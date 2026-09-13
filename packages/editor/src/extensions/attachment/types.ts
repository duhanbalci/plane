/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node } from "@tiptap/core";
// types
import type { TFileHandler } from "@/types";

export enum EAttachmentAttributeNames {
  ID = "id",
  SOURCE = "src",
  ASSET_ID = "asset_id",
  NAME = "name",
  SIZE = "size",
  MIME = "mime",
  ACCEPTED_FILE_TYPE = "acceptedFileType",
  UPLOAD_STATUS = "uploadStatus",
}

/** bloğun hangi dosya ailesine kilitlendiği; boşsa normal dosya eki */
export enum EAttachmentAcceptedFileType {
  VIDEO = "video",
}

export enum EAttachmentUploadStatus {
  PENDING = "pending",
  UPLOADING = "uploading",
  UPLOADED = "uploaded",
  FAILED = "failed",
}

export type TAttachmentAttributes = {
  [EAttachmentAttributeNames.ID]: string | null;
  [EAttachmentAttributeNames.SOURCE]: string | null;
  [EAttachmentAttributeNames.ASSET_ID]: string | null;
  [EAttachmentAttributeNames.NAME]: string | null;
  [EAttachmentAttributeNames.SIZE]: number | null;
  [EAttachmentAttributeNames.MIME]: string | null;
  [EAttachmentAttributeNames.ACCEPTED_FILE_TYPE]: EAttachmentAcceptedFileType | null;
  [EAttachmentAttributeNames.UPLOAD_STATUS]: EAttachmentUploadStatus | null;
};

/** the file waiting to be uploaded for a freshly inserted node */
export type TAttachmentUploadEntity = {
  file: File;
};

export type TInsertAttachmentProps = {
  file?: File;
  pos?: number;
  event: "insert" | "drop";
  acceptedFileType?: EAttachmentAcceptedFileType;
};

export type TAttachmentExtensionOptions = {
  getAttachmentDownloadSource: TFileHandler["getAssetDownloadSrc"];
  getAttachmentSource: TFileHandler["getAssetSrc"];
  uploadAttachment?: TFileHandler["upload"];
};

export type TAttachmentExtensionStorage = {
  fileMap: Map<string, TAttachmentUploadEntity>;
  deletedAttachmentSet: Map<string, boolean>;
  maxFileSize: number;
};

export type TAttachmentExtensionType = Node<TAttachmentExtensionOptions, TAttachmentExtensionStorage>;
