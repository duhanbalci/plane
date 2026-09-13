/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum ETabsAttributeNames {
  ORIENTATION = "data-orientation",
}

export enum ETabAttributeNames {
  TITLE = "data-title",
}

export type TTabsOrientation = "horizontal" | "vertical";

export type TTabsAttributes = {
  [ETabsAttributeNames.ORIENTATION]: TTabsOrientation;
};

export type TTabAttributes = {
  [ETabAttributeNames.TITLE]: string;
};

export const DEFAULT_TAB_TITLE = "Tab";
