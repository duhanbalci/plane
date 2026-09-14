/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ConnectedApplicationService } from "@plane/services";
import type { IConnectedApplication } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// local imports
import { CONNECTED_APPLICATIONS_LIST } from "./fetch-key";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  application: IConnectedApplication;
};

const connectedApplicationService = new ConnectedApplicationService();

export function RevokeConnectedAppModal(props: Props) {
  const { isOpen, onClose, application } = props;
  // states
  const [isRevoking, setIsRevoking] = useState(false);
  // translation
  const { t } = useTranslation();

  const handleClose = () => {
    onClose();
    setIsRevoking(false);
  };

  const handleRevoke = async () => {
    setIsRevoking(true);

    try {
      await connectedApplicationService.revoke(application.id);

      setToast({ type: TOAST_TYPE.SUCCESS, title: t("account_settings.connected_apps.revoke_success") });
      mutate<IConnectedApplication[]>(
        CONNECTED_APPLICATIONS_LIST,
        (previous) => (previous ?? []).filter((row) => row.id !== application.id),
        false
      );
      handleClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("account_settings.connected_apps.revoke_error"),
        message: (error as { error?: string })?.error,
      });
      setIsRevoking(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      handleSubmit={handleRevoke}
      isSubmitting={isRevoking}
      title={t("account_settings.connected_apps.revoke_confirm_title")}
      content={t("account_settings.connected_apps.revoke_confirm_description", { name: application.name })}
      primaryButtonText={{
        default: t("account_settings.connected_apps.revoke"),
        loading: t("common.loading"),
      }}
    />
  );
}
