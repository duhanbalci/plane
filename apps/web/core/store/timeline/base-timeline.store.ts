/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEqual, set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// components
import { DEPENDENT_RELATION_KIND } from "@plane/constants";
import type {
  ChartDataType,
  IBlockUpdateDependencyData,
  IDependencyDrag,
  IDependencyEdge,
  IGanttBlock,
  TDependencyKind,
  TGanttViews,
  EGanttBlockType,
} from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
import { currentViewDataWithView } from "@/components/gantt-chart/data";
import {
  getDateFromPositionOnGantt,
  getItemPositionWidth,
  getPositionFromDate,
} from "@/components/gantt-chart/views/helpers";
// helpers
// store
import type { RootStore } from "@/store/root.store";

// types
type BlockRect = { marginLeft: number; width: number };

/** Highest number of blocks a single drag may cascade through. */
const MAX_PROPAGATION_NODES = 200;

/** Sub pixel slack so float noise is not read as a violated constraint. */
const POSITION_EPSILON = 0.5;

/**
 * Left edge the dependent block must reach for the constraint to hold.
 * FS: dependent starts after the predecessor ends, SS: starts no earlier than
 * the predecessor starts, FF: ends no earlier than the predecessor ends.
 */
const getRequiredLeft = (kind: TDependencyKind, predecessor: BlockRect, dependent: BlockRect) => {
  if (kind === "SS") return predecessor.marginLeft;
  if (kind === "FF") return predecessor.marginLeft + predecessor.width - dependent.width;
  return predecessor.marginLeft + predecessor.width;
};

type BlockData = {
  id: string;
  name: string;
  sort_order: number | null;
  start_date?: string | undefined | null;
  target_date?: string | undefined | null;
  project_id?: string | undefined | null;
};

export interface IBaseTimelineStore {
  // observables
  currentView: TGanttViews;
  currentViewData: ChartDataType | undefined;
  activeBlockId: string | null;
  renderView: any;
  isDragging: boolean;
  isDependencyEnabled: boolean;
  dependencyDrag: IDependencyDrag | null;
  //
  setBlockIds: (ids: string[]) => void;
  getBlockById: (blockId: string) => IGanttBlock;
  // computed functions
  getIsCurrentDependencyDragging: (blockId: string) => boolean;
  isBlockActive: (blockId: string) => boolean;
  // dependencies
  getDependencies: (blockId: string) => IDependencyEdge[];
  getDependencyEdges: () => IDependencyEdge[];
  getIsDependencyViolated: (edge: IDependencyEdge) => boolean;
  startDependencyDrag: (fromId: string, side: "start" | "end", x: number, y: number) => void;
  updateDependencyDrag: (x: number, y: number) => void;
  endDependencyDrag: () => void;
  // actions
  updateCurrentView: (view: TGanttViews) => void;
  updateCurrentViewData: (data: ChartDataType | undefined) => void;
  updateActiveBlockId: (blockId: string | null) => void;
  updateRenderView: (data: any) => void;
  updateAllBlocksOnChartChangeWhileDragging: (addedWidth: number) => void;
  getUpdatedPositionAfterDrag: (
    id: string,
    shouldUpdateHalfBlock: boolean,
    ignoreDependencies?: boolean
  ) => IBlockUpdateDependencyData[];
  updateBlockPosition: (id: string, deltaLeft: number, deltaWidth: number, ignoreDependencies?: boolean) => void;
  getNumberOfDaysFromPosition: (position: number | undefined) => number | undefined;
  setIsDragging: (isDragging: boolean) => void;
  initGantt: () => void;

  getDateFromPositionOnGantt: (position: number, offsetDays: number) => Date | undefined;
  getPositionFromDateOnGantt: (date: string | Date, offSetWidth: number) => number | undefined;
}

export class BaseTimeLineStore implements IBaseTimelineStore {
  blocksMap: Record<string, IGanttBlock> = {};
  blockIds: string[] | undefined = undefined;

  isDragging: boolean = false;
  currentView: TGanttViews = "week";
  currentViewData: ChartDataType | undefined = undefined;
  activeBlockId: string | null = null;
  renderView: any = [];

  rootStore: RootStore;

  isDependencyEnabled = false;
  dependencyDrag: IDependencyDrag | null = null;

  /** Blocks moved by dependency propagation during the current drag. */
  private shiftedBlockIds = new Set<string>();

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      blocksMap: observable,
      blockIds: observable,
      isDragging: observable.ref,
      currentView: observable.ref,
      currentViewData: observable,
      activeBlockId: observable.ref,
      renderView: observable,
      dependencyDrag: observable,
      // actions
      setIsDragging: action,
      startDependencyDrag: action.bound,
      updateDependencyDrag: action.bound,
      endDependencyDrag: action.bound,
      setBlockIds: action.bound,
      initGantt: action.bound,
      updateCurrentView: action.bound,
      updateCurrentViewData: action.bound,
      updateActiveBlockId: action.bound,
      updateRenderView: action.bound,
    });

    this.initGantt();

    this.rootStore = _rootStore;
  }

  /**
   * Update Block Ids to derive blocks from
   * @param ids
   */
  setBlockIds = (ids: string[]) => {
    this.blockIds = ids;
  };

  /**
   * setIsDragging
   * @param isDragging
   */
  setIsDragging = (isDragging: boolean) => {
    runInAction(() => {
      // a fresh drag starts with an empty propagation trail
      if (isDragging && !this.isDragging) this.shiftedBlockIds.clear();
      this.isDragging = isDragging;
    });
  };

  /**
   * @description check if block is active
   * @param {string} blockId
   */
  isBlockActive = computedFn((blockId: string): boolean => this.activeBlockId === blockId);

  /**
   * @description update current view
   * @param {TGanttViews} view
   */
  updateCurrentView = (view: TGanttViews) => {
    this.currentView = view;
  };

  /**
   * @description update current view data
   * @param {ChartDataType | undefined} data
   */
  updateCurrentViewData = (data: ChartDataType | undefined) => {
    runInAction(() => {
      this.currentViewData = data;
    });
  };

  /**
   * @description update active block
   * @param {string | null} block
   */
  updateActiveBlockId = (blockId: string | null) => {
    this.activeBlockId = blockId;
  };

  /**
   * @description update render view
   * @param {any[]} data
   */
  updateRenderView = (data: any[]) => {
    this.renderView = data;
  };

  /**
   * @description initialize gantt chart with month view
   */
  initGantt = () => {
    const newCurrentViewData = currentViewDataWithView(this.currentView);

    runInAction(() => {
      this.currentViewData = newCurrentViewData;
      this.blocksMap = {};
      this.blockIds = undefined;
    });
  };

  /** Gets Block from Id */
  getBlockById = computedFn((blockId: string) => this.blocksMap[blockId]);

  /**
   * updates the BlocksMap from blockIds
   * @param getDataById
   * @returns
   */
  updateBlocks(getDataById: (id: string) => BlockData | undefined | null, type?: EGanttBlockType, index?: number) {
    if (!this.blockIds || !Array.isArray(this.blockIds) || this.isDragging) return true;

    const updatedBlockMaps: { path: string[]; value: any }[] = [];
    const newBlocks: IGanttBlock[] = [];

    // Loop through blockIds to generate blocks Data
    for (const blockId of this.blockIds) {
      const blockData = getDataById(blockId);
      if (!blockData) continue;

      const block: IGanttBlock = {
        data: blockData,
        id: blockData?.id,
        name: blockData.name,
        sort_order: blockData?.sort_order ?? undefined,
        start_date: blockData?.start_date ?? undefined,
        target_date: blockData?.target_date ?? undefined,
        meta: {
          type,
          index,
          project_id: blockData?.project_id,
        },
      };
      if (this.currentViewData && (this.currentViewData?.data?.startDate || this.currentViewData?.data?.dayWidth)) {
        block.position = getItemPositionWidth(this.currentViewData, block);
      }

      // create block updates if the block already exists, or push them to newBlocks
      if (this.blocksMap[blockId]) {
        for (const key of Object.keys(block)) {
          const currValue = this.blocksMap[blockId][key as keyof IGanttBlock];
          const nextValue = block[key as keyof IGanttBlock];
          if (!isEqual(currValue, nextValue)) {
            updatedBlockMaps.push({ path: [blockId, key], value: nextValue });
          }
        }
      } else {
        newBlocks.push(block);
      }
    }

    // update the store with the block updates
    runInAction(() => {
      for (const updatedBlock of updatedBlockMaps) {
        set(this.blocksMap, updatedBlock.path, updatedBlock.value);
      }

      for (const newBlock of newBlocks) {
        set(this.blocksMap, [newBlock.id], newBlock);
      }
    });
  }

  /**
   * returns number of days that the position pixels span across the timeline chart
   * @param position
   * @returns
   */
  getNumberOfDaysFromPosition = (position: number | undefined) => {
    if (!this.currentViewData || !position) return;

    return Math.round(position / this.currentViewData.data.dayWidth);
  };

  /**
   * returns position of the date on chart
   */
  getPositionFromDateOnGantt = computedFn((date: string | Date, offSetWidth: number) => {
    if (!this.currentViewData) return;

    return getPositionFromDate(this.currentViewData, date, offSetWidth);
  });

  /**
   * returns the date at which the position corresponds to on the timeline chart
   */
  getDateFromPositionOnGantt = computedFn((position: number, offsetDays: number) => {
    if (!this.currentViewData) return;

    return getDateFromPositionOnGantt(position, this.currentViewData, offsetDays);
  });

  /**
   * Adds width on Chart position change while the blocks are being dragged
   * @param addedWidth
   */
  updateAllBlocksOnChartChangeWhileDragging = action((addedWidth: number) => {
    if (!this.blockIds || !this.isDragging) return;

    runInAction(() => {
      this.blockIds?.forEach((blockId) => {
        const currBlock = this.blocksMap[blockId];

        if (!currBlock || !currBlock.position) return;

        currBlock.position.marginLeft += addedWidth;
      });
    });
  });

  /**
   * returns updates dates of blocks post drag.
   * @param id
   * @param shouldUpdateHalfBlock if is a half block then update the incomplete block only if this is true
   * @returns
   */
  getUpdatedPositionAfterDrag = action(
    (id: string, shouldUpdateHalfBlock: boolean, ignoreDependencies = false): IBlockUpdateDependencyData[] => {
      const currBlock = this.blocksMap[id];

      if (!currBlock?.position || !this.currentViewData) return [];

      const updatePayload: IBlockUpdateDependencyData = { id, meta: currBlock.meta };

      // If shouldUpdateHalfBlock or the start date is available then update start date
      if (shouldUpdateHalfBlock || currBlock.start_date) {
        updatePayload.start_date = renderFormattedPayloadDate(
          getDateFromPositionOnGantt(currBlock.position.marginLeft, this.currentViewData)
        );
      }
      // If shouldUpdateHalfBlock or the target date is available then update target date
      if (shouldUpdateHalfBlock || currBlock.target_date) {
        updatePayload.target_date = renderFormattedPayloadDate(
          getDateFromPositionOnGantt(currBlock.position.marginLeft + currBlock.position.width, this.currentViewData, -1)
        );
      }

      const updates = [updatePayload];

      if (ignoreDependencies || !this.isDependencyEnabled) return updates;

      // blocks already nudged by the live preview plus anything still violated
      const shiftedIds = new Set(this.shiftedBlockIds);
      for (const blockId of Object.keys(this.computeDependencyShifts(id))) shiftedIds.add(blockId);

      for (const blockId of shiftedIds) {
        if (blockId === id) continue;
        const block = this.blocksMap[blockId];
        if (!block?.position) continue;

        updates.push({
          id: blockId,
          meta: block.meta,
          start_date: renderFormattedPayloadDate(
            getDateFromPositionOnGantt(block.position.marginLeft, this.currentViewData)
          ),
          target_date: renderFormattedPayloadDate(
            getDateFromPositionOnGantt(block.position.marginLeft + block.position.width, this.currentViewData, -1)
          ),
        });
      }

      return updates;
    }
  );

  /**
   * updates the block's position such as marginLeft and width while dragging
   * @param id
   * @param deltaLeft
   * @param deltaWidth
   * @returns
   */
  updateBlockPosition = action((id: string, deltaLeft: number, deltaWidth: number, ignoreDependencies = false) => {
    const currBlock = this.blocksMap[id];

    if (!currBlock?.position) return;

    const newMarginLeft = currBlock.position.marginLeft + deltaLeft;
    const newWidth = currBlock.position.width + deltaWidth;

    runInAction(() => {
      set(this.blocksMap, [id, "position"], {
        marginLeft: newMarginLeft ?? currBlock.position?.marginLeft,
        width: newWidth ?? currBlock.position?.width,
      });

      if (ignoreDependencies || !this.isDependencyEnabled) return;

      // preview the cascade live while the pointer is still down
      const shifts = this.computeDependencyShifts(id);
      for (const [blockId, rect] of Object.entries(shifts)) {
        this.shiftedBlockIds.add(blockId);
        set(this.blocksMap, [blockId, "position"], rect);
      }
    });
  });

  /** Whether the block may take part in a connector: it needs both dates and a position. */
  private canConnect = (blockId: string) => {
    const block = this.blocksMap[blockId];
    return !!block?.position && !!block.start_date && !!block.target_date;
  };

  /**
   * Dependency edges leaving the given block, always predecessor -> dependent.
   * Read from the relation map, so a relation created anywhere shows up here.
   */
  getDependencies = computedFn((blockId: string): IDependencyEdge[] => {
    if (!this.isDependencyEnabled) return [];

    const relations = this.rootStore?.issue?.issueDetail?.relation?.relationMap?.[blockId];
    if (!relations) return [];

    const edges: IDependencyEdge[] = [];
    for (const [relationType, kind] of Object.entries(DEPENDENT_RELATION_KIND)) {
      for (const to of relations[relationType as keyof typeof relations] ?? []) {
        if (to === blockId) continue;
        edges.push({ from: blockId, to, kind });
      }
    }
    return edges;
  });

  /** Every drawable dependency edge between the blocks currently on the chart. */
  getDependencyEdges = computedFn((): IDependencyEdge[] => {
    if (!this.isDependencyEnabled || !this.blockIds) return [];

    const edges: IDependencyEdge[] = [];
    for (const blockId of this.blockIds) {
      if (!this.canConnect(blockId)) continue;
      for (const edge of this.getDependencies(blockId)) {
        if (!this.canConnect(edge.to)) continue;
        edges.push(edge);
      }
    }
    return edges;
  });

  /** Whether the dependent block breaks the constraint of the given edge. */
  getIsDependencyViolated = computedFn((edge: IDependencyEdge): boolean => {
    const from = this.blocksMap[edge.from]?.position;
    const to = this.blocksMap[edge.to]?.position;
    if (!from || !to) return false;

    return to.marginLeft < getRequiredLeft(edge.kind, from, to) - POSITION_EPSILON;
  });

  /**
   * Walks the dependent graph from the given block and returns the minimum
   * forward shift of every block whose constraint is violated. Breadth first,
   * duration preserving and bounded, so a cyclic graph cannot loop forever.
   */
  private computeDependencyShifts = (rootId: string): Record<string, BlockRect> => {
    const shifts: Record<string, BlockRect> = {};

    if (!this.isDependencyEnabled) return shifts;

    const getRect = (blockId: string): BlockRect | undefined => shifts[blockId] ?? this.blocksMap[blockId]?.position;

    const queue: string[] = [rootId];
    let processed = 0;

    while (queue.length > 0 && processed < MAX_PROPAGATION_NODES) {
      const currentId = queue.shift() as string;
      processed++;

      const predecessor = getRect(currentId);
      if (!predecessor || !this.canConnect(currentId)) continue;

      for (const edge of this.getDependencies(currentId)) {
        if (!this.canConnect(edge.to)) continue;

        const dependent = getRect(edge.to);
        if (!dependent) continue;

        const requiredLeft = getRequiredLeft(edge.kind, predecessor, dependent);
        if (dependent.marginLeft >= requiredLeft - POSITION_EPSILON) continue;

        shifts[edge.to] = { marginLeft: requiredLeft, width: dependent.width };
        queue.push(edge.to);
      }
    }

    return shifts;
  };

  /** Blocks force render while a connector is being dragged so it can be dropped on them. */
  getIsCurrentDependencyDragging = computedFn((_blockId: string) => !!this.dependencyDrag);

  startDependencyDrag = (fromId: string, side: "start" | "end", x: number, y: number) => {
    this.dependencyDrag = { fromId, side, x, y };
  };

  updateDependencyDrag = (x: number, y: number) => {
    if (!this.dependencyDrag) return;
    this.dependencyDrag = { ...this.dependencyDrag, x, y };
  };

  endDependencyDrag = () => {
    this.dependencyDrag = null;
  };
}
