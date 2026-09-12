# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db import transaction
from django.db.models import Q, UUIDField, Value

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView, BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueTypeSerializer
from plane.db.models import Issue, IssueType, Project, ProjectIssueType, Workspace

DEFAULT_TYPE_NAME = "Task"
EPIC_TYPE_NAME = "Epic"


def issue_type_queryset(slug):
    """Workspace issue types annotated with the projects they are linked to."""
    return IssueType.objects.filter(workspace__slug=slug).annotate(
        project_ids=ArrayAgg(
            "project_issue_types__project_id",
            distinct=True,
            filter=Q(
                project_issue_types__isnull=False,
                project_issue_types__deleted_at__isnull=True,
            ),
            default=Value([], output_field=ArrayField(UUIDField())),
        )
    )


class IssueTypeViewSet(BaseViewSet):
    """Workspace level issue types."""

    model = IssueType
    serializer_class = IssueTypeSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        issue_types = issue_type_queryset(slug)
        return Response(IssueTypeSerializer(issue_types, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace_id = Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()
        if workspace_id is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueTypeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if IssueType.objects.filter(workspace__slug=slug, name=serializer.validated_data.get("name")).exists():
            return Response(
                {"error": "Issue type with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save(workspace_id=workspace_id)
        issue_type = issue_type_queryset(slug).get(pk=serializer.data["id"])
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        issue_type = IssueType.objects.filter(workspace__slug=slug, pk=pk).first()
        if issue_type is None:
            return Response({"error": "Issue type not found"}, status=status.HTTP_404_NOT_FOUND)
        if (
            request.data.get("name")
            and IssueType.objects.filter(workspace__slug=slug, name=request.data.get("name")).exclude(pk=pk).exists()
        ):
            return Response(
                {"error": "Issue type with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = IssueTypeSerializer(issue_type, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        issue_type = issue_type_queryset(slug).get(pk=pk)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        issue_type = IssueType.objects.filter(workspace__slug=slug, pk=pk).first()
        if issue_type is None:
            return Response({"error": "Issue type not found"}, status=status.HTTP_404_NOT_FOUND)
        issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectIssueTypeViewSet(BaseViewSet):
    """Issue types linked to a project through ProjectIssueType."""

    model = IssueType
    serializer_class = IssueTypeSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        issue_types = issue_type_queryset(slug).filter(
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
        )
        return Response(IssueTypeSerializer(issue_types, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IssueTypeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if IssueType.objects.filter(workspace__slug=slug, name=serializer.validated_data.get("name")).exists():
            return Response(
                {"error": "Issue type with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            issue_type = serializer.save(workspace_id=project.workspace_id)
            is_default = bool(request.data.get("is_default", False))
            if is_default:
                ProjectIssueType.objects.filter(project_id=project_id, is_default=True).update(is_default=False)
            ProjectIssueType.objects.create(
                project_id=project_id,
                workspace_id=project.workspace_id,
                issue_type=issue_type,
                level=int(request.data.get("level", 0) or 0),
                is_default=is_default,
            )

        issue_type = issue_type_queryset(slug).get(pk=issue_type.id)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        project_issue_type = ProjectIssueType.objects.filter(
            project_id=project_id, workspace__slug=slug, issue_type_id=pk
        ).first()
        if project_issue_type is None:
            return Response({"error": "Issue type is not linked to the project"}, status=status.HTTP_404_NOT_FOUND)

        issue_type = project_issue_type.issue_type
        if (
            request.data.get("name")
            and IssueType.objects.filter(workspace__slug=slug, name=request.data.get("name")).exclude(pk=pk).exists()
        ):
            return Response(
                {"error": "Issue type with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            serializer = IssueTypeSerializer(issue_type, data=request.data, partial=True)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()

            if "is_default" in request.data:
                is_default = bool(request.data.get("is_default"))
                if is_default:
                    ProjectIssueType.objects.filter(project_id=project_id, is_default=True).exclude(
                        pk=project_issue_type.pk
                    ).update(is_default=False)
                project_issue_type.is_default = is_default
            if "level" in request.data:
                project_issue_type.level = int(request.data.get("level") or 0)
            project_issue_type.save()

        issue_type = issue_type_queryset(slug).get(pk=pk)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        """Unlink the type from the project; the workspace type itself stays."""
        project_issue_type = ProjectIssueType.objects.filter(
            project_id=project_id, workspace__slug=slug, issue_type_id=pk
        ).first()
        if project_issue_type is None:
            return Response({"error": "Issue type is not linked to the project"}, status=status.HTTP_404_NOT_FOUND)
        project_issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectIssueTypeEnableEndpoint(BaseAPIView):
    """Turn on work item types for a project and seed the default types.

    Idempotent: re-running links missing rows and back-fills untyped issues only.
    """

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            default_type = IssueType.objects.filter(
                workspace_id=project.workspace_id, name=DEFAULT_TYPE_NAME, is_epic=False
            ).first()
            if default_type is None:
                default_type = IssueType.objects.create(
                    workspace_id=project.workspace_id,
                    name=DEFAULT_TYPE_NAME,
                    description="Default work item type",
                    is_default=True,
                    level=0,
                )

            epic_type = IssueType.objects.filter(workspace_id=project.workspace_id, is_epic=True).first()
            if epic_type is None:
                epic_type = IssueType.objects.create(
                    workspace_id=project.workspace_id,
                    name=EPIC_TYPE_NAME,
                    description="Epic work item type",
                    is_epic=True,
                    level=1,
                )

            for issue_type, level, is_default in ((default_type, 0, True), (epic_type, 1, False)):
                ProjectIssueType.objects.get_or_create(
                    project_id=project_id,
                    issue_type=issue_type,
                    defaults={
                        "workspace_id": project.workspace_id,
                        "level": level,
                        "is_default": is_default,
                    },
                )

            # Back-fill work items that have no type yet
            Issue.objects.filter(project_id=project_id, type__isnull=True).update(type=default_type)

            if not project.is_issue_type_enabled:
                project.is_issue_type_enabled = True
                project.save(update_fields=["is_issue_type_enabled"])

        issue_types = issue_type_queryset(slug).filter(
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
        )
        return Response(IssueTypeSerializer(issue_types, many=True).data, status=status.HTTP_200_OK)
