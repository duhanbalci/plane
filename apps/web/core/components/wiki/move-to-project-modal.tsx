/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
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

/** Moves a wiki page (and its sub pages) into a project. */
export const MoveToProjectModal = observer(function MoveToProjectModal(props: Props) {
  const { isOpen, onClose, page } = props;
  // params
  const { workspaceSlug } = useParams();
  // router
  const router = useAppRouter();
  // states
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { workspaceProjectIds, getPartialProjectById } = useProject();
  const { removePage } = usePageStore(EPageStoreType.WORKSPACE);
  const { t } = useTranslation();

  // workspace projects (the lite list has no member role); the API rejects targets the user cannot write pages in
  const options = useMemo(
    () =>
      (workspaceProjectIds ?? [])
        .map((id) => {
          const project = getPartialProjectById(id);
          return {
            value: id,
            query: `${project?.name ?? ""} ${project?.identifier ?? ""}`,
            content: (
              <div className="flex items-center gap-2">
                {project?.logo_props && <Logo logo={project.logo_props} size={14} />}
                <span className="truncate">{project?.name}</span>
              </div>
            ),
          };
        }),
    [workspaceProjectIds, getPartialProjectById]
  );

  useEffect(() => {
    if (!isOpen) setProjectId(undefined);
  }, [isOpen]);

  const selectedProject = projectId ? getPartialProjectById(projectId) : undefined;

  const handleSubmit = async () => {
    if (!workspaceSlug || !projectId || !page.id) return;
    setIsSubmitting(true);
    try {
      const pageId = page.id;
      await workspacePageService.moveWikiPageToProject(workspaceSlug.toString(), pageId, projectId);
      // the page (and its subtree) is no longer part of the wiki
      await removePage({ pageId, shouldSync: false, cascade: true }).catch(() => {});
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("wiki.move_to_project.success"),
      });
      onClose();
      router.push(`/${workspaceSlug.toString()}/projects/${projectId}/pages/${pageId}`);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("wiki.move_to_project.error"),
      });
    }
    setIsSubmitting(false);
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-16 font-medium">{t("wiki.move_to_project.title")}</h3>
        <p className="text-13 text-secondary">{t("wiki.move_to_project.description")}</p>
        <CustomSearchSelect
          value={projectId}
          label={
            <span className="truncate">
              {selectedProject?.name ?? t("wiki.move_to_project.project_placeholder")}
            </span>
          }
          options={options}
          onChange={(value: string) => setProjectId(value)}
          input
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isSubmitting}
            disabled={!projectId}
            onClick={handleSubmit}
          >
            {t("wiki.move_to_project.submit")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
