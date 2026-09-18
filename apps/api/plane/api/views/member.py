# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.response import Response
from rest_framework import status
from drf_spectacular.utils import (
    extend_schema,
    OpenApiResponse,
    OpenApiRequest,
)

# Module imports
from .base import BaseAPIView
from plane.api.serializers import (
    UserLiteSerializer,
    ProjectMemberSerializer,
    WorkspaceMemberLiteAPISerializer,
    ProjectMemberLiteAPISerializer,
)
from plane.app.permissions import ROLE
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, ProjectUserProperty
from plane.db.models.project import ProjectNetwork
from plane.utils.permissions import (
    ProjectMemberPermission,
    WorkSpaceAdminPermission,
    ProjectAdminPermission,
    WorkspaceUserPermission,
)
from plane.utils.openapi import (
    WORKSPACE_SLUG_PARAMETER,
    PROJECT_ID_PARAMETER,
    CURSOR_PARAMETER,
    PER_PAGE_PARAMETER,
    UNAUTHORIZED_RESPONSE,
    FORBIDDEN_RESPONSE,
    WORKSPACE_NOT_FOUND_RESPONSE,
    PROJECT_NOT_FOUND_RESPONSE,
    WORKSPACE_MEMBER_EXAMPLE,
    PROJECT_MEMBER_EXAMPLE,
    create_paginated_response,
)


class WorkspaceMemberAPIEndpoint(BaseAPIView):
    permission_classes = [WorkSpaceAdminPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="get_workspace_members",
        summary="List workspace members",
        description="Retrieve all users who are members of the specified workspace.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER],
        responses={
            200: OpenApiResponse(
                description="List of workspace members with their roles",
                response={
                    "type": "array",
                    "items": {
                        "allOf": [
                            {"$ref": "#/components/schemas/UserLite"},
                            {
                                "type": "object",
                                "properties": {
                                    "role": {
                                        "type": "integer",
                                        "description": "Member role in the workspace",
                                    }
                                },
                            },
                        ]
                    },
                },
                examples=[WORKSPACE_MEMBER_EXAMPLE],
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    # Get all the users that are present inside the workspace
    def get(self, request, slug):
        """List workspace members

        Retrieve all users who are members of the specified workspace.
        Returns user profiles with their respective workspace roles and permissions.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace_members = WorkspaceMember.objects.filter(workspace__slug=slug).select_related("member")

        # Get all the users with their roles
        users_with_roles = []
        for workspace_member in workspace_members:
            user_data = UserLiteSerializer(workspace_member.member).data
            user_data["role"] = workspace_member.role
            users_with_roles.append(user_data)

        return Response(users_with_roles, status=status.HTTP_200_OK)


class ProjectMemberListCreateAPIEndpoint(BaseAPIView):
    permission_classes = [ProjectMemberPermission]
    use_read_replica = True

    def get_permissions(self):
        if self.request.method == "GET":
            return [ProjectMemberPermission()]
        return [ProjectAdminPermission()]

    @extend_schema(
        operation_id="get_project_members",
        summary="List project members",
        description="Retrieve all users who are members of the specified project.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={
            200: OpenApiResponse(
                description="List of project members with their roles",
                response=UserLiteSerializer,
                examples=[PROJECT_MEMBER_EXAMPLE],
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: PROJECT_NOT_FOUND_RESPONSE,
        },
    )
    # Get all the users that are present inside the workspace
    def get(self, request, slug, project_id):
        """List project members

        Retrieve all users who are members of the specified project.
        Returns user profiles with their project-specific roles and access levels.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the workspace members that are present inside the workspace
        project_members = ProjectMember.objects.filter(project_id=project_id, workspace__slug=slug).values_list(
            "member_id", flat=True
        )

        # Get all the users that are present inside the workspace
        users = UserLiteSerializer(User.objects.filter(id__in=project_members), many=True).data
        return Response(users, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="create_project_member",
        summary="Create project member",
        description="Create a new project member",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={201: OpenApiResponse(description="Project member created", response=ProjectMemberSerializer)},
        request=OpenApiRequest(request=ProjectMemberSerializer),
    )
    def post(self, request, slug, project_id):
        serializer = ProjectMemberSerializer(data=request.data, context={"slug": slug})
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# API endpoint to get and update a project member
class ProjectMemberDetailAPIEndpoint(ProjectMemberListCreateAPIEndpoint):
    @extend_schema(
        operation_id="get_project_member",
        summary="Get project member",
        description="Retrieve a project member by ID.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={
            200: OpenApiResponse(description="Project member", response=ProjectMemberSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: PROJECT_NOT_FOUND_RESPONSE,
        },
    )
    # Get a project member by ID
    def get(self, request, slug, project_id, pk):
        """Get project member

        Retrieve a project member by ID.
        Returns a project member with their project-specific roles and access levels.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the workspace members that are present inside the workspace
        project_members = ProjectMember.objects.get(project_id=project_id, workspace__slug=slug, pk=pk)
        user = User.objects.get(id=project_members.member_id)
        user = UserLiteSerializer(user).data
        return Response(user, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="update_project_member",
        summary="Update project member",
        description="Update a project member",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={200: OpenApiResponse(description="Project member updated", response=ProjectMemberSerializer)},
        request=OpenApiRequest(request=ProjectMemberSerializer),
    )
    def patch(self, request, slug, project_id, pk):
        project_member = ProjectMember.objects.get(project_id=project_id, workspace__slug=slug, pk=pk)
        serializer = ProjectMemberSerializer(project_member, data=request.data, partial=True, context={"slug": slug})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        operation_id="delete_project_member",
        summary="Delete project member",
        description="Delete a project member",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        responses={204: OpenApiResponse(description="Project member deleted")},
    )
    def delete(self, request, slug, project_id, pk):
        project_member = ProjectMember.objects.get(project_id=project_id, workspace__slug=slug, pk=pk)
        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberLiteAPIEndpoint(BaseAPIView):
    """Workspace members (lite) list endpoint."""

    permission_classes = [WorkSpaceAdminPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="get_workspace_members_lite",
        summary="List workspace members (lite)",
        description="Retrieve a paginated, lightweight list of workspace members for pickers and directories.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, CURSOR_PARAMETER, PER_PAGE_PARAMETER],
        responses={
            200: create_paginated_response(
                WorkspaceMemberLiteAPISerializer,
                "PaginatedWorkspaceMemberLite",
                "Paginated list of workspace members with minimal fields",
                "Paginated Workspace Members (Lite)",
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: WORKSPACE_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug):
        """List workspace members (lite)

        Retrieve a paginated, lightweight list of workspace members, optimized for
        pickers and directories.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

        workspace_members = (
            WorkspaceMember.objects.filter(workspace__slug=slug).select_related("member").order_by("-created_at")
        )
        return self.paginate(
            request=request,
            queryset=workspace_members,
            on_results=lambda members: WorkspaceMemberLiteAPISerializer(members, many=True).data,
        )


class ProjectMemberLiteAPIEndpoint(BaseAPIView):
    """Project members (lite) list endpoint."""

    permission_classes = [ProjectMemberPermission]
    use_read_replica = True

    @extend_schema(
        operation_id="get_project_members_lite",
        summary="List project members (lite)",
        description="Retrieve a paginated, lightweight list of project members for pickers and directories.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER, CURSOR_PARAMETER, PER_PAGE_PARAMETER],
        responses={
            200: create_paginated_response(
                ProjectMemberLiteAPISerializer,
                "PaginatedProjectMemberLite",
                "Paginated list of project members with minimal fields",
                "Paginated Project Members (Lite)",
            ),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: PROJECT_NOT_FOUND_RESPONSE,
        },
    )
    def get(self, request, slug, project_id):
        """List project members (lite)

        Retrieve a paginated, lightweight list of project members, optimized for
        pickers and directories.
        """
        # Check if the workspace exists
        if not Workspace.objects.filter(slug=slug).exists():
            return Response(
                {"error": "Provided workspace does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not Project.objects.filter(id=project_id, workspace__slug=slug).exists():
            return Response(
                {"error": "Provided project does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

        project_members = (
            ProjectMember.objects.filter(project_id=project_id, workspace__slug=slug)
            .select_related("member")
            .order_by("-created_at")
        )
        return self.paginate(
            request=request,
            queryset=project_members,
            on_results=lambda members: ProjectMemberLiteAPISerializer(members, many=True).data,
        )


class ProjectJoinAPIEndpoint(BaseAPIView):
    """
    Let the caller join a project in their workspace.

    The v1 counterpart of the web app's "Join project" button. Adding a member
    through ``/members/`` needs a project admin, which leaves a workspace admin
    who is not yet in a project with no way in over the API. The rules are the
    app's: workspace admins and members may join public projects, only
    workspace admins may join secret ones, and the project role mirrors the
    workspace role.
    """

    permission_classes = [WorkspaceUserPermission]

    @extend_schema(
        operation_id="join_project",
        summary="Join project",
        description="Add the authenticated user to a project in the workspace.",
        tags=["Members"],
        parameters=[WORKSPACE_SLUG_PARAMETER, PROJECT_ID_PARAMETER],
        request=None,
        responses={
            200: OpenApiResponse(description="Already a member", response=ProjectMemberSerializer),
            201: OpenApiResponse(description="Joined the project", response=ProjectMemberSerializer),
            401: UNAUTHORIZED_RESPONSE,
            403: FORBIDDEN_RESPONSE,
            404: PROJECT_NOT_FOUND_RESPONSE,
        },
    )
    def post(self, request, slug, project_id):
        """Join project

        Add the authenticated user to the project with a role matching their
        workspace role. Joining a project you already belong to is a no-op.
        """
        workspace_member = WorkspaceMember.objects.get(member=request.user, workspace__slug=slug, is_active=True)
        # Guests are invited to projects one by one; they never join on their own.
        if workspace_member.role not in [ROLE.ADMIN.value, ROLE.MEMBER.value]:
            return Response(
                {"error": "Workspace guests cannot join projects themselves"},
                status=status.HTTP_403_FORBIDDEN,
            )

        project = Project.objects.filter(pk=project_id, workspace__slug=slug, archived_at__isnull=True).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        if project.network == ProjectNetwork.SECRET.value and workspace_member.role != ROLE.ADMIN.value:
            return Response(
                {"error": "Only workspace admins can join a private project"},
                status=status.HTTP_403_FORBIDDEN,
            )

        project_member = ProjectMember.objects.filter(project=project, member=request.user).first()
        if project_member is not None and project_member.is_active:
            return Response(ProjectMemberSerializer(project_member).data, status=status.HTTP_200_OK)

        if project_member is None:
            # save() also creates the member's ProjectUserProperty.
            project_member = ProjectMember.objects.create(
                project=project,
                member=request.user,
                role=workspace_member.role,
                workspace=project.workspace,
                created_by=request.user,
            )
        else:
            # A former member rejoining keeps the row; restore it at their current workspace role.
            project_member.is_active = True
            project_member.role = workspace_member.role
            project_member.save(update_fields=["is_active", "role", "updated_at"])
            ProjectUserProperty.objects.get_or_create(
                project=project,
                user=request.user,
                defaults={"workspace": project.workspace, "created_by": request.user},
            )

        return Response(ProjectMemberSerializer(project_member).data, status=status.HTTP_201_CREATED)
