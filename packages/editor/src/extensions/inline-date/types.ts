/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EInlineDateAttributeNames {
  DATE = "date",
}

export type TInlineDateAttributes = {
  [EInlineDateAttributeNames.DATE]: string | null;
};

export type TInlineDateStorage = {
  /** Yeni eklenen chip'in takvimi acik gelsin diye node view'in tuketecegi bayrak. */
  openNextNodeView: boolean;
  markdown: unknown;
};
