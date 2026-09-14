/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IConnectedApplication } from "@plane/types";
import { APIService } from "../api.service";

/**
 * Applications the current user has granted OAuth access to — remote MCP
 * clients, chiefly. Served by the authorization server under /auth/o/ rather
 * than /api/, because that is where the rest of the OAuth surface lives.
 */
export class ConnectedApplicationService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  /**
   * Lists every application currently holding a grant on this account.
   * @returns {Promise<IConnectedApplication[]>} The connected applications
   * @throws {Error} Throws response data if the request fails
   */
  async list(): Promise<IConnectedApplication[]> {
    return this.get(`/auth/o/applications/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Revokes every token the application holds on this account. The application
   * has to go through the consent screen again to regain access.
   * @param {string} applicationId - The application to revoke
   * @throws {Error} Throws response data if the request fails
   */
  async revoke(applicationId: string): Promise<void> {
    return this.delete(`/auth/o/applications/${applicationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
