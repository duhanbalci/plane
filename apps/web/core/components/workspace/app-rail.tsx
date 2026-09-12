/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import {
  MultipleStickyOutline,
  PagesOutline,
  ProjectsOutline,
  SettingsOutline,
  TickOutline,
} from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { ContextMenu } from "@plane/propel/context-menu";
import { cn } from "@plane/utils";
// components
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
// hooks
import { useAppMode } from "@/hooks/use-app-mode";
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { useAppRailVisibility } from "@/lib/app-rail/context";

/**
 * App rail: the fixed mode switcher on the far left of the workspace shell.
 * Work / Wiki on top, Settings below a divider, Stickies pinned to the bottom.
 */
export const AppRail = observer(function AppRail() {
  // router
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  // hooks
  const { mode } = useAppMode();
  const { t } = useTranslation();
  const { preferences, updateDisplayMode } = useAppRailPreferences();
  const { isCollapsed, toggleAppRail } = useAppRailVisibility();
  // derived values
  const slug = workspaceSlug?.toString() ?? "";
  const showLabel = preferences.displayMode === "icon_with_label";
  const railWidth = showLabel ? "5rem" : "3.25rem";

  const modeItems = [
    {
      key: "work",
      label: t("sidebar.work"),
      icon: <ProjectsOutline className="size-5" />,
      href: `/${slug}/`,
      isActive: mode === "work",
    },
    {
      key: "wiki",
      label: t("sidebar.wiki"),
      icon: <PagesOutline className="size-5" />,
      href: `/${slug}/wiki`,
      isActive: mode === "wiki",
    },
  ];

  return (
    <div
      className="z-[26] hidden h-full flex-shrink-0 bg-canvas transition-all duration-300 ease-in-out md:block"
      style={{ width: railWidth }}
    >
      <ContextMenu>
        <ContextMenu.Trigger className="h-full">
          <div className="flex h-full flex-col justify-between gap-4 px-2 py-3">
            <div className={cn("flex flex-col", showLabel ? "gap-4" : "gap-3")}>
              {modeItems.map((item) => (
                <AppSidebarItem key={item.key} variant="link" item={{ ...item, showLabel }} />
              ))}
              <div className="mx-2 border-t border-strong" />
              <AppSidebarItem
                variant="link"
                item={{
                  label: t("sidebar.settings"),
                  icon: <SettingsOutline className="size-5" />,
                  href: `/${slug}/settings`,
                  isActive: mode === "settings",
                  showLabel,
                }}
              />
            </div>
            {/* Stickies stays pinned to the bottom of the rail */}
            <AppSidebarItem
              variant="link"
              item={{
                label: t("sidebar.stickies"),
                icon: <MultipleStickyOutline className="size-5" />,
                href: `/${slug}/stickies/`,
                isActive: pathname.includes(`/${slug}/stickies`),
                showLabel,
              }}
            />
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content positionerClassName="z-30" className="outline-none">
            <ContextMenu.Item onClick={() => updateDisplayMode("icon_only")}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-11">{t("sidebar.app_rail.icon_only")}</span>
                {preferences.displayMode === "icon_only" && <TickOutline className="size-3.5" />}
              </div>
            </ContextMenu.Item>
            <ContextMenu.Item onClick={() => updateDisplayMode("icon_with_label")}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-11">{t("sidebar.app_rail.icon_with_name")}</span>
                {preferences.displayMode === "icon_with_label" && <TickOutline className="size-3.5" />}
              </div>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onClick={toggleAppRail}>
              <span className="text-11">{isCollapsed ? t("sidebar.app_rail.dock") : t("sidebar.app_rail.undock")}</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
    </div>
  );
});
