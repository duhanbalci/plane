/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { mergeAttributes, Node } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.DETAILS]: {
      /** Imlecin bulundugu blogu bir toggle bloguna cevirir. */
      setDetails: () => ReturnType;
      /** Toggle blogunu bozup icerigini disari alir. */
      unsetDetails: () => ReturnType;
    };
  }
}

/**
 * Toggle blogunun sema tanimi. React icermez, boylece live server ve
 * PDF export ile ayni node kullanilir.
 */
export const DetailsExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.DETAILS,
  group: "block",
  content: `${CORE_EXTENSIONS.DETAILS_SUMMARY} ${CORE_EXTENSIONS.DETAILS_CONTENT}`,
  defining: true,

  parseHTML() {
    return [{ tag: "details" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { class: "editor-details-block" }), 0];
  },
});

/** Toggle basligi: tek satir inline icerik. */
export const DetailsSummaryExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.DETAILS_SUMMARY,
  content: "inline*",
  defining: true,
  selectable: false,
  isolating: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["summary", mergeAttributes(HTMLAttributes, { class: "editor-details-summary" }), 0];
  },
});

/** Toggle govdesi: blok icerik alir. */
export const DetailsContentExtensionConfig = Node.create({
  name: CORE_EXTENSIONS.DETAILS_CONTENT,
  content: "block+",
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: `div[data-type="${CORE_EXTENSIONS.DETAILS_CONTENT}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "editor-details-content",
        "data-type": CORE_EXTENSIONS.DETAILS_CONTENT,
      }),
      0,
    ];
  },
});
