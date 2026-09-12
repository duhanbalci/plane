/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty, TIssueType, TSupportedOperators } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

/**
 * Work item type filter specific params
 */
export type TCreateWorkItemTypeFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<TIssueType> & {
    workItemTypes: TIssueType[];
  };

/**
 * Helper to get the work item type multi select config
 */
export const getWorkItemTypeMultiSelectConfig = (
  params: TCreateWorkItemTypeFilterParams,
  singleValueOperator: TSupportedOperators
) =>
  getMultiSelectConfig<TIssueType, string, TIssueType>(
    {
      items: params.workItemTypes,
      getId: (workItemType) => workItemType.id,
      getLabel: (workItemType) => workItemType.name,
      getValue: (workItemType) => workItemType.id,
      getIconData: (workItemType) => workItemType,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      getOptionIcon: params.getOptionIcon,
    }
  );

/**
 * Get the work item type filter config
 * @template K - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the work item type filter config
 */
export const getWorkItemTypeFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateWorkItemTypeFilterParams> =>
  (params: TCreateWorkItemTypeFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Type",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getWorkItemTypeMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
        ),
      ]),
    });
