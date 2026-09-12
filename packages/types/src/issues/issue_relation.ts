/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "./issue";

export type TIssueRelation = Record<TIssueRelationTypes, TIssue[]>;

export type TIssueRelationMap = {
  [issue_id: string]: Record<TIssueRelationTypes, string[]>;
};

export type TIssueRelationIdMap = Record<TIssueRelationTypes, string[]>;

export type TIssueRelationTypes =
  | "blocking"
  | "blocked_by"
  | "duplicate"
  | "relates_to"
  | "start_before"
  | "start_after"
  | "finish_before"
  | "finish_after";

/** Relation types that constrain dates between two work items on the timeline. */
export type TIssueDependencyRelationTypes = Extract<
  TIssueRelationTypes,
  "blocking" | "blocked_by" | "start_before" | "start_after" | "finish_before" | "finish_after"
>;
