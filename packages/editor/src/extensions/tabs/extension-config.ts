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
import { ETabAttributeNames, ETabsAttributeNames } from "./types";
import type { TTabsOrientation } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.TABS]: {
      insertTabs: (orientation: TTabsOrientation) => ReturnType;
    };
  }
}

/**
 * Şemaya özel sekme tanımları; React içermez, live server ve PDF export aynı
 * node'u yükler.
 */
export const TabsExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.TABS,
  group: "block",
  content: `${CORE_EXTENSIONS.TAB}+`,
  isolating: true,

  addAttributes() {
    return {
      [ETabsAttributeNames.ORIENTATION]: {
        default: "horizontal",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute(ETabsAttributeNames.ORIENTATION) === "vertical" ? "vertical" : "horizontal",
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          node.forEach((tab) => {
            state.write(`**${tab.attrs[ETabAttributeNames.TITLE] ?? ""}**\n\n`);
            state.renderContent(tab);
          });
          state.closeBlock(node);
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="tabs"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node-type": "tabs",
        class: "editor-tabs",
        "data-spacing-group": "container",
      }),
      0,
    ];
  },
});

export const TabExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.TAB,
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      [ETabAttributeNames.TITLE]: {
        default: "Tab 1",
        parseHTML: (element: HTMLElement) => element.getAttribute(ETabAttributeNames.TITLE) ?? "Tab 1",
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
    return [{ tag: 'div[data-node-type="tab"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node-type": "tab",
        class: "editor-tab",
      }),
      0,
    ];
  },
});
