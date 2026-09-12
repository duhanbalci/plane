/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { FolderInput } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// components
import { MoveToProjectModal } from "@/components/wiki/move-to-project-modal";
import { MoveToWikiModal } from "@/components/wiki/move-to-wiki-modal";
// hooks
import { EPageStoreType } from "@/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

/**
 * Header "Move page" button, like the real Plane wiki: a wiki page moves into
 * a project, a project page moves into the wiki.
 */
export const PageMoveControl = observer(function PageMoveControl({ page, storeType }: Props) {
  // states
  const [isModalOpen, setIsModalOpen] = useState(false);
  // hooks
  const { t } = useTranslation();
  // derived values
  const isProjectPage = storeType === EPageStoreType.PROJECT;
  const label = isProjectPage ? t("wiki.move_to_wiki.title") : t("wiki.move_to_project.title");

  if (!page.canCurrentUserMovePage || page.archived_at) return null;

  return (
    <>
      {isProjectPage ? (
        <MoveToWikiModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} page={page} />
      ) : (
        <MoveToProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} page={page} />
      )}
      <Tooltip label={label} side="bottom">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="grid size-6 flex-shrink-0 place-items-center rounded-sm text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
          aria-label={label}
        >
          <FolderInput className="size-3.5" />
        </button>
      </Tooltip>
    </>
  );
});
