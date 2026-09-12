/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// components
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";

export interface EpicModalProps {
  data?: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  beforeFormSubmit?: () => Promise<void>;
  onSubmit?: (res: TIssue) => Promise<void>;
  fetchIssueDetails?: boolean;
  primaryButtonText?: {
    default: string;
    loading: string;
  };
  isProjectSelectionDisabled?: boolean;
}

/**
 * Epic olustur/duzenle modali. Is kalemi modalini `isEpic` kipinde kullanir:
 * tip dropdown'i epic tiplerine kilitli, parent/cycle/module alanlari yok,
 * kayit `projectEpics` store'u uzerinden `/epics/` uclarina gider.
 */
export const CreateUpdateEpicModal = observer(function CreateUpdateEpicModal(props: EpicModalProps) {
  const { data, isOpen, onClose, beforeFormSubmit, onSubmit, fetchIssueDetails, isProjectSelectionDisabled } = props;
  const { t } = useTranslation();

  return (
    <CreateUpdateIssueModal
      data={data}
      isOpen={isOpen}
      onClose={onClose}
      beforeFormSubmit={beforeFormSubmit}
      onSubmit={onSubmit}
      fetchIssueDetails={fetchIssueDetails}
      isProjectSelectionDisabled={isProjectSelectionDisabled}
      storeType={EIssuesStoreType.EPIC}
      withDraftIssueWrapper={false}
      isEpic
      modalTitle={data?.id ? t("common.update") : t("epic.new")}
      primaryButtonText={
        props.primaryButtonText ?? {
          default: data?.id ? t("common.update") : t("common.create"),
          loading: data?.id ? t("updating") : t("creating"),
        }
      }
    />
  );
});
