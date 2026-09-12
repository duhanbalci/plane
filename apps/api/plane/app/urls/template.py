# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import ProjectTemplateViewSet, WorkspaceTemplateViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/templates/",
        WorkspaceTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-templates",
    ),
    path(
        "workspaces/<str:slug>/templates/<uuid:pk>/",
        WorkspaceTemplateViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="workspace-templates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/templates/",
        ProjectTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="project-templates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/templates/<uuid:pk>/",
        ProjectTemplateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-templates",
    ),
]
