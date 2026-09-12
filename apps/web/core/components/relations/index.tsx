/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { BlockingOutline, CloseCircleOutline, DuplicateOfOutline, RelatesToOutline } from "@makeplane/propel/icons";
import { ArrowRightFromLine, ArrowRightToLine, CornerDownRight, CornerRightUp } from "lucide-react";
import { TIMELINE_DEPENDENCY_RELATIONS } from "@plane/constants";
import type { TIssueRelationTypes } from "@plane/types";
import type { TRelationObject } from "@/components/issues/issue-detail-widgets/relations";

export const ISSUE_RELATION_OPTIONS: Record<TIssueRelationTypes, TRelationObject> = {
  relates_to: {
    key: "relates_to",
    i18n_label: "issue.relation.relates_to",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatesToOutline height={size} width={size} className="text-secondary" />,
    placeholder: "Add related work items",
  },
  duplicate: {
    key: "duplicate",
    i18n_label: "issue.relation.duplicate",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <DuplicateOfOutline width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocked_by: {
    key: "blocked_by",
    i18n_label: "issue.relation.blocked_by",
    className: "bg-danger-subtle text-danger-primary",
    icon: (size) => <BlockingOutline width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocking: {
    key: "blocking",
    i18n_label: "issue.relation.blocking",
    className: "bg-yellow-500/20 text-yellow-700",
    icon: (size) => <CloseCircleOutline width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  start_before: {
    key: "start_before",
    i18n_label: "issue.relation.start_before",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <ArrowRightFromLine width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  start_after: {
    key: "start_after",
    i18n_label: "issue.relation.start_after",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <CornerDownRight width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  finish_before: {
    key: "finish_before",
    i18n_label: "issue.relation.finish_before",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <ArrowRightToLine width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  finish_after: {
    key: "finish_after",
    i18n_label: "issue.relation.finish_after",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <CornerRightUp width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
};

/**
 * Relation options offered wherever a relation can be picked (issue detail, peek).
 * Kept as the full set so relates_to / duplicate stay available.
 */
export const useTimeLineRelationOptions = () => ISSUE_RELATION_OPTIONS;

/** Only the relation types that draw a connector on the timeline. */
export const TIMELINE_DEPENDENCY_OPTIONS: Partial<Record<TIssueRelationTypes, TRelationObject>> = Object.fromEntries(
  TIMELINE_DEPENDENCY_RELATIONS.map((key) => [key, ISSUE_RELATION_OPTIONS[key]])
);

export const useTimelineDependencyOptions = () => TIMELINE_DEPENDENCY_OPTIONS;
