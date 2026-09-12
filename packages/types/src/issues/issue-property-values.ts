/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Custom property values of a work item, keyed by property id.
 * Every value is stored as a list of strings, single valued properties keep a single item.
 */
export type TIssuePropertyValues = Record<string, string[]>;

/**
 * Validation errors of custom property values, keyed by property id.
 * The value is an i18n key or a ready to render message.
 */
export type TIssuePropertyValueErrors = Record<string, string>;
