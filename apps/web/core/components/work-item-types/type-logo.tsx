/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Logo } from "@plane/propel/emoji-icon-picker";
import { EpicOutline, WorkItemsOutline } from "@makeplane/propel/icons";
import type { TIssueType } from "@plane/types";
import { cn } from "@plane/utils";

type TProps = {
  type: Pick<TIssueType, "logo_props" | "is_epic"> | undefined;
  size?: number;
  className?: string;
};

// Backend'den `logo_props: {}` gelebiliyor; `in_use` yoksa gercek Plane gibi
// varsayilan ikona dus (epic ucgen, digerleri work item ikonu).
export function WorkItemTypeLogo({ type, size = 12, className }: TProps) {
  const logo = type?.logo_props;
  if (logo?.in_use) return <Logo logo={logo} size={size} />;
  const Icon = type?.is_epic ? EpicOutline : WorkItemsOutline;
  return <Icon className={cn("flex-shrink-0", className)} style={{ width: size, height: size }} />;
}
