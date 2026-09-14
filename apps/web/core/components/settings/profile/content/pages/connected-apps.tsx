/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { ConnectedApplicationService } from "@plane/services";
// components
import { CONNECTED_APPLICATIONS_LIST, ConnectedAppListItem } from "@/components/connected-apps";
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
import { APITokenSettingsLoader } from "@/components/ui/loader/settings/api-token";

const connectedApplicationService = new ConnectedApplicationService();

export const ConnectedAppsProfileSettings = observer(function ConnectedAppsProfileSettings() {
  // store hooks
  const { data: applications } = useSWR(CONNECTED_APPLICATIONS_LIST, () => connectedApplicationService.list());
  // translation
  const { t } = useTranslation();

  if (!applications) {
    return <APITokenSettingsLoader />;
  }

  return (
    <div className="size-full">
      <ProfileSettingsHeading
        title={t("account_settings.connected_apps.title")}
        description={t("account_settings.connected_apps.description")}
      />
      <div className="mt-7">
        {applications.length > 0 ? (
          <div>
            {applications.map((application) => (
              <ConnectedAppListItem key={application.id} application={application} />
            ))}
          </div>
        ) : (
          <EmptyStateCompact
            assetKey="token"
            assetClassName="size-20"
            title={t("account_settings.connected_apps.empty_title")}
            description={t("account_settings.connected_apps.empty_description")}
            align="start"
            rootClassName="py-20"
          />
        )}
      </div>
    </div>
  );
});
