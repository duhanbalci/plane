/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@makeplane/propel/components/switch";
import { AddOutline, DeleteOutline, EditOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { WorkItemTypesEnableCard } from "./enable-card";
import { WorkItemTypePropertyList } from "./property-list";
import { WorkItemTypeLogo } from "./type-logo";
import { CreateUpdateWorkItemTypeModal } from "./type-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [typeToEdit, setTypeToEdit] = useState<TIssueType | undefined>();
  const [typeToDelete, setTypeToDelete] = useState<TIssueType | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const { getProjectById } = useProject();
  const { getProjectTypes, fetchProjectTypes, fetchProperties, updateType, deleteType } = useIssueTypes();
  // derived values
  const projectDetails = getProjectById(projectId);
  const isIssueTypeEnabled = Boolean(projectDetails?.is_issue_type_enabled);
  const issueTypes = getProjectTypes(projectId);

  useSWR(
    isIssueTypeEnabled && workspaceSlug && projectId ? `PROJECT_ISSUE_TYPES_${workspaceSlug}_${projectId}` : null,
    () => fetchProjectTypes(workspaceSlug, projectId)
  );

  // keep a type selected and load its properties
  useEffect(() => {
    if (!isIssueTypeEnabled) return;
    const nextTypeId =
      selectedTypeId && issueTypes.some((type) => type.id === selectedTypeId)
        ? selectedTypeId
        : (issueTypes[0]?.id ?? null);
    if (nextTypeId !== selectedTypeId) setSelectedTypeId(nextTypeId);
    if (nextTypeId) void fetchProperties(workspaceSlug, projectId, nextTypeId).catch((error) => console.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIssueTypeEnabled, issueTypes.length, selectedTypeId, workspaceSlug, projectId]);

  const handleToggleActive = async (issueType: TIssueType) => {
    try {
      await updateType(workspaceSlug, projectId, issueType.id, { is_active: !issueType.is_active });
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("work_item_types.update.toast.error.message.default"),
      });
    }
  };

  const handleSetDefault = async (issueType: TIssueType) => {
    if (!issueType.is_active) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("work_item_types.settings.cant_set_default_inactive_message"),
      });
      return;
    }
    try {
      await updateType(workspaceSlug, projectId, issueType.id, { is_default: true });
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("work_item_types.update.toast.error.message.default"),
      });
    }
  };

  const handleDelete = async () => {
    if (!typeToDelete) return;
    setIsDeleting(true);
    try {
      await deleteType(workspaceSlug, projectId, typeToDelete.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("work_item_types.settings.item_delete_confirmation.toast.success.message"),
      });
      setTypeToDelete(undefined);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("work_item_types.settings.item_delete_confirmation.toast.error.message"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isIssueTypeEnabled) {
    return (
      <div>
        <SettingsHeading title={t("work_item_types.label")} description={t("work_item_types.settings.description")} />
        <div className="mt-6">
          <WorkItemTypesEnableCard workspaceSlug={workspaceSlug} projectId={projectId} isAdmin={isAdmin} />
        </div>
      </div>
    );
  }

  return (
    <>
      <CreateUpdateWorkItemTypeModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isTypeModalOpen}
        handleClose={() => {
          setIsTypeModalOpen(false);
          setTypeToEdit(undefined);
        }}
        data={typeToEdit}
      />
      <AlertModalCore
        isOpen={!!typeToDelete}
        handleClose={() => setTypeToDelete(undefined)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        variant="danger"
        title={t("work_item_types.settings.item_delete_confirmation.title")}
        content={t("work_item_types.settings.item_delete_confirmation.description")}
        primaryButtonText={{
          default: t("work_item_types.settings.item_delete_confirmation.primary_button"),
          loading: t("common.loading"),
        }}
      />

      <div>
        <SettingsHeading title={t("work_item_types.label")} description={t("work_item_types.settings.description")} />
        <div className="mt-6 flex items-center justify-between">
          <h6 className="text-body-sm-medium text-primary">{t("work_item_types.settings.types.title")}</h6>
          <Button
            variant="secondary"
            size="sm"
            disabled={!isAdmin}
            onClick={() => {
              setTypeToEdit(undefined);
              setIsTypeModalOpen(true);
            }}
          >
            <AddOutline className="h-3.5 w-3.5" />
            {t("work_item_types.create.button")}
          </Button>
        </div>

        <div className="mt-4 divide-y divide-subtle rounded-md border border-subtle">
          {issueTypes.map((issueType) => (
            <div
              key={issueType.id}
              className={cn("flex items-center gap-3 px-4 py-2.5", selectedTypeId === issueType.id && "bg-surface-2")}
            >
              <button
                type="button"
                className="flex min-w-0 flex-grow items-center gap-3 text-left"
                onClick={() => setSelectedTypeId(issueType.id)}
              >
                <WorkItemTypeLogo type={issueType} size={16} className="text-tertiary" />
                <div className="min-w-0">
                  <p className="truncate text-body-xs-medium text-primary">
                    {issueType.name}
                    {issueType.is_default && (
                      <span className="bg-surface-3 ml-2 rounded-sm px-1.5 py-0.5 text-caption-sm-regular text-tertiary">
                        {t("common.default")}
                      </span>
                    )}
                  </p>
                  {issueType.description && (
                    <p className="truncate text-caption-sm-regular text-tertiary">{issueType.description}</p>
                  )}
                </div>
              </button>
              <Switch
                size="sm"
                checked={issueType.is_active}
                onCheckedChange={() => handleToggleActive(issueType)}
                disabled={!isAdmin}
                aria-label={t("work_item_types.settings.properties.enable_disable.label")}
              />
              {!issueType.is_default && (
                <Button variant="link" size="sm" disabled={!isAdmin} onClick={() => handleSetDefault(issueType)}>
                  {t("work_item_types.settings.set_as_default")}
                </Button>
              )}
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => {
                  setTypeToEdit(issueType);
                  setIsTypeModalOpen(true);
                }}
              >
                <EditOutline className="h-3.5 w-3.5 text-tertiary" />
              </button>
              <button
                type="button"
                disabled={!isAdmin || issueType.is_default}
                title={issueType.is_default ? t("work_item_types.settings.cant_delete_default_message") : undefined}
                onClick={() => setTypeToDelete(issueType)}
              >
                <DeleteOutline className="h-3.5 w-3.5 text-tertiary" />
              </button>
            </div>
          ))}
        </div>

        {selectedTypeId && (
          <div className="mt-10">
            <WorkItemTypePropertyList
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              typeId={selectedTypeId}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </div>
    </>
  );
});
