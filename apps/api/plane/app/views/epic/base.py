# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.db.models import Count, Q
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, IssueType, Project, ProjectIssueType
from plane.db.models.state import StateGroup
from plane.utils.host import base_host

from ..base import BaseAPIView
from ..issue.base import IssueDetailEndpoint, IssueListEndpoint, IssuePaginatedViewSet, IssueViewSet
from ..issue.sub_issue import SubIssuesEndpoint


def project_epic_type_id(project_id):
    """Projeye bagli, aktif epic tipinin id'si."""
    return (
        ProjectIssueType.objects.filter(
            project_id=project_id,
            issue_type__is_epic=True,
            issue_type__is_active=True,
        )
        .values_list("issue_type_id", flat=True)
        .first()
    )


class EpicViewSet(IssueViewSet):
    """Epic listesi ve CRUD'i; IssueViewSet ile ayni filtre/grup/sayfalama makinesi."""

    is_epic = True

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        if not Project.objects.filter(pk=project_id, workspace__slug=slug, is_epic_enabled=True).exists():
            return Response({"error": "Epics are not enabled for this project"}, status=status.HTTP_400_BAD_REQUEST)

        if request.data.get("parent_id") or request.data.get("parent"):
            return Response({"error": "Epic cannot have a parent"}, status=status.HTTP_400_BAD_REQUEST)

        type_id = request.data.get("type_id") or request.data.get("type")
        if type_id:
            if not IssueType.objects.filter(
                pk=type_id,
                is_epic=True,
                project_issue_types__project_id=project_id,
                project_issue_types__deleted_at__isnull=True,
            ).exists():
                return Response({"error": "Work item type is not an epic type"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            type_id = project_epic_type_id(project_id)
            if not type_id:
                return Response({"error": "Project has no epic work item type"}, status=status.HTTP_400_BAD_REQUEST)
            data = request.data
            if hasattr(data, "_mutable"):
                data._mutable = True
            data["type_id"] = str(type_id)

        return super().create(request, slug=slug, project_id=project_id)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], creator=True, model=Issue)
    def partial_update(self, request, slug, project_id, pk=None):
        if request.data.get("parent_id") or request.data.get("parent"):
            return Response({"error": "Epic cannot have a parent"}, status=status.HTTP_400_BAD_REQUEST)
        return super().partial_update(request, slug=slug, project_id=project_id, pk=pk)


class EpicListEndpoint(IssueListEndpoint):
    is_epic = True


class EpicPaginatedViewSet(IssuePaginatedViewSet):
    is_epic = True


class EpicDetailEndpoint(IssueDetailEndpoint):
    is_epic = True


class EpicIssuesEndpoint(SubIssuesEndpoint):
    """`epics/<id>/issues/` — epic'in cocuk is kalemleri."""

    is_epic = True


class EpicIssueEndpoint(BaseAPIView):
    """Tek bir cocugu epic'ten cikarir."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, epic_id, issue_id):
        issue = (
            Issue.issue_objects.work_items()
            .filter(pk=issue_id, parent_id=epic_id, workspace__slug=slug, project_id=project_id)
            .first()
        )
        if issue is None:
            return Response({"error": "Work item not found under this epic"}, status=status.HTTP_404_NOT_FOUND)

        issue.parent = None
        issue.save(update_fields=["parent"])

        issue_activity.delay(
            type="issue.activity.updated",
            requested_data=json.dumps({"parent": None}),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=json.dumps({"parent": str(epic_id)}),
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EpicAnalyticsEndpoint(BaseAPIView):
    """Epic ilerleme sayimlari (TEpicAnalytics)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, epic_id):
        if not Issue.issue_objects.epics().filter(pk=epic_id, workspace__slug=slug, project_id=project_id).exists():
            return Response({"error": "Epic not found"}, status=status.HTTP_404_NOT_FOUND)

        children = Issue.issue_objects.work_items().filter(parent_id=epic_id, workspace__slug=slug)

        counts = children.aggregate(
            backlog_issues=Count("id", filter=Q(state__group=StateGroup.BACKLOG.value)),
            unstarted_issues=Count("id", filter=Q(state__group=StateGroup.UNSTARTED.value)),
            started_issues=Count("id", filter=Q(state__group=StateGroup.STARTED.value)),
            completed_issues=Count("id", filter=Q(state__group=StateGroup.COMPLETED.value)),
            cancelled_issues=Count("id", filter=Q(state__group=StateGroup.CANCELLED.value)),
            overdue_issues=Count(
                "id",
                filter=Q(target_date__lt=timezone.now().date())
                & ~Q(state__group__in=[StateGroup.COMPLETED.value, StateGroup.CANCELLED.value]),
            ),
        )
        return Response(counts, status=status.HTTP_200_OK)
