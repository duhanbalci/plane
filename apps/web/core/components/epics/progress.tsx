/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TEpicAnalytics, TEpicAnalyticsGroup } from "@plane/types";
// services
import { EpicService } from "@/services/issue/epic.service";

const epicService = new EpicService();

const PROGRESS_GROUPS: {
  key: TEpicAnalyticsGroup;
  label: string;
  color: string;
}[] = [
  {
    key: "backlog_issues",
    label: STATE_GROUPS.backlog.label,
    color: STATE_GROUPS.backlog.color,
  },
  {
    key: "unstarted_issues",
    label: STATE_GROUPS.unstarted.label,
    color: STATE_GROUPS.unstarted.color,
  },
  {
    key: "started_issues",
    label: STATE_GROUPS.started.label,
    color: STATE_GROUPS.started.color,
  },
  {
    key: "completed_issues",
    label: STATE_GROUPS.completed.label,
    color: STATE_GROUPS.completed.color,
  },
  {
    key: "cancelled_issues",
    label: STATE_GROUPS.cancelled.label,
    color: STATE_GROUPS.cancelled.color,
  },
];

type Props = {
  workspaceSlug: string;
  projectId: string;
  epicId: string;
};

/** Epic'in cocuk is kalemlerinin durum dagilimi (`epics/<id>/analytics/`). */
export const EpicProgress = observer(function EpicProgress(props: Props) {
  const { workspaceSlug, projectId, epicId } = props;
  const { t } = useTranslation();

  const { data: analytics } = useSWR<TEpicAnalytics>(
    workspaceSlug && projectId && epicId
      ? `EPIC_ANALYTICS_${workspaceSlug}_${projectId}_${epicId}`
      : null,
    () => epicService.fetchEpicAnalytics(workspaceSlug, projectId, epicId),
  );

  if (!analytics) return null;

  const total = PROGRESS_GROUPS.reduce(
    (sum, group) => sum + (analytics[group.key] ?? 0),
    0,
  );
  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-subtle px-9 py-3">
      <div className="flex items-center justify-between text-13 text-secondary">
        <span>{t("common.work_items")}</span>
        <span>
          {analytics.completed_issues}/{total}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-layer-1">
        {PROGRESS_GROUPS.map((group) => {
          const count = analytics[group.key] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={group.key}
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: group.color,
              }}
              title={`${group.label}: ${count}`}
            />
          );
        })}
      </div>
      {analytics.overdue_issues > 0 && (
        <span className="text-caption-sm-regular text-danger-text-subtle">
          {t("epic.progress.overdue")}: {analytics.overdue_issues}
        </span>
      )}
    </div>
  );
});
