/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import { ETemplateType } from "@plane/types";
import type { TWorkItemTemplate } from "@plane/types";
// services
import { TemplateService } from "@/services/template.service";
// store
import type { CoreRootStore } from "@/store/root.store";

/** Key used for the workspace level bucket of `fetchedMap`. */
const WORKSPACE_SCOPE = "workspace";

export interface IWorkItemTemplateStore {
  // observables
  templatesMap: Record<string, TWorkItemTemplate>;
  fetchedMap: Record<string, boolean>;
  // computed actions
  getTemplateById: (templateId: string | null | undefined) => TWorkItemTemplate | undefined;
  getTemplatesForProject: (projectId: string | null | undefined) => TWorkItemTemplate[];
  getWorkspaceTemplates: () => TWorkItemTemplate[];
  isFetchedForProject: (projectId: string | null | undefined) => boolean;
  isFetchedForWorkspace: () => boolean;
  // fetch actions
  fetchProjectTemplates: (workspaceSlug: string, projectId: string) => Promise<TWorkItemTemplate[]>;
  fetchWorkspaceTemplates: (workspaceSlug: string) => Promise<TWorkItemTemplate[]>;
  // crud actions
  createTemplate: (
    workspaceSlug: string,
    projectId: string | null,
    data: Partial<TWorkItemTemplate>
  ) => Promise<TWorkItemTemplate>;
  updateTemplate: (
    workspaceSlug: string,
    projectId: string | null,
    templateId: string,
    data: Partial<TWorkItemTemplate>
  ) => Promise<TWorkItemTemplate>;
  deleteTemplate: (workspaceSlug: string, projectId: string | null, templateId: string) => Promise<void>;
}

export class WorkItemTemplateStore implements IWorkItemTemplateStore {
  // observables
  templatesMap: Record<string, TWorkItemTemplate> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  templateService: TemplateService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      templatesMap: observable,
      fetchedMap: observable,
      // actions
      fetchProjectTemplates: action,
      fetchWorkspaceTemplates: action,
      createTemplate: action,
      updateTemplate: action,
      deleteTemplate: action,
    });

    this.rootStore = _rootStore;
    this.templateService = new TemplateService();
  }

  getTemplateById = computedFn((templateId: string | null | undefined): TWorkItemTemplate | undefined =>
    templateId ? this.templatesMap[templateId] : undefined
  );

  /** Project templates plus the workspace ones, sorted by name. */
  getTemplatesForProject = computedFn((projectId: string | null | undefined): TWorkItemTemplate[] => {
    if (!projectId) return [];
    const templates = Object.values(this.templatesMap).filter(
      (template) => template.project === projectId || template.project === null
    );
    return orderBy(templates, ["name"], ["asc"]);
  });

  getWorkspaceTemplates = computedFn((): TWorkItemTemplate[] =>
    orderBy(
      Object.values(this.templatesMap).filter((template) => template.project === null),
      ["name"],
      ["asc"]
    )
  );

  isFetchedForProject = computedFn((projectId: string | null | undefined): boolean =>
    projectId ? Boolean(this.fetchedMap[projectId]) : false
  );

  isFetchedForWorkspace = computedFn((): boolean => Boolean(this.fetchedMap[WORKSPACE_SCOPE]));

  // helpers
  private applyTemplates = (templates: TWorkItemTemplate[], scope: string) => {
    runInAction(() => {
      for (const template of templates) set(this.templatesMap, [template.id], template);
      set(this.fetchedMap, [scope], true);
    });
  };

  // fetch actions
  fetchProjectTemplates = async (workspaceSlug: string, projectId: string) => {
    const response = await this.templateService.list(workspaceSlug, projectId, ETemplateType.WORK_ITEM);
    this.applyTemplates(response ?? [], projectId);
    return response;
  };

  fetchWorkspaceTemplates = async (workspaceSlug: string) => {
    const response = await this.templateService.listWorkspaceTemplates(workspaceSlug, ETemplateType.WORK_ITEM);
    this.applyTemplates(response ?? [], WORKSPACE_SCOPE);
    return response;
  };

  // crud actions
  createTemplate = async (workspaceSlug: string, projectId: string | null, data: Partial<TWorkItemTemplate>) => {
    const payload = { ...data, template_type: ETemplateType.WORK_ITEM };
    const response = projectId
      ? await this.templateService.create(workspaceSlug, projectId, payload)
      : await this.templateService.createWorkspaceTemplate(workspaceSlug, payload);
    runInAction(() => set(this.templatesMap, [response.id], response));
    return response;
  };

  updateTemplate = async (
    workspaceSlug: string,
    projectId: string | null,
    templateId: string,
    data: Partial<TWorkItemTemplate>
  ) => {
    const response = projectId
      ? await this.templateService.update(workspaceSlug, projectId, templateId, data)
      : await this.templateService.updateWorkspaceTemplate(workspaceSlug, templateId, data);
    runInAction(() => set(this.templatesMap, [response.id], response));
    return response;
  };

  deleteTemplate = async (workspaceSlug: string, projectId: string | null, templateId: string) => {
    if (projectId) await this.templateService.destroy(workspaceSlug, projectId, templateId);
    else await this.templateService.destroyWorkspaceTemplate(workspaceSlug, templateId);
    runInAction(() => unset(this.templatesMap, [templateId]));
  };
}
