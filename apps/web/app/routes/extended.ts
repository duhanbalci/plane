/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

export const extendedRoutes: RouteConfigEntry[] = [
  // The nesting mirrors coreRoutes so mergeRoutes() merges these into the
  // existing workspace shell instead of adding a parallel tree.
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        // Workspace Wiki
        layout("./(all)/[workspaceSlug]/(projects)/wiki/layout.tsx", [
          route(":workspaceSlug/wiki", "./(all)/[workspaceSlug]/(projects)/wiki/page.tsx"),
          route(":workspaceSlug/wiki/:pageId", "./(all)/[workspaceSlug]/(projects)/wiki/[pageId]/page.tsx"),
        ]),
      ]),
    ]),
  ]),
];
