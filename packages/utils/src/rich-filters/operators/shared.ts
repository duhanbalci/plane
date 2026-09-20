/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAllAvailableOperatorsForDisplay, TNegatedOperator, TSupportedOperators } from "@plane/types";
import { NEGATION_OPERATOR_PREFIX } from "@plane/types";

/**
 * Result type for operator conversion
 */
export type TOperatorForPayload = {
  operator: TSupportedOperators;
  isNegation: boolean;
};

/**
 * Checks whether a display operator is the negated variant of a supported operator.
 * @param displayOperator - The operator from the UI
 * @returns True if the operator is negated
 */
export const isNegatedOperator = (
  displayOperator: TAllAvailableOperatorsForDisplay
): displayOperator is TNegatedOperator<TSupportedOperators> => displayOperator.startsWith(NEGATION_OPERATOR_PREFIX);

/**
 * Converts a display operator to the format needed for supported by filter expression condition.
 * @param displayOperator - The operator from the UI
 * @returns Object with supported operator and negation flag
 */
export const getOperatorForPayload = (displayOperator: TAllAvailableOperatorsForDisplay): TOperatorForPayload => {
  if (isNegatedOperator(displayOperator)) {
    return {
      operator: displayOperator.slice(NEGATION_OPERATOR_PREFIX.length) as TSupportedOperators,
      isNegation: true,
    };
  }

  return {
    operator: displayOperator,
    isNegation: false,
  };
};

/**
 * Converts a supported operator and its negation flag into the operator shown in the UI.
 * @param operator - The supported operator
 * @param isNegation - Whether the condition is negated
 * @returns The display operator
 */
export const getOperatorForDisplay = <T extends TSupportedOperators>(
  operator: T,
  isNegation?: boolean
): T | TNegatedOperator<T> =>
  isNegation ? (`${NEGATION_OPERATOR_PREFIX}${operator}` as TNegatedOperator<T>) : operator;
