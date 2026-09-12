/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// constants
import type { EPageAccess } from "@plane/constants";
import type { TPage } from "@plane/types";
// ui
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local imports
import { PageForm } from "./page-form";

type Props = {
  workspaceSlug: string;
  /** absent for wiki pages, which are not bound to a project */
  projectId?: string;
  isModalOpen: boolean;
  pageAccess?: EPageAccess;
  handleModalClose: () => void;
  redirectionEnabled?: boolean;
  storeType: EPageStoreType;
  /** when set, the created page becomes a sub page of this page */
  parentId?: string;
  /** wiki only: the collection the page is created in */
  collectionId?: string;
};

export function CreatePageModal(props: Props) {
  const {
    workspaceSlug,
    projectId,
    isModalOpen,
    pageAccess,
    handleModalClose,
    redirectionEnabled = false,
    storeType,
    parentId,
    collectionId,
  } = props;
  // states
  const [pageFormData, setPageFormData] = useState<Partial<TPage>>({
    id: undefined,
    name: "",
    logo_props: undefined,
    parent: parentId ?? null,
    collection: collectionId,
  });
  // router
  const router = useAppRouter();
  // store hooks
  const { createPage } = usePageStore(storeType);
  const handlePageFormData = <T extends keyof TPage>(key: T, value: TPage[T]) =>
    setPageFormData((prev) => ({ ...prev, [key]: value }));

  // update page access in form data when page access from the store changes
  useEffect(() => {
    setPageFormData((prev) => ({ ...prev, access: pageAccess }));
  }, [pageAccess]);

  // keep the parent and the collection in sync with the block the modal was opened from
  useEffect(() => {
    setPageFormData((prev) => ({ ...prev, parent: parentId ?? null, collection: collectionId }));
  }, [parentId, collectionId]);

  const handleStateClear = () => {
    setPageFormData({ id: undefined, name: "", access: pageAccess, parent: parentId ?? null, collection: collectionId });
    handleModalClose();
  };

  const isWikiPage = storeType === EPageStoreType.WORKSPACE;

  const handleFormSubmit = async () => {
    if (!workspaceSlug || (!isWikiPage && !projectId)) return;

    try {
      const pageData = await createPage(pageFormData);
      if (pageData && redirectionEnabled) {
        const href = isWikiPage
          ? `/${workspaceSlug}/wiki/${pageData.id}`
          : `/${workspaceSlug}/projects/${projectId}/pages/${pageData.id}`;
        router.push(href);
      }
      if (pageData) handleStateClear();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <ModalCore
      isOpen={isModalOpen}
      handleClose={handleModalClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXL}
    >
      <PageForm
        formData={pageFormData}
        handleFormData={handlePageFormData}
        handleModalClose={handleStateClear}
        handleFormSubmit={handleFormSubmit}
      />
    </ModalCore>
  );
}
