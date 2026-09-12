# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssuePropertyOptionSerializer, IssuePropertySerializer
from plane.db.models import IssueProperty, IssuePropertyOption, Project, ProjectIssueType


def linked_issue_type(slug, project_id, issue_type_id):
    """Issue type id if it is linked to the project, else None."""
    return (
        ProjectIssueType.objects.filter(workspace__slug=slug, project_id=project_id, issue_type_id=issue_type_id)
        .values_list("issue_type_id", flat=True)
        .first()
    )


class IssuePropertyViewSet(BaseViewSet):
    model = IssueProperty
    serializer_class = IssuePropertySerializer

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_type_id):
        if linked_issue_type(slug, project_id, issue_type_id) is None:
            return Response({"error": "Issue type is not linked to the project"}, status=status.HTTP_404_NOT_FOUND)
        properties = IssueProperty.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_type_id=issue_type_id
        ).prefetch_related("options")
        return Response(IssuePropertySerializer(properties, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, issue_type_id):
        if linked_issue_type(slug, project_id, issue_type_id) is None:
            return Response({"error": "Issue type is not linked to the project"}, status=status.HTTP_404_NOT_FOUND)
        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()

        serializer = IssuePropertySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if IssueProperty.objects.filter(
            issue_type_id=issue_type_id, name=serializer.validated_data.get("name")
        ).exists():
            return Response(
                {"error": "Property with the same name already exists for this issue type"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save(
            issue_type_id=issue_type_id,
            project_id=project_id,
            workspace_id=project.workspace_id,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, issue_type_id, pk):
        issue_property = IssueProperty.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_type_id=issue_type_id, pk=pk
        ).first()
        if issue_property is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        if (
            request.data.get("name")
            and IssueProperty.objects.filter(issue_type_id=issue_type_id, name=request.data.get("name"))
            .exclude(pk=pk)
            .exists()
        ):
            return Response(
                {"error": "Property with the same name already exists for this issue type"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = IssuePropertySerializer(issue_property, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, issue_type_id, pk):
        issue_property = IssueProperty.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_type_id=issue_type_id, pk=pk
        ).first()
        if issue_property is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        issue_property.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyOptionViewSet(BaseViewSet):
    model = IssuePropertyOption
    serializer_class = IssuePropertyOptionSerializer

    def get_property(self, slug, project_id, issue_type_id, property_id):
        return IssueProperty.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_type_id=issue_type_id,
            pk=property_id,
        ).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_type_id, property_id):
        if self.get_property(slug, project_id, issue_type_id, property_id) is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        options = IssuePropertyOption.objects.filter(property_id=property_id)
        return Response(IssuePropertyOptionSerializer(options, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, issue_type_id, property_id):
        issue_property = self.get_property(slug, project_id, issue_type_id, property_id)
        if issue_property is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        if issue_property.property_type != IssueProperty.PropertyType.OPTION:
            return Response(
                {"error": "Options can only be added to option properties"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IssuePropertyOptionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if IssuePropertyOption.objects.filter(
            property_id=property_id, name=serializer.validated_data.get("name")
        ).exists():
            return Response(
                {"error": "Option with the same name already exists for this property"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save(
            property_id=property_id,
            project_id=project_id,
            workspace_id=issue_property.workspace_id,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, issue_type_id, property_id, pk):
        if self.get_property(slug, project_id, issue_type_id, property_id) is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        option = IssuePropertyOption.objects.filter(property_id=property_id, pk=pk).first()
        if option is None:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        if (
            request.data.get("name")
            and IssuePropertyOption.objects.filter(property_id=property_id, name=request.data.get("name"))
            .exclude(pk=pk)
            .exists()
        ):
            return Response(
                {"error": "Option with the same name already exists for this property"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = IssuePropertyOptionSerializer(option, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, issue_type_id, property_id, pk):
        if self.get_property(slug, project_id, issue_type_id, property_id) is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        option = IssuePropertyOption.objects.filter(property_id=property_id, pk=pk).first()
        if option is None:
            return Response({"error": "Option not found"}, status=status.HTTP_404_NOT_FOUND)
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
