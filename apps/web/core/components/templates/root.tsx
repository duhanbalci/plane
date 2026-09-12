/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { AddOutline, DeleteOutline, EditOutline, TemplatesOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorkItemTemplate } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkItemTemplates } from "@/hooks/store/use-work-item-templates";
// local imports
import { CreateUpdateTemplateModal } from "./template-modal";

type Props = {
  workspaceSlug: string;
  /** null = workspace level templates */
  projectId: string | null;
  isAdmin: boolean;
};

export const WorkItemTemplatesRoot = observer(function WorkItemTemplatesRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<TWorkItemTemplate | undefined>();
  const [templateToDelete, setTemplateToDelete] = useState<TWorkItemTemplate | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const {
    fetchProjectTemplates,
    fetchWorkspaceTemplates,
    getTemplatesForProject,
    getWorkspaceTemplates,
    deleteTemplate,
  } = useWorkItemTemplates();
  // derived values
  const templates = projectId ? getTemplatesForProject(projectId) : getWorkspaceTemplates();

  useSWR(
    workspaceSlug ? `WORK_ITEM_TEMPLATES_${workspaceSlug}_${projectId ?? "workspace"}` : null,
    () => (projectId ? fetchProjectTemplates(workspaceSlug, projectId) : fetchWorkspaceTemplates(workspaceSlug))
  );

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setIsDeleting(true);
    try {
      // workspace rows listed inside a project are read-only; delete them at their own scope
      await deleteTemplate(workspaceSlug, templateToDelete.project, templateToDelete.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("templates.toasts.delete.success.title"),
      });
      setTemplateToDelete(undefined);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("templates.toasts.delete.error.title"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isEditable = (template: TWorkItemTemplate) =>
    isAdmin && (projectId ? template.source === "project" : true);

  return (
    <div className="w-full">
      <AlertModalCore
        isOpen={Boolean(templateToDelete)}
        handleClose={() => setTemplateToDelete(undefined)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title={t("templates.delete_confirmation.title")}
        content={`${t("templates.delete_confirmation.description.prefix")}${templateToDelete?.name ?? ""}${t(
          "templates.delete_confirmation.description.suffix"
        )}`}
      />
      <CreateUpdateTemplateModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isModalOpen}
        handleClose={() => {
          setIsModalOpen(false);
          setTemplateToEdit(undefined);
        }}
        data={templateToEdit}
      />
      <SettingsHeading
        title={t("templates.settings.title")}
        description={t("templates.settings.description")}
        control={
          isAdmin ? (
            <Button variant="primary" size="sm" prependIcon={<AddOutline />} onClick={() => setIsModalOpen(true)}>
              {t("templates.settings.new_work_item_template")}
            </Button>
          ) : undefined
        }
      />
      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <TemplatesOutline className="size-6 text-tertiary" />
          <p className="text-body-sm-regular text-tertiary">{t("templates.empty_state.page.no_templates.title")}</p>
        </div>
      ) : (
        <div className="divide-y-[0.5px] divide-subtle border-t-[0.5px] border-subtle">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center gap-3 py-3">
              <TemplatesOutline className="size-4 shrink-0 text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm-medium text-primary">{template.name}</p>
                <p className="truncate text-caption-sm-regular text-tertiary">
                  {template.source === "workspace"
                    ? t("templates.settings.template_source.workspace.info")
                    : t("templates.settings.template_source.project.info")}
                  {" · "}
                  {t("templates.settings.list.updated")}: {renderFormattedDate(template.updated_at)}
                </p>
              </div>
              {isEditable(template) && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("edit")}
                    className="grid size-7 place-items-center rounded-sm hover:bg-layer-1"
                    onClick={() => {
                      setTemplateToEdit(template);
                      setIsModalOpen(true);
                    }}
                  >
                    <EditOutline className="size-4 text-tertiary" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    className="grid size-7 place-items-center rounded-sm hover:bg-layer-1"
                    onClick={() => setTemplateToDelete(template)}
                  >
                    <DeleteOutline className="size-4 text-tertiary" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
