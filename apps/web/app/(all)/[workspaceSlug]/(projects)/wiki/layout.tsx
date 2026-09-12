/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import useSWR from "swr";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local imports
import type { Route } from "./+types/layout";
import { WikiHeader } from "./header";

export default function WorkspaceWikiLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { fetchPagesList, fetchCollections } = usePageStore(EPageStoreType.WORKSPACE);
  // the wiki sidebar needs both the collections and the whole page tree
  useSWR(workspaceSlug ? `WORKSPACE_WIKI_COLLECTIONS_${workspaceSlug}` : null, () => fetchCollections(workspaceSlug));
  useSWR(workspaceSlug ? `WORKSPACE_WIKI_PAGES_${workspaceSlug}` : null, () => fetchPagesList(workspaceSlug));

  return (
    <>
      <AppHeader header={<WikiHeader />} />
      <ContentWrapper className="flex overflow-hidden">
        <div className="relative flex h-full flex-grow flex-col overflow-hidden">
          <Outlet />
        </div>
      </ContentWrapper>
    </>
  );
}
