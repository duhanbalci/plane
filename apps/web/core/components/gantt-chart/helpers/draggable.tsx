/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import React from "react";
import { observer } from "mobx-react";
// hooks
import type { IGanttBlock } from "@plane/types";
// helpers
import { cn } from "@plane/utils";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
// components
import { useDependencyDrag } from "../dependencies";
import type { TDependencySide } from "../dependencies";
import { LeftResizable } from "./blockResizables/left-resizable";
import { RightResizable } from "./blockResizables/right-resizable";

type Props = {
  block: IGanttBlock;
  blockToRender: (data: any) => React.ReactNode;
  handleBlockDrag: (e: React.MouseEvent<HTMLDivElement, MouseEvent>, dragDirection: "left" | "right" | "move") => void;
  isMoving: "left" | "right" | "move" | undefined;
  enableBlockLeftResize: boolean;
  enableBlockRightResize: boolean;
  enableBlockMove: boolean;
  enableDependency: boolean | ((blockId: string) => boolean);
  ganttContainerRef: RefObject<HTMLDivElement | null>;
};

export const ChartDraggable = observer(function ChartDraggable(props: Props) {
  const {
    block,
    blockToRender,
    handleBlockDrag,
    enableBlockLeftResize,
    enableBlockRightResize,
    enableBlockMove,
    enableDependency,
    ganttContainerRef,
    isMoving,
  } = props;
  // store hooks
  const { isDependencyEnabled, dependencyDrag } = useTimeLineChartStore();
  const { handleDependencyDragStart } = useDependencyDrag(block.id, ganttContainerRef);

  const isDependencyAllowed =
    isDependencyEnabled &&
    (typeof enableDependency === "function" ? enableDependency(block.id) : enableDependency) &&
    // a connector needs both ends of the bar to be real dates
    !!block.start_date &&
    !!block.target_date;
  // while a connector is in flight every handle stays visible so it can be dropped on
  const isLinking = !!dependencyDrag;

  const renderHandle = (side: TDependencySide) => (
    <button
      type="button"
      data-dependency-handle
      data-block-id={block.id}
      data-side={side}
      tabIndex={-1}
      aria-label={side === "start" ? "Start dependency from start date" : "Start dependency from due date"}
      className={cn(
        "absolute top-1/2 z-[7] h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-strong bg-layer-1 opacity-0 transition-opacity group-hover:opacity-100",
        side === "start" ? "-left-3.5" : "-right-3.5",
        { "opacity-100": isLinking }
      )}
      onMouseDown={(e) => handleDependencyDragStart(e, side)}
    />
  );

  return (
    <div className="group relative z-[5] inline-flex h-full w-full cursor-pointer items-center font-medium transition-all">
      <LeftResizable
        enableBlockLeftResize={enableBlockLeftResize}
        handleBlockDrag={handleBlockDrag}
        isMoving={isMoving}
        position={block.position}
      />
      {isDependencyAllowed && renderHandle("start")}
      {/* oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
      <div
        className={cn("relative z-[6] flex h-8 w-full items-center rounded-sm", {
          "pointer-events-none": isMoving,
        })}
        onMouseDown={(e) => enableBlockMove && handleBlockDrag(e, "move")}
      >
        {blockToRender({ ...block.data, meta: block.meta })}
      </div>
      {isDependencyAllowed && renderHandle("end")}
      {/* right resize drag handle */}
      <RightResizable
        enableBlockRightResize={enableBlockRightResize}
        handleBlockDrag={handleBlockDrag}
        isMoving={isMoving}
        position={block.position}
      />
    </div>
  );
});
