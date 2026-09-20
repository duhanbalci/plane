# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Work item types and their custom properties over the public v1 API.

A client that writes work items needs both: the type id to file an item as a
Bug rather than a Task, and the property ids to fill the fields that type
carries. The property *values* of a single work item reuse the app endpoint,
so validation, the required-property check and the activity feed stay defined
in one place; only the authentication is swapped for the v1 credentials.
"""

# Python imports
from collections import defaultdict

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ProjectEntityPermission
from plane.app.serializers import IssuePropertySerializer, IssueTypeSerializer
from plane.app.views.issue_type.base import issue_type_queryset
from plane.app.views.issue_type.value import IssuePropertyValueEndpoint
from plane.db.models import IssueProperty

from .base import BaseAPIView, ExternalAPIAuthMixin


class WorkItemTypeListAPIEndpoint(BaseAPIView):
    """The work item types enabled for a project, each with its properties."""

    permission_classes = [ProjectEntityPermission]
    use_read_replica = True

    def get(self, request, slug, project_id):
        issue_types = list(
            issue_type_queryset(slug).filter(
                project_issue_types__project_id=project_id,
                project_issue_types__deleted_at__isnull=True,
            )
        )

        properties_by_type = defaultdict(list)
        properties = IssueProperty.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            issue_type_id__in=[issue_type.id for issue_type in issue_types],
        ).prefetch_related("options")
        for issue_property in properties:
            properties_by_type[issue_property.issue_type_id].append(issue_property)

        data = []
        for issue_type in issue_types:
            row = IssueTypeSerializer(issue_type).data
            row["properties"] = IssuePropertySerializer(
                properties_by_type.get(issue_type.id, []), many=True
            ).data
            data.append(row)

        return Response(data, status=status.HTTP_200_OK)


class WorkItemPropertyValueAPIEndpoint(ExternalAPIAuthMixin, IssuePropertyValueEndpoint):
    """Read and replace the custom property values of one work item."""
