/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import type { TCommentMarkRange } from "./types";
import { ECommentMarkAttributeNames, parseCommentMarkIds } from "./types";

type CommentMarkState = {
  activeMarkId: string | null;
  decorations: DecorationSet;
};

type CommentMarkMeta = {
  activeMarkId?: string | null;
};

export const commentMarkPluginKey = new PluginKey<CommentMarkState>("commentMark");

/** Every range of the document carrying the given thread mark id. */
export const findCommentMarkRanges = (state: EditorState, markId: string): TCommentMarkRange[] => {
  const ranges: TCommentMarkRange[] = [];
  if (!markId) return ranges;

  state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find(
      (item) =>
        item.type.name === CORE_EXTENSIONS.COMMENT &&
        parseCommentMarkIds(item.attrs[ECommentMarkAttributeNames.IDS]).includes(markId)
    );
    if (!mark) return true;

    const from = pos;
    const to = pos + node.nodeSize;
    const previous = ranges[ranges.length - 1];
    // Merge the adjacent text nodes of one marked run into a single range.
    if (previous && previous.to === from) {
      previous.to = to;
    } else {
      ranges.push({ from, to });
    }
    return true;
  });

  return ranges;
};

/** Thread mark ids present at a document position. */
export const commentMarkIdsAt = (state: EditorState, pos: number): string[] => {
  const resolved = state.doc.resolve(pos);
  const marks = resolved.marks();
  const ids: string[] = [];
  for (const mark of marks) {
    if (mark.type.name !== CORE_EXTENSIONS.COMMENT) continue;
    ids.push(...parseCommentMarkIds(mark.attrs[ECommentMarkAttributeNames.IDS]));
  }
  return Array.from(new Set(ids));
};

const buildDecorations = (state: EditorState, activeMarkId: string | null) => {
  if (!activeMarkId) return DecorationSet.empty;

  const decorations = findCommentMarkRanges(state, activeMarkId).map((range) =>
    Decoration.inline(range.from, range.to, {
      class: "editor-comment-mark-active",
      "data-comment-active": "true",
    })
  );
  return DecorationSet.create(state.doc, decorations);
};

export const CommentMarkPlugin = (onClick?: (ids: string[]) => void) =>
  new Plugin<CommentMarkState>({
    key: commentMarkPluginKey,
    state: {
      init: () => ({ activeMarkId: null, decorations: DecorationSet.empty }),
      apply: (tr, value, _oldState, newState) => {
        const meta = tr.getMeta(commentMarkPluginKey) as CommentMarkMeta | undefined;
        let activeMarkId = value.activeMarkId;
        let shouldRecalculate = tr.docChanged;

        if (meta && meta.activeMarkId !== undefined) {
          activeMarkId = meta.activeMarkId || null;
          shouldRecalculate = true;
        }

        return {
          activeMarkId,
          decorations: shouldRecalculate
            ? buildDecorations(newState, activeMarkId)
            : value.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations: (state) => commentMarkPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
      handleClick: (view, pos) => {
        if (!onClick) return false;
        const ids = commentMarkIdsAt(view.state, pos);
        if (ids.length === 0) return false;
        onClick(ids);
        return false;
      },
    },
  });
