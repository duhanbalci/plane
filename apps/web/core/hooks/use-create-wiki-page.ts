/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";

type TCreateWikiPageOptions = {
  collectionId?: string;
  parentId?: string;
};

/**
 * Creates an untitled wiki page right away and opens it, the way the real
 * Plane wiki does from the sidebar, instead of asking for a title first.
 */
export const useCreateWikiPage = (workspaceSlug: string | undefined) => {
  // states
  const [isCreating, setIsCreating] = useState(false);
  // hooks
  const router = useAppRouter();
  const { t } = useTranslation();
  const { createPage, defaultCollectionId } = usePageStore(EPageStoreType.WORKSPACE);

  const create = useCallback(
    async (options: TCreateWikiPageOptions = {}) => {
      if (isCreating || !workspaceSlug) return;
      setIsCreating(true);
      try {
        const page = await createPage({
          collection: options.collectionId ?? defaultCollectionId,
          parent: options.parentId ?? null,
        });
        if (page?.id) router.push(`/${workspaceSlug}/wiki/${page.id}`);
      } catch {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: t("wiki_collections.toasts.create_page_error"),
        });
      }
      setIsCreating(false);
    },
    [createPage, defaultCollectionId, isCreating, router, t, workspaceSlug]
  );

  return { create, isCreating };
};
