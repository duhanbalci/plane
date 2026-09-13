/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CalendarOutline } from "@makeplane/propel/icons";
// types
import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";
import type { CommandProps } from "@/types";

/** `/date` bugunun tarihiyle satir ici tarih chip'i ekler. */
export const inlineDateSlashCommandOption: TSlashCommandAdditionalOption = {
  commandKey: "date",
  key: "date",
  title: "Date",
  description: "Insert a date",
  searchTerms: ["date", "calendar", "day", "today", "deadline"],
  icon: <CalendarOutline className="size-3.5" />,
  section: "general",
  pushAfter: "emoji",
  command: ({ editor, range }: CommandProps) => {
    editor.chain().focus().deleteRange(range).insertInlineDate().run();
  },
};
