/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "../users";

/** Where a thread sits in the document. */
export type TPageCommentAnchor = {
  mark_id?: string;
  block_id?: string | null;
  quoted_text?: string;
};

export type TPageCommentReaction = {
  id: string;
  comment: string;
  actor: string;
  actor_detail?: IUserLite;
  reaction: string;
  workspace: string;
  created_at: string;
};

export type TPageComment = {
  id: string;
  page: string;
  actor: string | null;
  actor_detail?: IUserLite;
  comment_html: string;
  comment_json: object;
  comment_stripped: string;
  attachments: string[];
  /** thread root for a reply, null for the root itself */
  parent: string | null;
  anchor: TPageCommentAnchor;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  edited_at: string | null;
  reactions: TPageCommentReaction[];
  workspace: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TPageCommentFilter = "active" | "resolved" | "all";
