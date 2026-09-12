/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TPageEmbedDetails = {
  name: string | undefined;
  logo_props?: unknown;
};

export type TPageEmbedConfig = {
  /** resolve the embedded page's details from the app store */
  getPageDetails: (pageId: string) => TPageEmbedDetails | undefined;
  /** navigate to the embedded page */
  onClick: (pageId: string) => void;
  /** create a sub page of the current page and return its id */
  createPage: (name: string) => Promise<{ id: string } | undefined>;
};
