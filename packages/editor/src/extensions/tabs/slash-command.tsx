/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";
import type { CommandProps, TEditorCommands } from "@/types";
// local imports
import { HorizontalTabsIcon, VerticalTabsIcon } from "./icons";
import type { TTabsOrientation } from "./types";

const TABS_OPTIONS: {
  commandKey: TEditorCommands;
  orientation: TTabsOrientation;
  title: string;
  icon: React.ReactNode;
  pushAfter: TEditorCommands;
}[] = [
  {
    commandKey: "tabs-horizontal",
    orientation: "horizontal",
    title: "Horizontal tabs",
    icon: <HorizontalTabsIcon className="size-3.5 stroke-2" />,
    pushAfter: "column-4",
  },
  {
    commandKey: "tabs-vertical",
    orientation: "vertical",
    title: "Vertical tabs",
    icon: <VerticalTabsIcon className="size-3.5 stroke-2" />,
    pushAfter: "tabs-horizontal",
  },
];

/** `/Horizontal tabs`, `/Vertical tabs` — gerçek Plane ile aynı etiketler. */
export const tabsSlashCommandOptions: TSlashCommandAdditionalOption[] = TABS_OPTIONS.map(
  ({ commandKey, icon, orientation, pushAfter, title }) => ({
    commandKey,
    key: commandKey,
    title,
    description: `Create ${orientation} tabs`,
    searchTerms: ["tab", "tabs", orientation, "layout"],
    icon,
    section: "general",
    pushAfter,
    command: ({ editor, range }: CommandProps) =>
      editor.chain().focus().deleteRange(range).insertTabs(orientation).run(),
  })
);
