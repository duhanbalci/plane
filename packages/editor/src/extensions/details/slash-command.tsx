/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ToggleListOutline } from "@makeplane/propel/icons";
// types
import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";
import type { CommandProps } from "@/types";

/** `/toggle` katlanabilir blok ekler. */
export const detailsSlashCommandOption: TSlashCommandAdditionalOption = {
  commandKey: "toggle",
  key: "toggle",
  title: "Toggle",
  description: "Insert a collapsible block",
  searchTerms: ["toggle", "details", "collapse", "expand", "accordion", "dropdown"],
  icon: <ToggleListOutline className="size-3.5" />,
  section: "general",
  pushAfter: "callout",
  command: ({ editor, range }: CommandProps) => {
    editor.chain().focus().deleteRange(range).setDetails().run();
  },
};
