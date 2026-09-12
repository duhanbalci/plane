/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TPageCommentConfig = {
  /** open the composer for a fresh thread and return the mark id to apply */
  onCreate: (range: { from: number; to: number; text: string }) => Promise<string | undefined>;
  /** the reader clicked commented text */
  onClick: (ids: string[]) => void;
  /** thread currently highlighted in the document */
  activeMarkId?: string;
};
