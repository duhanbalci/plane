/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// helpers
import { insertEmptyParagraphAtNodeBoundaries } from "@/helpers/insert-empty-paragraph-at-node-boundary";
// local imports
import { ExternalEmbedNodeView } from "./components/node-view";
import type { ExternalEmbedNodeViewProps } from "./components/node-view";
import { ExternalEmbedExtensionConfig } from "./extension-config";
import { getExternalEmbedProvider } from "./providers";
import { EExternalEmbedAttributeNames, EExternalEmbedDisplay } from "./types";

type Props = {
  isEditable: boolean;
};

export function ExternalEmbedExtension(props: Props) {
  const { isEditable } = props;

  return ExternalEmbedExtensionConfig.extend({
    selectable: isEditable,
    draggable: isEditable,

    addStorage() {
      return {
        // escape markdown for external embeds
        markdown: {
          serialize() {},
        },
      };
    },

    addProseMirrorPlugins() {
      const { editor, name } = this;

      return [
        new Plugin({
          key: new PluginKey("external-embed-paste"),
          props: {
            // a bare provider link pasted on an empty line becomes an embed
            handlePaste: (view, event) => {
              if (!editor.isEditable) return false;
              const pastedText = event.clipboardData?.getData("text/plain")?.trim();
              if (!pastedText || /\s/.test(pastedText)) return false;
              if (!getExternalEmbedProvider(pastedText)) return false;

              const { selection } = view.state;
              if (!selection.empty) return false;
              const parentNode = selection.$from.parent;
              if (parentNode.type.name !== CORE_EXTENSIONS.PARAGRAPH || parentNode.content.size !== 0) return false;

              const nodeType = view.state.schema.nodes[name];
              if (!nodeType) return false;
              const from = selection.$from.before();
              const embedNode = nodeType.create({
                [EExternalEmbedAttributeNames.SOURCE]: pastedText,
                [EExternalEmbedAttributeNames.DISPLAY]: EExternalEmbedDisplay.EMBED,
              });
              view.dispatch(view.state.tr.replaceWith(from, from + parentNode.nodeSize, embedNode));
              return true;
            },
          },
        }),
      ];
    },

    addKeyboardShortcuts() {
      return {
        ArrowDown: insertEmptyParagraphAtNodeBoundaries("down", this.name),
        ArrowUp: insertEmptyParagraphAtNodeBoundaries("up", this.name),
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps) => (
        <ExternalEmbedNodeView {...nodeViewProps} node={nodeViewProps.node as ExternalEmbedNodeViewProps["node"]} />
      ));
    },
  });
}
