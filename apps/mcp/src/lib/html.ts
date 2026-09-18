/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  "#x27": "'",
  amp: "&",
};

/** Real markup: a tag, closing tag or comment opener. "a < b" is not markup. */
const HAS_MARKUP = /<[a-z!/]/i;

/** An escaped tag such as "&lt;p&gt;" or "&lt;/strong&gt;". */
const HAS_ESCAPED_TAG = /&lt;\/?[a-z][^&]*&gt;/i;

/**
 * Undo entity-encoding on an HTML body sent without any real markup.
 *
 * Models sometimes escape the HTML they send ("&lt;p&gt;Hi&lt;/p&gt;"). Plane
 * accepts that without complaint and stores it as text, so the work item shows
 * literal tags. A body that contains real markup, or no escaped tags at all, is
 * returned unchanged.
 */
export function normalizeHtml(value: string): string {
  if (HAS_MARKUP.test(value) || !HAS_ESCAPED_TAG.test(value)) return value;
  // One pass, so "&amp;lt;" decodes to "&lt;" rather than on to "<".
  return value.replace(/&(lt|gt|quot|apos|#39|#x27|amp);/gi, (match, name: string) => {
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}
