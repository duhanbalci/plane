/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { EAttachmentAttributeNames } from "./types";
import type { TInsertAttachmentProps } from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.ATTACHMENT]: {
      insertAttachment: (props: TInsertAttachmentProps) => ReturnType;
    };
  }
}

/**
 * Schema-only definition of the file attachment block. Kept free of React so the
 * live server and the PDF export load the very same node.
 */
export const AttachmentExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.ATTACHMENT,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      [EAttachmentAttributeNames.ID]: { default: null },
      [EAttachmentAttributeNames.SOURCE]: { default: null },
      [EAttachmentAttributeNames.ASSET_ID]: { default: null },
      [EAttachmentAttributeNames.NAME]: { default: null },
      [EAttachmentAttributeNames.SIZE]: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const size = Number(element.getAttribute(EAttachmentAttributeNames.SIZE));
          return Number.isFinite(size) && size > 0 ? size : null;
        },
      },
      [EAttachmentAttributeNames.MIME]: { default: null },
      // gerçek Plane ile aynı: data-accepted-file-type="video"
      [EAttachmentAttributeNames.ACCEPTED_FILE_TYPE]: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-accepted-file-type") || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          const acceptedFileType = attributes[EAttachmentAttributeNames.ACCEPTED_FILE_TYPE];
          if (!acceptedFileType) return {};
          return { "data-accepted-file-type": acceptedFileType };
        },
      },
      // upload progress is runtime-only, it never lands in the HTML
      [EAttachmentAttributeNames.UPLOAD_STATUS]: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: "attachment-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["attachment-component", mergeAttributes(HTMLAttributes)];
  },
});
