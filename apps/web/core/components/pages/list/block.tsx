/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PagesOutline } from "@makeplane/propel/icons";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { InstructionType } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
import { BlockItemAction } from "@/components/pages/list/block-item-action";
import { CreatePageModal } from "@/components/pages/modals/create-page-modal";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePage, usePageStore } from "@/hooks/store";

type TPageListBlock = {
  pageId: string;
  storeType: EPageStoreType;
  /** ordered ids of the list this block is rendered in, used for drop placement */
  siblingIds?: string[];
  /** nesting level, drives the indentation */
  depth?: number;
};

const INDENT_PER_LEVEL = 20;
const DRAG_INSTANCE_ID = "PAGES_TREE";

export const PageListBlock = observer(function PageListBlock(props: TPageListBlock) {
  const { pageId, storeType, siblingIds = [], depth = 0 } = props;
  // refs
  const parentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  // states
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  const [isCreateSubPageModalOpen, setIsCreateSubPageModalOpen] = useState(false);
  // hooks
  const { t } = useTranslation();
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const page = usePage({ pageId, storeType });
  const { getChildPageIds, movePageInTree } = usePageStore(storeType);
  const { isMobile } = usePlatformOS();
  // derived values
  const childPageIds = getChildPageIds(pageId);
  const subPagesCount = page?.sub_pages_count ?? 0;
  const hasSubPages = subPagesCount > 0 || childPageIds.length > 0;
  const workspaceSlug = routerWorkspaceSlug?.toString();
  const projectId = page?.project_ids?.[0];

  const handleDrop = (sourceId: string, dropInstruction: InstructionType | undefined) => {
    if (!dropInstruction || sourceId === pageId) return;
    if (dropInstruction === "make-child") {
      setIsExpanded(true);
      movePageInTree(sourceId, pageId);
      return;
    }
    const orderedSiblingIds = siblingIds.filter((siblingId) => siblingId !== sourceId);
    const targetIndex = orderedSiblingIds.indexOf(pageId);
    if (targetIndex === -1) return;
    movePageInTree(sourceId, page?.parent ?? null, dropInstruction === "reorder-below" ? targetIndex + 1 : targetIndex);
  };

  useEffect(() => {
    const element = dragRef.current;
    if (!element) return;
    const initialData = { id: pageId, dragInstanceId: DRAG_INSTANCE_ID, parentId: page?.parent ?? null };
    return combine(
      draggable({
        element,
        getInitialData: () => initialData,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source?.data?.id !== pageId && source?.data?.dragInstanceId === DRAG_INSTANCE_ID,
        getData: ({ input, element: dropElement }) =>
          attachInstruction(initialData, {
            input,
            element: dropElement,
            currentLevel: depth,
            indentPerLevel: INDENT_PER_LEVEL,
            mode: "standard",
          }),
        onDrag: ({ self }) => setInstruction(extractInstruction(self.data)?.type),
        onDragLeave: () => setInstruction(undefined),
        onDrop: ({ self, source }) => {
          const dropInstruction = extractInstruction(self.data)?.type;
          setInstruction(undefined);
          if (typeof source.data?.id === "string") handleDrop(source.data.id, dropInstruction);
        },
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, depth, page?.parent, siblingIds.join(","), isDragging]);

  // handle page check
  if (!page) return null;
  // derived values
  const { name, logo_props, getRedirectionLink } = page;

  return (
    <>
      {workspaceSlug && (
        <CreatePageModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          isModalOpen={isCreateSubPageModalOpen}
          handleModalClose={() => setIsCreateSubPageModalOpen(false)}
          parentId={pageId}
          collectionId={page?.collection ?? undefined}
          redirectionEnabled
          storeType={storeType}
        />
      )}
      <div ref={dragRef} className={cn("relative", { "opacity-60": isDragging })}>
        <DropIndicator isVisible={instruction === "reorder-above"} />
        <ListItem
          prependTitleElement={
            <span className="flex items-center" style={{ paddingLeft: depth * INDENT_PER_LEVEL }}>
              <button
                type="button"
                className={cn("mr-1 grid size-4 flex-shrink-0 place-items-center rounded-sm hover:bg-layer-1", {
                  invisible: !hasSubPages,
                })}
                aria-label={isExpanded ? t("nested_pages.collapse") : t("nested_pages.expand")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsExpanded((prev) => !prev);
                }}
              >
                {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
              {logo_props?.in_use ? (
                <Logo logo={logo_props} size={16} type="lucide" />
              ) : (
                <PagesOutline className="h-4 w-4 text-tertiary" />
              )}
            </span>
          }
          title={getPageName(name)}
          itemLink={getRedirectionLink()}
          className={cn({ "bg-layer-1": instruction === "make-child" })}
          actionableItems={
            <>
              <button
                type="button"
                className="grid size-5 place-items-center rounded-sm text-tertiary hover:bg-layer-1 hover:text-primary"
                aria-label={t("nested_pages.add_sub_page")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsCreateSubPageModalOpen(true);
                }}
              >
                <Plus className="size-3.5" />
              </button>
              <BlockItemAction page={page} parentRef={parentRef} storeType={storeType} />
            </>
          }
          isMobile={isMobile}
          parentRef={parentRef}
        />
        <DropIndicator isVisible={instruction === "reorder-below"} />
      </div>
      {isExpanded &&
        childPageIds.map((childPageId) => (
          <PageListBlock
            key={childPageId}
            pageId={childPageId}
            storeType={storeType}
            siblingIds={childPageIds}
            depth={depth + 1}
          />
        ))}
    </>
  );
});
