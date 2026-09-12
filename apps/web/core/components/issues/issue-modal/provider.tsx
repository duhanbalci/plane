/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISearchIssueResponse, TIssue, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type {
  TActiveAdditionalPropertiesProps,
  TCreateSubWorkItemProps,
  TCreateUpdatePropertyValuesProps,
  THandleProjectEntitiesFetchProps,
  THandleTemplateChangeProps,
  TPropertyValuesValidationProps,
} from "@/components/issues/issue-modal/context";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemTemplates } from "@/hooks/store/use-work-item-templates";
import { useUser } from "@/hooks/store/user/user-user";
// services
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [workItemTemplateId, setWorkItemTemplateId] = useState<string | null>(props.templateId ?? null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { getProjectById } = useProject();
  const { getActiveProperties, getDefaultTypeId, fetchProjectTypes, fetchProperties, isTypesFetchedForProject } =
    useIssueTypes();
  const { updatePropertyValues } = useIssueDetail();
  const { getTemplateById } = useWorkItemTemplates();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  /** Work item types are opt-in per project. */
  const areIssueTypesEnabled = useCallback(
    (projectId: string | null | undefined) =>
      projectId ? Boolean(getProjectById(projectId)?.is_issue_type_enabled) : false,
    [getProjectById]
  );

  const getIssueTypeIdOnProjectChange = useCallback(
    (projectId: string) => {
      if (!areIssueTypesEnabled(projectId)) return null;
      return getDefaultTypeId(projectId);
    },
    [areIssueTypesEnabled, getDefaultTypeId]
  );

  const getActiveAdditionalPropertiesLength = useCallback(
    (validationProps: TActiveAdditionalPropertiesProps) => {
      const { projectId, watch } = validationProps;
      if (!areIssueTypesEnabled(projectId)) return 0;
      return getActiveProperties(watch("type_id")).length;
    },
    [areIssueTypesEnabled, getActiveProperties]
  );

  const handlePropertyValuesValidation = useCallback(
    (validationProps: TPropertyValuesValidationProps) => {
      const { projectId, watch } = validationProps;
      if (!areIssueTypesEnabled(projectId)) return true;

      const activeProperties = getActiveProperties(watch("type_id"));
      const errors: TIssuePropertyValueErrors = {};
      for (const property of activeProperties) {
        if (!property.is_required) continue;
        const values = issuePropertyValues[property.id];
        const isEmpty = !values || values.every((value) => value === undefined || value === "");
        if (isEmpty) errors[property.id] = "common.errors.required";
      }
      setIssuePropertyValueErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [areIssueTypesEnabled, getActiveProperties, issuePropertyValues]
  );

  const handleCreateUpdatePropertyValues = useCallback(
    async (valuesProps: TCreateUpdatePropertyValuesProps) => {
      const { issueId, projectId, workspaceSlug, issueTypeId } = valuesProps;
      if (!issueTypeId || !areIssueTypesEnabled(projectId)) return;
      if (Object.keys(issuePropertyValues).length === 0) return;

      // only send values of the properties that belong to the selected type
      const activePropertyIds = new Set(getActiveProperties(issueTypeId).map((property) => property.id));
      const payload: TIssuePropertyValues = {};
      for (const [propertyId, values] of Object.entries(issuePropertyValues)) {
        if (activePropertyIds.has(propertyId)) payload[propertyId] = values;
      }
      if (Object.keys(payload).length === 0) return;

      try {
        await updatePropertyValues(workspaceSlug, projectId, issueId, payload);
        setIssuePropertyValues({});
        setIssuePropertyValueErrors({});
      } catch (error: any) {
        // the backend answers with 400 { error, properties? }
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: error?.error ?? t("common.something_went_wrong"),
        });
      }
    },
    [areIssueTypesEnabled, getActiveProperties, issuePropertyValues, updatePropertyValues, t]
  );

  const handleProjectEntitiesFetch = useCallback(
    async (fetchProps: THandleProjectEntitiesFetchProps) => {
      const { workItemProjectId, workItemTypeId, workspaceSlug } = fetchProps;
      if (!workItemProjectId || !areIssueTypesEnabled(workItemProjectId)) return;

      try {
        if (!isTypesFetchedForProject(workItemProjectId)) await fetchProjectTypes(workspaceSlug, workItemProjectId);
        if (workItemTypeId) await fetchProperties(workspaceSlug, workItemProjectId, workItemTypeId);
      } catch (error) {
        console.error(error);
      }
    },
    [areIssueTypesEnabled, fetchProjectTypes, fetchProperties, isTypesFetchedForProject]
  );

  /** Apply a template to the open form; values the template does not carry are kept. */
  const handleTemplateChange = useCallback(
    async (templateProps: THandleTemplateChangeProps) => {
      const { workspaceSlug, reset, editorRef, getValues, projectId } = templateProps;
      const template = getTemplateById(workItemTemplateId);
      if (!template) return;

      setIsApplyingTemplate(true);
      try {
        const templateData = template.template_data;
        const currentValues = getValues?.() ?? ({} as TIssue);
        const targetProjectId = projectId ?? currentValues.project_id ?? null;

        // the property definitions of the templated type have to be loaded before the values are set
        if (targetProjectId) {
          await handleProjectEntitiesFetch({
            workItemProjectId: targetProjectId,
            workItemTypeId: templateData.type_id ?? undefined,
            workspaceSlug,
          });
        }

        const descriptionHTML = templateData.description_html || currentValues.description_html || "<p></p>";
        reset({
          ...currentValues,
          ...(templateData.name ? { name: templateData.name } : {}),
          description_html: descriptionHTML,
          ...(templateData.type_id ? { type_id: templateData.type_id } : {}),
          ...(templateData.state_id ? { state_id: templateData.state_id } : {}),
          ...(templateData.priority && templateData.priority !== "none" ? { priority: templateData.priority } : {}),
          ...(templateData.label_ids?.length ? { label_ids: templateData.label_ids } : {}),
          ...(templateData.assignee_ids?.length ? { assignee_ids: templateData.assignee_ids } : {}),
          ...(templateData.module_ids?.length ? { module_ids: templateData.module_ids } : {}),
        } as TIssue);
        editorRef.current?.setEditorValue(descriptionHTML, true);

        // only the properties that belong to the templated type survive
        const activePropertyIds = new Set(getActiveProperties(templateData.type_id).map((property) => property.id));
        const propertyValues: TIssuePropertyValues = {};
        for (const [propertyId, values] of Object.entries(templateData.properties ?? {})) {
          if (activePropertyIds.has(propertyId)) propertyValues[propertyId] = values;
        }
        setIssuePropertyValues(propertyValues);
        setIssuePropertyValueErrors({});
      } catch (error) {
        console.error(error);
      } finally {
        setIsApplyingTemplate(false);
      }
    },
    [getActiveProperties, getTemplateById, handleProjectEntitiesFetch, workItemTemplateId]
  );

  /** Create the template's sub work items under the freshly created work item. */
  const handleCreateSubWorkItem = useCallback(
    async (subWorkItemProps: TCreateSubWorkItemProps) => {
      const { workspaceSlug, projectId, parentId } = subWorkItemProps;
      const template = getTemplateById(workItemTemplateId);
      const subWorkItems = template?.template_data?.sub_work_items ?? [];
      if (subWorkItems.length === 0) return;

      let created = 0;
      for (const subWorkItem of subWorkItems) {
        try {
          // sequential on purpose: the sub work items keep the order of the template
          // oxlint-disable-next-line no-await-in-loop
          const response = await issueService.createIssue(workspaceSlug, projectId, {
            name: subWorkItem.name,
            parent_id: parentId,
            type_id: subWorkItem.type_id ?? undefined,
            priority: subWorkItem.priority,
            label_ids: subWorkItem.label_ids,
            assignee_ids: subWorkItem.assignee_ids,
          } as Partial<TIssue>);
          created += 1;

          const properties = subWorkItem.properties ?? {};
          if (response?.id && Object.keys(properties).length > 0) {
            // oxlint-disable-next-line no-await-in-loop
            await updatePropertyValues(workspaceSlug, projectId, response.id, properties);
          }
        } catch (error) {
          console.error(error);
        }
      }

      if (created > 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("templates.toasts.sub_work_items.created", { count: created }),
        });
      }
    },
    [getTemplateById, t, updatePropertyValues, workItemTemplateId]
  );

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId,
        setWorkItemTemplateId,
        isApplyingTemplate,
        setIsApplyingTemplate,
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues,
        setIssuePropertyValues,
        issuePropertyValueErrors,
        setIssuePropertyValueErrors,
        getIssueTypeIdOnProjectChange,
        getActiveAdditionalPropertiesLength,
        handlePropertyValuesValidation,
        handleCreateUpdatePropertyValues,
        handleProjectEntitiesFetch,
        handleTemplateChange,
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem,
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
