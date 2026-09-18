/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { TiptapTransformer } from "@hocuspocus/transformer";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { TITLE_EDITOR_EXTENSIONS, extractTextFromHTML, generateTitleProsemirrorJson } from "@plane/editor";
import { syncTitleWithName } from "@/extensions/title-update/sync-title";

/** A page document whose title field reads `title`, as the editor would have saved it. */
function documentTitled(title: string): Y.Doc {
  const json = (generateTitleProsemirrorJson as (text: string) => JSONContent)(title);
  return TiptapTransformer.toYdoc(json, "title", TITLE_EDITOR_EXTENSIONS as AnyExtension[]);
}

const titleOf = (doc: Y.Doc) => extractTextFromHTML(doc.getXmlFragment("title").toJSON());

describe("syncTitleWithName", () => {
  it("replaces a stale title with the stored name", () => {
    const doc = documentTitled("Roadmap");

    expect(syncTitleWithName(doc, "Roadmap 2027")).toBe(true);
    expect(titleOf(doc)).toBe("Roadmap 2027");
  });

  it("leaves a matching title untouched, so loading a page does not create an edit", () => {
    const doc = documentTitled("Roadmap");
    let updates = 0;
    doc.on("update", () => updates++);

    expect(syncTitleWithName(doc, "Roadmap")).toBe(false);
    expect(updates).toBe(0);
  });

  it("fills in an empty title field (documents saved before titles lived in them)", () => {
    const doc = new Y.Doc();

    expect(syncTitleWithName(doc, "Runbook")).toBe(true);
    expect(titleOf(doc)).toBe("Runbook");
  });

  it("converges an editor still holding the old title onto the new one", () => {
    // The server's copy and a client's copy start from the same saved state.
    const server = documentTitled("Old title");
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));

    syncTitleWithName(server, "New title");
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server, Y.encodeStateVector(client)));

    // Not "Old titleNew title": the old text is deleted, not left alongside.
    expect(titleOf(client)).toBe("New title");
    expect(titleOf(server)).toBe("New title");
  });

  it("does not touch the body", () => {
    const doc = documentTitled("Old");
    const body = doc.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("body text")]);
    body.insert(0, [paragraph]);

    syncTitleWithName(doc, "New");

    expect(body.toJSON()).toContain("body text");
  });
});
