/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  TAllAvailableOperatorsForDisplay,
  TFilterConditionNode,
  TFilterProperty,
  TFilterValue,
} from "@plane/types";
// local imports
import { getOperatorForDisplay } from "../../operators/shared";

/**
 * Helper function to get the display operator for a condition.
 * Negated conditions are shown with their negated operator variant.
 * @param condition - The condition to get the display operator for
 * @returns The display operator (possibly negated)
 */
export const getDisplayOperator = <P extends TFilterProperty>(
  condition: TFilterConditionNode<P, TFilterValue>
): TAllAvailableOperatorsForDisplay => getOperatorForDisplay(condition.operator, condition.isNegation);
