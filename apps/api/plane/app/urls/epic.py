# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    CommentReactionViewSet,
    EpicAnalyticsEndpoint,
    EpicDetailEndpoint,
    EpicIssueEndpoint,
    EpicIssuesEndpoint,
    EpicListEndpoint,
    EpicPaginatedViewSet,
    EpicViewSet,
    IssueActivityEndpoint,
    IssueAttachmentEndpoint,
    IssueAttachmentV2Endpoint,
    IssueCommentViewSet,
    IssueLinkViewSet,
    IssueReactionViewSet,
    IssueRelationViewSet,
    IssueSubscriberViewSet,
    WorkItemDescriptionVersionEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/list/",
        EpicListEndpoint.as_view(),
        name="project-epic",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/",
        EpicViewSet.as_view({"get": "list", "post": "create"}),
        name="project-epic",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics-detail/",
        EpicDetailEndpoint.as_view(),
        name="project-epic-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/v2/epics/",
        EpicPaginatedViewSet.as_view({"get": "list"}),
        name="project-epics-paginated",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:pk>/",
        EpicViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-epic",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/issues/",
        EpicIssuesEndpoint.as_view(),
        name="epic-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/issues/<uuid:issue_id>/",
        EpicIssueEndpoint.as_view(),
        name="epic-issue",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:epic_id>/analytics/",
        EpicAnalyticsEndpoint.as_view(),
        name="epic-analytics",
    ),
    # Epic ayrintilari issue ucları ile ayni gorunumleri kullanir.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/history/",
        IssueActivityEndpoint.as_view(),
        name="project-epic-history",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/comments/",
        IssueCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="project-epic-comment",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/comments/<uuid:pk>/",
        IssueCommentViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-epic-comment",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/reactions/",
        IssueReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="project-epic-reactions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/reactions/<str:reaction_code>/",
        IssueReactionViewSet.as_view({"delete": "destroy"}),
        name="project-epic-reactions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:comment_id>/comment-reactions/",
        CommentReactionViewSet.as_view({"get": "list", "post": "create"}),
        name="project-epic-comment-reactions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/links/",
        IssueLinkViewSet.as_view({"get": "list", "post": "create"}),
        name="project-epic-links",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/links/<uuid:pk>/",
        IssueLinkViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-epic-links",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/subscribe/",
        IssueSubscriberViewSet.as_view({"get": "subscription_status", "post": "subscribe", "delete": "unsubscribe"}),
        name="project-epic-subscribers",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/issue-relation/",
        IssueRelationViewSet.as_view({"get": "list", "post": "create"}),
        name="epic-relation",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/remove-relation/",
        IssueRelationViewSet.as_view({"post": "remove_relation"}),
        name="epic-relation",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:work_item_id>/description-versions/",
        WorkItemDescriptionVersionEndpoint.as_view(),
        name="epic-description-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:work_item_id>/description-versions/<uuid:pk>/",
        WorkItemDescriptionVersionEndpoint.as_view(),
        name="epic-description-versions",
    ),
    path(
        "assets/v2/workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/attachments/",
        IssueAttachmentV2Endpoint.as_view(),
        name="project-epic-attachments",
    ),
    path(
        "assets/v2/workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/attachments/<uuid:pk>/",
        IssueAttachmentV2Endpoint.as_view(),
        name="project-epic-attachments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/epics/<uuid:issue_id>/issue-attachments/",
        IssueAttachmentEndpoint.as_view(),
        name="project-epic-attachments",
    ),
]
