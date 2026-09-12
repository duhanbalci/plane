# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from ..base import BaseAPIView
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.issue_type import (
    project_member_ids,
    property_value_to_raw,
    validate_property_values,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, IssueProperty, IssuePropertyValue


def collect_values(issue_id, properties_by_id):
    """Current values of an issue as {property_id: [raw value, ...]}."""
    values = {str(property_id): [] for property_id in properties_by_id}
    rows = IssuePropertyValue.objects.filter(issue_id=issue_id, property_id__in=properties_by_id.keys())
    for row in rows:
        issue_property = properties_by_id.get(row.property_id)
        if issue_property is None:
            continue
        raw = property_value_to_raw(issue_property, row)
        if raw is not None:
            values[str(row.property_id)].append(raw)
    return values


class IssuePropertyValueEndpoint(BaseAPIView):
    """Read and replace the custom property values of one work item."""

    def issue_properties(self, issue):
        if issue.type_id is None:
            return {}
        return {
            issue_property.id: issue_property
            for issue_property in IssueProperty.objects.filter(issue_type_id=issue.type_id).prefetch_related("options")
        }

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        properties_by_id = self.issue_properties(issue)
        return Response(collect_values(issue.id, properties_by_id), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(workspace__slug=slug, project_id=project_id, pk=issue_id).first()
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        payload = request.data
        if not isinstance(payload, dict):
            return Response({"error": "Payload must be an object"}, status=status.HTTP_400_BAD_REQUEST)

        properties_by_id = self.issue_properties(issue)
        properties_by_key = {str(pk): value for pk, value in properties_by_id.items()}

        unknown = [key for key in payload if key not in properties_by_key]
        if unknown:
            return Response(
                {"error": "Property does not belong to the work item type", "properties": unknown},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_values = collect_values(issue.id, properties_by_id)
        member_ids = project_member_ids(project_id)

        rows_by_property = {}
        for key, values in payload.items():
            issue_property = properties_by_key[key]
            if not issue_property.is_active:
                return Response(
                    {"error": f"{issue_property.display_name} is not active"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            options_by_id = {str(option.id): option for option in issue_property.options.all() if option.is_active}
            if not isinstance(values, list):
                values = [values]
            try:
                rows_by_property[issue_property] = validate_property_values(
                    issue_property, values, options_by_id, member_ids
                )
            except serializers.ValidationError as err:
                return Response({"error": err.detail}, status=status.HTTP_400_BAD_REQUEST)

        # Every required property must end up with at least one value
        final_values = dict(current_values)
        for issue_property, rows in rows_by_property.items():
            final_values[str(issue_property.id)] = rows
        missing = [
            issue_property.display_name
            for issue_property in properties_by_id.values()
            if issue_property.is_required and issue_property.is_active and not final_values.get(str(issue_property.id))
        ]
        if missing:
            return Response(
                {"error": f"Required properties are missing: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for issue_property, rows in rows_by_property.items():
                IssuePropertyValue.objects.filter(issue_id=issue.id, property_id=issue_property.id).delete()
                IssuePropertyValue.objects.bulk_create(
                    [
                        IssuePropertyValue(
                            issue_id=issue.id,
                            property_id=issue_property.id,
                            project_id=project_id,
                            workspace_id=issue.workspace_id,
                            created_by=request.user,
                            updated_by=request.user,
                            **row,
                        )
                        for row in rows
                    ],
                    batch_size=50,
                )

        requested = {key: (payload[key] if isinstance(payload[key], list) else [payload[key]]) for key in payload}
        issue_activity.delay(
            type="issue_property.activity.updated",
            requested_data=json.dumps({"property_values": requested}, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue.id),
            project_id=str(project_id),
            current_instance=json.dumps(
                {"property_values": {key: current_values.get(key, []) for key in payload}},
                cls=DjangoJSONEncoder,
            ),
            epoch=int(timezone.now().timestamp()),
        )

        properties_by_id = self.issue_properties(issue)
        return Response(collect_values(issue.id, properties_by_id), status=status.HTTP_200_OK)
