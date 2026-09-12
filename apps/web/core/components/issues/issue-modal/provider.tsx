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
  TCreateUpdatePropertyValuesProps,
  THandleProjectEntitiesFetchProps,
  TPropertyValuesValidationProps,
} from "@/components/issues/issue-modal/context";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
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

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId: null,
        setWorkItemTemplateId: () => {},
        isApplyingTemplate: false,
        setIsApplyingTemplate: () => {},
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
        handleTemplateChange: () => Promise.resolve(),
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem: () => Promise.resolve(),
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
