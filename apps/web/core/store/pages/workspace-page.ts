/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
// constants
import { EPageAccess, EUserPermissions } from "@plane/constants";
import type { TPage } from "@plane/types";
// store
import type { RootStore } from "@/store/root.store";
// services
import { WorkspacePageService } from "@/services/page";
// local imports
import { BasePage } from "./base-page";
import type { TPageInstance } from "./base-page";

const workspacePageService = new WorkspacePageService();

export type TWorkspacePage = TPageInstance;

export class WorkspacePage extends BasePage implements TWorkspacePage {
  constructor(store: RootStore, page: TPage) {
    // required fields for API calls
    const { workspaceSlug } = store.router;
    // initialize base instance
    super(store, page, {
      update: async (payload) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await workspacePageService.update(workspaceSlug, page.id, payload);
      },
      updateDescription: async (document) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.updateDescription(workspaceSlug, page.id, document);
      },
      updateAccess: async (payload) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.updateAccess(workspaceSlug, page.id, payload);
      },
      lock: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.lock(workspaceSlug, page.id);
      },
      unlock: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.unlock(workspaceSlug, page.id);
      },
      archive: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await workspacePageService.archive(workspaceSlug, page.id);
      },
      restore: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await workspacePageService.restore(workspaceSlug, page.id);
      },
      duplicate: async (options?: { includeChildren?: boolean }) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await workspacePageService.duplicate(workspaceSlug, page.id, options);
      },
    });
    makeObservable(this, {
      // computed
      canCurrentUserAccessPage: computed,
      canCurrentUserEditPage: computed,
      canCurrentUserDuplicatePage: computed,
      canCurrentUserLockPage: computed,
      canCurrentUserChangeAccess: computed,
      canCurrentUserArchivePage: computed,
      canCurrentUserDeletePage: computed,
      canCurrentUserFavoritePage: computed,
      canCurrentUserMovePage: computed,
      isContentEditable: computed,
    });
  }

  /** The workspace role decides everything for a wiki page; there is no project. */
  private getWorkspaceRole = computedFn((): number | undefined => {
    const { workspaceSlug } = this.rootStore.router;
    if (!workspaceSlug) return undefined;
    return this.rootStore.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug.toString());
  });

  get canCurrentUserAccessPage() {
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return isPagePublic || this.isCurrentUserOwner || this.getWorkspaceRole() === EUserPermissions.ADMIN;
  }

  get canCurrentUserEditPage() {
    const role = this.getWorkspaceRole();
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return (
      (isPagePublic && !!role && role >= EUserPermissions.MEMBER) || (!isPagePublic && this.isCurrentUserOwner)
    );
  }

  get canCurrentUserDuplicatePage() {
    const role = this.getWorkspaceRole();
    return !!role && role >= EUserPermissions.MEMBER;
  }

  get canCurrentUserLockPage() {
    return this.isCurrentUserOwner || this.getWorkspaceRole() === EUserPermissions.ADMIN;
  }

  get canCurrentUserChangeAccess() {
    return this.isCurrentUserOwner;
  }

  get canCurrentUserArchivePage() {
    return this.isCurrentUserOwner || this.getWorkspaceRole() === EUserPermissions.ADMIN;
  }

  get canCurrentUserDeletePage() {
    return this.isCurrentUserOwner || this.getWorkspaceRole() === EUserPermissions.ADMIN;
  }

  get canCurrentUserFavoritePage() {
    const role = this.getWorkspaceRole();
    return !!role && role >= EUserPermissions.GUEST;
  }

  /** Wiki pages do not move between projects. */
  /** Owners and workspace admins may move a wiki page into a project. */
  get canCurrentUserMovePage() {
    const role = this.getWorkspaceRole();
    return this.isCurrentUserOwner || role === EUserPermissions.ADMIN;
  }

  get isContentEditable() {
    const role = this.getWorkspaceRole();
    const isOwner = this.isCurrentUserOwner;
    const isPublic = this.access === EPageAccess.PUBLIC;

    return (
      !this.archived_at &&
      !this.is_locked &&
      (isOwner || (isPublic && !!role && role >= EUserPermissions.MEMBER))
    );
  }

  getRedirectionLink = computedFn(() => {
    const { workspaceSlug } = this.rootStore.router;
    return `/${workspaceSlug}/wiki/${this.id}`;
  });
}
