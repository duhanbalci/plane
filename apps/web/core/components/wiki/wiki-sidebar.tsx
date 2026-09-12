/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { HomeOutline, PagesOutline } from "@makeplane/propel/icons";
import { cn, getPageName } from "@plane/utils";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { CollectionFormModal } from "./collection-form-modal";
import { WikiCollectionItem } from "./collection-item";
import { WikiPageTreeItem } from "./page-tree-item";

const storeType = EPageStoreType.WORKSPACE;

type TSectionProps = {
  title: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
};

function WikiSidebarSection(props: TSectionProps) {
  const { title, defaultOpen = true, action, children } = props;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      <div className="group flex items-center justify-between rounded-md px-2 py-1 text-placeholder hover:bg-layer-transparent-hover">
        <button
          type="button"
          className="flex flex-grow items-center gap-1 text-left text-13 font-semibold whitespace-nowrap"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {title}
        </button>
        {action}
      </div>
      {isOpen && <div className="flex flex-col">{children}</div>}
    </div>
  );
}

/** Sidebar body of the wiki mode: static nav, collections, private and archived pages. */
export const WikiSidebar = observer(function WikiSidebar() {
  // router
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const router = useAppRouter();
  // states
  const [isCreateCollectionModalOpen, setIsCreateCollectionModalOpen] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  // store hooks
  const {
    collectionIds,
    defaultCollectionId,
    filters,
    updateFilters,
    canCurrentUserCreatePage,
    createPage,
    getRootPageIds,
    getFilteredPageIdsByTab,
    getPageById,
  } = usePageStore(storeType);
  const { data: currentUser } = useUser();
  const { t } = useTranslation();
  // derived values
  const slug = workspaceSlug?.toString() ?? "";
  const wikiHomeHref = `/${slug}/wiki`;
  const privatePageIds = (getRootPageIds("private") ?? []).filter(
    (pageId) => getPageById(pageId)?.owned_by === currentUser?.id
  );
  const archivedPageIds = getFilteredPageIdsByTab("archived") ?? [];

  const handleCreatePage = async () => {
    if (isCreatingPage) return;
    setIsCreatingPage(true);
    try {
      const page = await createPage({ collection: defaultCollectionId });
      if (page?.id) router.push(`/${slug}/wiki/${page.id}`);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("wiki_collections.toasts.create_page_error"),
      });
    }
    setIsCreatingPage(false);
  };

  return (
    <>
      <CollectionFormModal isOpen={isCreateCollectionModalOpen} onClose={() => setIsCreateCollectionModalOpen(false)} />
      <SidebarWrapper
        quickActions={
          <div className="flex flex-col gap-2">
            {canCurrentUserCreatePage && (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md bg-layer-1 px-2 py-1.5 text-13 font-medium text-secondary hover:bg-layer-2 hover:text-primary"
                onClick={handleCreatePage}
              >
                <Plus className="size-4" />
                {t("wiki.sidebar.new_page")}
              </button>
            )}
            <div className="flex items-center gap-1 rounded-md bg-layer-1 px-2 py-1">
              <Search className="size-3.5 flex-shrink-0 text-tertiary" />
              <input
                type="text"
                className="w-full border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
                placeholder={t("common.search.placeholder")}
                value={filters.searchQuery}
                onChange={(e) => updateFilters("searchQuery", e.target.value)}
              />
              {filters.searchQuery && (
                <button type="button" aria-label={t("common.clear")} onClick={() => updateFilters("searchQuery", "")}>
                  <X className="size-3 text-tertiary" />
                </button>
              )}
            </div>
          </div>
        }
      >
        {/* static navigation */}
        <div className="flex flex-col gap-0.5">
          <Link href={wikiHomeHref}>
            <SidebarNavItem isActive={pathname === wikiHomeHref}>
              <span className="flex items-center gap-1.5 text-13 font-medium">
                <HomeOutline className="size-4" />
                {t("sidebar.home")}
              </span>
            </SidebarNavItem>
          </Link>
        </div>
        {/* collections */}
        <WikiSidebarSection
          title={t("wiki.sidebar.collections")}
          action={
            canCurrentUserCreatePage && (
              <button
                type="button"
                className="grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-2 hover:text-primary"
                aria-label={t("wiki_collections.create_modal.submit")}
                onClick={() => setIsCreateCollectionModalOpen(true)}
              >
                <Plus className="size-3.5" />
              </button>
            )
          }
        >
          {collectionIds.map((collectionId) => (
            <WikiCollectionItem key={collectionId} collectionId={collectionId} pageType="public" workspaceSlug={slug} />
          ))}
        </WikiSidebarSection>
        {/* private pages */}
        <WikiSidebarSection title={t("wiki.tabs.private")}>
          {privatePageIds.length === 0 ? (
            <p className="px-3 py-1 text-12 text-tertiary">{t("wiki_collections.list.no_pages_title")}</p>
          ) : (
            privatePageIds.map((pageId) => (
              <WikiPageTreeItem key={pageId} pageId={pageId} siblingIds={privatePageIds} />
            ))
          )}
        </WikiSidebarSection>
        {/* archived pages */}
        <WikiSidebarSection title={t("wiki.tabs.archived")} defaultOpen={false}>
          {archivedPageIds.length === 0 ? (
            <p className="px-3 py-1 text-12 text-tertiary">{t("wiki_collections.list.no_pages_title")}</p>
          ) : (
            archivedPageIds.map((pageId) => {
              const page = getPageById(pageId);
              if (!page) return null;
              return (
                <Link
                  key={pageId}
                  href={`/${slug}/wiki/${pageId}`}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-secondary hover:bg-layer-transparent-hover"
                  )}
                >
                  {page.logo_props?.in_use ? (
                    <Logo logo={page.logo_props} size={14} type="lucide" />
                  ) : (
                    <PagesOutline className="size-4 flex-shrink-0 text-tertiary" />
                  )}
                  <span className="truncate text-13">{getPageName(page.name)}</span>
                </Link>
              );
            })
          )}
        </WikiSidebarSection>
      </SidebarWrapper>
    </>
  );
});
