/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EPageEmbedAttributeNames {
  ID = "id",
  ENTITY_IDENTIFIER = "entity_identifier",
}

export type TPageEmbedAttributes = {
  [EPageEmbedAttributeNames.ID]: string | undefined;
  [EPageEmbedAttributeNames.ENTITY_IDENTIFIER]: string | undefined;
};
