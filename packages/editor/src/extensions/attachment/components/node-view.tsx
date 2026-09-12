/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NodeViewWrapper, useEditorState } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
// plane imports
import { cn, convertBytesToSize } from "@plane/utils";
// local imports
import { EAttachmentUploadStatus } from "../types";
import type { TAttachmentAttributes, TAttachmentExtensionType } from "../types";
import { getAttachmentFileMap, getAttachmentIcon } from "../utils";

export type AttachmentNodeViewProps = Omit<NodeViewProps, "extension" | "updateAttributes"> & {
  extension: TAttachmentExtensionType;
  node: NodeViewProps["node"] & {
    attrs: TAttachmentAttributes;
  };
  updateAttributes: (attrs: Partial<TAttachmentAttributes>) => void;
};

export function AttachmentNodeView(props: AttachmentNodeViewProps) {
  const { deleteNode, editor, extension, node, selected, updateAttributes } = props;
  const { id, mime, name, size, src, uploadStatus } = node.attrs;
  // states
  const [downloadSrc, setDownloadSrc] = useState<string | undefined>(undefined);
  const [hasFailed, setHasFailed] = useState(false);
  // refs
  const hasTriedUploadingOnMountRef = useRef(false);
  // derived values
  const FileTypeIcon = getAttachmentIcon(mime);
  const isUploading = !src && uploadStatus !== EAttachmentUploadStatus.FAILED && !hasFailed;
  // subscribe to the upload progress of this block
  const uploadPercentage: number | undefined = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      (currentEditor.storage.utility?.assetsUploadStatus as Record<string, number> | undefined)?.[id ?? ""],
  });

  const uploadFile = useCallback(async () => {
    const fileMap = getAttachmentFileMap(editor);
    const entity = fileMap?.get(id ?? "");
    const upload = extension.options.uploadAttachment;
    if (!entity || !upload || !id) return;
    setHasFailed(false);
    updateAttributes({ uploadStatus: EAttachmentUploadStatus.UPLOADING });
    editor.storage.utility.uploadInProgress = true;
    try {
      const assetId = await upload(id, entity.file);
      if (!assetId) throw new Error("Attachment upload returned an empty asset id");
      fileMap?.delete(id);
      updateAttributes({
        src: assetId,
        asset_id: assetId,
        uploadStatus: EAttachmentUploadStatus.UPLOADED,
      });
    } catch (error) {
      console.error("Error while uploading the attachment:", error);
      setHasFailed(true);
      updateAttributes({ uploadStatus: EAttachmentUploadStatus.FAILED });
    } finally {
      editor.storage.utility.uploadInProgress = false;
    }
  }, [editor, extension.options, id, updateAttributes]);

  // upload the freshly inserted file once the node view is mounted
  useEffect(() => {
    if (hasTriedUploadingOnMountRef.current || src) return;
    hasTriedUploadingOnMountRef.current = true;
    const fileMap = getAttachmentFileMap(editor);
    if (!fileMap?.has(id ?? "")) {
      // nothing to upload and no source either, the node is broken
      setHasFailed(true);
      return;
    }
    void uploadFile();
  }, [editor, id, src, uploadFile]);

  // resolve the download url of the uploaded asset
  useEffect(() => {
    if (!src) {
      setDownloadSrc(undefined);
      return;
    }
    const resolveSource = async () => {
      try {
        const url = await extension.options.getAttachmentDownloadSource?.(src);
        setDownloadSrc(url);
      } catch (error) {
        console.error("Error fetching attachment source:", error);
        setDownloadSrc(undefined);
      }
    };
    void resolveSource();
  }, [src, extension.options]);

  const handleRetry = useCallback(() => {
    hasTriedUploadingOnMountRef.current = true;
    void uploadFile();
  }, [uploadFile]);

  return (
    <NodeViewWrapper className="attachment-component">
      <div
        className={cn(
          "my-2 flex items-center gap-3 rounded-md border border-subtle bg-layer-1 px-3 py-2 transition-colors",
          {
            "border-accent-strong": selected && editor.isEditable && !hasFailed,
            "border-danger-strong bg-danger-subtle": hasFailed,
          }
        )}
        contentEditable={false}
        data-drag-handle
      >
        {isUploading ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-tertiary" />
        ) : (
          <FileTypeIcon className={cn("size-5 shrink-0 text-tertiary", { "text-danger-primary": hasFailed })} />
        )}
        <div className="flex-1 truncate">
          <p className="truncate text-13 font-medium text-primary">{name ?? "Attachment"}</p>
          <p className="text-11 text-tertiary">
            {hasFailed
              ? "Upload failed. Something went wrong. Please try again."
              : isUploading
                ? `Uploading${uploadPercentage === undefined ? "" : ` ${uploadPercentage}%`}...`
                : size
                  ? convertBytesToSize(size)
                  : ""}
          </p>
        </div>
        {hasFailed && editor.isEditable && (
          <button
            type="button"
            className="shrink-0 rounded-sm p-1 text-danger-primary transition-colors hover:bg-danger-subtle-hover"
            onClick={handleRetry}
            title="Retry upload"
          >
            <RefreshCw className="size-4" />
          </button>
        )}
        {!!downloadSrc && (
          <a
            href={downloadSrc}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-sm p-1 text-tertiary transition-colors hover:bg-layer-1-hover hover:text-primary"
            title="Open attachment"
          >
            <Download className="size-4" />
          </a>
        )}
        {editor.isEditable && (
          <button
            type="button"
            className="shrink-0 rounded-sm p-1 text-tertiary transition-colors hover:bg-layer-1-hover hover:text-danger-primary"
            onClick={deleteNode}
            title="Delete attachment"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}
