/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { normalizeHtml } from "@/lib/html";
import { PlaneApiError, type PlaneClient } from "@/lib/plane-client";
import { DESTRUCTIVE, MUTATES, READ_ONLY, handler, text, withWarnings, type ToolRegistrar } from "./context";

const workspaceSlug = z.string().describe("Workspace slug, from list_workspaces");
const projectId = z.string().describe("Project id, from list_projects");
const workItemId = z.string().describe("Work item id");
const RELATION_TYPE = z.enum([
  "blocking",
  "blocked_by",
  "duplicate",
  "relates_to",
  "start_before",
  "start_after",
  "finish_before",
  "finish_after",
]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * What list_work_items returns unless asked otherwise. Leaves out
 * description_html, which dominates the payload: a full body per item made a
 * short list cost thousands of tokens. get_work_item still returns everything.
 */
export const LIST_FIELDS = [
  "id",
  "sequence_id",
  "name",
  "state",
  "priority",
  "assignees",
  "labels",
  "start_date",
  "target_date",
  "parent",
  "estimate_point",
  "type_id",
  "created_at",
  "updated_at",
  "completed_at",
];

/** Fields create and update share. Update makes the clearable ones nullable. */
const workItemFields = {
  description_html: z.string().optional().describe("Body as raw HTML, e.g. <p>Hi</p>. Do not entity-encode it."),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  state: z.string().optional().describe("State id, from list_project_states"),
  assignees: z.array(z.string()).optional().describe("User ids, from list_project_members"),
  labels: z.array(z.string()).optional().describe("Label ids, from list_project_labels or create_label"),
  type_id: z
    .string()
    .optional()
    .describe("Work item type id, from the work_item_types in get_project, e.g. the id of Bug"),
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Custom property values of the work item type, keyed by property id from the work_item_types in " +
        'get_project: { "<property_id>": value }. A value may be a single value or an array for multi-value ' +
        "properties; booleans take true or false, option properties take option ids, dates take YYYY-MM-DD. " +
        "A type's required properties must be set for the work item to be complete."
    ),
  cycle_id: z
    .string()
    .optional()
    .describe(
      "Cycle id, from list_cycles. Adds the work item to it, moving it out of any other cycle. " +
        "To take it out of a cycle without a new one, use remove_work_item_from_cycle."
    ),
  module_id: z
    .string()
    .optional()
    .describe("Module id, from list_modules. Adds the work item to it, moving it out of any other module."),
};

type Attachments = { cycle_id?: string; module_id?: string };

type PropertyValues = Record<string, unknown>;

/**
 * Write the custom property values of a work item. They live in their own
 * table behind a separate endpoint, so like the cycle and module links they
 * cannot ride along on the create or update, and a failure here is returned
 * as a warning rather than undoing the write that already happened.
 */
async function setProperties(
  client: PlaneClient,
  base: string,
  id: string,
  properties: PropertyValues | undefined
): Promise<string[]> {
  if (!properties || Object.keys(properties).length === 0) return [];
  try {
    await client.request(`${base}/issues/${id}/property-values/`, { method: "PATCH", body: properties });
    return [];
  } catch (error) {
    if (!(error instanceof PlaneApiError)) throw error;
    return [`the work item was saved, but its custom property values were not: ${error.detail}`];
  }
}

/**
 * Link a work item to a cycle and a module. Plane keeps these in their own
 * tables behind separate endpoints, so they cannot ride along on the create or
 * update. A failure here does not undo the write that already happened; it is
 * returned as a warning instead.
 */
async function attach(
  client: PlaneClient,
  base: string,
  id: string,
  { cycle_id, module_id }: Attachments
): Promise<string[]> {
  const links = [
    cycle_id && { kind: "cycle", path: `${base}/cycles/${cycle_id}/cycle-issues/`, target: cycle_id },
    module_id && { kind: "module", path: `${base}/modules/${module_id}/module-issues/`, target: module_id },
  ].filter((link) => !!link);

  // The two links are independent, so one failing does not stop the other.
  const outcomes = await Promise.all(
    links.map(async (link) => {
      try {
        await client.request(link.path, { method: "POST", body: { issues: [id] } });
        return null;
      } catch (error) {
        if (!(error instanceof PlaneApiError)) throw error;
        return `the work item was saved, but adding it to ${link.kind} ${link.target} failed: ${error.detail}`;
      }
    })
  );
  return outcomes.filter((warning) => warning !== null);
}

/** The custom property values of a work item, or the reason they could not be read. */
async function propertyValues(client: PlaneClient, base: string, id: string): Promise<unknown> {
  try {
    return await client.request(`${base}/issues/${id}/property-values/`);
  } catch (error) {
    if (!(error instanceof PlaneApiError)) throw error;
    return { error: `Could not read the custom property values: ${error.detail}` };
  }
}

/** Drop undefined keys and repair an entity-encoded body. */
function toBody<T extends { description_html?: string | null }>(fields: T): T {
  const body = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
  if (typeof body.description_html === "string") body.description_html = normalizeHtml(body.description_html);
  return body;
}

export const registerWorkItemTools: ToolRegistrar = (server) => {
  server.registerTool(
    "list_work_items",
    {
      title: "List work items",
      description:
        "List work items in a project. Filters take ids, not names — resolve them first with " +
        "list_project_states, list_project_labels or list_project_members.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        state: z.string().optional().describe("State id to filter by"),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
        assignees: z.string().optional().describe("Comma-separated user ids"),
        labels: z.string().optional().describe("Comma-separated label ids"),
        order_by: z
          .string()
          .optional()
          .describe(
            "Sort field, prefixed with - for descending: created_at, updated_at, sequence_id, target_date, " +
              "start_date, priority, state__group. Defaults to -created_at."
          ),
        fields: z
          .array(z.string())
          .min(1)
          .optional()
          .describe(
            "Fields to return per work item. Defaults to a compact set without description_html; " +
              "call get_work_item for one item's full body."
          ),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        per_page: z.number().int().min(1).max(100).optional(),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, fields, ...query }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/`, {
          query: { ...query, fields: (fields ?? LIST_FIELDS).join(",") },
        })
      )
    )
  );

  server.registerTool(
    "get_work_item",
    {
      title: "Get a work item",
      description:
        "Retrieve one work item in full, including property_values: the work item type's custom properties, " +
        "keyed by property id. get_project names those properties.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, work_item_id }, client) => {
      const base = `/workspaces/${workspace_slug}/projects/${project_id}`;
      const workItem = await client.request<Record<string, unknown>>(`${base}/issues/${work_item_id}/`);
      // Only typed work items can carry property values, so skip the call otherwise.
      if (!workItem.type_id) return text(workItem);
      return text({ ...workItem, property_values: await propertyValues(client, base, work_item_id) });
    })
  );

  server.registerTool(
    "search_work_items",
    {
      title: "Search work items",
      description: "Search work items across a workspace by title or identifier.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        query: z.string().min(1).describe("Search text"),
        project_id: z.string().optional().describe("Restrict the search to one project"),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, query, project_id }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/issues/search/`, {
          query: { search: query, project_id },
        })
      )
    )
  );

  server.registerTool(
    "create_work_item",
    {
      title: "Create a work item",
      description:
        "Create a work item in a project. Can also give it a work item type with its custom property values, " +
        "and place it in a cycle and a module, in the same call. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        name: z.string().min(1).describe("Title of the work item"),
        ...workItemFields,
        start_date: date.optional().describe("Start date, YYYY-MM-DD"),
        target_date: date.optional().describe("Due date, YYYY-MM-DD"),
        parent: z.string().optional().describe("Parent work item id, making this a sub-work item"),
        estimate_point: z.string().optional().describe("Estimate point id, from the project's estimate"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, cycle_id, module_id, properties, ...fields }, client) => {
      const base = `/workspaces/${workspace_slug}/projects/${project_id}`;
      const workItem = await client.request<{ id: string }>(`${base}/issues/`, {
        method: "POST",
        body: toBody(fields),
      });
      const warnings = [
        ...(await setProperties(client, base, workItem.id, properties)),
        ...(await attach(client, base, workItem.id, { cycle_id, module_id })),
      ];
      return withWarnings(workItem, warnings);
    })
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update a work item",
      description:
        "Update fields on an existing work item. Only the fields you pass are changed; pass null to clear " +
        "a date, the parent or the estimate. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
        name: z.string().min(1).optional(),
        ...workItemFields,
        start_date: date.nullable().optional().describe("Start date, YYYY-MM-DD, or null to clear"),
        target_date: date.nullable().optional().describe("Due date, YYYY-MM-DD, or null to clear"),
        parent: z.string().nullable().optional().describe("Parent work item id, or null to detach"),
        estimate_point: z.string().nullable().optional().describe("Estimate point id, or null to clear"),
      }),
      annotations: MUTATES,
    },
    handler(
      async ({ workspace_slug, project_id, work_item_id, cycle_id, module_id, properties, ...fields }, client) => {
        const base = `/workspaces/${workspace_slug}/projects/${project_id}`;
        const path = `${base}/issues/${work_item_id}/`;
        const body = toBody(fields);
        // A call that only moves the item between cycles or modules, or only sets
        // custom property values, has nothing to PATCH on the work item itself.
        const workItem = Object.keys(body).length
          ? await client.request(path, { method: "PATCH", body })
          : await client.request(path);
        const warnings = [
          ...(await setProperties(client, base, work_item_id, properties)),
          ...(await attach(client, base, work_item_id, { cycle_id, module_id })),
        ];
        return withWarnings(workItem, warnings);
      }
    )
  );

  server.registerTool(
    "list_work_item_relations",
    {
      title: "List work item relations",
      description:
        "List a work item's relations to other work items, grouped by type: blocking, blocked_by, duplicate, " +
        "relates_to, start_before, start_after, finish_before, finish_after.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, work_item_id }, client) =>
      text(
        await client.request(
          `/workspaces/${workspace_slug}/projects/${project_id}/work-items/${work_item_id}/relations/`
        )
      )
    )
  );

  server.registerTool(
    "add_work_item_relation",
    {
      title: "Relate work items",
      description:
        "Relate a work item to one or more others. The type reads from this work item's side: " +
        '"blocking" means this work item blocks the others, "blocked_by" that they block it. Related work ' +
        "items may be in other projects of the same workspace. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
        relation_type: RELATION_TYPE,
        related_work_item_ids: z.array(z.string()).min(1).describe("Ids of the work items to relate to"),
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, project_id, work_item_id, relation_type, related_work_item_ids }, client) =>
      text(
        await client.request(
          `/workspaces/${workspace_slug}/projects/${project_id}/work-items/${work_item_id}/relations/`,
          { method: "POST", body: { relation_type, issues: related_work_item_ids } }
        )
      )
    )
  );

  server.registerTool(
    "remove_work_item_relation",
    {
      title: "Remove a work item relation",
      description:
        "Remove the relation between two work items, whatever its type and whichever side it was added from. " +
        "Neither work item is deleted. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
        related_work_item_id: z.string().describe("Id of the related work item"),
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, project_id, work_item_id, related_work_item_id }, client) => {
      await client.request(
        `/workspaces/${workspace_slug}/projects/${project_id}/work-items/${work_item_id}/relations/remove/`,
        { method: "POST", body: { related_issue: related_work_item_id } }
      );
      return text(`Removed the relation between ${work_item_id} and ${related_work_item_id}.`);
    })
  );

  server.registerTool(
    "list_work_item_comments",
    {
      title: "List work item comments",
      description: "List the comments on a work item.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, work_item_id }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/${work_item_id}/comments/`)
      )
    )
  );

  server.registerTool(
    "delete_work_item",
    {
      title: "Delete a work item",
      description:
        "Permanently delete a work item. Only its creator or a project admin may do this, and it cannot be " +
        "undone from here. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
      }),
      annotations: DESTRUCTIVE,
    },
    handler(async ({ workspace_slug, project_id, work_item_id }, client) => {
      await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/${work_item_id}/`, {
        method: "DELETE",
      });
      // A 204 carries no body, so report the outcome rather than echoing null.
      return text(`Deleted work item ${work_item_id}.`);
    })
  );

  server.registerTool(
    "delete_work_item_comment",
    {
      title: "Delete a work item comment",
      description: "Permanently delete a comment from a work item. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
        comment_id: z.string().describe("Comment id, from list_work_item_comments"),
      }),
      annotations: DESTRUCTIVE,
    },
    handler(async ({ workspace_slug, project_id, work_item_id, comment_id }, client) => {
      await client.request(
        `/workspaces/${workspace_slug}/projects/${project_id}/issues/${work_item_id}/comments/${comment_id}/`,
        { method: "DELETE" }
      );
      return text(`Deleted comment ${comment_id}.`);
    })
  );

  server.registerTool(
    "add_work_item_comment",
    {
      title: "Comment on a work item",
      description: "Add a comment to a work item. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
        comment_html: z.string().min(1).describe("Comment body as HTML"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, work_item_id, comment_html }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/${work_item_id}/comments/`, {
          method: "POST",
          body: { comment_html: normalizeHtml(comment_html) },
        })
      )
    )
  );
};
