/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// services
import { WorkspacePageService } from "@/services/page";
// store
import type { TPageInstance } from "@/store/pages/base-page";

const workspacePageService = new WorkspacePageService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  page: TPageInstance;
};

/** Moves a project page (and its sub pages) into a wiki collection. */
export const MoveToWikiModal = observer(function MoveToWikiModal(props: Props) {
  const { isOpen, onClose, page } = props;
  // params
  const { workspaceSlug } = useParams();
  // states
  const [collectionId, setCollectionId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { collectionIds, getCollectionById, defaultCollectionId, fetchCollections } = usePageStore(
    EPageStoreType.WORKSPACE
  );
  const { removePage: removeProjectPage } = usePageStore(EPageStoreType.PROJECT);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen || !workspaceSlug) return;
    fetchCollections(workspaceSlug.toString()).catch(() => {});
  }, [isOpen, workspaceSlug, fetchCollections]);

  useEffect(() => {
    if (isOpen) setCollectionId((previous) => previous ?? defaultCollectionId);
  }, [isOpen, defaultCollectionId]);

  const handleSubmit = async () => {
    const projectId = page.project_ids?.[0];
    if (!workspaceSlug || !projectId || !page.id) return;
    setIsSubmitting(true);
    try {
      await workspacePageService.moveProjectPageToWiki(
        workspaceSlug.toString(),
        projectId,
        page.id,
        collectionId ?? defaultCollectionId
      );
      // the page is no longer part of the project
      await removeProjectPage({ pageId: page.id, shouldSync: false }).catch(() => {});
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("wiki.move_to_wiki.success"),
      });
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("wiki.move_to_wiki.error"),
      });
    }
    setIsSubmitting(false);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-16 font-medium">{t("wiki.move_to_wiki.title")}</h3>
        <p className="text-13 text-secondary">{t("wiki.move_to_wiki.description")}</p>
        <CustomSelect
          value={collectionId}
          label={
            <span className="truncate">
              {collectionId
                ? (getCollectionById(collectionId)?.name ?? t("wiki_collections.fallback_name"))
                : t("wiki_collections.delete_modal.transfer_target_placeholder")}
            </span>
          }
          onChange={(value: string) => setCollectionId(value)}
          input
        >
          {collectionIds.map((id) => (
            <CustomSelect.Option key={id} value={id}>
              {getCollectionById(id)?.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" loading={isSubmitting} onClick={handleSubmit}>
            {t("wiki.move_to_wiki.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
