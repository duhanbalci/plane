/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueProperty, TIssuePropertyOption } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IssuePropertyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private propertiesPath(workspaceSlug: string, projectId: string, typeId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${typeId}/properties/`;
  }

  private optionsPath(workspaceSlug: string, projectId: string, typeId: string, propertyId: string) {
    return `${this.propertiesPath(workspaceSlug, projectId, typeId)}${propertyId}/options/`;
  }

  async list(workspaceSlug: string, projectId: string, typeId: string): Promise<TIssueProperty[]> {
    return this.get(this.propertiesPath(workspaceSlug, projectId, typeId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueProperty>
  ): Promise<TIssueProperty> {
    return this.post(this.propertiesPath(workspaceSlug, projectId, typeId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueProperty>
  ): Promise<TIssueProperty> {
    return this.patch(`${this.propertiesPath(workspaceSlug, projectId, typeId)}${propertyId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, typeId: string, propertyId: string): Promise<void> {
    return this.delete(`${this.propertiesPath(workspaceSlug, projectId, typeId)}${propertyId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listOptions(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string
  ): Promise<TIssuePropertyOption[]> {
    return this.get(this.optionsPath(workspaceSlug, projectId, typeId, propertyId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption> {
    return this.post(this.optionsPath(workspaceSlug, projectId, typeId, propertyId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateOption(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption> {
    return this.patch(`${this.optionsPath(workspaceSlug, projectId, typeId, propertyId)}${optionId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroyOption(
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string
  ): Promise<void> {
    return this.delete(`${this.optionsPath(workspaceSlug, projectId, typeId, propertyId)}${optionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
