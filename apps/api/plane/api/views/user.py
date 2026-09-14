# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import OuterRef, Subquery

# Third party imports
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse

# Module imports
from plane.api.serializers import UserLiteSerializer, WorkspaceLiteSerializer
from plane.api.views.base import BaseAPIView
from plane.db.models import User, Workspace, WorkspaceMember
from plane.utils.openapi.decorators import user_docs
from plane.utils.openapi import USER_EXAMPLE


class UserEndpoint(BaseAPIView):
    serializer_class = UserLiteSerializer
    model = User

    @user_docs(
        operation_id="get_current_user",
        summary="Get current user",
        description="Retrieve the authenticated user's profile information including basic details.",
        responses={
            200: OpenApiResponse(
                description="Current user profile",
                response=UserLiteSerializer,
                examples=[USER_EXAMPLE],
            ),
        },
    )
    def get(self, request):
        """Get current user

        Retrieve the authenticated user's profile information including basic details.
        Returns user data based on the current authentication context.
        """
        serializer = UserLiteSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserWorkspacesEndpoint(BaseAPIView):
    """List the workspaces the authenticated user belongs to.

    OAuth access tokens are workspace-agnostic, so a client that has just
    completed the consent flow has no workspace slug yet. This is its entry
    point: every other endpoint takes the slug returned here.
    """

    serializer_class = WorkspaceLiteSerializer
    model = Workspace
    use_read_replica = True

    @user_docs(
        operation_id="list_user_workspaces",
        summary="List the current user's workspaces",
        description="Retrieve every workspace the authenticated user is an active member of.",
        responses={
            200: OpenApiResponse(
                description="Workspaces the user belongs to",
                response=WorkspaceLiteSerializer(many=True),
            ),
        },
    )
    def get(self, request):
        """List the current user's workspaces

        Retrieve every workspace the authenticated user is an active member of,
        together with the role they hold in each.
        """
        role = WorkspaceMember.objects.filter(workspace=OuterRef("id"), member=request.user, is_active=True).values(
            "role"
        )

        workspaces = (
            Workspace.objects.filter(workspace_member__member=request.user, workspace_member__is_active=True)
            .annotate(role=Subquery(role))
            .distinct()
            .order_by("name")
        )

        serialized = WorkspaceLiteSerializer(workspaces, many=True).data
        for workspace, payload in zip(workspaces, serialized):
            payload["role"] = workspace.role

        return Response(serialized, status=status.HTTP_200_OK)
