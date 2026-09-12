/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PagesOutline } from "@makeplane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
import { getPageName } from "@plane/utils";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherIcon } from "@/components/common/switcher-label";
import { PageHeaderActions } from "@/components/pages/header/actions";
import { PageSyncingBadge } from "@/components/pages/header/syncing-badge";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";

const storeType = EPageStoreType.WORKSPACE;

/** Breadcrumb: Wiki / Collection / …ancestors / Page */
export const WikiHeader = observer(function WikiHeader() {
  // router
  const { workspaceSlug, pageId } = useParams();
  // store hooks
  const { getPageById, getCollectionById } = usePageStore(storeType);
  // index route has no pageId; usePage() would throw there
  const page = pageId ? getPageById(pageId.toString()) : undefined;
  const { t } = useTranslation();
  // derived values
  const collection = page?.collection ? getCollectionById(page.collection) : undefined;

  // the parent chain of the current page, closest ancestor last
  const ancestorPages: NonNullable<ReturnType<typeof getPageById>>[] = [];
  let ancestorId = page?.parent ?? null;
  const seenAncestorIds = new Set<string>();
  while (ancestorId && !seenAncestorIds.has(ancestorId)) {
    seenAncestorIds.add(ancestorId);
    const ancestor = getPageById(ancestorId);
    if (!ancestor) break;
    ancestorPages.unshift(ancestor);
    ancestorId = ancestor.parent ?? null;
  }

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t("sidebar.wiki")}
                href={`/${workspaceSlug}/wiki`}
                icon={<PagesOutline className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {collection && <Breadcrumbs.Item component={<BreadcrumbLink label={collection.name} />} />}
          {ancestorPages.map((ancestorPage) => (
            <Breadcrumbs.Item
              key={ancestorPage.id}
              component={
                <BreadcrumbLink
                  label={getPageName(ancestorPage.name)}
                  href={`/${workspaceSlug}/wiki/${ancestorPage.id}`}
                  icon={<SwitcherIcon logo_props={ancestorPage.logo_props} LabelIcon={PagesOutline} size={16} />}
                />
              }
            />
          ))}
          {page && (
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={getPageName(page.name)}
                  icon={<SwitcherIcon logo_props={page.logo_props} LabelIcon={PagesOutline} size={16} />}
                />
              }
            />
          )}
        </Breadcrumbs>
      </Header.LeftItem>
      {page && (
        <Header.RightItem>
          <PageSyncingBadge syncStatus={page.isSyncingWithServer} />
          <PageHeaderActions page={page} storeType={storeType} />
        </Header.RightItem>
      )}
    </Header>
  );
});
