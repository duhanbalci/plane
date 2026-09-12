/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PagesOutline } from "@makeplane/propel/icons";
import type { TPageEntityData } from "@plane/types";
import { calculateTimeAgo, getPageName } from "@plane/utils";
// assets
import darkWikiAsset from "@/app/assets/empty-state/wiki/all-dark.webp?url";
import lightWikiAsset from "@/app/assets/empty-state/wiki/all-light.webp?url";
// components
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();
const storeType = EPageStoreType.WORKSPACE;

type TRecentEntry = {
  id: string;
  name: string;
  visitedAt: string | undefined;
};

type Props = {
  workspaceSlug: string;
};

/** Wiki index view: the wiki pages the user opened most recently. */
export const WikiRecentPages = observer(function WikiRecentPages(props: Props) {
  const { workspaceSlug } = props;
  // theme hook
  const { resolvedTheme } = useTheme();
  // store hooks
  const { getPageById, getFilteredPageIdsByTab } = usePageStore(storeType);
  const { t } = useTranslation();
  // recent visits, pages only; wiki pages are the ones the store knows about
  const { data: recents } = useSWR(
    workspaceSlug ? `WIKI_RECENT_VISITS_${workspaceSlug}` : null,
    workspaceSlug ? () => workspaceService.fetchWorkspaceRecents(workspaceSlug, "page") : null,
    { revalidateOnFocus: false }
  );
  // derived values
  const recentEntries: TRecentEntry[] = (recents ?? [])
    .map<TRecentEntry | undefined>((activity) => {
      const entity = activity.entity_data as TPageEntityData | undefined;
      const page = entity?.id ? getPageById(entity.id) : undefined;
      if (!page?.id || page.archived_at) return undefined;
      return { id: page.id, name: page.name ?? "", visitedAt: activity.visited_at };
    })
    .filter((entry): entry is TRecentEntry => !!entry);
  // fall back to the most recently updated pages when there is no visit history
  const fallbackEntries: TRecentEntry[] = (getFilteredPageIdsByTab("public") ?? [])
    .slice(0, 12)
    .map<TRecentEntry | undefined>((pageId) => {
      const page = getPageById(pageId);
      return page ? { id: pageId, name: page.name ?? "", visitedAt: page.updated_at?.toString() } : undefined;
    })
    .filter((entry): entry is TRecentEntry => !!entry);
  const entries = recentEntries.length > 0 ? recentEntries : fallbackEntries;

  if (entries.length === 0)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DetailedEmptyState
          title={t("wiki.empty_state.title")}
          description={t("wiki.empty_state.description")}
          assetPath={resolvedTheme === "light" ? lightWikiAsset : darkWikiAsset}
        />
      </div>
    );

  return (
    <div className="vertical-scrollbar scrollbar-sm h-full w-full overflow-y-auto p-8">
      <h3 className="mb-4 text-14 font-semibold text-tertiary">{t("wiki.recents.title")}</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const page = getPageById(entry.id);
          return (
            <Link
              key={entry.id}
              href={`/${workspaceSlug}/wiki/${entry.id}`}
              className="flex items-center gap-3 rounded-md border border-subtle bg-surface-1 p-3 hover:bg-layer-1"
            >
              <div className="grid size-8 flex-shrink-0 place-items-center rounded-sm bg-layer-2">
                {page?.logo_props?.in_use ? (
                  <Logo logo={page.logo_props} size={16} type="lucide" />
                ) : (
                  <PagesOutline className="size-4 text-tertiary" />
                )}
              </div>
              <div className="min-w-0 flex-grow">
                <p className="truncate text-13 font-medium text-primary">{getPageName(entry.name)}</p>
                {entry.visitedAt && <p className="text-11 text-placeholder">{calculateTimeAgo(entry.visitedAt)}</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
});
