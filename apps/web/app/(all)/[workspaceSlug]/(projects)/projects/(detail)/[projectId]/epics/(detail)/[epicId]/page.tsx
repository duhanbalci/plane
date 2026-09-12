/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EIssueServiceType } from "@plane/types";
import { Loader } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import { EpicProgress } from "@/components/epics/progress";
import { IssueDetailRoot } from "@/components/issues/issue-detail/root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemProperties } from "@/hooks/use-issue-properties";
import type { Route } from "./+types/page";

function ProjectEpicDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, epicId } = params;
  // store hooks
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const {
    fetchIssue,
    issue: { getIssueById },
  } = useIssueDetail(EIssueServiceType.EPICS);

  const { isLoading } = useSWR(
    workspaceSlug && projectId && epicId
      ? `EPIC_DETAIL_${workspaceSlug}_${projectId}_${epicId}`
      : null,
    () => fetchIssue(workspaceSlug, projectId, epicId),
  );

  useWorkItemProperties(
    projectId,
    workspaceSlug,
    epicId,
    EIssueServiceType.EPICS,
  );

  // derived values
  const epic = getIssueById(epicId);
  const project = getProjectById(projectId);
  const pageTitle =
    project && epic
      ? `${project.identifier}-${epic.sequence_id} ${epic.name}`
      : undefined;

  if (!epic || isLoading)
    return (
      <Loader className="flex h-full gap-5 p-5">
        <div className="basis-2/3 space-y-2">
          <Loader.Item height="30px" width="40%" />
          <Loader.Item height="15px" width="60%" />
          <Loader.Item height="15px" width="60%" />
        </div>
        <div className="basis-1/3 space-y-3">
          <Loader.Item height="30px" />
          <Loader.Item height="30px" />
        </div>
      </Loader>
    );

  return (
    <>
      <PageHead title={pageTitle ?? t("common.epic")} />
      <div className="flex h-full w-full flex-col overflow-hidden">
        <EpicProgress
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          epicId={epicId}
        />
        <div className="h-full w-full overflow-hidden">
          <IssueDetailRoot
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={epicId}
            issueServiceType={EIssueServiceType.EPICS}
          />
        </div>
      </div>
    </>
  );
}

export default observer(ProjectEpicDetailPage);
