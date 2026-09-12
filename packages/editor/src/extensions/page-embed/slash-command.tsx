/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { FileText } from "lucide-react";
// types
import type { TSlashCommandAdditionalOption } from "@/extensions/slash-commands/root";
import type { CommandProps, TPageEmbedConfig } from "@/types";

/** `/page` creates a sub page of the current page and embeds it. */
export const pageEmbedSlashCommandOption = (config: TPageEmbedConfig): TSlashCommandAdditionalOption => ({
  commandKey: "page-embed",
  key: "page-embed",
  title: "Sub page",
  description: "Create a sub page",
  searchTerms: ["page", "sub", "subpage", "nested", "child"],
  icon: <FileText className="size-3.5" />,
  section: "general",
  pushAfter: "callout",
  command: async ({ editor, range }: CommandProps) => {
    // the text typed after the slash becomes the page title
    const typedText = editor.state.doc
      .textBetween(range.from, range.to, "\n", " ")
      .replace(/^\/\S*\s*/, "")
      .trim();
    editor.chain().focus().deleteRange(range).run();
    const page = await config.createPage(typedText.length > 0 ? typedText : "Untitled");
    if (!page?.id) return;
    editor.chain().focus().insertPageEmbed({ entity_identifier: page.id }).run();
  },
});
