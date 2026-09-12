/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueDependencyRelationTypes, TIssueRelationTypes } from "@plane/types";

export const REVERSE_RELATIONS: { [key in TIssueRelationTypes]: TIssueRelationTypes } = {
  blocked_by: "blocking",
  blocking: "blocked_by",
  relates_to: "relates_to",
  duplicate: "duplicate",
  start_before: "start_after",
  start_after: "start_before",
  finish_before: "finish_after",
  finish_after: "finish_before",
};

/** Relation types that constrain dates between two blocks on the timeline. */
export const TIMELINE_DEPENDENCY_RELATIONS: TIssueDependencyRelationTypes[] = [
  "blocking",
  "blocked_by",
  "start_before",
  "start_after",
  "finish_before",
  "finish_after",
];

/**
 * Dependency constraint kinds.
 * FS: dependent starts after the predecessor's target date
 * SS: dependent starts no earlier than the predecessor's start date
 * FF: dependent finishes no earlier than the predecessor's target date
 */
export const DEPENDENCY_KINDS = ["FS", "SS", "FF"] as const;

/**
 * Relation types, held on the predecessor block, that point at its dependents.
 * The remaining three (blocked_by / start_after / finish_after) are their inverses.
 */
export const DEPENDENT_RELATION_KIND: Record<"blocking" | "start_before" | "finish_before", "FS" | "SS" | "FF"> = {
  blocking: "FS",
  start_before: "SS",
  finish_before: "FF",
};
