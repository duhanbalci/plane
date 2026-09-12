/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { getMarkType } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// types
import type { TPageCommentConfig } from "@/types";
// local imports
import { CommentMarkExtensionConfig } from "./extension-config";
import { CommentMarkPlugin, commentMarkPluginKey, findCommentMarkRanges } from "./plugin";
import type { TCommentMarkRange } from "./types";
import { ECommentMarkAttributeNames, parseCommentMarkIds, serializeCommentMarkIds } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.COMMENT]: {
      /** mark the current selection as belonging to the given thread */
      setCommentMark: (markId: string) => ReturnType;
      /** drop a single thread id, leaving any overlapping thread in place */
      unsetCommentMark: (markId: string) => ReturnType;
      /** highlight the ranges of a thread, or clear the highlight with null */
      setActiveCommentMark: (markId: string | null) => ReturnType;
    };
  }
}

export function CommentMarkExtension(pageCommentConfig?: TPageCommentConfig) {
  return CommentMarkExtensionConfig.extend({
    addOptions(this) {
      return {
        ...this.parent?.(),
        pageCommentConfig,
      };
    },

    addCommands() {
      return {
        setCommentMark:
          (markId: string) =>
          ({ state, tr, dispatch }) => {
            const { from, to } = state.selection;
            if (!markId || from === to) return false;
            if (!dispatch) return true;

            const markType = getMarkType(CORE_EXTENSIONS.COMMENT, state.schema);
            // Rewrite range by range so an existing thread id on the same text
            // survives alongside the new one.
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return true;
              const start = Math.max(pos, from);
              const end = Math.min(pos + node.nodeSize, to);
              if (start >= end) return true;

              const existing = node.marks.find((mark) => mark.type.name === CORE_EXTENSIONS.COMMENT);
              const ids = parseCommentMarkIds(existing?.attrs[ECommentMarkAttributeNames.IDS]);
              ids.push(markId);
              tr.addMark(
                start,
                end,
                markType.create({ [ECommentMarkAttributeNames.IDS]: serializeCommentMarkIds(ids) })
              );
              return true;
            });
            dispatch(tr);
            return true;
          },

        unsetCommentMark:
          (markId: string) =>
          ({ state, tr, dispatch }) => {
            if (!markId) return false;
            const ranges = findCommentMarkRanges(state, markId);
            if (ranges.length === 0) return false;
            if (!dispatch) return true;

            const markType = getMarkType(CORE_EXTENSIONS.COMMENT, state.schema);
            for (const range of ranges) {
              state.doc.nodesBetween(range.from, range.to, (node, pos) => {
                if (!node.isText) return true;
                const existing = node.marks.find((mark) => mark.type.name === CORE_EXTENSIONS.COMMENT);
                if (!existing) return true;

                const start = Math.max(pos, range.from);
                const end = Math.min(pos + node.nodeSize, range.to);
                if (start >= end) return true;

                const remaining = parseCommentMarkIds(existing.attrs[ECommentMarkAttributeNames.IDS]).filter(
                  (id) => id !== markId
                );
                tr.removeMark(start, end, markType);
                if (remaining.length > 0) {
                  tr.addMark(
                    start,
                    end,
                    markType.create({ [ECommentMarkAttributeNames.IDS]: serializeCommentMarkIds(remaining) })
                  );
                }
                return true;
              });
            }
            dispatch(tr);
            return true;
          },

        setActiveCommentMark:
          (markId: string | null) =>
          ({ tr, dispatch }) => {
            if (!dispatch) return true;
            dispatch(tr.setMeta(commentMarkPluginKey, { activeMarkId: markId }));
            return true;
          },
      };
    },

    addProseMirrorPlugins() {
      return [CommentMarkPlugin(pageCommentConfig?.onClick)];
    },
  });
}

/** The first document range of a thread, for scrolling it into view. */
export const getCommentMarkRange = (
  state: Parameters<typeof findCommentMarkRanges>[0],
  markId: string
): TCommentMarkRange | undefined => findCommentMarkRanges(state, markId)[0];

/** The comment config the editor was built with, for menus that only get the editor. */
export const getPageCommentConfig = (editor: Editor): TPageCommentConfig | undefined => {
  const extension = editor.extensionManager.extensions.find((item) => item.name === CORE_EXTENSIONS.COMMENT);
  return (extension?.options as { pageCommentConfig?: TPageCommentConfig } | undefined)?.pageCommentConfig;
};
