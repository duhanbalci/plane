# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    WorkItemPropertyValueAPIEndpoint,
    WorkItemTypeListAPIEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/work-item-types/",
        WorkItemTypeListAPIEndpoint.as_view(http_method_names=["get"]),
        name="work-item-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/",
        WorkItemPropertyValueAPIEndpoint.as_view(http_method_names=["get", "patch"]),
        name="work-item-property-values",
    ),
]
