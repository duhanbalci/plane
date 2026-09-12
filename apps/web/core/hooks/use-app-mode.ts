/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";

export type TAppMode = "work" | "wiki" | "settings";

export type TAppModeDetails = {
  /** active mode, derived from the pathname */
  mode: TAppMode;
  /** localized title, rendered in the sidebar panel header */
  title: string;
  /** landing route of the mode, used by the app rail */
  homeHref: string;
};

/**
 * Derives the active app mode (work / wiki / settings) from the current pathname.
 * Single source of truth for the app rail, the sidebar panel title and its body.
 */
export const useAppMode = (): TAppModeDetails => {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();

  const slug = workspaceSlug?.toString() ?? "";

  return useMemo(() => {
    const mode: TAppMode = new RegExp(`^/${slug}/wiki(/|$)`).test(pathname)
      ? "wiki"
      : new RegExp(`^/${slug}/settings(/|$)`).test(pathname)
        ? "settings"
        : "work";

    const details: Record<TAppMode, { title: string; homeHref: string }> = {
      work: { title: t("sidebar.work"), homeHref: `/${slug}/` },
      wiki: { title: t("sidebar.wiki"), homeHref: `/${slug}/wiki` },
      settings: { title: t("sidebar.settings"), homeHref: `/${slug}/settings` },
    };

    return { mode, ...details[mode] };
  }, [pathname, slug, t]);
};
