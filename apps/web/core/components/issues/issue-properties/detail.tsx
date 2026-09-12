/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { WorkItemsOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
import { IssueTypeDropdown } from "@/components/dropdowns/issue-type";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { getIssuePropertyIcon } from "./property-icon";

import { IssuePropertyValueInput } from "./property-value-input";

type TBaseProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

type TTypeProps = TBaseProps & {
  issueTypeId: string | null | undefined;
  onChange: (typeId: string) => Promise<void> | void;
};

/**
 * "Type" row of the work item detail sidebar / peek overview.
 */
export const IssueTypeProperty = observer(function IssueTypeProperty(props: TTypeProps) {
  const { projectId, issueId, issueTypeId, onChange, disabled = false } = props;
  const { t } = useTranslation();
  // states
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { getProjectById } = useProject();
  const { getActiveProperties } = useIssueTypes();
  const { propertyValues } = useIssueDetail();
  // derived values
  const isIssueTypeEnabled = Boolean(getProjectById(projectId)?.is_issue_type_enabled);

  const applyChange = async (typeId: string) => {
    setIsSubmitting(true);
    try {
      await onChange(typeId);
    } finally {
      setIsSubmitting(false);
      setPendingTypeId(null);
    }
  };

  const handleChange = (typeId: string) => {
    if (typeId === issueTypeId) return;
    const values = propertyValues.getValuesByIssueId(issueId) ?? {};
    const hasValues = getActiveProperties(issueTypeId).some((property) => (values[property.id] ?? []).length > 0);
    if (hasValues) {
      setPendingTypeId(typeId);
      return;
    }
    void applyChange(typeId);
  };

  if (!isIssueTypeEnabled) return null;

  return (
    <>
      <AlertModalCore
        isOpen={!!pendingTypeId}
        handleClose={() => setPendingTypeId(null)}
        handleSubmit={() => {
          if (pendingTypeId) void applyChange(pendingTypeId);
        }}
        isSubmitting={isSubmitting}
        title={t("work_item_types.change_confirmation.title")}
        content={t("work_item_types.change_confirmation.description")}
        primaryButtonText={{
          default: t("work_item_types.change_confirmation.button.default"),
          loading: t("work_item_types.change_confirmation.button.loading"),
        }}
      />
      <SidebarPropertyListItem icon={WorkItemsOutline} label={t("work_item_types.label")}>
        <IssueTypeDropdown
          value={issueTypeId}
          onChange={handleChange}
          projectId={projectId}
          disabled={disabled}
          buttonVariant="transparent-with-text"
          className="group w-full grow"
          buttonContainerClassName="w-full text-left h-7.5"
          buttonClassName="text-body-xs-regular"
          placeholder={t("common.none")}
          dropdownArrow
          dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
        />
      </SidebarPropertyListItem>
    </>
  );
});

type TCustomPropertiesProps = TBaseProps & {
  issueTypeId: string | null | undefined;
};

/**
 * One sidebar row per active custom property of the work item's type.
 */
export const IssueCustomProperties = observer(function IssueCustomProperties(props: TCustomPropertiesProps) {
  const { workspaceSlug, projectId, issueId, issueTypeId, disabled = false } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { getActiveProperties, fetchProperties, isTypesFetchedForProject, fetchProjectTypes } = useIssueTypes();
  const { propertyValues } = useIssueDetail();
  // derived values
  const isIssueTypeEnabled = Boolean(getProjectById(projectId)?.is_issue_type_enabled);
  const activeProperties = getActiveProperties(issueTypeId);

  useEffect(() => {
    if (!isIssueTypeEnabled) return;
    const run = async () => {
      try {
        if (!isTypesFetchedForProject(projectId)) await fetchProjectTypes(workspaceSlug, projectId);
        if (issueTypeId) await fetchProperties(workspaceSlug, projectId, issueTypeId);
        await propertyValues.fetchPropertyValues(workspaceSlug, projectId, issueId);
      } catch (error) {
        console.error(error);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIssueTypeEnabled, workspaceSlug, projectId, issueId, issueTypeId]);

  if (!isIssueTypeEnabled || activeProperties.length === 0) return null;

  return (
    <>
      {activeProperties.map((property) => (
        <SidebarPropertyListItem
          key={property.id}
          icon={getIssuePropertyIcon(property.property_type) as React.FC<{ className?: string }>}
          label={property.display_name}
        >
          <IssuePropertyValueInput
            property={property}
            value={propertyValues.getValue(issueId, property.id)}
            onChange={(value) => {
              void propertyValues
                .updatePropertyValues(workspaceSlug, projectId, issueId, { [property.id]: value })
                .catch((error: any) =>
                  setToast({
                    type: TOAST_TYPE.ERROR,
                    title: t("error"),
                    message: error?.error ?? t("common.something_went_wrong"),
                  })
                );
            }}
            projectId={projectId}
            disabled={disabled}
            className="w-full"
          />
        </SidebarPropertyListItem>
      ))}
    </>
  );
});
