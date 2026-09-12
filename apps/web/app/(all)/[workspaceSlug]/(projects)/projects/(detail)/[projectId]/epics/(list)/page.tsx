/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { ProjectLayoutRoot } from "@/components/issues/issue-layouts/roots/project-layout-root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectEpicsPage({ params }: Route.ComponentProps) {
  const { projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();

  const project = getProjectById(projectId);
  const pageTitle = project?.name
    ? `${project?.name} - ${t("common.epics")}`
    : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        <ProjectLayoutRoot storeType={EIssuesStoreType.EPIC} />
      </div>
    </>
  );
}

export default observer(ProjectEpicsPage);
