# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import TemplateSerializer
from plane.db.models import Project, Template, Workspace


def requested_template_type(request):
    """`?type=` selects the template family; work items are the default."""
    template_type = request.query_params.get("type", Template.TemplateType.WORKITEM)
    if template_type not in Template.TemplateType.values:
        return None
    return template_type


class WorkspaceTemplateViewSet(BaseViewSet):
    """Workspace level templates; readable by members, writable by workspace admins."""

    model = Template
    serializer_class = TemplateSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        template_type = requested_template_type(request)
        if template_type is None:
            return Response({"error": "Invalid template type"}, status=status.HTTP_400_BAD_REQUEST)
        templates = Template.objects.filter(
            workspace__slug=slug, project__isnull=True, template_type=template_type
        )
        return Response(TemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace_id = Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()
        if workspace_id is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = TemplateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if Template.objects.filter(
            workspace_id=workspace_id,
            project__isnull=True,
            template_type=serializer.validated_data.get("template_type", Template.TemplateType.WORKITEM),
            name=serializer.validated_data.get("name"),
        ).exists():
            return Response(
                {"error": "Template with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save(workspace_id=workspace_id, project=None)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        template = Template.objects.filter(workspace__slug=slug, project__isnull=True, pk=pk).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(TemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        template = Template.objects.filter(workspace__slug=slug, project__isnull=True, pk=pk).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = TemplateSerializer(template, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if serializer.validated_data.get("name") and Template.objects.filter(
            workspace__slug=slug,
            project__isnull=True,
            template_type=template.template_type,
            name=serializer.validated_data.get("name"),
        ).exclude(pk=pk).exists():
            return Response(
                {"error": "Template with the same name already exists in the workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        template = Template.objects.filter(workspace__slug=slug, project__isnull=True, pk=pk).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateViewSet(BaseViewSet):
    """Project templates; the list also carries the workspace templates as read-only rows."""

    model = Template
    serializer_class = TemplateSerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        template_type = requested_template_type(request)
        if template_type is None:
            return Response({"error": "Invalid template type"}, status=status.HTTP_400_BAD_REQUEST)
        templates = Template.objects.filter(workspace__slug=slug, template_type=template_type).filter(
            Q(project_id=project_id) | Q(project__isnull=True)
        )
        return Response(TemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = TemplateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if Template.objects.filter(
            project_id=project_id,
            template_type=serializer.validated_data.get("template_type", Template.TemplateType.WORKITEM),
            name=serializer.validated_data.get("name"),
        ).exists():
            return Response(
                {"error": "Template with the same name already exists in the project"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save(workspace_id=project.workspace_id, project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        template = (
            Template.objects.filter(workspace__slug=slug, pk=pk)
            .filter(Q(project_id=project_id) | Q(project__isnull=True))
            .first()
        )
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(TemplateSerializer(template).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        template = (
            Template.objects.filter(workspace__slug=slug, pk=pk)
            .filter(Q(project_id=project_id) | Q(project__isnull=True))
            .first()
        )
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        if template.project_id is None:
            return Response(
                {"error": "Workspace templates cannot be edited from a project"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TemplateSerializer(template, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if serializer.validated_data.get("name") and Template.objects.filter(
            project_id=project_id,
            template_type=template.template_type,
            name=serializer.validated_data.get("name"),
        ).exclude(pk=pk).exists():
            return Response(
                {"error": "Template with the same name already exists in the project"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        template = (
            Template.objects.filter(workspace__slug=slug, pk=pk)
            .filter(Q(project_id=project_id) | Q(project__isnull=True))
            .first()
        )
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
        if template.project_id is None:
            return Response(
                {"error": "Workspace templates cannot be deleted from a project"},
                status=status.HTTP_403_FORBIDDEN,
            )
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
