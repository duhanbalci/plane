/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { TLogoProps } from "../common";

/**
 * Work item type. Lives at the workspace level and is linked to projects.
 */
export type TIssueType = {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps | undefined;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  project_ids: string[];
  workspace: string;
  created_at: string;
  updated_at: string;
};

/**
 * Supported custom property types.
 */
export enum EIssuePropertyType {
  TEXT = "text",
  DECIMAL = "decimal",
  OPTION = "option",
  BOOLEAN = "boolean",
  DATETIME = "datetime",
  RELATION = "relation",
}

/**
 * Relation target of a `relation` typed custom property.
 */
export type TIssuePropertyRelationType = "user" | null;

/**
 * Option of an `option` typed custom property.
 */
export type TIssuePropertyOption = {
  id: string;
  property: string;
  name: string;
  description: string;
  logo_props: TLogoProps | undefined;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

/**
 * Custom property attached to a work item type.
 */
export type TIssueProperty = {
  id: string;
  issue_type: string;
  name: string;
  display_name: string;
  description: string;
  property_type: EIssuePropertyType;
  relation_type: TIssuePropertyRelationType;
  is_required: boolean;
  is_active: boolean;
  is_multi: boolean;
  default_value: string[];
  settings: Record<string, unknown>;
  sort_order: number;
  logo_props: TLogoProps | undefined;
  options: TIssuePropertyOption[];
};

/**
 * Text property display formats, stored in `settings.display_format`.
 */
export type TIssuePropertyTextDisplayFormat = "single-line" | "multi-line" | "readonly";
