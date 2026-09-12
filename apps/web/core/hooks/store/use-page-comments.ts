/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IPageCommentsStore } from "@/store/pages/page-comments.store";

export const usePageComments = (): IPageCommentsStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("usePageComments must be used within StoreProvider");
  return context.pageComments;
};
