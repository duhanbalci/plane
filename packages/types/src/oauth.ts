/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface IOAuthScope {
  key: string;
  description: string;
}

/** An application the current user has granted access to their Plane account. */
export interface IConnectedApplication {
  id: string;
  name: string;
  client_id: string;
  client_uri: string | null;
  /**
   * Registered itself through dynamic client registration rather than being
   * set up by an admin, so it has not been reviewed by anybody.
   */
  is_dynamically_registered: boolean;
  scopes: IOAuthScope[];
  authorized_at: string | null;
  last_authorized_at: string | null;
  last_used_at: string | null;
}
