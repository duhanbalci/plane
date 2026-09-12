/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
// types
import type { TPageEmbedConfig } from "@/types";
// local imports
import { PageEmbedExtensionConfig } from "./extension-config";
import { PageEmbedNodeView } from "./page-embed-node-view";

export function PageEmbedExtension(pageEmbedConfig?: TPageEmbedConfig) {
  return PageEmbedExtensionConfig.extend({
    addOptions(this) {
      return {
        ...this.parent?.(),
        pageEmbedConfig,
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(PageEmbedNodeView);
    },
  });
}
