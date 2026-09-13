/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { EColumnAttributeNames } from "./types";
import type { TColumnCount } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.COLUMN_LIST]: {
      insertColumns: (count: TColumnCount) => ReturnType;
    };
  }
}

/**
 * Şemaya özel kolon tanımları; React içermez, live server ve PDF export aynı
 * node'u yükler.
 */
export const ColumnListExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.COLUMN_LIST,
  group: "block",
  content: `${CORE_EXTENSIONS.COLUMN}+`,
  isolating: true,

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          node.forEach((column) => {
            state.renderContent(column);
          });
          state.closeBlock(node);
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="column-list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node-type": "column-list",
        class: "editor-column-list horizontal-scrollbar scrollbar-sm",
        "data-spacing-group": "container",
      }),
      0,
    ];
  },
});

export const ColumnExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.COLUMN,
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      [EColumnAttributeNames.WIDTH]: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          const width = Number(element.getAttribute(EColumnAttributeNames.WIDTH));
          return Number.isFinite(width) && width > 0 ? width : 1;
        },
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.renderContent(node);
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node-type": "column",
        class: "editor-column",
      }),
      0,
    ];
  },
});
