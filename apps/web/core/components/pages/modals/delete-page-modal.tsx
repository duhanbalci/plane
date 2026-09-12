/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// ui
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { getPageName } from "@plane/utils";
// constants
// plane web hooks
import { useAppRouter } from "@/hooks/use-app-router";
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type TConfirmPageDeletionProps = {
  isOpen: boolean;
  onClose: () => void;
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const DeletePageModal = observer(function DeletePageModal(props: TConfirmPageDeletionProps) {
  const { isOpen, onClose, page, storeType } = props;
  // states
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSubPages, setDeleteSubPages] = useState(false);
  // store hooks
  const { removePage } = usePageStore(storeType);
  const { t } = useTranslation();

  // derived values
  const { id: pageId, name } = page;
  const hasSubPages = (page.sub_pages_count ?? 0) > 0;

  const handleClose = () => {
    setIsDeleting(false);
    setDeleteSubPages(false);
    onClose();
  };

  const router = useAppRouter();
  const { pageId: routePageId } = useParams();

  const handleDelete = async () => {
    if (!pageId) return;
    setIsDeleting(true);
    try {
      await removePage({ pageId, cascade: hasSubPages && deleteSubPages });
      handleClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Page deleted successfully.",
      });
      if (routePageId) {
        router.back();
      }
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Page could not be deleted. Please try again.",
      });
    }

    setIsDeleting(false);
  };

  if (!page || !page.id) return null;

  return (
    <AlertModalCore
      handleClose={handleClose}
      handleSubmit={handleDelete}
      isSubmitting={isDeleting}
      isOpen={isOpen}
      title="Delete page"
      content={
        <>
          Are you sure you want to delete page-{" "}
          <span className="font-medium break-words break-all text-primary">{getPageName(name)}</span> ? The Page will be
          deleted permanently. This action cannot be undone.
          {hasSubPages && (
            <div className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="delete-sub-pages"
                  checked={!deleteSubPages}
                  onChange={() => setDeleteSubPages(false)}
                />
                <span className="text-13 text-primary">{t("nested_pages.delete_modal.only_this_page")}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="delete-sub-pages"
                  checked={deleteSubPages}
                  onChange={() => setDeleteSubPages(true)}
                />
                <span className="text-13 text-primary">{t("nested_pages.delete_modal.with_sub_pages")}</span>
              </label>
            </div>
          )}
        </>
      }
    />
  );
});
