/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TPageComment, TPageCommentFilter } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { usePageComments } from "@/hooks/store/use-page-comments";
import { useUser } from "@/hooks/store/user";
import { EPageStoreType } from "@/hooks/store/use-page-store";
// services
import type { TPageCommentScope } from "@/services/page/page-comment.service";
// components
import type { INavigationPaneExtensionProps } from "../navigation-pane/types/extensions";
// local imports
import { PageCommentComposer } from "./composer";
import type { TPageCommentActions } from "./thread-card";
import { PageCommentThreadCard } from "./thread-card";

const FILTERS: TPageCommentFilter[] = ["active", "resolved", "all"];

export const PageCommentsPane = observer(function PageCommentsPane(props: INavigationPaneExtensionProps) {
  const { page, storeType } = props;
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString() ?? "";
  // store hooks
  const commentsStore = usePageComments();
  const { data: currentUser } = useUser();
  // translation
  const { t } = useTranslation();
  // derived values
  const pageId = page.id ?? "";
  const projectId = storeType === EPageStoreType.PROJECT ? page.project_ids?.[0] : undefined;
  const editorRef = page.editor.editorRef;
  const scope: TPageCommentScope = useMemo(
    () => ({ workspaceSlug, pageId, projectId }),
    [workspaceSlug, pageId, projectId]
  );

  const { mutate } = useSWR(
    workspaceSlug && pageId ? ["PAGE_COMMENTS", workspaceSlug, pageId] : null,
    workspaceSlug && pageId ? () => commentsStore.fetchComments(scope) : null,
    { revalidateOnFocus: false }
  );

  const threads = commentsStore.getThreads(pageId);
  const filter = commentsStore.filter;
  const activeThreadId = commentsStore.activeThreadId;
  const pendingComment = commentsStore.pendingComment;

  const visibleThreads = useMemo(
    () =>
      threads.filter((thread) => {
        if (filter === "active") return !thread.root.is_resolved;
        if (filter === "resolved") return thread.root.is_resolved;
        return true;
      }),
    [threads, filter]
  );

  // Highlight the thread the reader picked, and bring its text into view.
  useEffect(() => {
    if (!editorRef) return;
    const thread = threads.find((item) => item.root.id === activeThreadId);
    const markId = thread?.root.anchor?.mark_id ?? null;
    editorRef.setActiveCommentMark(markId);
    if (!markId) return;
    const position = editorRef.getCommentMarkPosition(markId);
    if (position !== undefined) editorRef.scrollToNodeViaDOMCoordinates({ pos: position });
  }, [activeThreadId, editorRef, threads]);

  const isAnchored = useCallback(
    (comment: TPageComment) => {
      const markId = comment.anchor?.mark_id;
      if (!markId) return false;
      if (!editorRef) return true;
      return editorRef.getCommentMarkPosition(markId) !== undefined;
    },
    [editorRef]
  );

  const notifyError = useCallback(
    (key: string) => {
      setToast({ type: TOAST_TYPE.ERROR, title: t("common.error.label"), message: t(key) });
    },
    [t]
  );

  const actions: TPageCommentActions = useMemo(
    () => ({
      createReply: async (parentId, commentHTML, commentJSON) => {
        try {
          await commentsStore.createComment(scope, {
            comment_html: commentHTML,
            comment_json: commentJSON,
            parent: parentId,
          });
        } catch {
          notifyError("page_comments.toasts.create_error");
        }
      },
      updateComment: async (commentId, commentHTML, commentJSON) => {
        try {
          await commentsStore.updateComment(scope, commentId, {
            comment_html: commentHTML,
            comment_json: commentJSON,
          });
        } catch {
          notifyError("page_comments.toasts.update_error");
        }
      },
      removeComment: async (commentId) => {
        try {
          await commentsStore.removeComment(scope, commentId);
        } catch {
          notifyError("page_comments.toasts.delete_error");
        }
      },
      toggleResolved: async (comment) => {
        try {
          if (comment.is_resolved) await commentsStore.unresolveComment(scope, comment.id);
          else await commentsStore.resolveComment(scope, comment.id);
        } catch {
          notifyError("page_comments.toasts.resolve_error");
        }
      },
      toggleReaction: async (commentId, reaction) => {
        if (!currentUser?.id) return;
        await commentsStore.toggleReaction(scope, commentId, reaction, currentUser.id);
      },
    }),
    [commentsStore, currentUser?.id, notifyError, scope]
  );

  const handleCancelPending = useCallback(() => {
    if (pendingComment) editorRef?.unsetCommentMark(pendingComment.markId);
    commentsStore.setPendingComment(null);
  }, [commentsStore, editorRef, pendingComment]);

  const handleCreateThread = useCallback(
    async (commentHTML: string, commentJSON: object) => {
      if (!pendingComment) return;
      try {
        const comment = await commentsStore.createComment(scope, {
          comment_html: commentHTML,
          comment_json: commentJSON,
          anchor: {
            mark_id: pendingComment.markId,
            block_id: pendingComment.blockId ?? null,
            quoted_text: pendingComment.quotedText,
          },
        });
        commentsStore.setPendingComment(null);
        commentsStore.setActiveThreadId(comment.id);
        await mutate();
      } catch {
        notifyError("page_comments.toasts.create_error");
      }
    },
    [commentsStore, mutate, notifyError, pendingComment, scope]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden px-3.5">
      <h3 className="text-sm mb-3 font-medium text-primary">{t("page_comments.title")}</h3>
      <div className="mb-3 flex items-center gap-1">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => commentsStore.setFilter(item)}
            className={cn("text-xs rounded-full px-2 py-0.5 text-tertiary transition-colors hover:bg-layer-1", {
              "bg-layer-1 text-primary": filter === item,
            })}
          >
            {t(`page_comments.filters.${item}`)}
          </button>
        ))}
      </div>

      <div className="vertical-scrollbar scrollbar-sm flex-1 space-y-2 overflow-y-auto pb-4">
        {pendingComment?.pageId === pageId && (
          <div className="border-accent-primary space-y-2 rounded-md border bg-surface-1 p-3">
            {pendingComment.quotedText && (
              <span className="text-xs line-clamp-2 border-l-2 border-subtle pl-2 text-tertiary italic">
                {pendingComment.quotedText}
              </span>
            )}
            <PageCommentComposer
              id={`new_page_comment_${pendingComment.markId}`}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              placeholder={t("page_comments.placeholder")}
              submitLabel={t("page_comments.submit")}
              autofocus
              onCancel={handleCancelPending}
              onSubmit={handleCreateThread}
            />
          </div>
        )}

        {visibleThreads.length === 0 && !pendingComment && (
          <p className="text-xs py-6 text-center text-tertiary">
            {filter === "resolved" ? t("page_comments.empty_resolved") : t("page_comments.empty")}
          </p>
        )}

        {visibleThreads.map((thread) => (
          <PageCommentThreadCard
            key={thread.root.id}
            thread={thread}
            actions={actions}
            currentUserId={currentUser?.id ?? ""}
            isActive={activeThreadId === thread.root.id}
            isAnchored={isAnchored(thread.root)}
            onSelect={() => commentsStore.setActiveThreadId(thread.root.id)}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
        ))}
      </div>
    </div>
  );
});
