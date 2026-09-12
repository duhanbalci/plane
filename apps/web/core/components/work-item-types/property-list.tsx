/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@makeplane/propel/components/switch";
import { AddOutline, DeleteOutline, EditOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueProperty } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// components
import { getIssuePropertyIcon } from "@/components/issues/issue-properties";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CreateUpdatePropertyModal } from "./property-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  typeId: string;
  isAdmin: boolean;
};

export const WorkItemTypePropertyList = observer(function WorkItemTypePropertyList(props: Props) {
  const { workspaceSlug, projectId, typeId, isAdmin } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [propertyToEdit, setPropertyToEdit] = useState<TIssueProperty | undefined>();
  const [propertyToDelete, setPropertyToDelete] = useState<TIssueProperty | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const { getProperties, updateProperty, deleteProperty } = useIssueTypes();
  // derived values
  const properties = getProperties(typeId);

  const handleToggleActive = async (property: TIssueProperty) => {
    try {
      await updateProperty(workspaceSlug, projectId, typeId, property.id, { is_active: !property.is_active });
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("work_item_types.settings.properties.toast.update.error.message"),
      });
    }
  };

  const handleDelete = async () => {
    if (!propertyToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProperty(workspaceSlug, projectId, typeId, propertyToDelete.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("work_item_types.settings.properties.toast.delete.success.message", {
          name: propertyToDelete.display_name,
        }),
      });
      setPropertyToDelete(undefined);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("work_item_types.settings.properties.toast.delete.error.message"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <CreateUpdatePropertyModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        typeId={typeId}
        isOpen={isModalOpen}
        handleClose={() => {
          setIsModalOpen(false);
          setPropertyToEdit(undefined);
        }}
        data={propertyToEdit}
      />
      <AlertModalCore
        isOpen={!!propertyToDelete}
        handleClose={() => setPropertyToDelete(undefined)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        variant="danger"
        title={t("work_item_types.settings.properties.delete_confirmation.title")}
        content={t("work_item_types.settings.properties.delete_confirmation.description")}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h6 className="text-body-sm-medium text-primary">{t("work_item_types.settings.properties.title")}</h6>
            <p className="text-caption-sm-regular text-tertiary">
              {t("work_item_types.settings.properties.description")}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!isAdmin}
            onClick={() => {
              setPropertyToEdit(undefined);
              setIsModalOpen(true);
            }}
          >
            <AddOutline className="h-3.5 w-3.5" />
            {t("work_item_types.settings.properties.add_button")}
          </Button>
        </div>

        {properties.length === 0 ? (
          <div className="rounded-md border border-subtle px-4 py-6 text-center">
            <p className="text-body-sm-medium text-secondary">
              {t("work_item_types.settings.properties.empty_state.title")}
            </p>
            <p className="text-caption-sm-regular text-tertiary">
              {t("work_item_types.settings.properties.empty_state.description")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-subtle rounded-md border border-subtle">
            {properties.map((property) => {
              const Icon = getIssuePropertyIcon(property.property_type);
              return (
                <div key={property.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="h-4 w-4 flex-shrink-0 text-tertiary" />
                  <div className="min-w-0 flex-grow">
                    <p className="truncate text-body-xs-medium text-primary">
                      {property.display_name}
                      {property.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
                    </p>
                    {property.description && (
                      <p className="truncate text-caption-sm-regular text-tertiary">{property.description}</p>
                    )}
                  </div>
                  <Switch
                    size="sm"
                    checked={property.is_active}
                    onCheckedChange={() => handleToggleActive(property)}
                    disabled={!isAdmin}
                    aria-label={t("work_item_types.settings.properties.enable_disable.label")}
                  />
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      setPropertyToEdit(property);
                      setIsModalOpen(true);
                    }}
                  >
                    <EditOutline className="h-3.5 w-3.5 text-tertiary" />
                  </button>
                  <button type="button" disabled={!isAdmin} onClick={() => setPropertyToDelete(property)}>
                    <DeleteOutline className="h-3.5 w-3.5 text-tertiary" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
});
