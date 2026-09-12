/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TPageNavigationTabs } from "@plane/types";
// components
import { PageListBlock } from "@/components/pages/list/block";
import { CreatePageModal } from "@/components/pages/modals/create-page-modal";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local imports
import { CollectionFormModal } from "./collection-form-modal";
import { DeleteCollectionModal } from "./delete-collection-modal";

const DRAG_INSTANCE_ID = "PAGES_TREE";

type Props = {
  collectionId: string;
  pageType: TPageNavigationTabs;
  workspaceSlug: string;
};

export const WikiCollectionItem = observer(function WikiCollectionItem(props: Props) {
  const { collectionId, pageType, workspaceSlug } = props;
  // refs
  const dropRef = useRef<HTMLDivElement>(null);
  // states
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isCreatePageModalOpen, setIsCreatePageModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  // store hooks
  const { getCollectionById, getCollectionRootPageIds, movePageToCollection, canCurrentUserCreatePage } =
    usePageStore(EPageStoreType.WORKSPACE);
  const { t } = useTranslation();
  // derived values
  const collection = getCollectionById(collectionId);
  const rootPageIds = getCollectionRootPageIds(collectionId, pageType);

  useEffect(() => {
    const element = dropRef.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => source?.data?.dragInstanceId === DRAG_INSTANCE_ID,
      onDragEnter: () => setIsDropTarget(true),
      onDragLeave: () => setIsDropTarget(false),
      onDrop: ({ source }) => {
        setIsDropTarget(false);
        const sourceId = source.data?.id;
        if (typeof sourceId !== "string") return;
        setIsExpanded(true);
        movePageToCollection(sourceId, collectionId).catch(() => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: t("wiki_collections.list.remove_error"),
          });
        });
      },
    });
  }, [collectionId, movePageToCollection, t]);

  if (!collection) return null;

  return (
    <>
      <CreatePageModal
        workspaceSlug={workspaceSlug}
        isModalOpen={isCreatePageModalOpen}
        handleModalClose={() => setIsCreatePageModalOpen(false)}
        collectionId={collectionId}
        redirectionEnabled
        storeType={EPageStoreType.WORKSPACE}
      />
      <CollectionFormModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        collectionId={collectionId}
      />
      <DeleteCollectionModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        collectionId={collectionId}
      />
      <div className="mb-1">
        <div
          ref={dropRef}
          className={cn("group flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-layer-1", {
            "bg-layer-1": isDropTarget,
          })}
        >
          <button
            type="button"
            className="grid size-4 flex-shrink-0 place-items-center rounded-sm hover:bg-layer-2"
            aria-label={isExpanded ? t("nested_pages.collapse") : t("nested_pages.expand")}
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {collection.logo_props?.in_use && <Logo logo={collection.logo_props} size={14} type="lucide" />}
          <span className="flex-grow truncate text-13 font-medium">{collection.name}</span>
          {canCurrentUserCreatePage && (
            <button
              type="button"
              className="grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-2 hover:text-primary"
              aria-label={t("wiki_collections.header.add_page")}
              onClick={() => setIsCreatePageModalOpen(true)}
            >
              <Plus className="size-3.5" />
            </button>
          )}
          <CustomMenu placement="bottom-end" ellipsis closeOnSelect>
            <CustomMenu.MenuItem onClick={() => setIsCreatePageModalOpen(true)}>
              {t("wiki_collections.menu.create_new_page")}
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => setIsRenameModalOpen(true)}>
              {t("wiki_collections.menu.edit_collection")}
            </CustomMenu.MenuItem>
            {!collection.is_default && (
              <CustomMenu.MenuItem onClick={() => setIsDeleteModalOpen(true)}>
                {t("common.delete")}
              </CustomMenu.MenuItem>
            )}
          </CustomMenu>
        </div>
        {isExpanded && (
          <div className="pl-2">
            {rootPageIds.length === 0 ? (
              <p className="px-3 py-1 text-12 text-tertiary">{t("wiki_collections.list.no_pages_title")}</p>
            ) : (
              rootPageIds.map((pageId) => (
                <PageListBlock
                  key={pageId}
                  pageId={pageId}
                  storeType={EPageStoreType.WORKSPACE}
                  siblingIds={rootPageIds}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
});
