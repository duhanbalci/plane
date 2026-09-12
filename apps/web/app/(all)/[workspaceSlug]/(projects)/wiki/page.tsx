/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useTheme } from "next-themes";
// plane imports
import { useTranslation } from "@plane/i18n";
// assets
import darkWikiAsset from "@/app/assets/empty-state/wiki/all-dark.webp?url";
import lightWikiAsset from "@/app/assets/empty-state/wiki/all-light.webp?url";
// components
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

/** Wiki index: opens the first page of the tree, or shows the empty state. */
function WorkspaceWikiPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  // router
  const router = useAppRouter();
  // theme hook
  const { resolvedTheme } = useTheme();
  // store hooks
  const { getRootPageIds, loader } = usePageStore(EPageStoreType.WORKSPACE);
  const { t } = useTranslation();
  // derived values
  const rootPageIds = getRootPageIds("public");
  const firstPageId = rootPageIds?.[0];
  const resolvedPath = resolvedTheme === "light" ? lightWikiAsset : darkWikiAsset;

  useEffect(() => {
    if (firstPageId) router.replace(`/${workspaceSlug}/wiki/${firstPageId}`);
  }, [firstPageId, router, workspaceSlug]);

  if (loader || firstPageId) return null;

  return (
    <>
      <PageHead title={t("sidebar.wiki")} />
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("wiki.empty_state.title")}
          description={t("wiki.empty_state.description")}
          assetPath={resolvedPath}
        />
      </div>
    </>
  );
}

export default observer(WorkspaceWikiPage);
