/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { ProjectSettingsFeatureControlItem } from "@/components/settings/project/content/feature-control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesEpicsProjectSettingsHeader } from "./header";

function FeaturesEpicsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  // translation
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} settings - ${t("project_settings.features.epics.short_title")}`
    : undefined;
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesEpicsProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.epics.title")}
          description={t("project_settings.features.epics.description")}
        />
        <div className="mt-7">
          <ProjectSettingsFeatureControlItem
            title={t("project_settings.features.epics.toggle_title")}
            description={t("project_settings.features.epics.toggle_description")}
            featureProperty="is_epic_enabled"
            projectId={projectId}
            value={!!currentProjectDetails?.is_epic_enabled}
            workspaceSlug={workspaceSlug}
            disabled={!currentProjectDetails?.is_issue_type_enabled}
          />
          {!currentProjectDetails?.is_issue_type_enabled && (
            <p className="mt-2 text-13 text-tertiary">{t("project_settings.features.epics.requires_types")}</p>
          )}
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesEpicsSettingsPage);
