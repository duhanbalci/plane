/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { EInlineStatusAttributeNames } from "./types";
import type { TInlineStatusAttributes } from "./types";
import { DEFAULT_INLINE_STATUS_COLOR } from "./utils";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.INLINE_STATUS]: {
      /** Paragraf icine durum chip'i ekler. */
      insertInlineStatus: (attributes?: Partial<TInlineStatusAttributes>) => ReturnType;
    };
  }
}

/**
 * Satir ici durum node'unun sema tanimi. React icermez.
 */
export const InlineStatusExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.INLINE_STATUS,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      [EInlineStatusAttributeNames.TEXT]: { default: "" },
      [EInlineStatusAttributeNames.COLOR]: { default: DEFAULT_INLINE_STATUS_COLOR },
    };
  },

  parseHTML() {
    return [{ tag: "inline-status-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["inline-status-component", mergeAttributes(HTMLAttributes)];
  },
});
