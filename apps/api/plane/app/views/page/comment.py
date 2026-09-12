# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ProjectPagePermission, WorkspacePagePermission
from plane.app.permissions.base import ROLE
from plane.app.serializers import PageCommentSerializer, PageCommentReactionSerializer
from plane.bgtasks.page_comment_notification_task import page_comment_notification
from plane.db.models import PageComment, PageCommentReaction

from ..base import BaseViewSet
from .base import PageScopeMixin

ADMIN = ROLE.ADMIN.value
MEMBER = ROLE.MEMBER.value
GUEST = ROLE.GUEST.value


class ProjectPageCommentPermission(ProjectPagePermission):
    """Commenting follows page *read* access, not page write access.

    Anyone who may read the page may comment on it; guests stay limited to
    pages they own (the owner short circuit in the base class). Author/admin
    checks for editing and deleting a comment live in the view.
    """

    def _check_project_action_access(self, request, role):
        if request.method in SAFE_METHODS:
            return role in [ADMIN, MEMBER, GUEST]
        return role in [ADMIN, MEMBER]


class PageCommentViewSet(PageScopeMixin, BaseViewSet):
    """Inline comments of a page, for both the project and the wiki scope."""

    serializer_class = PageCommentSerializer
    model = PageComment

    def get_permissions(self):
        if self.is_workspace_scope:
            return [WorkspacePagePermission()]
        return [ProjectPageCommentPermission()]

    def get_queryset(self):
        return (
            PageComment.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                page_id=self.kwargs.get("page_id"),
            )
            .select_related("actor", "workspace")
            .prefetch_related("page_comment_reactions__actor")
            .order_by("created_at")
        )

    def _page(self):
        """The page the URL points at, already scoped by the permission class."""
        return self.get_page(
            self.kwargs.get("slug"),
            self.kwargs.get("project_id"),
            self.kwargs.get("page_id"),
        )

    def _can_moderate(self, comment):
        """Comment author, or an admin of the enclosing scope."""
        if comment.actor_id == self.request.user.id:
            return True
        return self.is_admin(self.kwargs.get("slug"), self.kwargs.get("project_id"), self.request.user)

    def list(self, request, slug, page_id, project_id=None):
        self._page()
        queryset = self.get_queryset()
        resolved = request.GET.get("resolved", "all")
        if resolved == "true":
            queryset = queryset.filter(is_resolved=True)
        elif resolved == "false":
            queryset = queryset.filter(is_resolved=False)
        return Response(PageCommentSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    def create(self, request, slug, page_id, project_id=None):
        page = self._page()
        serializer = PageCommentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        parent = serializer.validated_data.get("parent")
        if parent is not None and parent.page_id != page.id:
            return Response({"error": "The parent comment belongs to another page"}, status=status.HTTP_400_BAD_REQUEST)

        comment = serializer.save(workspace_id=page.workspace_id, page_id=page.id, actor=request.user)
        page_comment_notification.delay(
            page_id=str(page.id),
            comment_id=str(comment.id),
            comment_html=comment.comment_html,
            actor_id=str(request.user.id),
        )
        return Response(PageCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, page_id, pk, project_id=None):
        self._page()
        comment = self.get_queryset().get(pk=pk)
        if not self._can_moderate(comment):
            return Response({"error": "You are not allowed to edit this comment"}, status=status.HTTP_403_FORBIDDEN)

        serializer = PageCommentSerializer(comment, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if "comment_html" in request.data and request.data["comment_html"] != comment.comment_html:
            serializer.save(edited_at=timezone.now())
        else:
            serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, page_id, pk, project_id=None):
        self._page()
        comment = self.get_queryset().get(pk=pk)
        if not self._can_moderate(comment):
            return Response({"error": "You are not allowed to delete this comment"}, status=status.HTTP_403_FORBIDDEN)
        # Replies go with the thread root.
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def resolve(self, request, slug, page_id, pk, project_id=None):
        self._page()
        comment = self.get_queryset().get(pk=pk)
        comment.is_resolved = True
        comment.resolved_by = request.user
        comment.resolved_at = timezone.now()
        comment.save(update_fields=["is_resolved", "resolved_by", "resolved_at", "updated_at"])
        return Response(PageCommentSerializer(comment).data, status=status.HTTP_200_OK)

    def unresolve(self, request, slug, page_id, pk, project_id=None):
        self._page()
        comment = self.get_queryset().get(pk=pk)
        comment.is_resolved = False
        comment.resolved_by = None
        comment.resolved_at = None
        comment.save(update_fields=["is_resolved", "resolved_by", "resolved_at", "updated_at"])
        return Response(PageCommentSerializer(comment).data, status=status.HTTP_200_OK)


class PageCommentReactionViewSet(PageScopeMixin, BaseViewSet):
    serializer_class = PageCommentReactionSerializer
    model = PageCommentReaction

    def get_permissions(self):
        if self.is_workspace_scope:
            return [WorkspacePagePermission()]
        return [ProjectPageCommentPermission()]

    def _comment(self):
        self.get_page(self.kwargs.get("slug"), self.kwargs.get("project_id"), self.kwargs.get("page_id"))
        return PageComment.objects.get(
            pk=self.kwargs.get("comment_id"),
            page_id=self.kwargs.get("page_id"),
            workspace__slug=self.kwargs.get("slug"),
        )

    def create(self, request, slug, page_id, comment_id, project_id=None):
        comment = self._comment()
        reaction = request.data.get("reaction")
        if not reaction:
            return Response({"error": "reaction is required"}, status=status.HTTP_400_BAD_REQUEST)
        if PageCommentReaction.objects.filter(comment=comment, actor=request.user, reaction=reaction).exists():
            return Response({"error": "The reaction already exists"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            # A concurrent insert would otherwise poison the request transaction.
            with transaction.atomic():
                instance = PageCommentReaction.objects.create(
                    workspace_id=comment.workspace_id,
                    comment=comment,
                    actor=request.user,
                    reaction=reaction,
                )
        except IntegrityError:
            return Response({"error": "The reaction already exists"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PageCommentReactionSerializer(instance).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, slug, page_id, comment_id, reaction_code, project_id=None):
        self._comment()
        instance = PageCommentReaction.objects.get(
            comment_id=comment_id,
            actor=request.user,
            reaction=reaction_code,
            workspace__slug=slug,
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
