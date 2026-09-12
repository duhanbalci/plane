/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EFileAssetType } from "@plane/types";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { isCommentEmpty } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";

type Props = {
  id: string;
  workspaceSlug: string;
  projectId?: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  autofocus?: boolean;
  onSubmit: (commentHTML: string, commentJSON: object) => Promise<void>;
  onCancel?: () => void;
};

export const PageCommentComposer = observer(function PageCommentComposer(props: Props) {
  const {
    id,
    workspaceSlug,
    projectId,
    initialValue = "<p></p>",
    placeholder,
    submitLabel,
    autofocus = false,
    onSubmit,
    onCancel,
  } = props;
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // states
  const [commentHTML, setCommentHTML] = useState(initialValue);
  const [commentJSON, setCommentJSON] = useState<object>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { getWorkspaceBySlug } = useWorkspace();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  // translation
  const { t } = useTranslation();
  // derived values
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const isEmpty = isCommentEmpty(commentHTML);

  const handleSubmit = async () => {
    if (isEmpty || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(commentHTML, commentJSON);
      setCommentHTML("<p></p>");
      editorRef.current?.clearEditor();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <LiteTextEditor
        editable
        ref={editorRef}
        id={id}
        autofocus={autofocus}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        initialValue={initialValue}
        placeholder={placeholder}
        containerClassName="min-h-min"
        parentClassName="p-2"
        showSubmitButton={false}
        showToolbarInitially={false}
        displayConfig={{ fontSize: "small-font" }}
        onChange={(json, html) => {
          setCommentJSON(json);
          setCommentHTML(html);
        }}
        uploadFile={async (blockId, file) => {
          const { asset_id } = await uploadEditorAsset({
            blockId,
            data: { entity_identifier: "", entity_type: EFileAssetType.COMMENT_DESCRIPTION },
            file,
            projectId,
            workspaceSlug,
          });
          return asset_id;
        }}
        duplicateFile={async (assetId) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityType: EFileAssetType.COMMENT_DESCRIPTION,
            projectId,
            workspaceSlug,
          });
          return asset_id;
        }}
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("page_comments.cancel")}
          </Button>
        )}
        <Button variant="primary" size="sm" loading={isSubmitting} disabled={isEmpty} onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
});
