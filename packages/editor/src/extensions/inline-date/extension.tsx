/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
// local imports
import { InlineDateExtensionConfig } from "./extension-config";
import { InlineDateNodeView } from "./node-view";
import { EInlineDateAttributeNames } from "./types";
import type { TInlineDateStorage } from "./types";
import { formatDateLabel, toISODate } from "./utils";

export const InlineDateExtension = InlineDateExtensionConfig.extend<unknown, TInlineDateStorage>({
  addStorage() {
    return {
      openNextNodeView: false,
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.write(formatDateLabel(node.attrs[EInlineDateAttributeNames.DATE] as string | null));
        },
      },
    };
  },

  addCommands() {
    return {
      insertInlineDate:
        (date) =>
        ({ commands }) => {
          // yeni chip bugunun tarihiyle gelir ve takvimi acik dogar
          this.storage.openNextNodeView = true;
          return commands.insertContent({
            type: this.name,
            attrs: { [EInlineDateAttributeNames.DATE]: date ?? toISODate(new Date()) },
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
    return ReactNodeViewRenderer((props) => <InlineDateNodeView {...props} consumeOpenOnMount={consumeOpenOnMount} />);
  },
});
