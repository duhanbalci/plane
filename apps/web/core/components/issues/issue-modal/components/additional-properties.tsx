/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// components
import { IssuePropertyValueInput } from "@/components/issues/issue-properties";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  projectId: string | null | undefined;
  issueTypeId: string | null | undefined;
  isDisabled?: boolean;
};

export const IssueAdditionalProperties = observer(function IssueAdditionalProperties(props: Props) {
  const { workspaceSlug, projectId, issueTypeId, isDisabled = false } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { getActiveProperties } = useIssueTypes();
  const { issuePropertyValues, setIssuePropertyValues, issuePropertyValueErrors, handleProjectEntitiesFetch } =
    useIssueModal();
  // derived values
  const isIssueTypeEnabled = Boolean(projectId && getProjectById(projectId)?.is_issue_type_enabled);
  const activeProperties = getActiveProperties(issueTypeId);

  // fetch the properties of the selected type
  useEffect(() => {
    if (!isIssueTypeEnabled || !projectId) return;
    void handleProjectEntitiesFetch({
      workItemProjectId: projectId,
      workItemTypeId: issueTypeId ?? undefined,
      workspaceSlug,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIssueTypeEnabled, projectId, issueTypeId, workspaceSlug]);

  if (!isIssueTypeEnabled || activeProperties.length === 0) return null;

  return (
    <div className="space-y-3 px-5">
      {activeProperties.map((property) => {
        const error = issuePropertyValueErrors[property.id];
        return (
          <div key={property.id} className="flex w-full items-start gap-2">
            <div className="w-2/5 flex-shrink-0 pt-1.5">
              <span className="text-body-xs-medium text-secondary">
                {property.display_name}
                {property.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
              </span>
              {property.description && (
                <p className="truncate text-caption-sm-regular text-placeholder">{property.description}</p>
              )}
            </div>
            <div className={cn("w-3/5")}>
              <IssuePropertyValueInput
                property={property}
                value={issuePropertyValues[property.id] ?? []}
                onChange={(value) => setIssuePropertyValues((prev) => ({ ...prev, [property.id]: value }))}
                projectId={projectId ?? undefined}
                disabled={isDisabled}
                hasError={Boolean(error)}
              />
              {error && <p className="mt-1 text-caption-sm-regular text-danger-primary">{t(error)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
});
