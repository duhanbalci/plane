/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
import { useEffect, useCallback } from "react";

const usePeekOverviewOutsideClickDetector = (
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void,
  issueId: string,
  excludePreventionElementIds?: string[]
) => {
  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      // Walk the path captured at dispatch: a Combobox option selects on mousedown and may be
      // unmounted before this listener runs, leaving event.target detached from the tree.
      const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (ref.current && !path.includes(ref.current)) {
        // check for the closest element with attribute name data-prevent-outside-click
        const preventOutsideClickElement = path.find((el) => el.hasAttribute("data-prevent-outside-click"));
        // if the closest element with attribute name data-prevent-outside-click is found
        if (preventOutsideClickElement) {
          // Check if this element's ID is in the exclusion list
          const elementId = preventOutsideClickElement.id;
          const shouldExcludePrevention =
            excludePreventionElementIds && elementId && excludePreventionElementIds.includes(elementId);

          if (!shouldExcludePrevention && !preventOutsideClickElement.contains(ref.current)) {
            // Only prevent the callback if the ref is NOT inside the same prevent-outside-click container.
            // This allows normal outside click detection for elements within the same container
            return;
          }
        }
        // check if the click target is the current issue element or its children
        if (path.some((el) => el.id === `issue-${issueId}`)) return;
        const delayOutsideClickElement = path.find((el) => el.hasAttribute("data-delay-outside-click"));
        if (delayOutsideClickElement) {
          // if the click target is the closest element with attribute name data-delay-outside-click, delay the callback
          setTimeout(() => {
            callback();
          }, 0);
          return;
        }
        // else, call the callback immediately
        callback();
      }
    },
    [ref, callback, issueId, excludePreventionElementIds]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [handleClick]);
};

export default usePeekOverviewOutsideClickDetector;
