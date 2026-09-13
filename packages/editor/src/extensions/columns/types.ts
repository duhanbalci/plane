/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EColumnAttributeNames {
  WIDTH = "data-width",
}

export type TColumnAttributes = {
  [EColumnAttributeNames.WIDTH]: number;
};

/** Gerçek Plane ile aynı: kolon sayısı 2-4 arası. */
export type TColumnCount = 2 | 3 | 4;
