/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { MUTATES, READ_ONLY, handler, text, type ToolRegistrar } from "./context";

const workspaceSlug = z.string().describe("Workspace slug, from list_workspaces");
const projectId = z.string().describe("Project id, from list_projects");

/** Plane stores roles as numbers. */
const PROJECT_ROLES = { admin: 20, member: 15, guest: 5 } as const;

export const registerProjectTools: ToolRegistrar = (server) => {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the projects you can see in a workspace.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, cursor }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/`, { query: { cursor } }))
    )
  );

  server.registerTool(
    "get_project",
    {
      title: "Get a project",
      description: "Retrieve a single project by id.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/`))
    )
  );

  server.registerTool(
    "list_project_states",
    {
      title: "List project states",
      description:
        "List a project's work item states. Needed to set or filter by state, since state is referenced by id.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/states/`))
    )
  );

  server.registerTool(
    "list_project_labels",
    {
      title: "List project labels",
      description: "List a project's labels, which work items reference by id.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/labels/`))
    )
  );

  server.registerTool(
    "create_label",
    {
      title: "Create a label",
      description:
        "Create a label in a project, so work items can be tagged with it. Check list_project_labels first: " +
        "names are unique per project. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        name: z.string().min(1).describe("Label name"),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #3A86FF")
          .optional()
          .describe("Hex colour, e.g. #3A86FF"),
        description: z.string().optional(),
        parent: z.string().optional().describe("Parent label id, to nest this label under another"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, ...body }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/labels/`, {
          method: "POST",
          body,
        })
      )
    )
  );

  server.registerTool(
    "join_project",
    {
      title: "Join a project",
      description:
        "Add yourself to a project. Project calls, reads included, need project membership even for " +
        'workspace admins, so join first when they answer "Not permitted". Workspace admins and members ' +
        "can join public projects; only workspace admins can join private ones. Your project role matches " +
        "your workspace role. Requires a token with the mcp:write scope.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/join/`, {
          method: "POST",
        })
      )
    )
  );

  server.registerTool(
    "add_project_member",
    {
      title: "Add a project member",
      description:
        "Add someone from the workspace to a project. Only project admins can do this; to add yourself, " +
        "use join_project. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        project_id: projectId,
        member: z.string().describe("User id, from list_workspace_members"),
        role: z.enum(["admin", "member", "guest"]).default("member"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, project_id, member, role }, client) =>
      text(
        await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/members/`, {
          method: "POST",
          body: { member, role: PROJECT_ROLES[role] },
        })
      )
    )
  );

  server.registerTool(
    "list_project_members",
    {
      title: "List project members",
      description: "List the members of a project, for resolving assignees.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/members/`))
    )
  );

  server.registerTool(
    "list_cycles",
    {
      title: "List cycles",
      description: "List a project's cycles (time-boxed iterations).",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/cycles/`))
    )
  );

  server.registerTool(
    "list_modules",
    {
      title: "List modules",
      description: "List a project's modules (feature groupings).",
      inputSchema: z.object({ workspace_slug: workspaceSlug, project_id: projectId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, project_id }, client) =>
      text(await client.request(`/workspaces/${workspace_slug}/projects/${project_id}/modules/`))
    )
  );
};
