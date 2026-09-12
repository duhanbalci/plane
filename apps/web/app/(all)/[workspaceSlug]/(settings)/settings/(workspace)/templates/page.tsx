/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WorkItemTemplatesRoot } from "@/components/templates";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { TemplatesWorkspaceSettingsHeader } from "./header";

function WorkspaceTemplatesPage() {
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  // derived values
  const canPerformWorkspaceAdminActions = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.WORKSPACE
  );
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("templates.settings.title")}`
    : undefined;

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<TemplatesWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <WorkItemTemplatesRoot
        workspaceSlug={workspaceSlug?.toString()}
        projectId={null}
        isAdmin={canPerformWorkspaceAdminActions}
      />
    </SettingsContentWrapper>
  );
}

export default observer(WorkspaceTemplatesPage);
