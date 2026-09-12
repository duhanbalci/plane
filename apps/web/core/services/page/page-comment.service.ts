/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TPageComment, TPageCommentReaction } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/** The page a comment hangs off: a project page, or a workspace (wiki) page. */
export type TPageCommentScope = {
  workspaceSlug: string;
  pageId: string;
  projectId?: string;
};

export class PageCommentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(scope: TPageCommentScope): string {
    const { workspaceSlug, pageId, projectId } = scope;
    return projectId
      ? `/api/workspaces/${workspaceSlug}/projects/${projectId}/pages/${pageId}/comments/`
      : `/api/workspaces/${workspaceSlug}/pages/${pageId}/comments/`;
  }

  async fetchAll(scope: TPageCommentScope, resolved?: "true" | "false"): Promise<TPageComment[]> {
    return this.get(this.basePath(scope), { params: resolved ? { resolved } : undefined })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(scope: TPageCommentScope, data: Partial<TPageComment>): Promise<TPageComment> {
    return this.post(this.basePath(scope), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(scope: TPageCommentScope, commentId: string, data: Partial<TPageComment>): Promise<TPageComment> {
    return this.patch(`${this.basePath(scope)}${commentId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(scope: TPageCommentScope, commentId: string): Promise<void> {
    return this.delete(`${this.basePath(scope)}${commentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async resolve(scope: TPageCommentScope, commentId: string): Promise<TPageComment> {
    return this.post(`${this.basePath(scope)}${commentId}/resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unresolve(scope: TPageCommentScope, commentId: string): Promise<TPageComment> {
    return this.delete(`${this.basePath(scope)}${commentId}/resolve/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addReaction(scope: TPageCommentScope, commentId: string, reaction: string): Promise<TPageCommentReaction> {
    return this.post(`${this.basePath(scope)}${commentId}/reactions/`, { reaction })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeReaction(scope: TPageCommentScope, commentId: string, reaction: string): Promise<void> {
    return this.delete(`${this.basePath(scope)}${commentId}/reactions/${reaction}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
