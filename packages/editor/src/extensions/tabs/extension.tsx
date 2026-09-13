/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { createActiveTabPlugin } from "./active-tab-plugin";
import { TabsBlock } from "./block";
import { TabExtensionConfig, TabsExtensionConfig } from "./extension-config";
import { ETabAttributeNames, ETabsAttributeNames } from "./types";
import type { TTabsOrientation } from "./types";

export const TabExtension = TabExtensionConfig.extend({
  selectable: false,
});

export const TabsExtension = TabsExtensionConfig.extend({
  selectable: true,
  draggable: true,

  addCommands() {
    return {
      insertTabs:
        (orientation: TTabsOrientation) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { [ETabsAttributeNames.ORIENTATION]: orientation },
            content: [1, 2].map((index) => ({
              type: CORE_EXTENSIONS.TAB,
              attrs: { [ETabAttributeNames.TITLE]: `Tab ${index}` },
              content: [{ type: CORE_EXTENSIONS.PARAGRAPH }],
            })),
          }),
    };
  },

  addProseMirrorPlugins() {
    return [createActiveTabPlugin()];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabsBlock);
  },
});
