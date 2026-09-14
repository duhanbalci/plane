/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IConnectedApplication } from "@plane/types";
import { calculateTimeAgo } from "@plane/utils";
// local imports
import { RevokeConnectedAppModal } from "./revoke-modal";

type Props = {
  application: IConnectedApplication;
};

export function ConnectedAppListItem(props: Props) {
  const { application } = props;
  // states
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  // translation
  const { t } = useTranslation();

  return (
    <>
      <RevokeConnectedAppModal
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        application={application}
      />
      <div className="flex items-start justify-between gap-4 border-b border-subtle py-4">
        <div className="min-w-0">
          <h5 className="truncate text-13 font-medium">{application.name}</h5>

          <p className="mt-1 text-11 leading-5 text-placeholder">
            {application.last_used_at
              ? t("account_settings.connected_apps.last_used", {
                  time: calculateTimeAgo(application.last_used_at),
                })
              : t("account_settings.connected_apps.never_used")}
          </p>

          {application.scopes.length > 0 && (
            <div className="mt-2">
              <p className="text-11 font-medium text-placeholder">{t("account_settings.connected_apps.permissions")}</p>
              <ul className="mt-1 space-y-0.5">
                {application.scopes.map((scope) => (
                  <li key={scope.key} className="text-11 leading-5 text-tertiary">
                    {scope.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* A dynamically registered client was created by whoever asked; the
              name it chose is not evidence of what it is. */}
          {application.is_dynamically_registered && (
            <p className="mt-2 text-11 leading-5 text-placeholder">{t("account_settings.connected_apps.unverified")}</p>
          )}
        </div>

        <Button variant="secondary" size="sm" onClick={() => setIsRevokeModalOpen(true)} className="shrink-0">
          {t("account_settings.connected_apps.revoke")}
        </Button>
      </div>
    </>
  );
}
