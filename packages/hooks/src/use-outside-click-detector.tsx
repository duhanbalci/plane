/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { useEffect } from "react";

export const useOutsideClickDetector = (
  ref: React.RefObject<HTMLElement | null> | any,
  callback: () => void,
  useCapture = false
) => {
  const handleClick = (event: MouseEvent) => {
    // Walk the path captured at dispatch: a Combobox option selects on mousedown and may be
    // unmounted before this listener runs, leaving event.target detached from the tree.
    const path = event.composedPath();
    if (ref.current && !path.includes(ref.current)) {
      // check for the closest element with attribute name data-prevent-outside-click
      const preventOutsideClickElement = path.find(
        (node) => node instanceof HTMLElement && node.hasAttribute("data-prevent-outside-click")
      );
      // if the closest element with attribute name data-prevent-outside-click is found, return
      if (preventOutsideClickElement) {
        return;
      }
      // else call the callback
      callback();
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClick, useCapture);
    return () => {
      document.removeEventListener("mousedown", handleClick, useCapture);
    };
  });
};
