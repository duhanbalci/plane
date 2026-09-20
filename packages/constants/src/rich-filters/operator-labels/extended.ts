/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TExtendedSupportedOperators,
  TNegatedOperator,
  TSupportedDateFilterOperators,
  TSupportedOperators,
} from "@plane/types";

/**
 * Extended operator labels
 */
export const EXTENDED_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {} as const;

/**
 * Extended date-specific operator labels
 */
export const EXTENDED_DATE_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {} as const;

/**
 * Negated operator labels for all operators
 */
export const NEGATED_OPERATOR_LABELS_MAP: Record<TNegatedOperator<TSupportedOperators>, string> = {
  not_exact: "is not",
  not_in: "is none of",
  not_range: "not between",
} as const;

/**
 * Negated date operator labels for all date operators
 */
export const NEGATED_DATE_OPERATOR_LABELS_MAP: Record<TNegatedOperator<TSupportedDateFilterOperators>, string> = {
  not_exact: "is not",
  not_range: "not between",
} as const;
