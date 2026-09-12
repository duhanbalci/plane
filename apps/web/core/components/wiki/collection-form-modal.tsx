/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** when set the modal renames that collection instead of creating one */
  collectionId?: string;
};

export const CollectionFormModal = observer(function CollectionFormModal(props: Props) {
  const { isOpen, onClose, collectionId } = props;
  // states
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { getCollectionById, createCollection, updateCollection } = usePageStore(EPageStoreType.WORKSPACE);
  const { t } = useTranslation();
  // derived values
  const collection = collectionId ? getCollectionById(collectionId) : undefined;
  const isEditing = !!collection;

  useEffect(() => {
    if (isOpen) setName(collection?.name ?? "");
  }, [isOpen, collection?.name]);

  const handleClose = () => {
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("wiki_collections.form.name_required"),
      });
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing && collectionId) {
        await updateCollection(collectionId, { name: trimmedName });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: t("wiki_collections.toasts.renamed"),
        });
      } else {
        await createCollection({ name: trimmedName });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: t("wiki_collections.toasts.created"),
        });
      }
      handleClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: isEditing
          ? t("wiki_collections.toasts.rename_error")
          : t("wiki_collections.toasts.create_error"),
      });
    }
    setIsSubmitting(false);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="space-y-4 p-5">
        <h3 className="text-16 font-medium">
          {isEditing ? t("wiki_collections.edit_modal.title") : t("wiki_collections.create_modal.title")}
        </h3>
        <Input
          id="collection-name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
          placeholder={
            isEditing
              ? t("wiki_collections.form.name_placeholder_edit")
              : t("wiki_collections.form.name_placeholder_create")
          }
          className="w-full"
          maxLength={255}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" loading={isSubmitting} onClick={handleSubmit}>
            {isEditing ? t("common.update") : t("wiki_collections.create_modal.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
