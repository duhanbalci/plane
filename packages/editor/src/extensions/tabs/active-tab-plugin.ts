/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

/** Aktif sekme sadece görünüm durumu; dokümana yazılmaz. */
export type TActiveTabState = Record<string, number>;

export type TSetActiveTabMeta = {
  tabsKey: string;
  index: number;
};

export const activeTabPluginKey = new PluginKey<TActiveTabState>("tabsActiveTab");

/** Tabs node'unu tanımlayan anahtar; unique-id yoksa konuma düşer. */
export const getTabsKey = (node: ProseMirrorNode, pos: number): string => (node.attrs.id as string) ?? `pos-${pos}`;

export const getActiveTabIndex = (state: EditorState, node: ProseMirrorNode, pos: number): number => {
  const stored = activeTabPluginKey.getState(state)?.[getTabsKey(node, pos)] ?? 0;
  return stored < node.childCount ? stored : 0;
};

/** Seçim bir sekmenin içine düştüyse o sekmeyi aktif yapar. */
const activeTabFromSelection = (state: EditorState, current: TActiveTabState): TActiveTabState => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== CORE_EXTENSIONS.TAB) continue;
    const tabsNode = $from.node(depth - 1);
    if (tabsNode.type.name !== CORE_EXTENSIONS.TABS) continue;
    const tabsPos = $from.before(depth - 1);
    const index = $from.index(depth - 1);
    const key = getTabsKey(tabsNode, tabsPos);
    if (current[key] === index) return current;
    return { ...current, [key]: index };
  }
  return current;
};

const buildDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name !== CORE_EXTENSIONS.TABS) return;
    const activeIndex = getActiveTabIndex(state, node, pos);
    let childPos = pos + 1;
    node.forEach((child, _offset, index) => {
      decorations.push(
        Decoration.node(childPos, childPos + child.nodeSize, {
          "data-active": index === activeIndex ? "true" : "false",
        })
      );
      childPos += child.nodeSize;
    });
  });
  return DecorationSet.create(state.doc, decorations);
};

export const createActiveTabPlugin = () =>
  new Plugin<TActiveTabState>({
    key: activeTabPluginKey,
    state: {
      init: () => ({}),
      apply: (tr: Transaction, value: TActiveTabState, _oldState, newState) => {
        const meta = tr.getMeta(activeTabPluginKey) as TSetActiveTabMeta | undefined;
        const next = meta ? { ...value, [meta.tabsKey]: meta.index } : value;
        return tr.selectionSet || tr.docChanged ? activeTabFromSelection(newState, next) : next;
      },
    },
    props: {
      decorations: (state) => buildDecorations(state),
    },
  });
