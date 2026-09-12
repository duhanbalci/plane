/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, set, unset } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TIssueProperty, TIssuePropertyOption, TIssueType } from "@plane/types";
// services
import { IssuePropertyService, IssueTypeService } from "@/services/issue";
// store
import type { CoreRootStore } from "@/store/root.store";

export interface IIssueTypeStore {
  // observables
  typesMap: Record<string, TIssueType>;
  propertiesMap: Record<string, Record<string, TIssueProperty>>;
  fetchedMap: Record<string, boolean>;
  // computed
  currentProjectTypeIds: string[] | undefined;
  // computed actions
  getProjectTypeIds: (projectId: string | null | undefined) => string[];
  getProjectTypes: (projectId: string | null | undefined) => TIssueType[];
  getTypeById: (typeId: string | null | undefined) => TIssueType | undefined;
  getDefaultTypeId: (projectId: string | null | undefined) => string | null;
  getEpicTypeId: (projectId: string | null | undefined) => string | null;
  getProperties: (typeId: string | null | undefined) => TIssueProperty[];
  getActiveProperties: (typeId: string | null | undefined) => TIssueProperty[];
  isTypesFetchedForProject: (projectId: string | null | undefined) => boolean;
  // fetch actions
  fetchProjectTypes: (workspaceSlug: string, projectId: string) => Promise<TIssueType[]>;
  fetchProperties: (workspaceSlug: string, projectId: string, typeId: string) => Promise<TIssueProperty[]>;
  // type actions
  enableForProject: (workspaceSlug: string, projectId: string) => Promise<TIssueType[]>;
  createType: (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  updateType: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueType>
  ) => Promise<TIssueType>;
  deleteType: (workspaceSlug: string, projectId: string, typeId: string) => Promise<void>;
  // property actions
  createProperty: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueProperty>
  ) => Promise<TIssueProperty>;
  updateProperty: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueProperty>
  ) => Promise<TIssueProperty>;
  deleteProperty: (workspaceSlug: string, projectId: string, typeId: string, propertyId: string) => Promise<void>;
  // option actions
  createOption: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssuePropertyOption>
  ) => Promise<TIssuePropertyOption>;
  updateOption: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssuePropertyOption>
  ) => Promise<TIssuePropertyOption>;
  deleteOption: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string
  ) => Promise<void>;
}

export class IssueTypeStore implements IIssueTypeStore {
  // observables
  typesMap: Record<string, TIssueType> = {};
  propertiesMap: Record<string, Record<string, TIssueProperty>> = {};
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  issueTypeService: IssueTypeService;
  issuePropertyService: IssuePropertyService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      typesMap: observable,
      propertiesMap: observable,
      fetchedMap: observable,
      // computed
      currentProjectTypeIds: computed,
      // actions
      fetchProjectTypes: action,
      fetchProperties: action,
      enableForProject: action,
      createType: action,
      updateType: action,
      deleteType: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      createOption: action,
      updateOption: action,
      deleteOption: action,
    });

    this.rootStore = _rootStore;
    this.issueTypeService = new IssueTypeService();
    this.issuePropertyService = new IssuePropertyService();
  }

  /**
   * Work item type ids of the project in the current route.
   */
  get currentProjectTypeIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return undefined;
    return this.getProjectTypeIds(projectId);
  }

  isTypesFetchedForProject = computedFn((projectId: string | null | undefined) =>
    projectId ? Boolean(this.fetchedMap[projectId]) : false
  );

  getProjectTypes = computedFn((projectId: string | null | undefined): TIssueType[] => {
    if (!projectId) return [];
    const types = Object.values(this.typesMap).filter((type) => type.project_ids?.includes(projectId));
    return orderBy(types, ["level", "name"], ["asc", "asc"]);
  });

  getProjectTypeIds = computedFn((projectId: string | null | undefined): string[] =>
    this.getProjectTypes(projectId).map((type) => type.id)
  );

  getTypeById = computedFn((typeId: string | null | undefined): TIssueType | undefined =>
    typeId ? this.typesMap[typeId] : undefined
  );

  getDefaultTypeId = computedFn((projectId: string | null | undefined): string | null => {
    const types = this.getProjectTypes(projectId).filter((type) => type.is_active && !type.is_epic);
    const defaultType = types.find((type) => type.is_default);
    return defaultType?.id ?? types[0]?.id ?? null;
  });

  getEpicTypeId = computedFn((projectId: string | null | undefined): string | null => {
    const epicType = this.getProjectTypes(projectId).find((type) => type.is_epic);
    return epicType?.id ?? null;
  });

  getProperties = computedFn((typeId: string | null | undefined): TIssueProperty[] => {
    if (!typeId) return [];
    return orderBy(Object.values(this.propertiesMap[typeId] ?? {}), ["sort_order"], ["asc"]);
  });

  getActiveProperties = computedFn((typeId: string | null | undefined): TIssueProperty[] =>
    this.getProperties(typeId).filter((property) => property.is_active)
  );

  // helpers
  private applyType = (type: TIssueType) => {
    set(this.typesMap, [type.id], type);
  };

  private applyProperties = (typeId: string, properties: TIssueProperty[]) => {
    const propertyMap: Record<string, TIssueProperty> = {};
    for (const property of properties) propertyMap[property.id] = property;
    set(this.propertiesMap, [typeId], propertyMap);
  };

  // fetch actions
  fetchProjectTypes = async (workspaceSlug: string, projectId: string) => {
    const response = await this.issueTypeService.list(workspaceSlug, projectId);
    runInAction(() => {
      for (const type of response ?? []) this.applyType(type);
      set(this.fetchedMap, [projectId], true);
    });
    return response;
  };

  fetchProperties = async (workspaceSlug: string, projectId: string, typeId: string) => {
    const response = await this.issuePropertyService.list(workspaceSlug, projectId, typeId);
    runInAction(() => {
      this.applyProperties(typeId, response ?? []);
    });
    return response;
  };

  // type actions
  enableForProject = async (workspaceSlug: string, projectId: string) => {
    const response = await this.issueTypeService.enable(workspaceSlug, projectId);
    runInAction(() => {
      for (const type of response ?? []) this.applyType(type);
      set(this.fetchedMap, [projectId], true);
    });
    // the backend flips `is_issue_type_enabled` on the project, mirror it locally
    const project = this.rootStore.projectRoot.project.projectMap[projectId];
    if (project) runInAction(() => set(project, ["is_issue_type_enabled"], true));
    return response;
  };

  createType = async (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => {
    const response = await this.issueTypeService.create(workspaceSlug, projectId, data);
    runInAction(() => this.applyType(response));
    return response;
  };

  updateType = async (workspaceSlug: string, projectId: string, typeId: string, data: Partial<TIssueType>) => {
    const original = this.typesMap[typeId];
    runInAction(() => {
      if (original) set(this.typesMap, [typeId], { ...original, ...data });
    });
    try {
      const response = await this.issueTypeService.update(workspaceSlug, projectId, typeId, data);
      runInAction(() => {
        this.applyType(response);
        // only one default type per project
        if (data.is_default) {
          for (const type of this.getProjectTypes(projectId)) {
            if (type.id !== typeId && type.is_default) set(this.typesMap, [type.id, "is_default"], false);
          }
        }
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (original) set(this.typesMap, [typeId], original);
      });
      throw error;
    }
  };

  /**
   * The project route only unlinks the type from the project, the workspace type stays.
   */
  deleteType = async (workspaceSlug: string, projectId: string, typeId: string) => {
    await this.issueTypeService.destroy(workspaceSlug, projectId, typeId);
    runInAction(() => {
      const type = this.typesMap[typeId];
      if (!type) return;
      const projectIds = (type.project_ids ?? []).filter((id) => id !== projectId);
      set(this.typesMap, [typeId, "project_ids"], projectIds);
      if (projectIds.length === 0) unset(this.propertiesMap, [typeId]);
    });
  };

  // property actions
  createProperty = async (workspaceSlug: string, projectId: string, typeId: string, data: Partial<TIssueProperty>) => {
    const response = await this.issuePropertyService.create(workspaceSlug, projectId, typeId, data);
    runInAction(() => set(this.propertiesMap, [typeId, response.id], response));
    return response;
  };

  updateProperty = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueProperty>
  ) => {
    const original = this.propertiesMap[typeId]?.[propertyId];
    runInAction(() => {
      if (original) set(this.propertiesMap, [typeId, propertyId], { ...original, ...data });
    });
    try {
      const response = await this.issuePropertyService.update(workspaceSlug, projectId, typeId, propertyId, data);
      runInAction(() => set(this.propertiesMap, [typeId, propertyId], response));
      return response;
    } catch (error) {
      runInAction(() => {
        if (original) set(this.propertiesMap, [typeId, propertyId], original);
      });
      throw error;
    }
  };

  deleteProperty = async (workspaceSlug: string, projectId: string, typeId: string, propertyId: string) => {
    await this.issuePropertyService.destroy(workspaceSlug, projectId, typeId, propertyId);
    runInAction(() => unset(this.propertiesMap, [typeId, propertyId]));
  };

  // option actions
  createOption = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssuePropertyOption>
  ) => {
    const response = await this.issuePropertyService.createOption(workspaceSlug, projectId, typeId, propertyId, data);
    runInAction(() => {
      const property = this.propertiesMap[typeId]?.[propertyId];
      if (property) set(this.propertiesMap, [typeId, propertyId, "options"], [...(property.options ?? []), response]);
    });
    return response;
  };

  updateOption = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssuePropertyOption>
  ) => {
    const response = await this.issuePropertyService.updateOption(
      workspaceSlug,
      projectId,
      typeId,
      propertyId,
      optionId,
      data
    );
    runInAction(() => {
      const property = this.propertiesMap[typeId]?.[propertyId];
      if (!property) return;
      set(
        this.propertiesMap,
        [typeId, propertyId, "options"],
        (property.options ?? []).map((option) => (option.id === optionId ? response : option))
      );
    });
    return response;
  };

  deleteOption = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    optionId: string
  ) => {
    await this.issuePropertyService.destroyOption(workspaceSlug, projectId, typeId, propertyId, optionId);
    runInAction(() => {
      const property = this.propertiesMap[typeId]?.[propertyId];
      if (!property) return;
      set(
        this.propertiesMap,
        [typeId, propertyId, "options"],
        (property.options ?? []).filter((option) => option.id !== optionId)
      );
    });
  };
}
