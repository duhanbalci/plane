/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

// Nested pages: the API exposes the parent as `parent` (PageSerializer), the
// sibling order as `sort_order` and the read-only child count as
// `sub_pages_count`. Wiki pages additionally carry the collection they sit in.
export type TPageExtended = {
  parent?: string | null;
  sort_order?: number;
  sub_pages_count?: number;
  collection?: string | null;
  is_global?: boolean;
};

/** A wiki collection: the folder workspace pages are grouped in. */
export type TPageCollection = {
  id: string;
  name: string;
  description?: string;
  logo_props?: TLogoProps;
  access: number;
  owned_by: string;
  sort_order: number;
  is_default: boolean;
  page_count?: number;
  workspace: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
};
