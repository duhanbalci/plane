/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { ETemplateType, TWorkItemTemplate } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class TemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listWorkspaceTemplates(workspaceSlug: string, type: ETemplateType): Promise<TWorkItemTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/templates/`, { params: { type } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceTemplate(
    workspaceSlug: string,
    data: Partial<TWorkItemTemplate>
  ): Promise<TWorkItemTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceTemplate(
    workspaceSlug: string,
    templateId: string,
    data: Partial<TWorkItemTemplate>
  ): Promise<TWorkItemTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/templates/${templateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroyWorkspaceTemplate(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async list(workspaceSlug: string, projectId: string, type: ETemplateType): Promise<TWorkItemTemplate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/templates/`, { params: { type } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TWorkItemTemplate>
  ): Promise<TWorkItemTemplate> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    templateId: string,
    data: Partial<TWorkItemTemplate>
  ): Promise<TWorkItemTemplate> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/templates/${templateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, templateId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
