/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Plus, Search, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TPageNavigationTabs } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local imports
import { CollectionFormModal } from "./collection-form-modal";
import { WikiCollectionItem } from "./collection-item";

const TABS: { key: TPageNavigationTabs; labelKey: string }[] = [
  { key: "public", labelKey: "wiki.tabs.public" },
  { key: "private", labelKey: "wiki.tabs.private" },
  { key: "archived", labelKey: "wiki.tabs.archived" },
];

type Props = {
  workspaceSlug: string;
};

/** Left pane of the wiki: search, tabs and the collection → page tree. */
export const WikiSidebar = observer(function WikiSidebar(props: Props) {
  const { workspaceSlug } = props;
  // states
  const [pageType, setPageType] = useState<TPageNavigationTabs>("public");
  const [isCreateCollectionModalOpen, setIsCreateCollectionModalOpen] = useState(false);
  // store hooks
  const { collectionIds, filters, updateFilters, canCurrentUserCreatePage } = usePageStore(
    EPageStoreType.WORKSPACE
  );
  const { t } = useTranslation();

  return (
    <>
      <CollectionFormModal
        isOpen={isCreateCollectionModalOpen}
        onClose={() => setIsCreateCollectionModalOpen(false)}
      />
      <div className="flex h-full w-72 flex-shrink-0 flex-col overflow-hidden border-r border-subtle">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex flex-grow items-center gap-1 rounded-sm bg-layer-1 px-2 py-1">
            <Search className="size-3.5 flex-shrink-0 text-tertiary" />
            <input
              type="text"
              className="w-full border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
              placeholder={t("common.search.placeholder")}
              value={filters.searchQuery}
              onChange={(e) => updateFilters("searchQuery", e.target.value)}
            />
            {filters.searchQuery && (
              <button
                type="button"
                aria-label={t("common.clear")}
                onClick={() => updateFilters("searchQuery", "")}
              >
                <X className="size-3 text-tertiary" />
              </button>
            )}
          </div>
          {canCurrentUserCreatePage && (
            <button
              type="button"
              className="grid size-6 flex-shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-primary"
              aria-label={t("wiki_collections.create_modal.submit")}
              onClick={() => setIsCreateCollectionModalOpen(true)}
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 px-3 pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={cn("rounded-sm px-2 py-0.5 text-12 text-tertiary hover:bg-layer-1", {
                "bg-layer-1 font-medium text-primary": pageType === tab.key,
              })}
              onClick={() => setPageType(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div className="vertical-scrollbar scrollbar-sm flex-grow overflow-y-auto px-1 pb-4">
          {collectionIds.map((collectionId) => (
            <WikiCollectionItem
              key={collectionId}
              collectionId={collectionId}
              pageType={pageType}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      </div>
    </>
  );
});
