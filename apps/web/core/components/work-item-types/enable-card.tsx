/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const WorkItemTypesEnableCard = observer(function WorkItemTypesEnableCard(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { enableForProject } = useIssueTypes();

  const handleEnable = async () => {
    setIsSubmitting(true);
    try {
      await enableForProject(workspaceSlug, projectId);
      setIsConfirmOpen(false);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: error?.error ?? t("common.something_went_wrong"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AlertModalCore
        isOpen={isConfirmOpen}
        handleClose={() => setIsConfirmOpen(false)}
        handleSubmit={handleEnable}
        isSubmitting={isSubmitting}
        variant="primary"
        title={t("work_item_types.empty_state.enable.confirmation.title")}
        content={t("work_item_types.empty_state.enable.confirmation.description")}
        primaryButtonText={{
          default: t("work_item_types.empty_state.enable.confirmation.button.default"),
          loading: t("work_item_types.empty_state.enable.confirmation.button.loading"),
        }}
      />
      <div className="flex flex-col items-start gap-3 rounded-lg border border-subtle bg-surface-2 p-6">
        <h4 className="text-h5-medium text-primary">{t("work_item_types.empty_state.enable.title")}</h4>
        <p className="text-body-sm-regular text-secondary">{t("work_item_types.empty_state.enable.description")}</p>
        <Button variant="primary" size="sm" disabled={!isAdmin} onClick={() => setIsConfirmOpen(true)}>
          {t("work_item_types.empty_state.enable.primary_button.text")}
        </Button>
      </div>
    </>
  );
});
