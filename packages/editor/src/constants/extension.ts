/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum CORE_EXTENSIONS {
  BLOCKQUOTE = "blockquote",
  BOLD = "bold",
  BULLET_LIST = "bulletList",
  CALLOUT = "calloutComponent",
  CHARACTER_COUNT = "characterCount",
  COMMENT = "comment",
  CODE_BLOCK = "codeBlock",
  CODE_INLINE = "code",
  CUSTOM_COLOR = "customColor",
  CUSTOM_IMAGE = "imageComponent",
  CUSTOM_LINK = "link",
  DOCUMENT = "doc",
  DROP_CURSOR = "dropCursor",
  ENTER_KEY = "enterKey",
  GAP_CURSOR = "gapCursor",
  HARD_BREAK = "hardBreak",
  HEADING = "heading",
  HEADINGS_LIST = "headingsList",
  HISTORY = "history",
  HORIZONTAL_RULE = "horizontalRule",
  IMAGE = "image",
  ITALIC = "italic",
  LIST_ITEM = "listItem",
  MARKDOWN_CLIPBOARD = "markdownClipboard",
  MENTION = "mention",
  ORDERED_LIST = "orderedList",
  PARAGRAPH = "paragraph",
  PLACEHOLDER = "placeholder",
  SIDE_MENU = "editorSideMenu",
  SLASH_COMMANDS = "slash-command",
  STRIKETHROUGH = "strike",
  TABLE = "table",
  TABLE_CELL = "tableCell",
  TABLE_HEADER = "tableHeader",
  TABLE_ROW = "tableRow",
  TASK_ITEM = "taskItem",
  TASK_LIST = "taskList",
  TEXT_ALIGN = "textAlign",
  TEXT_STYLE = "textStyle",
  TYPOGRAPHY = "typography",
  UNDERLINE = "underline",
  UTILITY = "utility",
  WORK_ITEM_EMBED = "issue-embed-component",
  PAGE_EMBED = "page-embed-component",
  EMOJI = "emoji",
  UNIQUE_ID = "uniqueID",
  ATTACHMENT = "attachment-component",
  EXTERNAL_EMBED = "external-embed-component",
  DETAILS = "details",
  DETAILS_SUMMARY = "detailsSummary",
  DETAILS_CONTENT = "detailsContent",
  INLINE_DATE = "inlineDate",
  INLINE_STATUS = "inlineStatus",
}

export const BLOCK_NODE_TYPES = [
  // Basic block nodes
  CORE_EXTENSIONS.PARAGRAPH,
  CORE_EXTENSIONS.HEADING,
  CORE_EXTENSIONS.BLOCKQUOTE,
  CORE_EXTENSIONS.CODE_BLOCK,
  CORE_EXTENSIONS.HORIZONTAL_RULE,

  // List nodes
  CORE_EXTENSIONS.BULLET_LIST,
  CORE_EXTENSIONS.ORDERED_LIST,
  CORE_EXTENSIONS.LIST_ITEM,
  CORE_EXTENSIONS.TASK_LIST,
  CORE_EXTENSIONS.TASK_ITEM,

  // Table nodes
  CORE_EXTENSIONS.TABLE,

  // Media and embed nodes
  CORE_EXTENSIONS.IMAGE,
  CORE_EXTENSIONS.CUSTOM_IMAGE,
  CORE_EXTENSIONS.CALLOUT,
  CORE_EXTENSIONS.WORK_ITEM_EMBED,
  CORE_EXTENSIONS.PAGE_EMBED,
  CORE_EXTENSIONS.ATTACHMENT,
  CORE_EXTENSIONS.EXTERNAL_EMBED,
  CORE_EXTENSIONS.DETAILS,

  // Inline nodes that also carry a persisted data-id
  CORE_EXTENSIONS.INLINE_DATE,
  CORE_EXTENSIONS.INLINE_STATUS,
];
