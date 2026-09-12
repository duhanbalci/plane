/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { stringToEmoji } from "@plane/propel/emoji-icon-picker";
import { EmojiReactionGroup, EmojiReactionPicker } from "@plane/propel/emoji-reaction";
import type { EmojiReactionType } from "@plane/propel/emoji-reaction";
import type { TPageComment } from "@plane/types";

type Props = {
  comment: TPageComment;
  currentUserId: string;
  disabled?: boolean;
  onToggle: (reaction: string) => void;
};

export const PageCommentReactions = observer(function PageCommentReactions(props: Props) {
  const { comment, currentUserId, disabled = false, onToggle } = props;
  // states
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const reactions: EmojiReactionType[] = useMemo(() => {
    const grouped = new Map<string, TPageComment["reactions"]>();
    for (const reaction of comment.reactions ?? []) {
      grouped.set(reaction.reaction, [...(grouped.get(reaction.reaction) ?? []), reaction]);
    }
    return Array.from(grouped.entries()).map(([reaction, rows]) => ({
      emoji: stringToEmoji(reaction),
      count: rows.length,
      reacted: rows.some((row) => row.actor === currentUserId),
      users: rows.map((row) => row.actor_detail?.display_name ?? ""),
    }));
  }, [comment.reactions, currentUserId]);

  if (reactions.length === 0 && disabled) return null;

  return (
    <div className="relative">
      <EmojiReactionPicker
        isOpen={isPickerOpen}
        handleToggle={setIsPickerOpen}
        onChange={(emoji) => onToggle(emoji)}
        disabled={disabled}
        placement="bottom-start"
        label={
          <EmojiReactionGroup
            reactions={reactions}
            onReactionClick={(emoji) => {
              if (disabled) return;
              // The group hands back the rendered emoji; the API stores code points.
              const reaction = Array.from(emoji)
                .map((char) => char.codePointAt(0))
                .join("-");
              onToggle(reaction);
            }}
            showAddButton={!disabled}
            onAddReaction={() => setIsPickerOpen(true)}
          />
        }
      />
    </div>
  );
});
