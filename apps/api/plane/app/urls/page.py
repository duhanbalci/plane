# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageVersionEndpoint,
    PageDuplicateEndpoint,
    PageCollectionViewSet,
    PageMoveToWikiEndpoint,
    WorkspacePageFavoriteViewSet,
)

# Wiki (workspace scoped) pages reuse the project page views with scope="workspace".
WORKSPACE_SCOPE = {"scope": "workspace"}

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}),
        name="project-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-pages",
    ),
    # favorite pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/favorite-pages/<uuid:page_id>/",
        PageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-pages",
    ),
    # move a page inside the tree
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/move/",
        PageViewSet.as_view({"post": "move"}),
        name="project-page-move",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="project-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="project-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="project-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="page-description",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(),
        name="page-duplicate",
    ),
    # move a project page into the workspace wiki
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/move-to-wiki/",
        PageMoveToWikiEndpoint.as_view(),
        name="project-page-move-to-wiki",
    ),
    # ---------------------------------------------------------------- wiki
    path(
        "workspaces/<str:slug>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}, **WORKSPACE_SCOPE),
        name="workspace-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}, **WORKSPACE_SCOPE),
        name="workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/",
        PageViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"},
            **WORKSPACE_SCOPE,
        ),
        name="workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/favorite-pages/<uuid:page_id>/",
        WorkspacePageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-workspace-pages",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/move/",
        PageViewSet.as_view({"post": "move"}, **WORKSPACE_SCOPE),
        name="workspace-page-move",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}, **WORKSPACE_SCOPE),
        name="workspace-page-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}, **WORKSPACE_SCOPE),
        name="workspace-pages-lock-unlock",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}, **WORKSPACE_SCOPE),
        name="workspace-pages-access",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}, **WORKSPACE_SCOPE),
        name="workspace-page-description",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(**WORKSPACE_SCOPE),
        name="workspace-page-versions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(**WORKSPACE_SCOPE),
        name="workspace-page-versions",
    ),
    path(
        "workspaces/<str:slug>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(**WORKSPACE_SCOPE),
        name="workspace-page-duplicate",
    ),
    # wiki collections
    path(
        "workspaces/<str:slug>/page-collections/",
        PageCollectionViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-page-collections",
    ),
    path(
        "workspaces/<str:slug>/page-collections/<uuid:pk>/",
        PageCollectionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="workspace-page-collections",
    ),
]
