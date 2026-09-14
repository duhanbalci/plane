/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { READ_ONLY, handler, text, type ToolRegistrar } from "./context";

export const registerWorkspaceTools: ToolRegistrar = (server) => {
  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description:
        "List every Plane workspace you belong to, with the role you hold in each. " +
        "Start here: every other tool needs a workspace_slug from this list.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    handler(async (_args, client) => text(await client.request("/users/me/workspaces/")))
  );

  server.registerTool(
    "get_current_user",
    {
      title: "Get the signed-in user",
      description: "Return the Plane account this session is acting as.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    handler(async (_args, client) => text(await client.request("/users/me/")))
  );

  server.registerTool(
    "list_workspace_members",
    {
      title: "List workspace members",
      description: "List the members of a workspace. Use this to resolve a person's name to their user id.",
      inputSchema: z.object({
        workspace_slug: z.string().describe("Workspace slug, from list_workspaces"),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug }, client) => text(await client.request(`/workspaces/${workspace_slug}/members/`)))
  );
};
