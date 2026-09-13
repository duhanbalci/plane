/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
import { v4 as uuidv4 } from "uuid";
// constants
import { ACCEPTED_ATTACHMENT_MIME_TYPES, ACCEPTED_VIDEO_MIME_TYPES } from "@/constants/config";
// helpers
import { isFileValid } from "@/helpers/file";
import { insertEmptyParagraphAtNodeBoundaries } from "@/helpers/insert-empty-paragraph-at-node-boundary";
// types
import type { TFileHandler } from "@/types";
// local imports
import { AttachmentNodeView } from "./components/node-view";
import type { AttachmentNodeViewProps } from "./components/node-view";
import { AttachmentExtensionConfig } from "./extension-config";
import { EAttachmentAcceptedFileType, EAttachmentAttributeNames, EAttachmentUploadStatus } from "./types";
import type { TAttachmentExtensionOptions, TAttachmentExtensionStorage } from "./types";
import { getAttachmentFileMap } from "./utils";

type Props = {
  fileHandler: TFileHandler;
  isEditable: boolean;
};

export function AttachmentExtension(props: Props) {
  const { fileHandler, isEditable } = props;
  // derived values
  const { getAssetSrc, getAssetDownloadSrc } = fileHandler;

  return AttachmentExtensionConfig.extend<TAttachmentExtensionOptions, TAttachmentExtensionStorage>({
    selectable: isEditable,
    draggable: isEditable,

    addOptions() {
      const upload = "upload" in fileHandler ? fileHandler.upload : undefined;
      return {
        ...this.parent?.(),
        getAttachmentDownloadSource: getAssetDownloadSrc,
        getAttachmentSource: getAssetSrc,
        uploadAttachment: upload,
      };
    },

    addStorage() {
      const maxFileSize = "validation" in fileHandler ? fileHandler.validation?.maxFileSize : 0;

      return {
        fileMap: new Map(),
        deletedAttachmentSet: new Map<string, boolean>(),
        maxFileSize,
        // escape markdown for attachments
        markdown: {
          serialize() {},
        },
      };
    },

    addCommands() {
      return {
        insertAttachment:
          (attachmentProps) =>
          ({ commands }) => {
            const file = attachmentProps?.file;
            if (!file) return false;
            const { acceptedFileType } = attachmentProps;
            // video bloğu yalnız video/* kabul eder, normal ek tüm listeyi
            const acceptedMimeTypes =
              acceptedFileType === EAttachmentAcceptedFileType.VIDEO
                ? ACCEPTED_VIDEO_MIME_TYPES
                : ACCEPTED_ATTACHMENT_MIME_TYPES;
            // early return if the dropped file is not supported
            if (
              !isFileValid({
                acceptedMimeTypes,
                file,
                maxFileSize: this.storage.maxFileSize,
                onError: (_error, message) => alert(message),
              })
            ) {
              return false;
            }
            // the id keeps track of the file until it is uploaded
            const fileId = uuidv4();
            getAttachmentFileMap(this.editor)?.set(fileId, { file });

            const attributes = {
              [EAttachmentAttributeNames.ID]: fileId,
              [EAttachmentAttributeNames.NAME]: file.name,
              [EAttachmentAttributeNames.SIZE]: file.size,
              [EAttachmentAttributeNames.MIME]: file.type,
              [EAttachmentAttributeNames.ACCEPTED_FILE_TYPE]: acceptedFileType ?? null,
              [EAttachmentAttributeNames.UPLOAD_STATUS]: EAttachmentUploadStatus.PENDING,
            };

            if (attachmentProps.pos) {
              return commands.insertContentAt(attachmentProps.pos, {
                type: this.name,
                attrs: attributes,
              });
            }
            return commands.insertContent({
              type: this.name,
              attrs: attributes,
            });
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        ArrowDown: insertEmptyParagraphAtNodeBoundaries("down", this.name),
        ArrowUp: insertEmptyParagraphAtNodeBoundaries("up", this.name),
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer((nodeViewProps) => (
        <AttachmentNodeView {...nodeViewProps} node={nodeViewProps.node as AttachmentNodeViewProps["node"]} />
      ));
    },
  });
}
