/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType, SVGProps } from "react";
import {
  BooleanOutline,
  DropdownOutline,
  DueDateOutline,
  HashOutline,
  MembersOutline,
  PropertiesOutline,
  TextOutline,
} from "@makeplane/propel/icons";
// plane imports
import { EIssuePropertyType } from "@plane/types";

const PROPERTY_TYPE_ICONS: Record<EIssuePropertyType, ComponentType<SVGProps<SVGSVGElement>>> = {
  [EIssuePropertyType.TEXT]: TextOutline,
  [EIssuePropertyType.DECIMAL]: HashOutline,
  [EIssuePropertyType.OPTION]: DropdownOutline,
  [EIssuePropertyType.BOOLEAN]: BooleanOutline,
  [EIssuePropertyType.DATETIME]: DueDateOutline,
  [EIssuePropertyType.RELATION]: MembersOutline,
};

/**
 * Icon of a custom property, picked from its property type.
 */
export const getIssuePropertyIcon = (
  propertyType: EIssuePropertyType | undefined
): ComponentType<SVGProps<SVGSVGElement>> =>
  (propertyType ? PROPERTY_TYPE_ICONS[propertyType] : undefined) ?? PropertiesOutline;
