/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EpicOutline } from "@makeplane/propel/icons";
import { EIssuesStoreType } from "@plane/types";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CountChip } from "@/components/common/count-chip";
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
import { CreateUpdateEpicModal } from "@/components/epic-modal";
import { HeaderFilters } from "@/components/issues/filters";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

export const ProjectEpicsHeader = observer(function ProjectEpicsHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  // states
  const [isEpicModalOpen, setIsEpicModalOpen] = useState(false);
  // store hooks
  const {
    issues: { getGroupIssueCount },
  } = useIssues(EIssuesStoreType.EPIC);
  const { t } = useTranslation();
  const { currentProjectDetails, loader } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const epicsCount = getGroupIssueCount(undefined, undefined, false);
  const canUserCreateEpic = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
  );

  return (
    <>
      <CreateUpdateEpicModal
        isOpen={isEpicModalOpen}
        onClose={() => setIsEpicModalOpen(false)}
      />
      <Header>
        <Header.LeftItem>
          <div className="flex items-center gap-2.5">
            <Breadcrumbs
              onBack={() => router.back()}
              isLoading={loader === "init-loader"}
              className="flex-grow-0"
            >
              <CommonProjectBreadcrumbs
                workspaceSlug={workspaceSlug?.toString()}
                projectId={projectId?.toString()}
              />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label={t("common.epics")}
                    href={`/${workspaceSlug}/projects/${projectId}/epics/`}
                    icon={<EpicOutline className="h-4 w-4 text-tertiary" />}
                    isLast
                  />
                }
                isLast
              />
            </Breadcrumbs>
            {epicsCount && epicsCount > 0 ? (
              <CountChip count={epicsCount} />
            ) : null}
          </div>
        </Header.LeftItem>
        <Header.RightItem>
          <div className="hidden gap-2 md:flex">
            <HeaderFilters
              projectId={projectId}
              currentProjectDetails={currentProjectDetails}
              workspaceSlug={workspaceSlug}
              canUserCreateIssue={canUserCreateEpic}
              storeType={EIssuesStoreType.EPIC}
            />
          </div>
          {canUserCreateEpic && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => setIsEpicModalOpen(true)}
            >
              {t("epic.new")}
            </Button>
          )}
        </Header.RightItem>
      </Header>
    </>
  );
});
