/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IDependencyEdge } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
// local imports
import { BLOCK_HEIGHT, HEADER_HEIGHT } from "../constants";

/** Rows drawn above and below the visible window. */
const ROW_OVERSCAN = 20;

/** Horizontal stub before a connector turns. */
const ELBOW_GAP = 10;

const STROKE_DEFAULT = "#9ca3af";
const STROKE_VIOLATED = "#ef4444";

/** Relation type held on the predecessor for each constraint kind. */
const KIND_TO_RELATION = {
  FS: "blocking",
  SS: "start_before",
  FF: "finish_before",
} as const;

type Props = {
  blockIds: string[];
  itemsContainerWidth: number;
  ganttContainerRef: RefObject<HTMLDivElement | null>;
};

type Point = { x: number; y: number };

/** Orthogonal path between the two connector endpoints. */
const getEdgePath = (kind: IDependencyEdge["kind"], from: Point, to: Point) => {
  if (kind === "SS") {
    const turn = Math.min(from.x, to.x) - ELBOW_GAP;
    return `M ${from.x} ${from.y} H ${turn} V ${to.y} H ${to.x}`;
  }

  if (kind === "FF") {
    const turn = Math.max(from.x, to.x) + ELBOW_GAP;
    return `M ${from.x} ${from.y} H ${turn} V ${to.y} H ${to.x}`;
  }

  // FS, forward: single elbow out of the predecessor's end
  if (to.x >= from.x + 2 * ELBOW_GAP) {
    return `M ${from.x} ${from.y} H ${from.x + ELBOW_GAP} V ${to.y} H ${to.x}`;
  }

  // FS, dependent sits to the left: route around through the row gutter
  const gutter = from.y < to.y ? from.y + BLOCK_HEIGHT / 2 : from.y - BLOCK_HEIGHT / 2;
  return `M ${from.x} ${from.y} H ${from.x + ELBOW_GAP} V ${gutter} H ${to.x - ELBOW_GAP} V ${to.y} H ${to.x}`;
};

export const DependencyLayer = observer(function DependencyLayer(props: Props) {
  const { blockIds, itemsContainerWidth, ganttContainerRef } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { isDependencyEnabled, getBlockById, getDependencyEdges, getIsDependencyViolated, dependencyDrag } =
    useTimeLineChartStore();
  const { removeRelation } = useIssueDetail();
  // states
  const [viewport, setViewport] = useState({ scrollTop: 0, clientHeight: 0 });
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const syncViewport = useCallback(() => {
    const element = ganttContainerRef.current;
    if (!element) return;
    setViewport({ scrollTop: element.scrollTop, clientHeight: element.clientHeight });
  }, [ganttContainerRef]);

  useEffect(() => {
    const element = ganttContainerRef.current;
    if (!element) return;

    syncViewport();
    element.addEventListener("scroll", syncViewport, { passive: true });
    window.addEventListener("resize", syncViewport);

    return () => {
      element.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [ganttContainerRef, syncViewport]);

  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    blockIds.forEach((blockId, index) => map.set(blockId, index));
    return map;
  }, [blockIds]);

  if (!isDependencyEnabled) return null;

  const firstRow = Math.floor((viewport.scrollTop - HEADER_HEIGHT) / BLOCK_HEIGHT) - ROW_OVERSCAN;
  const lastRow = Math.ceil((viewport.scrollTop - HEADER_HEIGHT + viewport.clientHeight) / BLOCK_HEIGHT) + ROW_OVERSCAN;

  const rowCenter = (index: number) => index * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;

  const getEndpoints = (edge: IDependencyEdge): { from: Point; to: Point } | undefined => {
    const fromIndex = rowIndexMap.get(edge.from);
    const toIndex = rowIndexMap.get(edge.to);
    if (fromIndex === undefined || toIndex === undefined) return;

    // only draw what the user can actually see
    const topRow = Math.min(fromIndex, toIndex);
    const bottomRow = Math.max(fromIndex, toIndex);
    if (bottomRow < firstRow || topRow > lastRow) return;

    const fromPosition = getBlockById(edge.from)?.position;
    const toPosition = getBlockById(edge.to)?.position;
    if (!fromPosition || !toPosition) return;

    const fromX = edge.kind === "SS" ? fromPosition.marginLeft : fromPosition.marginLeft + fromPosition.width;
    const toX = edge.kind === "FF" ? toPosition.marginLeft + toPosition.width : toPosition.marginLeft;

    return { from: { x: fromX, y: rowCenter(fromIndex) }, to: { x: toX, y: rowCenter(toIndex) } };
  };

  const handleRemove = (edge: IDependencyEdge) => {
    const fromBlock = getBlockById(edge.from);
    const projectId = fromBlock?.data?.project_id ?? fromBlock?.meta?.project_id;
    if (!workspaceSlug || !projectId) return;

    removeRelation(workspaceSlug.toString(), projectId, edge.from, KIND_TO_RELATION[edge.kind], edge.to).catch(() => {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Something went wrong while removing the dependency",
      });
    });
  };

  const dragLine = (() => {
    if (!dependencyDrag) return undefined;
    const index = rowIndexMap.get(dependencyDrag.fromId);
    const position = getBlockById(dependencyDrag.fromId)?.position;
    if (index === undefined || !position) return undefined;

    const x = dependencyDrag.side === "start" ? position.marginLeft : position.marginLeft + position.width;
    return { from: { x, y: rowCenter(index) }, to: { x: dependencyDrag.x, y: dependencyDrag.y } };
  })();

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-[4] overflow-visible"
      width={itemsContainerWidth}
      height={Math.max(blockIds.length * BLOCK_HEIGHT, 0)}
    >
      <defs>
        <marker id="dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={STROKE_DEFAULT} />
        </marker>
        <marker id="dependency-arrow-violated" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={STROKE_VIOLATED} />
        </marker>
      </defs>

      {getDependencyEdges().map((edge) => {
        const endpoints = getEndpoints(edge);
        if (!endpoints) return null;

        const key = `${edge.from}-${edge.to}-${edge.kind}`;
        const isViolated = getIsDependencyViolated(edge);
        const isHovered = hoveredEdge === key;
        const stroke = isViolated ? STROKE_VIOLATED : STROKE_DEFAULT;
        const path = getEdgePath(edge.kind, endpoints.from, endpoints.to);
        const midPoint = {
          x: (endpoints.from.x + endpoints.to.x) / 2,
          y: (endpoints.from.y + endpoints.to.y) / 2,
        };

        return (
          <g key={key}>
            {/* wide invisible hit area so thin connectors stay grabbable */}
            <path
              className={dependencyDrag ? "pointer-events-none" : "pointer-events-auto cursor-pointer"}
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={10}
              onMouseEnter={() => setHoveredEdge(key)}
              onMouseLeave={() => setHoveredEdge((curr) => (curr === key ? null : curr))}
            />
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={isHovered ? 2.5 : 1.5}
              markerEnd={`url(#${isViolated ? "dependency-arrow-violated" : "dependency-arrow"})`}
            />
            {isHovered && (
              <g
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredEdge(key)}
                onClick={() => handleRemove(edge)}
              >
                <circle cx={midPoint.x} cy={midPoint.y} r={7} fill={stroke} />
                <path
                  d={`M ${midPoint.x - 3} ${midPoint.y - 3} L ${midPoint.x + 3} ${midPoint.y + 3} M ${midPoint.x + 3} ${midPoint.y - 3} L ${midPoint.x - 3} ${midPoint.y + 3}`}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            )}
          </g>
        );
      })}

      {dragLine && (
        <path
          d={`M ${dragLine.from.x} ${dragLine.from.y} L ${dragLine.to.x} ${dragLine.to.y}`}
          fill="none"
          stroke={STROKE_DEFAULT}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd="url(#dependency-arrow)"
        />
      )}
    </svg>
  );
});
