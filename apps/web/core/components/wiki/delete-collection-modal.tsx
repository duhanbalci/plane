/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
};

/** Deleting a collection keeps its pages: the server moves them to "General". */
export const DeleteCollectionModal = observer(function DeleteCollectionModal(props: Props) {
  const { isOpen, onClose, collectionId } = props;
  // states
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const { getCollectionById, removeCollection } = usePageStore(EPageStoreType.WORKSPACE);
  const { t } = useTranslation();
  // derived values
  const collection = getCollectionById(collectionId);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeCollection(collectionId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("wiki_collections.toasts.transferred_deleted"),
      });
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("wiki_collections.toasts.delete_error"),
      });
    }
    setIsDeleting(false);
  };

  if (!collection) return null;

  return (
    <AlertModalCore
      handleClose={onClose}
      handleSubmit={handleDelete}
      isSubmitting={isDeleting}
      isOpen={isOpen}
      title={t("wiki_collections.delete_modal.title")}
      content={
        <>
          {t("wiki_collections.delete_modal.transfer_description")}
          <span className="mt-1 block font-medium break-words">{collection.name}</span>
        </>
      }
    />
  );
});
