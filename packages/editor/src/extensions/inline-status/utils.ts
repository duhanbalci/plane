/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TInlineStatusColor } from "./types";

export const INLINE_STATUS_PLACEHOLDER = "STATUS";

export const INLINE_STATUS_COLORS: { key: TInlineStatusColor; label: string }[] = [
  { key: "gray", label: "Gray" },
  { key: "green", label: "Green" },
  { key: "red", label: "Red" },
  { key: "yellow", label: "Yellow" },
  { key: "blue", label: "Blue" },
  { key: "purple", label: "Purple" },
];

export const DEFAULT_INLINE_STATUS_COLOR: TInlineStatusColor = "gray";

/** Chip'in arka plan/metin rengi editor.css'teki degiskenlerden gelir. */
export const getInlineStatusColorStyle = (color: TInlineStatusColor) => ({
  backgroundColor: `var(--editor-status-${color}-background)`,
  color: `var(--editor-status-${color}-text)`,
});
