/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { NodeViewRenderer } from "@tiptap/core";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";

const TOGGLE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.6818 7.39285C12.1061 7.63778 12.1061 8.25013 11.6818 8.49506L5.95455 11.8017C5.5303 12.0466 5 11.7405 5 11.2506L5 4.63731C5 4.14744 5.5303 3.84127 5.95455 4.08621L11.6818 7.39285Z" fill="currentColor"></path></svg>`;

/**
 * Toggle'in editor icindeki gorunumu. Acik/kapali durumu dokumanda tutulmaz,
 * yalnizca node view'de yasar (gercek Plane de boyle davraniyor).
 */
export const createDetailsNodeView =
  (shouldOpenInitially: () => boolean): NodeViewRenderer =>
  () => {
    let isOpen = shouldOpenInitially();

    const dom = document.createElement("div");
    dom.classList.add("editor-details-block");
    dom.setAttribute("data-type", CORE_EXTENSIONS.DETAILS);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-details-toggle";
    button.setAttribute("aria-label", "Toggle");
    button.innerHTML = TOGGLE_ICON;

    const contentDOM = document.createElement("div");
    contentDOM.className = "editor-details-body";

    const syncOpenState = () => {
      dom.classList.toggle("is-open", isOpen);
      button.setAttribute("aria-expanded", String(isOpen));
    };
    syncOpenState();

    // mousedown'u yutuyoruz ki editor secimi bozulmasin
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      isOpen = !isOpen;
      syncOpenState();
    });

    dom.append(button, contentDOM);

    return {
      dom,
      contentDOM,
      ignoreMutation: (mutation) => {
        if (mutation.type === "selection") return false;
        return !contentDOM.contains(mutation.target);
      },
    };
  };
