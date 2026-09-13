/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Icon2ColumnsOutline, Icon4ColumnsOutline } from "@makeplane/propel/icons";
import { Columns3 } from "lucide-react";
// types
import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";
import type { CommandProps, TEditorCommands } from "@/types";
// local imports
import type { TColumnCount } from "./types";

const COLUMN_OPTIONS: {
  commandKey: TEditorCommands;
  count: TColumnCount;
  icon: React.ReactNode;
  pushAfter: TEditorCommands;
}[] = [
  {
    commandKey: "column-2",
    count: 2,
    icon: <Icon2ColumnsOutline className="size-3.5" />,
    pushAfter: "attachment",
  },
  {
    commandKey: "column-3",
    count: 3,
    icon: <Columns3 className="size-3.5" />,
    pushAfter: "column-2",
  },
  {
    commandKey: "column-4",
    count: 4,
    icon: <Icon4ColumnsOutline className="size-3.5" />,
    pushAfter: "column-3",
  },
];

/** `/2 Columns`, `/3 Columns`, `/4 Columns` — gerçek Plane ile aynı etiketler. */
export const columnSlashCommandOptions: TSlashCommandAdditionalOption[] = COLUMN_OPTIONS.map(
  ({ commandKey, count, icon, pushAfter }) => ({
    commandKey,
    key: commandKey,
    title: `${count} Columns`,
    description: `Create ${count} columns of block`,
    searchTerms: ["column", "columns", "layout", "grid", `${count}`],
    icon,
    section: "general",
    pushAfter,
    command: ({ editor, range }: CommandProps) => editor.chain().focus().deleteRange(range).insertColumns(count).run(),
  })
);
