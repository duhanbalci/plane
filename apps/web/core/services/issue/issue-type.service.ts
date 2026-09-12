/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueType } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listWorkspaceTypes(workspaceSlug: string): Promise<TIssueType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceType(workspaceSlug: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceType(workspaceSlug: string, typeId: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceType(workspaceSlug: string, typeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async list(workspaceSlug: string, projectId: string): Promise<TIssueType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, typeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async enable(workspaceSlug: string, projectId: string): Promise<TIssueType[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/enable/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
