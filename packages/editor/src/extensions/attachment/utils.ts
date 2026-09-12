/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Editor } from "@tiptap/core";
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import type { TAttachmentExtensionStorage } from "./types";

/** the storage map that holds the files waiting to be uploaded */
export const getAttachmentFileMap = (editor: Editor): TAttachmentExtensionStorage["fileMap"] | undefined =>
  (editor.storage[CORE_EXTENSIONS.ATTACHMENT] as TAttachmentExtensionStorage | undefined)?.fileMap;

const ARCHIVE_MIME_TYPES = new Set([
  "application/zip",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
]);

const CODE_MIME_TYPES = new Set(["application/json", "application/xml", "text/css", "text/javascript", "text/xml"]);

const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** pick the card icon from the file's mime type */
export const getAttachmentIcon = (mime: string | null | undefined): LucideIcon => {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (ARCHIVE_MIME_TYPES.has(mime)) return FileArchive;
  if (SPREADSHEET_MIME_TYPES.has(mime)) return FileSpreadsheet;
  if (CODE_MIME_TYPES.has(mime)) return FileCode;
  if (DOCUMENT_MIME_TYPES.has(mime) || mime.startsWith("text/")) return FileText;
  return FileIcon;
};
