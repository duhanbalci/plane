/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { EInlineDateAttributeNames } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.INLINE_DATE]: {
      /** Paragraf icine tarih chip'i ekler. */
      insertInlineDate: (date?: string) => ReturnType;
    };
  }
}

/**
 * Satir ici tarih node'unun sema tanimi. React icermez.
 */
export const InlineDateExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.INLINE_DATE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      [EInlineDateAttributeNames.DATE]: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "inline-date-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["inline-date-component", mergeAttributes(HTMLAttributes)];
  },
});
