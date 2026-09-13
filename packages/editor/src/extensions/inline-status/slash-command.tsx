/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LabelsOutline } from "@makeplane/propel/icons";
// types
import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";
import type { CommandProps } from "@/types";

/** `/status` renkli durum chip'i ekler. */
export const inlineStatusSlashCommandOption: TSlashCommandAdditionalOption = {
  commandKey: "status",
  key: "status",
  title: "Status",
  description: "Insert a status label",
  searchTerms: ["status", "label", "tag", "badge", "state"],
  icon: <LabelsOutline className="size-3.5" />,
  section: "general",
  pushAfter: "date",
  command: ({ editor, range }: CommandProps) => {
    editor.chain().focus().deleteRange(range).insertInlineStatus().run();
  },
};
