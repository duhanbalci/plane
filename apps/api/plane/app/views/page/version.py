# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.db.models import PageVersion
from ..base import BaseAPIView
from plane.app.serializers import PageVersionSerializer, PageVersionDetailSerializer
from plane.app.permissions import ProjectPagePermission, WorkspacePagePermission


class PageVersionEndpoint(BaseAPIView):
    permission_classes = [ProjectPagePermission]
    # "project" or "workspace"; set per URL through as_view(scope=...).
    scope = "project"

    def get_permissions(self):
        if self.scope == "workspace":
            return [WorkspacePagePermission()]
        return [ProjectPagePermission()]

    def scoped_versions(self, slug, project_id, page_id):
        """Versions of a page inside the current scope."""
        if self.scope == "workspace":
            return PageVersion.objects.filter(workspace__slug=slug, page__is_global=True, page_id=page_id)
        return PageVersion.objects.filter(
            workspace__slug=slug,
            page__project_pages__project_id=project_id,
            page__project_pages__deleted_at__isnull=True,
            page_id=page_id,
        )

    def get(self, request, slug, page_id, project_id=None, pk=None):
        # Check if pk is provided
        if pk:
            # Return a single page version. Scope to an *active* ProjectPage link
            # for the URL project so a page belonging to (or removed from)
            # another project cannot be read via this endpoint (GHSA-g49r /
            # GHSA-ghcr). The active-link partial-unique constraint keeps the
            # join to a single row; distinct() is a defensive guard so the
            # page__project_pages join can never make get() raise
            # MultipleObjectsReturned (a 500).
            page_version = self.scoped_versions(slug, project_id, page_id).filter(pk=pk).distinct().get()
            # Serialize the page version
            serializer = PageVersionDetailSerializer(page_version)
            return Response(serializer.data, status=status.HTTP_200_OK)
        # Return all page versions scoped to an active ProjectPage link for the
        # URL project (defense in depth).
        page_versions = self.scoped_versions(slug, project_id, page_id).distinct()
        # Serialize the page versions
        serializer = PageVersionSerializer(page_versions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
