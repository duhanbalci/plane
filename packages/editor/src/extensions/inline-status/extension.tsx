/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
// local imports
import { InlineStatusExtensionConfig } from "./extension-config";
import { InlineStatusNodeView } from "./node-view";
import { EInlineStatusAttributeNames } from "./types";
import type { TInlineStatusStorage } from "./types";
import { DEFAULT_INLINE_STATUS_COLOR } from "./utils";

export const InlineStatusExtension = InlineStatusExtensionConfig.extend<unknown, TInlineStatusStorage>({
  addStorage() {
    return {
      openNextNodeView: false,
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const text = (node.attrs[EInlineStatusAttributeNames.TEXT] as string) ?? "";
          state.write(text.toUpperCase());
        },
      },
    };
  },

  addCommands() {
    return {
      insertInlineStatus:
        (attributes) =>
        ({ commands }) => {
          // yeni chip bos metinle gelir ve secicisi acik dogar
          this.storage.openNextNodeView = true;
          return commands.insertContent({
            type: this.name,
            attrs: {
              [EInlineStatusAttributeNames.TEXT]: attributes?.text ?? "",
              [EInlineStatusAttributeNames.COLOR]: attributes?.color ?? DEFAULT_INLINE_STATUS_COLOR,
            },
          });
        },
    };
  },

  addNodeView() {
    const consumeOpenOnMount = () => {
      const shouldOpen = this.storage.openNextNodeView;
      this.storage.openNextNodeView = false;
      return shouldOpen;
    };
    return ReactNodeViewRenderer((props) => (
      <InlineStatusNodeView {...props} consumeOpenOnMount={consumeOpenOnMount} />
    ));
  },
});
