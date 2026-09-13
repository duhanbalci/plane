/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { activeTabPluginKey, getActiveTabIndex, getTabsKey } from "./active-tab-plugin";
import { HorizontalTabsIcon, VerticalTabsIcon } from "./icons";
import { ETabAttributeNames, ETabsAttributeNames } from "./types";
import type { TTabsOrientation } from "./types";

export function TabsBlock(props: NodeViewProps) {
  const { editor, getPos, node, updateAttributes } = props;
  // states
  const [activeIndex, setActiveIndex] = useState(0);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  // derived values
  const orientation = (node.attrs[ETabsAttributeNames.ORIENTATION] ?? "horizontal") as TTabsOrientation;
  const tabs = node.content.content;

  // aktif sekme plugin state'inde tutulur, dokümana yazılmaz
  useEffect(() => {
    const syncActiveIndex = () => {
      const pos = getPos();
      if (pos === undefined) return;
      setActiveIndex(getActiveTabIndex(editor.state, node, pos));
    };
    syncActiveIndex();
    editor.on("transaction", syncActiveIndex);
    return () => {
      editor.off("transaction", syncActiveIndex);
    };
  }, [editor, getPos, node]);

  const setActiveTab = useCallback(
    (index: number) => {
      const pos = getPos();
      if (pos === undefined) return;
      const { state, dispatch } = editor.view;
      dispatch(state.tr.setMeta(activeTabPluginKey, { tabsKey: getTabsKey(node, pos), index }));
      setActiveIndex(index);
    },
    [editor, getPos, node]
  );

  const handleAddTab = useCallback(() => {
    const pos = getPos();
    if (pos === undefined) return;
    const { state, dispatch } = editor.view;
    const tabType = state.schema.nodes[CORE_EXTENSIONS.TAB];
    const paragraphType = state.schema.nodes[CORE_EXTENSIONS.PARAGRAPH];
    if (!tabType || !paragraphType) return;
    const newTab = tabType.create({ [ETabAttributeNames.TITLE]: `Tab ${node.childCount + 1}` }, paragraphType.create());
    dispatch(state.tr.insert(pos + node.nodeSize - 1, newTab));
    setActiveTab(node.childCount);
  }, [editor, getPos, node, setActiveTab]);

  const handleDeleteTab = useCallback(
    (index: number) => {
      const pos = getPos();
      if (pos === undefined) return;
      const { state, dispatch } = editor.view;
      // son sekme silinince tabs node'u kalkar, içeriği yerinde kalır
      if (node.childCount <= 1) {
        dispatch(state.tr.replaceWith(pos, pos + node.nodeSize, node.child(0).content));
        return;
      }
      let childPos = pos + 1;
      for (let i = 0; i < index; i++) childPos += node.child(i).nodeSize;
      dispatch(state.tr.delete(childPos, childPos + node.child(index).nodeSize));
      setActiveTab(Math.max(0, index - 1));
    },
    [editor, getPos, node, setActiveTab]
  );

  const handleRenameTab = useCallback(
    (index: number, title: string) => {
      const pos = getPos();
      if (pos === undefined) return;
      const { state, dispatch } = editor.view;
      let childPos = pos + 1;
      for (let i = 0; i < index; i++) childPos += node.child(i).nodeSize;
      dispatch(
        state.tr.setNodeMarkup(childPos, undefined, {
          ...node.child(index).attrs,
          [ETabAttributeNames.TITLE]: title.trim() === "" ? `Tab ${index + 1}` : title,
        })
      );
      setRenamingIndex(null);
    },
    [editor, getPos, node]
  );

  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper
      className="editor-tabs"
      data-node-type="tabs"
      data-orientation={orientation}
      data-spacing-group="container"
    >
      {isEditable && (
        <div className="editor-tabs-layout-controls" contentEditable={false} aria-label="Tabs layout">
          <button
            type="button"
            aria-label="Use horizontal tabs"
            aria-pressed={orientation === "horizontal"}
            className="editor-tabs-layout-control"
            onClick={() => updateAttributes({ [ETabsAttributeNames.ORIENTATION]: "horizontal" })}
          >
            <HorizontalTabsIcon className="size-3.5 stroke-2 text-current" />
          </button>
          <button
            type="button"
            aria-label="Use vertical tabs"
            aria-pressed={orientation === "vertical"}
            className="editor-tabs-layout-control"
            onClick={() => updateAttributes({ [ETabsAttributeNames.ORIENTATION]: "vertical" })}
          >
            <VerticalTabsIcon className="size-3.5 stroke-2" />
          </button>
        </div>
      )}
      <div className="editor-tabs-shell">
        <div className="editor-tabs-header" contentEditable={false} data-orientation={orientation}>
          {tabs.map((tab, index) => {
            const title = (tab.attrs[ETabAttributeNames.TITLE] as string) ?? `Tab ${index + 1}`;
            const isActive = index === activeIndex;
            return (
              <div
                key={(tab.attrs.id as string) ?? index}
                data-id={tab.attrs.id as string}
                className={`editor-tabs-item${isActive ? " editor-tabs-item-active" : ""}`}
              >
                {renamingIndex === index ? (
                  <input
                    autoFocus
                    className="editor-tabs-title-input"
                    defaultValue={title}
                    onBlur={(e) => handleRenameTab(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameTab(index, e.currentTarget.value);
                      if (e.key === "Escape") setRenamingIndex(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-pressed={isActive}
                    className="editor-tabs-tab"
                    onClick={() => setActiveTab(index)}
                    onDoubleClick={() => isEditable && setRenamingIndex(index)}
                  >
                    <span>{title}</span>
                  </button>
                )}
                {isEditable && (
                  <button
                    type="button"
                    aria-label={`Delete ${title}`}
                    className="editor-tabs-delete"
                    onClick={() => handleDeleteTab(index)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
          {isEditable && (
            <button type="button" aria-label="Add tab" className="editor-tabs-add" onClick={handleAddTab}>
              <Plus className="size-3.5" />
              <span>Add tab</span>
            </button>
          )}
        </div>
        <NodeViewContent as="div" className="editor-tabs-content" />
      </div>
    </NodeViewWrapper>
  );
}
