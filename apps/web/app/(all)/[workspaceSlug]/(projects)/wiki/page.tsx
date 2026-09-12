/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { WikiRecentPages } from "@/components/wiki";
// local imports
import type { Route } from "./+types/page";

/** Wiki index: recently visited wiki pages. */
function WorkspaceWikiPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();

  return (
    <>
      <PageHead title={t("sidebar.wiki")} />
      <WikiRecentPages workspaceSlug={workspaceSlug} />
    </>
  );
}

export default observer(WorkspaceWikiPage);
