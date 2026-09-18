/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { registerPlanningTools } from "./planning";
import { registerProjectTools } from "./projects";
import { registerWorkItemTools } from "./work-items";
import { registerWorkspaceTools } from "./workspaces";

export function registerTools(server: McpServer): void {
  registerWorkspaceTools(server);
  registerProjectTools(server);
  registerWorkItemTools(server);
  registerPlanningTools(server);
}
