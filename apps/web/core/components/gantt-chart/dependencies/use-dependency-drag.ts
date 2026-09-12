/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { useCallback } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueRelationTypes } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
// local imports
import { HEADER_HEIGHT, SIDEBAR_WIDTH } from "../constants";

export type TDependencySide = "start" | "end";

export const DEPENDENCY_HANDLE_ATTRIBUTE = "data-dependency-handle";

type DropTarget = { blockId: string; side: TDependencySide };

/**
 * Relation to create, expressed on the dependent work item.
 * end -> start is FS, start -> start is SS, end -> end is FF; a start -> end
 * drop is the same FS edge drawn backwards, so the roles are swapped.
 */
const resolveRelation = (
  from: DropTarget,
  to: DropTarget
): { issueId: string; relationType: TIssueRelationTypes; relatedIssueId: string } | undefined => {
  if (from.blockId === to.blockId) return;

  if (from.side === "end" && to.side === "start")
    return { issueId: to.blockId, relationType: "blocked_by", relatedIssueId: from.blockId };
  if (from.side === "start" && to.side === "start")
    return { issueId: to.blockId, relationType: "start_after", relatedIssueId: from.blockId };
  if (from.side === "end" && to.side === "end")
    return { issueId: to.blockId, relationType: "finish_after", relatedIssueId: from.blockId };
  // start -> end: the dropped-on block is the predecessor
  return { issueId: from.blockId, relationType: "blocked_by", relatedIssueId: to.blockId };
};

/** Find the handle, or failing that the block, under the pointer. */
const getDropTarget = (event: MouseEvent): DropTarget | undefined => {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!element) return;

  const handle = element.closest<HTMLElement>(`[${DEPENDENCY_HANDLE_ATTRIBUTE}]`);
  if (handle?.dataset.blockId && handle.dataset.side)
    return { blockId: handle.dataset.blockId, side: handle.dataset.side as TDependencySide };

  // dropped on the bar itself: the nearer edge wins
  const block = element.closest<HTMLElement>("[data-gantt-block-id]");
  if (!block?.dataset.ganttBlockId) return;

  const rect = block.getBoundingClientRect();
  return {
    blockId: block.dataset.ganttBlockId,
    side: event.clientX < rect.left + rect.width / 2 ? "start" : "end",
  };
};

export const useDependencyDrag = (blockId: string, ganttContainerRef: React.RefObject<HTMLDivElement | null>) => {
  const { startDependencyDrag, updateDependencyDrag, endDependencyDrag } = useTimeLineChartStore();
  const { relation } = useIssueDetail();

  const handleDependencyDragStart = useCallback(
    (event: React.MouseEvent<HTMLElement>, side: TDependencySide) => {
      const container = ganttContainerRef.current;
      if (!container || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      // pointer position in chart space, same normalisation as block resizing
      const toChartPoint = (clientX: number, clientY: number) => {
        const rect = container.getBoundingClientRect();
        return {
          x: clientX - rect.left - SIDEBAR_WIDTH + container.scrollLeft,
          y: clientY - rect.top + container.scrollTop - HEADER_HEIGHT,
        };
      };

      const startPoint = toChartPoint(event.clientX, event.clientY);
      startDependencyDrag(blockId, side, startPoint.x, startPoint.y);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const point = toChartPoint(moveEvent.clientX, moveEvent.clientY);
        updateDependencyDrag(point.x, point.y);
      };

      const cleanup = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("keydown", handleKeyDown);
        endDependencyDrag();
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") cleanup();
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        const target = getDropTarget(upEvent);
        cleanup();

        if (!target) return;

        const payload = resolveRelation({ blockId, side }, target);
        if (!payload) return;

        relation.createCurrentRelation(payload.issueId, payload.relationType, payload.relatedIssueId).catch(() => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error",
            message: "Something went wrong while creating the dependency",
          });
        });
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("keydown", handleKeyDown);
    },
    [blockId, ganttContainerRef, startDependencyDrag, updateDependencyDrag, endDependencyDrag, relation]
  );

  return { handleDependencyDragStart };
};
