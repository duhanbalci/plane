/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import type { TPageComment, TPageCommentFilter } from "@plane/types";
// services
import type { TPageCommentScope } from "@/services/page/page-comment.service";
import { PageCommentService } from "@/services/page/page-comment.service";

/** A thread: its root comment plus the replies hanging off it. */
export type TPageCommentThread = {
  root: TPageComment;
  replies: TPageComment[];
};

/** What the composer needs while a fresh thread has no server row yet. */
export type TPendingPageComment = {
  pageId: string;
  markId: string;
  quotedText: string;
  blockId?: string | null;
};

export interface IPageCommentsStore {
  commentsByPageId: Record<string, TPageComment[]>;
  activeThreadId: string | null;
  filter: TPageCommentFilter;
  pendingComment: TPendingPageComment | null;
  // helpers
  getCommentsByPageId: (pageId: string) => TPageComment[];
  getThreads: (pageId: string) => TPageCommentThread[];
  getCommentById: (pageId: string, commentId: string) => TPageComment | undefined;
  // actions
  setActiveThreadId: (threadId: string | null) => void;
  setFilter: (filter: TPageCommentFilter) => void;
  setPendingComment: (pending: TPendingPageComment | null) => void;
  fetchComments: (scope: TPageCommentScope) => Promise<TPageComment[]>;
  createComment: (scope: TPageCommentScope, data: Partial<TPageComment>) => Promise<TPageComment>;
  updateComment: (scope: TPageCommentScope, commentId: string, data: Partial<TPageComment>) => Promise<TPageComment>;
  removeComment: (scope: TPageCommentScope, commentId: string) => Promise<void>;
  resolveComment: (scope: TPageCommentScope, commentId: string) => Promise<TPageComment>;
  unresolveComment: (scope: TPageCommentScope, commentId: string) => Promise<TPageComment>;
  toggleReaction: (
    scope: TPageCommentScope,
    commentId: string,
    reaction: string,
    currentUserId: string
  ) => Promise<void>;
}

export class PageCommentsStore implements IPageCommentsStore {
  commentsByPageId: Record<string, TPageComment[]> = {};
  activeThreadId: string | null = null;
  filter: TPageCommentFilter = "active";
  pendingComment: TPendingPageComment | null = null;
  // service
  private service: PageCommentService;

  constructor() {
    makeObservable(this, {
      commentsByPageId: observable,
      activeThreadId: observable.ref,
      filter: observable.ref,
      pendingComment: observable,
      setActiveThreadId: action,
      setFilter: action,
      setPendingComment: action,
      fetchComments: action,
      createComment: action,
      updateComment: action,
      removeComment: action,
      resolveComment: action,
      unresolveComment: action,
      toggleReaction: action,
    });
    this.service = new PageCommentService();
  }

  getCommentsByPageId = (pageId: string): TPageComment[] => this.commentsByPageId[pageId] ?? [];

  getCommentById = (pageId: string, commentId: string): TPageComment | undefined =>
    this.getCommentsByPageId(pageId).find((comment) => comment.id === commentId);

  getThreads = (pageId: string): TPageCommentThread[] => {
    const comments = this.getCommentsByPageId(pageId);
    const roots = comments.filter((comment) => !comment.parent);
    return roots.map((root) => ({
      root,
      replies: comments.filter((comment) => comment.parent === root.id),
    }));
  };

  setActiveThreadId = (threadId: string | null) => {
    this.activeThreadId = threadId;
  };

  setFilter = (filter: TPageCommentFilter) => {
    this.filter = filter;
  };

  setPendingComment = (pending: TPendingPageComment | null) => {
    this.pendingComment = pending;
  };

  private replace = (pageId: string, comment: TPageComment) => {
    const comments = this.getCommentsByPageId(pageId);
    const index = comments.findIndex((item) => item.id === comment.id);
    if (index === -1) {
      this.commentsByPageId[pageId] = [...comments, comment];
    } else {
      this.commentsByPageId[pageId] = comments.map((item) => (item.id === comment.id ? comment : item));
    }
  };

  fetchComments = async (scope: TPageCommentScope): Promise<TPageComment[]> => {
    const comments = await this.service.fetchAll(scope);
    runInAction(() => {
      this.commentsByPageId[scope.pageId] = comments;
    });
    return comments;
  };

  createComment = async (scope: TPageCommentScope, data: Partial<TPageComment>): Promise<TPageComment> => {
    const comment = await this.service.create(scope, data);
    runInAction(() => {
      this.replace(scope.pageId, comment);
    });
    return comment;
  };

  updateComment = async (
    scope: TPageCommentScope,
    commentId: string,
    data: Partial<TPageComment>
  ): Promise<TPageComment> => {
    const comment = await this.service.update(scope, commentId, data);
    runInAction(() => {
      this.replace(scope.pageId, comment);
    });
    return comment;
  };

  removeComment = async (scope: TPageCommentScope, commentId: string): Promise<void> => {
    await this.service.remove(scope, commentId);
    runInAction(() => {
      // Replies of a removed thread root go with it on the server too.
      this.commentsByPageId[scope.pageId] = this.getCommentsByPageId(scope.pageId).filter(
        (comment) => comment.id !== commentId && comment.parent !== commentId
      );
      if (this.activeThreadId && this.getCommentById(scope.pageId, this.activeThreadId) === undefined) {
        this.activeThreadId = null;
      }
    });
  };

  resolveComment = async (scope: TPageCommentScope, commentId: string): Promise<TPageComment> => {
    const comment = await this.service.resolve(scope, commentId);
    runInAction(() => {
      this.replace(scope.pageId, comment);
    });
    return comment;
  };

  unresolveComment = async (scope: TPageCommentScope, commentId: string): Promise<TPageComment> => {
    const comment = await this.service.unresolve(scope, commentId);
    runInAction(() => {
      this.replace(scope.pageId, comment);
    });
    return comment;
  };

  toggleReaction = async (
    scope: TPageCommentScope,
    commentId: string,
    reaction: string,
    currentUserId: string
  ): Promise<void> => {
    const comment = this.getCommentById(scope.pageId, commentId);
    const existing = comment?.reactions?.find((item) => item.reaction === reaction && item.actor === currentUserId);
    if (existing) {
      await this.service.removeReaction(scope, commentId, reaction);
      runInAction(() => {
        if (!comment) return;
        this.replace(scope.pageId, {
          ...comment,
          reactions: comment.reactions.filter((item) => item.id !== existing.id),
        });
      });
      return;
    }
    const created = await this.service.addReaction(scope, commentId, reaction);
    runInAction(() => {
      if (!comment) return;
      this.replace(scope.pageId, { ...comment, reactions: [...(comment.reactions ?? []), created] });
    });
  };
}
