/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import type { RefObject } from "react";
import { useSearchParams } from "next/navigation";
import type { EditorRefApi } from "@plane/editor";
import {
  PAGE_NAVIGATION_PANE_TAB_KEYS,
  PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM,
  PAGE_NAVIGATION_PANE_VERSION_QUERY_PARAM,
} from "@/components/pages/navigation-pane";
import { useAppRouter } from "@/hooks/use-app-router";
import { useQueryParams } from "@/hooks/use-query-params";
import type { TPageNavigationPaneTab } from "@/components/pages/navigation-pane/tab-panels";
import type { INavigationPaneExtension } from "@/components/pages/navigation-pane";
import { PageCommentsPane } from "@/components/pages/comments";
import type { TPageInstance } from "@/store/pages/base-page";

export type TPageExtensionHookParams = {
  page: TPageInstance;
  editorRef: RefObject<EditorRefApi | null>;
};

/** Query param value that opens the inline comments pane. */
export const PAGE_COMMENTS_PANE_PARAM = "comments";

export const usePagesPaneExtensions = (_params: TPageExtensionHookParams) => {
  const router = useAppRouter();
  const { updateQueryParams } = useQueryParams();
  const searchParams = useSearchParams();

  // Generic navigation pane logic - hook manages feature-specific routing
  const navigationPaneQueryParam = searchParams.get(
    PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM
  ) as TPageNavigationPaneTab | null;

  const navigationPaneExtensions: INavigationPaneExtension[] = useMemo(
    () => [
      {
        id: "comments",
        triggerParam: PAGE_COMMENTS_PANE_PARAM,
        component: PageCommentsPane,
        width: 360,
      },
    ],
    []
  );

  const isNavigationPaneOpen =
    !!navigationPaneQueryParam &&
    (PAGE_NAVIGATION_PANE_TAB_KEYS.includes(navigationPaneQueryParam) ||
      navigationPaneExtensions.some((extension) => extension.triggerParam === navigationPaneQueryParam));

  const handleOpenNavigationPane = useCallback(() => {
    const updatedRoute = updateQueryParams({
      paramsToAdd: { [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: "outline" },
    });
    router.push(updatedRoute);
  }, [router, updateQueryParams]);

  const editorExtensionHandlers: Map<string, unknown> = useMemo(() => {
    const map: Map<string, unknown> = new Map();
    return map;
  }, []);

  const handleOpenCommentsPane = useCallback(() => {
    const updatedRoute = updateQueryParams({
      paramsToAdd: { [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: PAGE_COMMENTS_PANE_PARAM },
    });
    router.push(updatedRoute);
  }, [router, updateQueryParams]);

  const handleCloseNavigationPane = useCallback(() => {
    const updatedRoute = updateQueryParams({
      paramsToRemove: [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM, PAGE_NAVIGATION_PANE_VERSION_QUERY_PARAM],
    });
    router.push(updatedRoute);
  }, [router, updateQueryParams]);

  return {
    editorExtensionHandlers,
    navigationPaneExtensions,
    handleOpenNavigationPane,
    handleOpenCommentsPane,
    isNavigationPaneOpen,
    handleCloseNavigationPane,
  };
};
