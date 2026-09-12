/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Nested pages: the API exposes the parent as `parent` (PageSerializer), the
// sibling order as `sort_order` and the read-only child count as
// `sub_pages_count`.
export type TPageExtended = {
  parent?: string | null;
  sort_order?: number;
  sub_pages_count?: number;
};
