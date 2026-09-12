/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TemplatesOutline } from "@makeplane/propel/icons";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useWorkItemTemplates } from "@/hooks/store/use-work-item-templates";

type Props = {
  workspaceSlug: string;
  projectId: string | null | undefined;
  disabled?: boolean;
};

export const IssueTemplateDropdown = observer(function IssueTemplateDropdown(props: Props) {
  const { workspaceSlug, projectId, disabled = false } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { workItemTemplateId, setWorkItemTemplateId } = useIssueModal();
  const { fetchProjectTemplates, getTemplatesForProject } = useWorkItemTemplates();
  // derived values
  const templates = getTemplatesForProject(projectId);
  const selectedTemplate = templates.find((template) => template.id === workItemTemplateId);

  useSWR(
    workspaceSlug && projectId ? `WORK_ITEM_TEMPLATES_${workspaceSlug}_${projectId}` : null,
    projectId ? () => fetchProjectTemplates(workspaceSlug, projectId) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // nothing to pick from
  if (templates.length === 0) return null;

  return (
    <CustomMenu
      customButton={
        <span
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1 rounded border-[0.5px] border-strong px-2 text-caption-sm-regular hover:bg-layer-1",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          <TemplatesOutline className="size-3.5 text-tertiary" />
          <span className="max-w-32 truncate">
            {selectedTemplate?.name ?? t("templates.dropdown.tooltip.work_item")}
          </span>
        </span>
      }
      placement="bottom-start"
      closeOnSelect
      disabled={disabled}
    >
      {templates.map((template) => (
        <CustomMenu.MenuItem key={template.id} onClick={() => setWorkItemTemplateId(template.id)}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{template.name}</span>
            {template.source === "workspace" && (
              <span className="shrink-0 text-caption-sm-regular text-tertiary">
                {t("templates.settings.template_source.workspace.info")}
              </span>
            )}
          </div>
        </CustomMenu.MenuItem>
      ))}
      {workItemTemplateId && (
        <CustomMenu.MenuItem onClick={() => setWorkItemTemplateId(null)}>
          {t("templates.dropdown.clear")}
        </CustomMenu.MenuItem>
      )}
    </CustomMenu>
  );
});
