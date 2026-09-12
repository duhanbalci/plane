/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { TIssuePriorities } from "./issues";
import type { TIssuePropertyValues } from "./issues/issue-property-values";

/**
 * Template families; only work item templates are implemented today.
 */
export enum ETemplateType {
  WORK_ITEM = "workitem",
  PROJECT = "project",
  PAGE = "page",
}

/**
 * A sub work item carried by a work item template.
 */
export type TWorkItemTemplateSubItem = {
  name: string;
  type_id: string | null;
  priority: TIssuePriorities;
  label_ids: string[];
  assignee_ids: string[];
  properties: TIssuePropertyValues;
};

/**
 * `template_data` payload of a work item template.
 */
export type TWorkItemTemplateData = {
  name: string;
  description_html: string;
  type_id: string | null;
  state_id: string | null;
  priority: TIssuePriorities;
  label_ids: string[];
  assignee_ids: string[];
  module_ids: string[];
  properties: TIssuePropertyValues;
  sub_work_items: TWorkItemTemplateSubItem[];
};

/**
 * Where the template row comes from; workspace templates are read-only in a project.
 */
export type TTemplateSource = "project" | "workspace";

export type TTemplate<D = TWorkItemTemplateData> = {
  id: string;
  name: string;
  description_html: string;
  template_type: ETemplateType;
  template_data: D;
  is_active: boolean;
  workspace: string;
  project: string | null;
  source: TTemplateSource;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TWorkItemTemplate = TTemplate<TWorkItemTemplateData>;
