/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { EPageEmbedAttributeNames } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.PAGE_EMBED]: {
      insertPageEmbed: (attributes: { entity_identifier: string }) => ReturnType;
    };
  }
}

/**
 * Schema-only definition of the sub page embed. Kept free of React so the live
 * server and the PDF export load the very same node.
 */
export const PageEmbedExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.PAGE_EMBED,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      [EPageEmbedAttributeNames.ID]: { default: undefined },
      [EPageEmbedAttributeNames.ENTITY_IDENTIFIER]: { default: undefined },
    };
  },

  parseHTML() {
    return [{ tag: "page-embed-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["page-embed-component", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertPageEmbed:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
    };
  },
});
