/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { MUTATES, READ_ONLY, handler, text, type ToolRegistrar } from "./context";
import { LIST_FIELDS } from "./work-items";

const workspaceSlug = z.string().describe("Workspace slug, from list_workspaces");
const projectId = z.string().describe("Project id, from list_projects");
const cycleId = z.string().describe("Cycle id, from list_cycles");
const moduleId = z.string().describe("Module id, from list_modules");
const workItemId = z.string().describe("Work item id");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Plane takes a cycle's dates as a pair: both set (a scheduled cycle) or neither (a draft). */
const bothOrNeither = (value: { start_date?: string; end_date?: string }) =>
  (value.start_date === undefined) === (value.end_date === undefined);
const bothOrNeitherMessage = {
  message: "Pass start_date and end_date together, or neither",
  path: ["end_date"],
};

export const registerPlanningTools: ToolRegistrar = (server) => {
  server.registerTool(
    "create_cycle",
    {
      title: "Create a cycle",
      description:
        "Create a cycle (a time-boxed iteration) in a project. Without dates it is a draft; with them it is " +
        "scheduled. Requires a token with the mcp:write scope.",
      inputSchema: z
        .object({
          workspace_slug: workspaceSlug,
          project_id: projectId,
          name: z.string().min(1).describe("Cycle name"),
          description: z.string().optional(),
          start_date: date.optional().describe("First day, YYYY-MM-DD, in the project's timezone"),
          end_date: date.optional().describe("Last day, YYYY-MM-DD, in the project's timezone"),
          owned_by: z.string().optional().describe("Owner's user id. Defaults to you."),
        })
        .refine(bothOrNeither, bothOrNeitherMessage),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, ...body }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/cycles/`, {
          method: "POST",
          body,
        })
      )
    )
  );

  server.registerTool(
    "update_cycle",
    {
      title: "Update a cycle",
      description:
        "Rename, redescribe, reschedule or hand over a cycle. Only the fields you pass change. A cycle whose " +
        "end date has passed is completed and can no longer be edited. Requires a token with the mcp:write scope.",
      inputSchema: z
        .object({
          workspace_slug: workspaceSlug,
          project_id: projectId,
          cycle_id: cycleId,
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          start_date: date.optional().describe("First day, YYYY-MM-DD. Pass together with end_date."),
          end_date: date.optional().describe("Last day, YYYY-MM-DD. Pass together with start_date."),
          owned_by: z.string().optional().describe("New owner's user id"),
        })
        .refine(bothOrNeither, bothOrNeitherMessage),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, project_id, cycle_id, ...body }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/cycles/${cycle_id}/`, {
          method: "PATCH",
          body,
        })
      )
    )
  );

  server.registerTool(
    "list_cycle_work_items",
    {
      title: "List a cycle's work items",
      description: "List the work items in a cycle, in the same compact shape as list_work_items.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        cycle_id: cycleId,
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        per_page: z.number().int().min(1).max(100).optional(),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, cycle_id, ...query }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/cycles/${cycle_id}/cycle-issues/`, {
          query: { ...query, fields: LIST_FIELDS.join(",") },
        })
      )
    )
  );

  server.registerTool(
    "remove_work_item_from_cycle",
    {
      title: "Remove a work item from a cycle",
      description:
        "Take a work item out of a cycle. The work item itself is kept. To move it to another cycle instead, " +
        "pass cycle_id to update_work_item. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        cycle_id: cycleId,
        work_item_id: workItemId,
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, project_id, cycle_id, work_item_id }, client) => {
      await client.request(
        `/workspaces/${workspace_slug}/projects/${project_id}/cycles/${cycle_id}/cycle-issues/${work_item_id}/`,
        { method: "DELETE" }
      );
      return text(`Removed work item ${work_item_id} from cycle ${cycle_id}.`);
    })
  );

  server.registerTool(
    "list_module_work_items",
    {
      title: "List a module's work items",
      description: "List the work items in a module, in the same compact shape as list_work_items.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        module_id: moduleId,
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        per_page: z.number().int().min(1).max(100).optional(),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, module_id, ...query }, client) =>
      text(
        await client.request(
          `/workspaces/${workspace_slug}/projects/${project_id}/modules/${module_id}/module-issues/`,
          { query: { ...query, fields: LIST_FIELDS.join(",") } }
        )
      )
    )
  );

  server.registerTool(
    "remove_work_item_from_module",
    {
      title: "Remove a work item from a module",
      description:
        "Take a work item out of a module. The work item itself is kept. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        module_id: moduleId,
        work_item_id: workItemId,
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, project_id, module_id, work_item_id }, client) => {
      await client.request(
        `/workspaces/${workspace_slug}/projects/${project_id}/modules/${module_id}/module-issues/${work_item_id}/`,
        { method: "DELETE" }
      );
      return text(`Removed work item ${work_item_id} from module ${module_id}.`);
    })
  );
};
