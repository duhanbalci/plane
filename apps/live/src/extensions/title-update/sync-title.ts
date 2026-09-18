/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { TiptapTransformer } from "@hocuspocus/transformer";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import * as Y from "yjs";
import { TITLE_EDITOR_EXTENSIONS, extractTextFromHTML, generateTitleProsemirrorJson } from "@plane/editor";

/**
 * Make the document's title field read `name`, the page's stored name.
 *
 * Title edits in the editor reach the database before a document unloads
 * (TitleSyncExtension.beforeUnloadDocument), so at load time the stored name
 * is the latest. It differs from the title field only when the page was
 * renamed some other way, such as the API; the field then holds the old
 * title, and the title observer would write it straight back over the rename.
 *
 * Returns whether the title field was changed.
 */
export function syncTitleWithName(document: Y.Doc, name: string): boolean {
  const title = document.getXmlFragment("title");
  if (extractTextFromHTML(title.toJSON()) === name.trim()) return false;

  const titleJson = (generateTitleProsemirrorJson as (text: string) => JSONContent)(name);
  const replacement = TiptapTransformer.toYdoc(titleJson, "title", TITLE_EDITOR_EXTENSIONS as AnyExtension[]);

  document.transact(() => {
    if (title.length > 0) title.delete(0, title.length);
  });
  // The replacement's items come from another client, so they land in the now-empty field.
  Y.applyUpdate(document, Y.encodeStateAsUpdate(replacement));
  return true;
}
