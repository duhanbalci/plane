/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
import { useIssueStoreType } from "./use-issue-layout-store";

/** Epic layouts peek through the epics service, everything else through issues. */
export const usePeekServiceType = (): TIssueServiceType => {
  const storeType = useIssueStoreType();
  return storeType === EIssuesStoreType.EPIC ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES;
};
