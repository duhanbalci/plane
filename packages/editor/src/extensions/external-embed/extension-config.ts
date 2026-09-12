/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { EExternalEmbedAttributeNames, EExternalEmbedDisplay } from "./types";
import type { TInsertExternalEmbedProps } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.EXTERNAL_EMBED]: {
      insertExternalEmbed: (props: TInsertExternalEmbedProps) => ReturnType;
    };
  }
}

/**
 * Schema-only definition of the external embed block. Kept free of React so the
 * live server and the PDF export load the very same node.
 */
export const ExternalEmbedExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.EXTERNAL_EMBED,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      [EExternalEmbedAttributeNames.ID]: { default: null },
      [EExternalEmbedAttributeNames.SOURCE]: { default: null },
      [EExternalEmbedAttributeNames.DISPLAY]: { default: EExternalEmbedDisplay.EMBED },
      [EExternalEmbedAttributeNames.TITLE]: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "external-embed-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["external-embed-component", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      insertExternalEmbed:
        (props) =>
        ({ commands }) => {
          const attributes = {
            [EExternalEmbedAttributeNames.SOURCE]: props.src ?? null,
            [EExternalEmbedAttributeNames.DISPLAY]: props.display ?? EExternalEmbedDisplay.EMBED,
          };
          if (props.pos !== undefined) {
            return commands.insertContentAt(props.pos, {
              type: this.name,
              attrs: attributes,
            });
          }
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});
