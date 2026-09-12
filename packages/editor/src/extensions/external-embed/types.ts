/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node } from "@tiptap/core";

export enum EExternalEmbedAttributeNames {
  ID = "id",
  SOURCE = "src",
  DISPLAY = "display",
  TITLE = "title",
}

export enum EExternalEmbedDisplay {
  LINK = "link",
  CARD = "card",
  EMBED = "embed",
}

export type TExternalEmbedAttributes = {
  [EExternalEmbedAttributeNames.ID]: string | null;
  [EExternalEmbedAttributeNames.SOURCE]: string | null;
  [EExternalEmbedAttributeNames.DISPLAY]: EExternalEmbedDisplay;
  [EExternalEmbedAttributeNames.TITLE]: string | null;
};

export type TInsertExternalEmbedProps = {
  src?: string;
  display?: EExternalEmbedDisplay;
  pos?: number;
};

export type TExternalEmbedExtensionType = Node<Record<string, never>, Record<string, never>>;
