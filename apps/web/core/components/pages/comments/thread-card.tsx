/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Check, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Avatar } from "@makeplane/propel/components/avatar";
import type { TPageComment } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// local imports
import { PageCommentComposer } from "./composer";
import { PageCommentReactions } from "./reactions";
import type { TPageCommentThread } from "@/store/pages/page-comments.store";

export type TPageCommentActions = {
  createReply: (parentId: string, commentHTML: string, commentJSON: object) => Promise<void>;
  updateComment: (commentId: string, commentHTML: string, commentJSON: object) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
  toggleResolved: (comment: TPageComment) => Promise<void>;
  toggleReaction: (commentId: string, reaction: string) => Promise<void>;
};

type Props = {
  actions: TPageCommentActions;
  currentUserId: string;
  isActive: boolean;
  isAnchored: boolean;
  onSelect: () => void;
  projectId?: string;
  thread: TPageCommentThread;
  workspaceSlug: string;
};

type CommentBodyProps = {
  comment: TPageComment;
  currentUserId: string;
  actions: TPageCommentActions;
  workspaceSlug: string;
  projectId?: string;
};

const PageCommentBody = observer(function PageCommentBody(props: CommentBodyProps) {
  const { comment, currentUserId, actions, workspaceSlug, projectId } = props;
  // states
  const [isEditing, setIsEditing] = useState(false);
  // translation
  const { t } = useTranslation();
  // derived values
  const isAuthor = comment.actor === currentUserId;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Avatar
          src={getFileURL(comment.actor_detail?.avatar_url ?? "")}
          alt={comment.actor_detail?.display_name}
          fallback={comment.actor_detail?.display_name?.[0]?.toUpperCase()}
          size="xs"
        />
        <span className="text-xs truncate font-medium text-primary">{comment.actor_detail?.display_name}</span>
        <span className="text-xs text-tertiary">{calculateTimeAgo(comment.created_at)}</span>
        {comment.edited_at && <span className="text-xs text-tertiary">({t("page_comments.edited")})</span>}
        {isAuthor && (
          <CustomMenu
            customButton={<MoreHorizontal className="size-3.5 text-tertiary" />}
            placement="bottom-end"
            closeOnSelect
          >
            <CustomMenu.MenuItem onClick={() => setIsEditing(true)}>
              <span className="flex items-center gap-2">
                <Pencil className="size-3" />
                {t("page_comments.edit")}
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => void actions.removeComment(comment.id)}>
              <span className="flex items-center gap-2">
                <Trash2 className="size-3" />
                {t("page_comments.delete")}
              </span>
            </CustomMenu.MenuItem>
          </CustomMenu>
        )}
      </div>
      {isEditing ? (
        <PageCommentComposer
          id={`edit_page_comment_${comment.id}`}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          initialValue={comment.comment_html}
          submitLabel={t("page_comments.save")}
          autofocus
          onCancel={() => setIsEditing(false)}
          onSubmit={async (commentHTML, commentJSON) => {
            await actions.updateComment(comment.id, commentHTML, commentJSON);
            setIsEditing(false);
          }}
        />
      ) : (
        <LiteTextEditor
          editable={false}
          id={`page_comment_${comment.id}`}
          workspaceId={comment.workspace}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          initialValue={comment.comment_html}
          containerClassName="min-h-min !p-0"
          parentClassName="!border-0 !p-0"
          displayConfig={{ fontSize: "small-font" }}
        />
      )}
      <PageCommentReactions
        comment={comment}
        currentUserId={currentUserId}
        onToggle={(reaction) => void actions.toggleReaction(comment.id, reaction)}
      />
    </div>
  );
});

export const PageCommentThreadCard = observer(function PageCommentThreadCard(props: Props) {
  const { actions, currentUserId, isActive, isAnchored, onSelect, projectId, thread, workspaceSlug } = props;
  // states
  const [isReplying, setIsReplying] = useState(false);
  // translation
  const { t } = useTranslation();
  // derived values
  const { root, replies } = thread;
  const quotedText = root.anchor?.quoted_text;

  return (
    // oxlint-disable-next-line jsx_a11y/click-events-have-key-events
    <div
      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className={cn("cursor-pointer space-y-2 rounded-md border border-subtle bg-surface-1 p-3 transition-colors", {
        "border-accent-primary": isActive,
      })}
    >
      <div className="flex items-start justify-between gap-2">
        {quotedText ? (
          <span className="text-xs line-clamp-2 border-l-2 border-subtle pl-2 text-tertiary italic">{quotedText}</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="shrink-0 text-tertiary transition-colors hover:text-primary"
          aria-label={root.is_resolved ? t("page_comments.unresolve") : t("page_comments.resolve")}
          onClick={(e) => {
            e.stopPropagation();
            void actions.toggleResolved(root);
          }}
        >
          {root.is_resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {root.is_resolved && (
          <span className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-[10px] text-tertiary">
            {t("page_comments.resolved")}
          </span>
        )}
        {!isAnchored && (
          <span className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-[10px] text-tertiary">
            {t("page_comments.unanchored")}
          </span>
        )}
      </div>

      <PageCommentBody
        comment={root}
        currentUserId={currentUserId}
        actions={actions}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />

      {replies.length > 0 && (
        <div className="space-y-2 border-l border-subtle pl-3">
          {replies.map((reply) => (
            <PageCommentBody
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              actions={actions}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events */}
      <div onClick={(e) => e.stopPropagation()} role="presentation">
        {isReplying ? (
          <PageCommentComposer
            id={`reply_page_comment_${root.id}`}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            placeholder={t("page_comments.reply_placeholder")}
            submitLabel={t("page_comments.reply")}
            autofocus
            onCancel={() => setIsReplying(false)}
            onSubmit={async (commentHTML, commentJSON) => {
              await actions.createReply(root.id, commentHTML, commentJSON);
              setIsReplying(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="text-xs text-tertiary transition-colors hover:text-primary"
            onClick={() => setIsReplying(true)}
          >
            {t("page_comments.reply")}
          </button>
        )}
      </div>
    </div>
  );
});
