/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@makeplane/propel/components/tooltip";
import type { TIssueTypeIdentifier } from "@plane/types";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

const SIZE_MAP = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
};

/**
 * Renders the icon of a work item type.
 */
export const IssueTypeIdentifier = observer(function IssueTypeIdentifier(props: TIssueTypeIdentifier) {
  const { issueTypeId, size = "sm" } = props;
  // store hooks
  const { getTypeById } = useIssueTypes();
  // derived values
  const issueType = getTypeById(issueTypeId);

  if (!issueType?.logo_props) return null;

  return (
    <Tooltip label={issueType.name}>
      <div className="flex shrink-0 items-center">
        <Logo logo={issueType.logo_props} size={SIZE_MAP[size]} />
      </div>
    </Tooltip>
  );
});
