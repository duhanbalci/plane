/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { AnyExtension } from "@tiptap/core";
import { SlashCommands } from "@/extensions";
// local imports
import { CommentMarkExtension } from "./comment-mark/extension";
import { DetailsContentExtension, DetailsExtension, DetailsSummaryExtension } from "./details/extension";
import { detailsSlashCommandOption } from "./details/slash-command";
import { InlineDateExtension } from "./inline-date/extension";
import { inlineDateSlashCommandOption } from "./inline-date/slash-command";
import { InlineStatusExtension } from "./inline-status/extension";
import { inlineStatusSlashCommandOption } from "./inline-status/slash-command";
import { PageEmbedExtension } from "./page-embed/extension";
import { pageEmbedSlashCommandOption } from "./page-embed/slash-command";
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
        // sira onemli: her secenek `pushAfter`'a gore siraya sokulur
        additionalOptions: [
          ...(pageEmbedConfig ? [pageEmbedSlashCommandOption(pageEmbedConfig)] : []),
          detailsSlashCommandOption,
          inlineDateSlashCommandOption,
          inlineStatusSlashCommandOption,
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
    // toggle (details/summary/content); schema-only twins live in core-without-props
    isEnabled: () => true,
    getExtension: () => DetailsExtension,
  },
  {
    isEnabled: () => true,
    getExtension: () => DetailsSummaryExtension,
  },
  {
    isEnabled: () => true,
    getExtension: () => DetailsContentExtension,
  },
  {
    // inline date chip
    isEnabled: () => true,
    getExtension: () => InlineDateExtension,
  },
  {
    // inline status chip
    isEnabled: () => true,
    getExtension: () => InlineStatusExtension,
  },
];

export function DocumentEditorAdditionalExtensions(props: TDocumentEditorAdditionalExtensionsProps) {
  const { disabledExtensions, flaggedExtensions } = props;

  const documentExtensions = extensionRegistry
    .filter((config) => config.isEnabled(disabledExtensions, flaggedExtensions))
    .map((config) => config.getExtension(props));

  return documentExtensions;
}
