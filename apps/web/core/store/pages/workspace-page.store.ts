/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy, set, unset } from "lodash-es";
import { action, computed, makeObservable, observable, reaction, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { EUserPermissions } from "@plane/constants";
import type { TPage, TPageCollection, TPageFilters, TPageNavigationTabs } from "@plane/types";
// helpers
import { filterPagesByPageType, getPageName, orderPages, shouldFilterPage } from "@plane/utils";
// services
import { WorkspacePageService } from "@/services/page";
// store
import type { CoreRootStore } from "../root.store";
import type { TWorkspacePage } from "./workspace-page";
import { WorkspacePage } from "./workspace-page";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

// same gap the API uses between siblings
const DEFAULT_PAGE_SORT_ORDER = 65535;

const ROLE_PERMISSIONS_TO_CREATE_WIKI_PAGE = new Set<number>([EUserPermissions.ADMIN, EUserPermissions.MEMBER]);

export interface IWorkspacePageStore {
  // observables
  loader: TLoader;
  data: Record<string, TWorkspacePage>; // pageId => Page
  collections: Record<string, TPageCollection>; // collectionId => Collection
  error: TError | undefined;
  filters: TPageFilters;
  // computed
  isAnyPageAvailable: boolean;
  canCurrentUserCreatePage: boolean;
  collectionIds: string[];
  defaultCollectionId: string | undefined;
  // helper actions
  getPageById: (pageId: string) => TWorkspacePage | undefined;
  getCollectionById: (collectionId: string) => TPageCollection | undefined;
  getFilteredPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getRootPageIds: (pageType: TPageNavigationTabs) => string[] | undefined;
  getCollectionRootPageIds: (collectionId: string, pageType: TPageNavigationTabs) => string[];
  getChildPageIds: (parentId: string) => string[];
  updateFilters: <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => void;
  clearAllFilters: () => void;
  // actions
  fetchPagesList: (
    workspaceSlug: string,
    projectId?: string,
    pageType?: TPageNavigationTabs
  ) => Promise<TPage[] | undefined>;
  fetchPageDetails: (
    workspaceSlug: string,
    pageId: string,
    options?: { trackVisit?: boolean }
  ) => Promise<TPage | undefined>;
  createPage: (pageData: Partial<TPage>) => Promise<TPage | undefined>;
  removePage: (params: { pageId: string; shouldSync?: boolean; cascade?: boolean }) => Promise<void>;
  movePageInTree: (pageId: string, newParentId: string | null, index?: number) => Promise<void>;
  movePageToCollection: (pageId: string, collectionId: string) => Promise<void>;
  // collections
  fetchCollections: (workspaceSlug: string) => Promise<TPageCollection[] | undefined>;
  createCollection: (data: Partial<TPageCollection>) => Promise<TPageCollection | undefined>;
  updateCollection: (collectionId: string, data: Partial<TPageCollection>) => Promise<void>;
  removeCollection: (collectionId: string) => Promise<void>;
}

export class WorkspacePageStore implements IWorkspacePageStore {
  // observables
  loader: TLoader = "init-loader";
  data: Record<string, TWorkspacePage> = {};
  collections: Record<string, TPageCollection> = {};
  error: TError | undefined = undefined;
  filters: TPageFilters = {
    searchQuery: "",
    sortKey: "updated_at",
    sortBy: "desc",
  };
  // service
  service: WorkspacePageService;
  rootStore: CoreRootStore;

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      data: observable,
      collections: observable,
      error: observable,
      filters: observable,
      // computed
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      collectionIds: computed,
      defaultCollectionId: computed,
      // helper actions
      updateFilters: action,
      clearAllFilters: action,
      // actions
      fetchPagesList: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      movePageInTree: action,
      movePageToCollection: action,
      fetchCollections: action,
      createCollection: action,
      updateCollection: action,
      removeCollection: action,
    });
    this.rootStore = store;
    this.service = new WorkspacePageService();
    // reset the search when the workspace changes
    reaction(
      () => this.store.router.workspaceSlug,
      (workspaceSlug) => {
        if (!workspaceSlug) return;
        this.filters.searchQuery = "";
      }
    );
  }

  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  get canCurrentUserCreatePage() {
    const { workspaceSlug } = this.store.router;
    const role = this.store.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug?.toString() || "");
    return !!role && ROLE_PERMISSIONS_TO_CREATE_WIKI_PAGE.has(role);
  }

  /** Collections, default one first, then by sort order. */
  get collectionIds() {
    const collections = orderBy(
      Object.values(this.collections),
      [(collection) => (collection.is_default ? 0 : 1), (collection) => collection.sort_order ?? 0],
      ["asc", "asc"]
    );
    return collections.map((collection) => collection.id);
  }

  get defaultCollectionId() {
    return Object.values(this.collections).find((collection) => collection.is_default)?.id;
  }

  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  getCollectionById = computedFn((collectionId: string) => this.collections?.[collectionId] || undefined);

  getFilteredPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const pagesByType = filterPagesByPageType(pageType, Object.values(this.data || {}));
    let filteredPages = pagesByType.filter(
      (p) =>
        getPageName(p.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterPage(p, this.filters.filters)
    );
    filteredPages = orderPages(filteredPages, this.filters.sortKey, this.filters.sortBy);
    return filteredPages.map((page) => page.id) as string[];
  });

  /**
   * @description root (parentless) page ids across every collection. While
   * searching the tree is flattened so matches inside sub pages stay reachable.
   */
  getRootPageIds = computedFn((pageType: TPageNavigationTabs) => {
    const filteredPageIds = this.getFilteredPageIdsByTab(pageType);
    if (this.filters.searchQuery.trim() !== "") return filteredPageIds;
    return filteredPageIds.filter((pageId) => !this.getPageById(pageId)?.parent);
  });

  /** @description root page ids of a single collection, ordered by sort_order */
  getCollectionRootPageIds = computedFn((collectionId: string, pageType: TPageNavigationTabs) => {
    const pageIds = this.getRootPageIds(pageType).filter(
      (pageId) => this.getPageById(pageId)?.collection === collectionId
    );
    return orderBy(pageIds, (pageId) => this.getPageById(pageId)?.sort_order ?? 0, "asc");
  });

  getChildPageIds = computedFn((parentId: string) => {
    if (!parentId) return [];
    const childPages = Object.values(this.data || {}).filter((page) => page.parent === parentId);
    return orderBy(childPages, (page) => page.sort_order ?? 0, "asc").map((page) => page.id) as string[];
  });

  updateFilters = <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  /**
   * @description fetch every wiki page of the workspace
   * @param projectId ignored; kept so the shared page components can call the
   * project and the workspace store through the same signature.
   */
  fetchPagesList = async (workspaceSlug: string, projectId?: string, pageType?: TPageNavigationTabs) => {
    try {
      if (!workspaceSlug) return undefined;

      const currentPageIds = pageType ? this.getFilteredPageIdsByTab(pageType) : undefined;
      runInAction(() => {
        this.loader = currentPageIds && currentPageIds.length > 0 ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const pages = await this.service.fetchAll(workspaceSlug);
      runInAction(() => {
        for (const page of pages) {
          if (!page?.id) continue;
          const existingPage = this.getPageById(page.id);
          if (existingPage) {
            // If page already exists, update all fields except name
            const { name: _name, ...otherFields } = page;
            existingPage.mutateProperties(otherFields, false);
          } else {
            set(this.data, [page.id], new WorkspacePage(this.store, page));
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

  fetchPageDetails = async (workspaceSlug: string, pageId: string, options?: { trackVisit?: boolean }) => {
    try {
      if (!workspaceSlug || !pageId) return undefined;

      const currentPage = this.getPageById(pageId);
      runInAction(() => {
        this.loader = currentPage ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const page = await this.service.fetchById(workspaceSlug, pageId, options?.trackVisit ?? true);

      runInAction(() => {
        if (page?.id) {
          const pageInstance = this.getPageById(page.id);
          if (pageInstance) {
            pageInstance.mutateProperties(page, false);
          } else {
            set(this.data, [page.id], new WorkspacePage(this.store, page));
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

  createPage = async (pageData: Partial<TPage>) => {
    try {
      const { workspaceSlug } = this.store.router;
      if (!workspaceSlug) return undefined;

      runInAction(() => {
        this.loader = "mutation-loader";
        this.error = undefined;
      });

      const page = await this.service.create(workspaceSlug, pageData);
      runInAction(() => {
        if (page?.id) set(this.data, [page.id], new WorkspacePage(this.store, page));
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
      const { workspaceSlug } = this.store.router;
      if (!workspaceSlug || !pageId) return undefined;

      // With cascade the whole subtree goes away, otherwise the children move up.
      const removedPageIds = cascade ? this.getDescendantPageIds(pageId) : [pageId];
      const childPageIds = cascade ? [] : this.getChildPageIds(pageId);

      await this.service.remove(workspaceSlug, pageId, { cascade });
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

  /** @description the page id and every descendant id, walking the local tree */
  getDescendantPageIds = (pageId: string): string[] => {
    const ids = [pageId];
    for (const childId of this.getChildPageIds(pageId)) {
      ids.push(...this.getDescendantPageIds(childId));
    }
    return ids;
  };

  movePageInTree = async (pageId: string, newParentId: string | null, index?: number) => {
    const { workspaceSlug } = this.store.router;
    const page = this.getPageById(pageId);
    if (!workspaceSlug || !page) return;
    // a page cannot become a child of itself or of one of its own descendants
    if (newParentId && this.getDescendantPageIds(pageId).includes(newParentId)) return;

    const previousParent = page.parent ?? null;
    const previousSortOrder = page.sort_order;
    const sortOrder = this.getSortOrderForIndex(pageId, newParentId, index);
    // a sub page always lives in the collection of its parent
    const newCollection = newParentId ? this.getPageById(newParentId)?.collection : page.collection;

    runInAction(() => {
      page.mutateProperties({ parent: newParentId, sort_order: sortOrder }, false);
    });

    try {
      const updatedPage = await this.service.moveInTree(workspaceSlug, pageId, {
        parent: newParentId,
        sort_order: sortOrder,
        collection: newCollection ?? undefined,
      });
      runInAction(() => {
        page.mutateProperties(updatedPage, false);
        this.applyCollectionToSubtree(pageId, updatedPage.collection ?? null);
      });
    } catch (error) {
      runInAction(() => {
        page.mutateProperties({ parent: previousParent, sort_order: previousSortOrder }, false);
      });
      console.error("Unable to move page in the tree", error);
      throw error;
    }
  };

  /** @description drop a page (with its subtree) into another collection */
  movePageToCollection = async (pageId: string, collectionId: string) => {
    const { workspaceSlug } = this.store.router;
    const page = this.getPageById(pageId);
    if (!workspaceSlug || !page || page.collection === collectionId) return;

    const previousCollection = page.collection ?? null;
    const previousParent = page.parent ?? null;
    runInAction(() => {
      // a page moved into a collection becomes a root of that collection
      page.mutateProperties({ collection: collectionId, parent: null }, false);
      this.applyCollectionToSubtree(pageId, collectionId);
    });

    try {
      const updatedPage = await this.service.moveInTree(workspaceSlug, pageId, {
        parent: null,
        collection: collectionId,
      });
      runInAction(() => {
        page.mutateProperties(updatedPage, false);
      });
    } catch (error) {
      runInAction(() => {
        page.mutateProperties({ collection: previousCollection, parent: previousParent }, false);
        this.applyCollectionToSubtree(pageId, previousCollection);
      });
      console.error("Unable to move page to the collection", error);
      throw error;
    }
  };

  /** @description the children follow their parent into a collection */
  private applyCollectionToSubtree = (pageId: string, collectionId: string | null) => {
    for (const descendantId of this.getDescendantPageIds(pageId)) {
      if (descendantId === pageId) continue;
      this.getPageById(descendantId)?.mutateProperties({ collection: collectionId }, false);
    }
  };

  private getSortOrderForIndex = (pageId: string, parentId: string | null, index?: number) => {
    const siblingIds = (parentId ? this.getChildPageIds(parentId) : this.getRootSiblingIds(pageId)).filter(
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

  /** @description root level pages of the collection the page belongs to */
  private getRootSiblingIds = (pageId: string) => {
    const collectionId = this.getPageById(pageId)?.collection;
    const rootPages = Object.values(this.data || {}).filter(
      (page) => !page.parent && page.collection === collectionId
    );
    return orderBy(rootPages, (page) => page.sort_order ?? 0, "asc").map((page) => page.id) as string[];
  };

  // ------------------------------------------------------------- collections

  fetchCollections = async (workspaceSlug: string) => {
    try {
      if (!workspaceSlug) return undefined;
      const collections = await this.service.fetchCollections(workspaceSlug);
      runInAction(() => {
        for (const collection of collections) {
          set(this.collections, [collection.id], collection);
        }
      });
      return collections;
    } catch (error) {
      console.error("Unable to fetch the collections", error);
      throw error;
    }
  };

  createCollection = async (data: Partial<TPageCollection>) => {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug) return undefined;
    const collection = await this.service.createCollection(workspaceSlug, data);
    runInAction(() => {
      set(this.collections, [collection.id], collection);
    });
    return collection;
  };

  updateCollection = async (collectionId: string, data: Partial<TPageCollection>) => {
    const { workspaceSlug } = this.store.router;
    const collection = this.getCollectionById(collectionId);
    if (!workspaceSlug || !collection) return;

    const previousCollection = { ...collection };
    runInAction(() => {
      set(this.collections, [collectionId], { ...collection, ...data });
    });
    try {
      const updatedCollection = await this.service.updateCollection(workspaceSlug, collectionId, data);
      runInAction(() => {
        set(this.collections, [collectionId], updatedCollection);
      });
    } catch (error) {
      runInAction(() => {
        set(this.collections, [collectionId], previousCollection);
      });
      throw error;
    }
  };

  removeCollection = async (collectionId: string) => {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug) return;
    await this.service.removeCollection(workspaceSlug, collectionId);
    const fallbackCollectionId = this.defaultCollectionId;
    runInAction(() => {
      unset(this.collections, [collectionId]);
      // the server moved the pages to the default collection; mirror it locally
      for (const page of Object.values(this.data)) {
        if (page.collection === collectionId) {
          page.mutateProperties({ collection: fallbackCollectionId ?? null }, false);
        }
      }
    });
  };
}
