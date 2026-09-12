/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TEpicAnalytics } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/** Epic'e ozgu uclar; CRUD tarafi IssueService'in EPICS kipinden gecer. */
export class EpicService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchEpicAnalytics(workspaceSlug: string, projectId: string, epicId: string): Promise<TEpicAnalytics> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/analytics/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeEpicWorkItem(
    workspaceSlug: string,
    projectId: string,
    epicId: string,
    workItemId: string
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/epics/${epicId}/issues/${workItemId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
