/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EInlineStatusAttributeNames {
  TEXT = "text",
  COLOR = "color",
}

export type TInlineStatusColor = "gray" | "green" | "red" | "yellow" | "blue" | "purple";

export type TInlineStatusAttributes = {
  [EInlineStatusAttributeNames.TEXT]: string;
  [EInlineStatusAttributeNames.COLOR]: TInlineStatusColor;
};

export type TInlineStatusStorage = {
  /** Yeni eklenen chip'in secicisi acik gelsin diye node view'in tuketecegi bayrak. */
  openNextNodeView: boolean;
  markdown: unknown;
};
