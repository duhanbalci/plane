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
  type_id: z.string().optional().describe("Work item type id, when the project has work item types enabled"),
  cycle_id: z
    .string()
    .optional()
    .describe("Cycle id, from list_cycles. Adds the work item to it, moving it out of any other cycle."),
  module_id: z
    .string()
    .optional()
    .describe("Module id, from list_modules. Adds the work item to it, moving it out of any other module."),
};

type Attachments = { cycle_id?: string; module_id?: string };

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
      description: "Retrieve one work item in full.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, work_item_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/${work_item_id}/`))
    )
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
        "Create a work item in a project. Can also place it in a cycle and a module in the same call. " +
        "Requires a token with the mcp:write scope.",
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
    handler(async ({ workspace_slug, project_id, cycle_id, module_id, ...fields }, client) => {
      const base = `/workspaces/${workspace_slug}/projects/${project_id}`;
      const workItem = await client.request<{ id: string }>(`${base}/issues/`, {
        method: "POST",
        body: toBody(fields),
      });
      return withWarnings(workItem, await attach(client, base, workItem.id, { cycle_id, module_id }));
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
    handler(async ({ workspace_slug, project_id, work_item_id, cycle_id, module_id, ...fields }, client) => {
      const base = `/workspaces/${workspace_slug}/projects/${project_id}`;
      const path = `${base}/issues/${work_item_id}/`;
      const body = toBody(fields);
      // A call that only moves the item between cycles or modules has nothing to PATCH.
      const workItem = Object.keys(body).length
        ? await client.request(path, { method: "PATCH", body })
        : await client.request(path);
      return withWarnings(workItem, await attach(client, base, work_item_id, { cycle_id, module_id }));
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
