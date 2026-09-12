/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum ECommentMarkAttributeNames {
  /** comma separated thread mark ids, so overlapping threads can share a range */
  IDS = "ids",
}

export type TCommentMarkAttributes = {
  [ECommentMarkAttributeNames.IDS]: string | null;
};

export type TCommentMarkRange = {
  from: number;
  to: number;
};

/** Split the stored attribute into a list of thread mark ids. */
export const parseCommentMarkIds = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
};

/** Join thread mark ids back into the stored attribute, de-duplicated. */
export const serializeCommentMarkIds = (ids: string[]): string | null => {
  const unique = Array.from(new Set(ids.filter((id) => id.length > 0)));
  return unique.length > 0 ? unique.join(",") : null;
};
