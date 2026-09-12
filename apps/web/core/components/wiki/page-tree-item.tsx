/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PagesOutline } from "@makeplane/propel/icons";
import type { InstructionType } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// components
import { PageActions } from "@/components/pages/dropdowns";
// hooks
import { EPageStoreType, usePage, usePageStore } from "@/hooks/store";
import { useCreateWikiPage } from "@/hooks/use-create-wiki-page";

const INDENT_PER_LEVEL = 12;
// shared with the collection drop targets so pages can move between collections
export const DRAG_INSTANCE_ID = "PAGES_TREE";

const storeType = EPageStoreType.WORKSPACE;

type Props = {
  pageId: string;
  /** ordered ids of the list this row belongs to, used for drop placement */
  siblingIds?: string[];
  /** nesting level, drives the indentation */
  depth?: number;
};

/** Compact single line wiki page row for the sidebar tree. */
export const WikiPageTreeItem = observer(function WikiPageTreeItem(props: Props) {
  const { pageId, siblingIds = [], depth = 0 } = props;
  // refs
  const dragRef = useRef<HTMLDivElement>(null);
  // states
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // hooks
  const { t } = useTranslation();
  const { workspaceSlug, pageId: activePageId } = useParams();
  const { create: createWikiPage } = useCreateWikiPage(workspaceSlug?.toString());
  const page = usePage({ pageId, storeType });
  const { getChildPageIds, getPageById, movePageInTree, canCurrentUserCreatePage } = usePageStore(storeType);
  // derived values
  const childPageIds = getChildPageIds(pageId);
  const hasSubPages = (page?.sub_pages_count ?? 0) > 0 || childPageIds.length > 0;
  const isActive = activePageId?.toString() === pageId;
  // keep the branch open while the active page sits somewhere below this one
  const isAncestorOfActivePage = (() => {
    let cursor = activePageId ? getPageById(activePageId.toString())?.parent : undefined;
    for (let depthGuard = 0; cursor && depthGuard < 50; depthGuard++) {
      if (cursor === pageId) return true;
      cursor = getPageById(cursor)?.parent;
    }
    return false;
  })();

  useEffect(() => {
    if (isAncestorOfActivePage) setIsExpanded(true);
  }, [isAncestorOfActivePage]);

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
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, depth, page?.parent, siblingIds.join(","), isDragging]);

  if (!page) return null;

  const { name, logo_props, getRedirectionLink } = page;

  return (
    <>
      <div ref={dragRef} className={cn("relative", { "opacity-60": isDragging })}>
        <DropIndicator isVisible={instruction === "reorder-above"} />
        <div
          className={cn(
            "group flex h-7 items-center gap-1 rounded-md pr-1 text-secondary hover:bg-layer-transparent-hover",
            {
              "bg-layer-transparent-active text-primary": isActive,
              "bg-layer-1": instruction === "make-child",
            }
          )}
          style={{ paddingLeft: 4 + depth * INDENT_PER_LEVEL }}
        >
          <button
            type="button"
            className={cn("grid size-4 flex-shrink-0 place-items-center rounded-sm hover:bg-layer-2", {
              invisible: !hasSubPages,
            })}
            aria-label={isExpanded ? t("nested_pages.collapse") : t("nested_pages.expand")}
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          <Link href={getRedirectionLink()} className="flex min-w-0 flex-grow items-center gap-1.5">
            {logo_props?.in_use ? (
              <Logo logo={logo_props} size={14} type="lucide" />
            ) : (
              <PagesOutline className="size-4 flex-shrink-0 text-tertiary" />
            )}
            <span className="truncate text-13">{getPageName(name)}</span>
          </Link>
          <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            {canCurrentUserCreatePage && (
              <button
                type="button"
                className="grid size-5 place-items-center rounded-sm text-tertiary hover:bg-layer-2 hover:text-primary"
                aria-label={t("nested_pages.add_sub_page")}
                onClick={() => createWikiPage({ parentId: pageId, collectionId: page?.collection ?? undefined })}
              >
                <Plus className="size-3.5" />
              </button>
            )}
            <PageActions
              optionsOrder={[
                "open-in-new-tab",
                "copy-link",
                "make-a-copy",
                "toggle-lock",
                "toggle-access",
                "archive-restore",
                "delete",
                "move-to-project",
              ]}
              page={page}
              storeType={storeType}
            />
          </div>
        </div>
        <DropIndicator isVisible={instruction === "reorder-below"} />
      </div>
      {isExpanded &&
        childPageIds.map((childPageId) => (
          <WikiPageTreeItem key={childPageId} pageId={childPageId} siblingIds={childPageIds} depth={depth + 1} />
        ))}
    </>
  );
});
