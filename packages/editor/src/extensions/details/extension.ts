/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// helpers
import { insertEmptyParagraphAtNodeBoundaries } from "@/helpers/insert-empty-paragraph-at-node-boundary";
// local imports
import {
  DetailsContentExtensionConfig,
  DetailsExtensionConfig,
  DetailsSummaryExtensionConfig,
} from "./extension-config";
import { createDetailsNodeView } from "./node-view";
import type { TDetailsStorage } from "./types";

export const DetailsSummaryExtension = DetailsSummaryExtensionConfig.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.renderInline(node);
          state.closeBlock(node);
        },
      },
    };
  },
});

export const DetailsContentExtension = DetailsContentExtensionConfig.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.renderContent(node);
        },
      },
    };
  },
});

export const DetailsExtension = DetailsExtensionConfig.extend<unknown, TDetailsStorage>({
  selectable: true,
  draggable: true,

  addStorage() {
    return {
      // yeni eklenen toggle acik gelsin diye node view'in tuketecegi bayrak
      openNextNodeView: false,
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.renderContent(node);
        },
      },
    };
  },

  addCommands() {
    return {
      setDetails:
        () =>
        ({ chain, state }) => {
          const { $from } = state.selection;
          const insertPos = $from.before($from.depth);
          // imlecin bulundugu blogun icerigini toggle govdesine tasi
          const block = $from.node($from.depth);
          const content = block?.content?.size ? block.toJSON() : { type: CORE_EXTENSIONS.PARAGRAPH };
          this.storage.openNextNodeView = true;
          return chain()
            .insertContent({
              type: this.name,
              content: [
                { type: CORE_EXTENSIONS.DETAILS_SUMMARY },
                { type: CORE_EXTENSIONS.DETAILS_CONTENT, content: [content] },
              ],
            })
            .command(({ tr, dispatch }) => {
              if (!dispatch) return true;
              // imleci yeni toggle'in basligina koy
              let target: number | null = null;
              tr.doc.nodesBetween(Math.max(0, insertPos - 1), Math.min(tr.doc.content.size, insertPos + 4), (n, p) => {
                if (target === null && n.type.name === this.name) target = p;
              });
              if (target !== null) tr.setSelection(TextSelection.create(tr.doc, target + 2));
              return true;
            })
            .run();
        },
      unsetDetails:
        () =>
        ({ state, chain }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name !== this.name) continue;
            const pos = $from.before(depth);
            const node = $from.node(depth);
            const summary = node.firstChild;
            const content = node.lastChild;
            const replacement = [
              {
                type: CORE_EXTENSIONS.PARAGRAPH,
                content: summary?.content?.size ? summary.toJSON().content : undefined,
              },
              ...(content ? (content.toJSON().content ?? []) : []),
            ];
            return chain()
              .insertContentAt({ from: pos, to: pos + node.nodeSize }, replacement)
              .run();
          }
          return false;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // baslikta Enter -> govdenin ilk blokuna gec
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        const summaryDepth = findParentDepth($from, CORE_EXTENSIONS.DETAILS_SUMMARY);
        if (summaryDepth === null) return false;
        const summaryEnd = $from.after(summaryDepth);
        const contentStart = summaryEnd + 2;
        if (contentStart > state.doc.content.size) return false;
        return editor
          .chain()
          .command(({ tr, dispatch }) => {
            if (dispatch) tr.setSelection(TextSelection.create(tr.doc, contentStart));
            return true;
          })
          .focus()
          .run();
      },
      // bos basligin basinda Backspace -> toggle'i coz
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        const summaryDepth = findParentDepth($from, CORE_EXTENSIONS.DETAILS_SUMMARY);
        if (summaryDepth === null) return false;
        if ($from.parentOffset !== 0) return false;
        return editor.commands.unsetDetails();
      },
      ArrowDown: insertEmptyParagraphAtNodeBoundaries("down", this.name),
      ArrowUp: insertEmptyParagraphAtNodeBoundaries("up", this.name),
    };
  },

  addNodeView() {
    return createDetailsNodeView(() => {
      const shouldOpen = this.storage.openNextNodeView;
      this.storage.openNextNodeView = false;
      return shouldOpen;
    });
  },
});

/** Verilen tipteki en yakin ust node'un derinligi. */
const findParentDepth = ($pos: { depth: number; node: (depth: number) => ProseMirrorNode }, typeName: string) => {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === typeName) return depth;
  }
  return null;
};
