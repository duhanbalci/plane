/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { ColumnExtensionConfig, ColumnListExtensionConfig } from "./extension-config";
import { EColumnAttributeNames } from "./types";
import type { TColumnCount } from "./types";

const columnDragHandleKey = new PluginKey("columnDragHandle");

/** Kolonun üstünde duran sürükleme tutamacı; gerçek Plane'deki widget'ın aynısı. */
const createDragHandle = (editor: Editor, getPos: () => number) => {
  const container = document.createElement("div");
  container.className =
    "column-drag-handle-container absolute z-20 top-0 left-0 flex justify-center items-center w-full -translate-y-1/2";
  container.contentEditable = "false";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "px-1 bg-layer-1 border border-strong-1 rounded-sm outline-none transition-all duration-200";
  button.setAttribute("aria-label", "Column options and drag handle");
  button.draggable = true;
  button.innerHTML = `<svg class="size-4 text-primary" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>`;
  // tutamaca basınca kolonu seç, sürüklemeyi ProseMirror'ın kendi akışı devralır
  const selectColumn = () => {
    const pos = getPos();
    const { state, dispatch } = editor.view;
    if (pos === undefined || pos < 0 || pos > state.doc.content.size) return;
    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
  };
  button.addEventListener("mousedown", selectColumn);
  button.addEventListener("dragstart", selectColumn);

  container.appendChild(button);
  return container;
};

const buildDecorations = (editor: Editor, state: EditorState) => {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== CORE_EXTENSIONS.COLUMN) return;
    const width = Number(node.attrs[EColumnAttributeNames.WIDTH]) || 1;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        style: `flex-grow: ${width};`,
      })
    );
    if (editor.isEditable) {
      decorations.push(Decoration.widget(pos + 1, () => createDragHandle(editor, () => pos), { side: -1 }));
    }
  });
  return DecorationSet.create(state.doc, decorations);
};

export const ColumnExtension = ColumnExtensionConfig.extend({
  selectable: true,
  draggable: true,
});

export const ColumnListExtension = ColumnListExtensionConfig.extend({
  selectable: true,
  draggable: true,

  addCommands() {
    return {
      insertColumns:
        (count: TColumnCount) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: Array.from({ length: count }, () => ({
              type: CORE_EXTENSIONS.COLUMN,
              attrs: { [EColumnAttributeNames.WIDTH]: 1 },
              content: [{ type: CORE_EXTENSIONS.PARAGRAPH }],
            })),
          }),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: columnDragHandleKey,
        props: {
          decorations: (state) => buildDecorations(editor, state),
        },
      }),
    ];
  },

  /** Tek kolona düşen liste kaldırılır, içeriği olduğu yerde kalır. */
  onUpdate() {
    const { state, view } = this.editor;
    let tr = state.tr;
    let changed = false;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== this.name || node.childCount > 1) return;
      const column = node.firstChild;
      if (!column) return;
      const mappedPos = tr.mapping.map(pos);
      tr = tr.replaceWith(mappedPos, mappedPos + node.nodeSize, column.content);
      changed = true;
    });
    if (changed) view.dispatch(tr.setMeta("addToHistory", false));
  },
});
