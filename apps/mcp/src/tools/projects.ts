/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { READ_ONLY, handler, text, type ToolRegistrar } from "./context";

const workspaceSlug = z.string().describe("Workspace slug, from list_workspaces");
const projectId = z.string().describe("Project id, from list_projects");

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
