/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mark, mergeAttributes } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { ECommentMarkAttributeNames } from "./types";

/**
 * Schema-only definition of the inline comment mark. Kept free of React and of
 * any callback so the live server and the PDF export load the very same mark.
 */
export const CommentMarkExtensionConfig = Mark.create({
  name: CORE_EXTENSIONS.COMMENT,
  inclusive: false,
  excludes: "",
  keepOnSplit: true,

  addAttributes() {
    return {
      [ECommentMarkAttributeNames.IDS]: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-ids"),
        renderHTML: (attributes) => {
          const ids = attributes[ECommentMarkAttributeNames.IDS];
          if (!ids) return {};
          return { "data-comment-ids": ids };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-ids]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "editor-comment-mark" }), 0];
  },
});
