/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { DESTRUCTIVE, MUTATES, READ_ONLY, handler, text, type ToolRegistrar } from "./context";

const workspaceSlug = z.string().describe("Workspace slug, from list_workspaces");
const projectId = z.string().describe("Project id, from list_projects");
const workItemId = z.string().describe("Work item id");

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
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        per_page: z.number().int().min(1).max(100).optional(),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id, ...query }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/`, { query }))
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
      description: "Create a work item in a project. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        name: z.string().min(1).describe("Title of the work item"),
        description_html: z.string().optional().describe("Body as HTML"),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
        state: z.string().optional().describe("State id, from list_project_states"),
        assignees: z.array(z.string()).optional().describe("User ids, from list_project_members"),
        labels: z.array(z.string()).optional().describe("Label ids, from list_project_labels"),
        target_date: z.string().optional().describe("Due date, YYYY-MM-DD"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, ...body }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/`, {
          method: "POST",
          body,
        })
      )
    )
  );

  server.registerTool(
    "update_work_item",
    {
      title: "Update a work item",
      description:
        "Update fields on an existing work item. Only the fields you pass are changed. " +
        "Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: workItemId,
        name: z.string().optional(),
        description_html: z.string().optional(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
        state: z.string().optional().describe("State id, from list_project_states"),
        assignees: z.array(z.string()).optional(),
        labels: z.array(z.string()).optional(),
        target_date: z.string().optional().describe("Due date, YYYY-MM-DD"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, work_item_id, ...body }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/issues/${work_item_id}/`, {
          method: "PATCH",
          body,
        })
      )
    )
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
          body: { comment_html },
        })
      )
    )
  );
};
