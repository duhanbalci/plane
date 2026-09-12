# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    IssuePropertyOptionViewSet,
    IssuePropertyValueEndpoint,
    IssuePropertyViewSet,
    IssueTypeViewSet,
    ProjectIssueTypeEnableEndpoint,
    ProjectIssueTypeViewSet,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-issue-types",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="workspace-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        ProjectIssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/enable/",
        ProjectIssueTypeEnableEndpoint.as_view(),
        name="project-issue-types-enable",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/",
        ProjectIssueTypeViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/",
        IssuePropertyViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/<uuid:pk>/",
        IssuePropertyViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/<uuid:property_id>/options/",
        IssuePropertyOptionViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-property-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/<uuid:property_id>/options/<uuid:pk>/",
        IssuePropertyOptionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-property-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/",
        IssuePropertyValueEndpoint.as_view(),
        name="issue-property-values",
    ),
]
