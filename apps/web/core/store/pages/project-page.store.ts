/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, unset, set } from "lodash-es";
import { makeObservable, observable, runInAction, action, reaction, computed } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { EUserPermissions } from "@plane/constants";
import type { TPage, TPageFilters, TPageNavigationTabs } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// helpers
import { filterPagesByPageType, getPageName, orderPages, shouldFilterPage } from "@plane/utils";
// plane web constants
// plane web store
// services
import { ProjectPageService } from "@/services/page";
// store
import type { CoreRootStore } from "../root.store";
import type { TProjectPage } from "./project-page";
import { ProjectPage } from "./project-page";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

// same gap the API uses between siblings
const DEFAULT_PAGE_SORT_ORDER = 65535;

export const ROLE_PERMISSIONS_TO_CREATE_PAGE = [
  EUserPermissions.ADMIN,
  EUserPermissions.MEMBER,
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.MEMBER,
];

export interface IProjectPageStore {
  // observables
  loader: TLoader;
  data: Record<string, TProjectPage>; // pageId => Page
  error: TError | undefined;
  filters: TPageFilters;
  // computed
  isAnyPageAvailable: boolean;
  canCurrentUserCreatePage: boolean;
  // helper actions
  getCurrentProjectPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getCurrentProjectPageIds: (projectId: string) => string[];
  getCurrentProjectFilteredPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getRootPageIds: (pageType: TPageNavigationTabs) => string[] | undefined;
  getChildPageIds: (parentId: string) => string[];
  getPageById: (pageId: string) => TProjectPage | undefined;
  updateFilters: <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => void;
  clearAllFilters: () => void;
  // actions
  fetchPagesList: (
    workspaceSlug: string,
    projectId: string,
    pageType?: TPageNavigationTabs
  ) => Promise<TPage[] | undefined>;
  fetchPageDetails: (
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    options?: { trackVisit?: boolean }
  ) => Promise<TPage | undefined>;
  createPage: (pageData: Partial<TPage>) => Promise<TPage | undefined>;
  removePage: (params: { pageId: string; shouldSync?: boolean; cascade?: boolean }) => Promise<void>;
  movePage: (workspaceSlug: string, projectId: string, pageId: string, newProjectId: string) => Promise<void>;
  movePageInTree: (pageId: string, newParentId: string | null, index?: number) => Promise<void>;
}

export class ProjectPageStore implements IProjectPageStore {
  // observables
  loader: TLoader = "init-loader";
  data: Record<string, TProjectPage> = {}; // pageId => Page
  error: TError | undefined = undefined;
  filters: TPageFilters = {
    searchQuery: "",
    sortKey: "updated_at",
    sortBy: "desc",
  };
  // service
  service: ProjectPageService;
  rootStore: CoreRootStore;

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      data: observable,
      error: observable,
      filters: observable,
      // computed
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      // helper actions
      updateFilters: action,
      clearAllFilters: action,
      // actions
      fetchPagesList: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      movePage: action,
      movePageInTree: action,
    });
    this.rootStore = store;
    // service
    this.service = new ProjectPageService();
    // initialize display filters of the current project
    reaction(
      () => this.store.router.projectId,
      (projectId) => {
        if (!projectId) return;
        this.filters.searchQuery = "";
      }
    );
  }

  /**
   * @description check if any page is available
   */
  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  /**
   * @description returns true if the current logged in user can create a page
   */
  get canCurrentUserCreatePage() {
    const { workspaceSlug, projectId } = this.store.router;
    const currentUserProjectRole = this.store.user.permission.getProjectRoleByWorkspaceSlugAndProjectId(
      workspaceSlug?.toString() || "",
      projectId?.toString() || ""
    );
    return !!currentUserProjectRole && ROLE_PERMISSIONS_TO_CREATE_PAGE.includes(currentUserProjectRole);
  }

  /**
   * @description get the current project page ids based on the pageType
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;
    // helps to filter pages based on the pageType
    let pagesByType = filterPagesByPageType(pageType, Object.values(this?.data || {}));
    pagesByType = pagesByType.filter((p) => p.project_ids?.includes(projectId));

    const pages = (pagesByType.map((page) => page.id) as string[]) || undefined;

    return pages ?? undefined;
  });

  /**
   * @description get the current project page ids
   * @param {string} projectId
   */
  getCurrentProjectPageIds = computedFn((projectId: string) => {
    if (!projectId) return [];
    const pages = Object.values(this?.data || {}).filter((page) => page.project_ids?.includes(projectId));
    return pages.map((page) => page.id) as string[];
  });

  /**
   * @description get the current project filtered page ids based on the pageType
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectFilteredPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;

    // helps to filter pages based on the pageType
    const pagesByType = filterPagesByPageType(pageType, Object.values(this?.data || {}));
    let filteredPages = pagesByType.filter(
      (p) =>
        p.project_ids?.includes(projectId) &&
        getPageName(p.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterPage(p, this.filters.filters)
    );
    filteredPages = orderPages(filteredPages, this.filters.sortKey, this.filters.sortBy);

    const pages = (filteredPages.map((page) => page.id) as string[]) || undefined;

    return pages ?? undefined;
  });

  /**
   * @description get the root (parentless) page ids of the current project for the given tab.
   * While searching the tree is flattened so matches inside sub pages stay reachable.
   * @param {TPageNavigationTabs} pageType
   */
  getRootPageIds = computedFn((pageType: TPageNavigationTabs) => {
    const filteredPageIds = this.getCurrentProjectFilteredPageIdsByTab(pageType);
    if (!filteredPageIds) return undefined;
    if (this.filters.searchQuery.trim() !== "") return filteredPageIds;
    return filteredPageIds.filter((pageId) => !this.getPageById(pageId)?.parent);
  });

  /**
   * @description get the direct children of a page, ordered by sort_order
   * @param {string} parentId
   */
  getChildPageIds = computedFn((parentId: string) => {
    const { projectId } = this.store.router;
    if (!projectId || !parentId) return [];
    const childPages = Object.values(this?.data || {}).filter(
      (page) => page.parent === parentId && page.project_ids?.includes(projectId)
    );
    return orderBy(childPages, (page) => page.sort_order ?? 0, "asc").map((page) => page.id) as string[];
  });

  /**
   * @description get the page store by id
   * @param {string} pageId
   */
  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  updateFilters = <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  /**
   * @description clear all the filters
   */
  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  /**
   * @description fetch all the pages
   */
  fetchPagesList = async (workspaceSlug: string, projectId: string, pageType?: TPageNavigationTabs) => {
    try {
      if (!workspaceSlug || !projectId) return undefined;

      const currentPageIds = pageType ? this.getCurrentProjectPageIdsByTab(pageType) : undefined;
      runInAction(() => {
        this.loader = currentPageIds && currentPageIds.length > 0 ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const pages = await this.service.fetchAll(workspaceSlug, projectId);
      runInAction(() => {
        for (const page of pages) {
          if (page?.id) {
            const existingPage = this.getPageById(page.id);
            if (existingPage) {
              // If page already exists, update all fields except name

              const { name, ...otherFields } = page;
              existingPage.mutateProperties(otherFields, false);
            } else {
              // If new page, create a new instance with all data
              set(this.data, [page.id], new ProjectPage(this.store, page));
            }
          }
        }
        this.loader = undefined;
      });

      return pages;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the pages, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description fetch the details of a page
   * @param {string} pageId
   */
  fetchPageDetails = async (...args: Parameters<IProjectPageStore["fetchPageDetails"]>) => {
    const [workspaceSlug, projectId, pageId, options] = args;
    const { trackVisit } = options || {};
    try {
      if (!workspaceSlug || !projectId || !pageId) return undefined;

      const currentPageId = this.getPageById(pageId);
      runInAction(() => {
        this.loader = currentPageId ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const page = await this.service.fetchById(workspaceSlug, projectId, pageId, trackVisit ?? true);

      runInAction(() => {
        if (page?.id) {
          const pageInstance = this.getPageById(page.id);
          if (pageInstance) {
            pageInstance.mutateProperties(page, false);
          } else {
            set(this.data, [page.id], new ProjectPage(this.store, page));
          }
        }
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description create a page
   * @param {Partial<TPage>} pageData
   */
  createPage = async (pageData: Partial<TPage>) => {
    try {
      const { workspaceSlug, projectId } = this.store.router;
      if (!workspaceSlug || !projectId) return undefined;

      runInAction(() => {
        this.loader = "mutation-loader";
        this.error = undefined;
      });

      const page = await this.service.create(workspaceSlug, projectId, pageData);
      runInAction(() => {
        if (page?.id) set(this.data, [page.id], new ProjectPage(this.store, page));
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to create a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description delete a page
   * @param {string} pageId
   */
  removePage = async ({
    pageId,
    shouldSync: _shouldSync = true,
    cascade = false,
  }: {
    pageId: string;
    shouldSync?: boolean;
    cascade?: boolean;
  }) => {
    try {
      const { workspaceSlug, projectId } = this.store.router;
      if (!workspaceSlug || !projectId || !pageId) return undefined;

      // With cascade the whole subtree goes away, otherwise the children move up.
      const removedPageIds = cascade ? this.getDescendantPageIds(pageId) : [pageId];
      const childPageIds = cascade ? [] : this.getChildPageIds(pageId);

      await this.service.remove(workspaceSlug, projectId, pageId, { cascade });
      runInAction(() => {
        for (const removedPageId of removedPageIds) {
          unset(this.data, [removedPageId]);
          if (this.rootStore.favorite.entityMap[removedPageId])
            this.rootStore.favorite.removeFavoriteFromStore(removedPageId);
        }
        for (const childPageId of childPageIds) {
          this.getPageById(childPageId)?.mutateProperties({ parent: null }, false);
        }
      });
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to delete a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description move a page to a new project
   * @param {string} workspaceSlug
   * @param {string} projectId
   * @param {string} pageId
   * @param {string} newProjectId
   */
  movePage = async (workspaceSlug: string, projectId: string, pageId: string, newProjectId: string) => {
    try {
      await this.service.move(workspaceSlug, projectId, pageId, newProjectId);
      runInAction(() => {
        unset(this.data, [pageId]);
      });
    } catch (error) {
      console.error("Unable to move page", error);
      throw error;
    }
  };

  /**
   * @description the page id and every descendant id, walking the local tree
   * @param {string} pageId
   */
  getDescendantPageIds = (pageId: string): string[] => {
    const ids = [pageId];
    for (const childId of this.getChildPageIds(pageId)) {
      ids.push(...this.getDescendantPageIds(childId));
    }
    return ids;
  };

  /**
   * @description re-parent a page and/or place it at `index` among its new siblings
   * @param {string} pageId
   * @param {string | null} newParentId
   * @param {number | undefined} index
   */
  movePageInTree = async (pageId: string, newParentId: string | null, index?: number) => {
    const { workspaceSlug, projectId } = this.store.router;
    const page = this.getPageById(pageId);
    if (!workspaceSlug || !projectId || !page) return;
    // a page cannot become a child of itself or of one of its own descendants
    if (newParentId && this.getDescendantPageIds(pageId).includes(newParentId)) return;

    const previousParent = page.parent ?? null;
    const previousSortOrder = page.sort_order;
    const sortOrder = this.getSortOrderForIndex(pageId, newParentId, index);

    runInAction(() => {
      page.mutateProperties({ parent: newParentId, sort_order: sortOrder }, false);
    });

    try {
      const updatedPage = await this.service.moveInTree(workspaceSlug, projectId, pageId, {
        parent: newParentId,
        sort_order: sortOrder,
      });
      runInAction(() => {
        page.mutateProperties(updatedPage, false);
      });
    } catch (error) {
      // rollback the optimistic update
      runInAction(() => {
        page.mutateProperties({ parent: previousParent, sort_order: previousSortOrder }, false);
      });
      console.error("Unable to move page in the tree", error);
      throw error;
    }
  };

  /**
   * @description sort_order that places a page at `index` among the children of `parentId`
   */
  private getSortOrderForIndex = (pageId: string, parentId: string | null, index?: number) => {
    const siblingIds = (parentId ? this.getChildPageIds(parentId) : this.getRootSiblingIds()).filter(
      (siblingId) => siblingId !== pageId
    );
    const sortOrders = siblingIds.map((siblingId) => this.getPageById(siblingId)?.sort_order ?? 0);

    if (index === undefined || index >= sortOrders.length) {
      const last = sortOrders.length > 0 ? Math.max(...sortOrders) : 0;
      return last + DEFAULT_PAGE_SORT_ORDER;
    }
    if (index <= 0) return sortOrders[0] - DEFAULT_PAGE_SORT_ORDER;
    return (sortOrders[index - 1] + sortOrders[index]) / 2;
  };

  /**
   * @description root level pages of the current project, ordered by sort_order
   */
  private getRootSiblingIds = () => {
    const { projectId } = this.store.router;
    if (!projectId) return [];
    const rootPages = Object.values(this?.data || {}).filter(
      (page) => !page.parent && page.project_ids?.includes(projectId)
    );
    return orderBy(rootPages, (page) => page.sort_order ?? 0, "asc").map((page) => page.id) as string[];
  };
}
