/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { AnyExtension } from "@tiptap/core";
import { SlashCommands } from "@/extensions";
// local imports
import { ColumnExtension, ColumnListExtension } from "./columns/extension";
import { columnSlashCommandOptions } from "./columns/slash-command";
import { CommentMarkExtension } from "./comment-mark/extension";
import { PageEmbedExtension } from "./page-embed/extension";
import { pageEmbedSlashCommandOption } from "./page-embed/slash-command";
import { TabExtension, TabsExtension } from "./tabs/extension";
import { tabsSlashCommandOptions } from "./tabs/slash-command";
// types
import type { IEditorProps, TExtensions, TUserDetails } from "@/types";

export type TDocumentEditorAdditionalExtensionsProps = Pick<
  IEditorProps,
  | "disabledExtensions"
  | "flaggedExtensions"
  | "fileHandler"
  | "extendedEditorProps"
  | "pageCommentConfig"
  | "pageEmbedConfig"
> & {
  isEditable: boolean;
  provider?: HocuspocusProvider;
  userDetails: TUserDetails;
};

export type TDocumentEditorAdditionalExtensionsRegistry = {
  isEnabled: (disabledExtensions: TExtensions[], flaggedExtensions: TExtensions[]) => boolean;
  getExtension: (props: TDocumentEditorAdditionalExtensionsProps) => AnyExtension;
};

const extensionRegistry: TDocumentEditorAdditionalExtensionsRegistry[] = [
  {
    isEnabled: (disabledExtensions) => !disabledExtensions.includes("slash-commands"),
    getExtension: ({ disabledExtensions, flaggedExtensions, pageEmbedConfig }) =>
      SlashCommands({
        disabledExtensions,
        flaggedExtensions,
        additionalOptions: [
          ...(pageEmbedConfig ? [pageEmbedSlashCommandOption(pageEmbedConfig)] : []),
          ...columnSlashCommandOptions,
          ...tabsSlashCommandOptions,
        ],
      }),
  },
  {
    // the sub page embed node; the schema-only twin lives in core-without-props
    isEnabled: () => true,
    getExtension: ({ pageEmbedConfig }) => PageEmbedExtension(pageEmbedConfig),
  },
  {
    // the inline comment mark; the schema-only twin lives in core-without-props
    isEnabled: () => true,
    getExtension: ({ pageCommentConfig }) => CommentMarkExtension(pageCommentConfig),
  },
  {
    // the multi column layout; the schema-only twins live in core-without-props
    isEnabled: () => true,
    getExtension: () => ColumnListExtension,
  },
  {
    isEnabled: () => true,
    getExtension: () => ColumnExtension,
  },
  {
    // the tabs layout; the schema-only twins live in core-without-props
    isEnabled: () => true,
    getExtension: () => TabsExtension,
  },
  {
    isEnabled: () => true,
    getExtension: () => TabExtension,
  },
];

export function DocumentEditorAdditionalExtensions(props: TDocumentEditorAdditionalExtensionsProps) {
  const { disabledExtensions, flaggedExtensions } = props;

  const documentExtensions = extensionRegistry
    .filter((config) => config.isEnabled(disabledExtensions, flaggedExtensions))
    .map((config) => config.getExtension(props));

  return documentExtensions;
}
