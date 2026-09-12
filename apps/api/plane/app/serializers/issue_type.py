# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid as uuid_lib
from datetime import datetime

# Django imports
from django.utils.dateparse import parse_datetime

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssueType,
    ProjectMember,
)


class IssueTypeSerializer(BaseSerializer):
    project_ids = serializers.ListField(child=serializers.UUIDField(), read_only=True)

    class Meta:
        model = IssueType
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "workspace",
            "project_ids",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project_ids",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class IssuePropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyOption
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_default",
            "is_active",
            "sort_order",
            "property",
            "workspace",
            "project",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "property",
            "workspace",
            "project",
            "sort_order",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class IssuePropertySerializer(BaseSerializer):
    options = IssuePropertyOptionSerializer(many=True, read_only=True)

    class Meta:
        model = IssueProperty
        fields = [
            "id",
            "name",
            "display_name",
            "description",
            "property_type",
            "relation_type",
            "is_required",
            "is_active",
            "is_multi",
            "default_value",
            "settings",
            "sort_order",
            "logo_props",
            "issue_type",
            "workspace",
            "project",
            "options",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "issue_type",
            "workspace",
            "project",
            "sort_order",
            "options",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate(self, attrs):
        property_type = attrs.get(
            "property_type",
            getattr(self.instance, "property_type", IssueProperty.PropertyType.TEXT),
        )
        relation_type = attrs.get("relation_type", getattr(self.instance, "relation_type", None))
        if property_type == IssueProperty.PropertyType.RELATION and not relation_type:
            raise serializers.ValidationError({"relation_type": "relation_type is required for relation properties"})
        if property_type != IssueProperty.PropertyType.RELATION and relation_type:
            raise serializers.ValidationError({"relation_type": "relation_type is only valid for relation properties"})
        return attrs


class IssuePropertyValueSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyValue
        fields = [
            "id",
            "issue",
            "property",
            "value_text",
            "value_decimal",
            "value_boolean",
            "value_datetime",
            "value_uuid",
            "value_option",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


def property_value_to_raw(issue_property, row):
    """Serialize one IssuePropertyValue row back into the raw string the API accepts."""
    property_type = issue_property.property_type
    if property_type == IssueProperty.PropertyType.OPTION:
        return str(row.value_option_id) if row.value_option_id else None
    if property_type == IssueProperty.PropertyType.RELATION:
        return str(row.value_uuid) if row.value_uuid else None
    if property_type == IssueProperty.PropertyType.BOOLEAN:
        return "true" if row.value_boolean else "false"
    if property_type == IssueProperty.PropertyType.DECIMAL:
        return str(row.value_decimal) if row.value_decimal is not None else None
    if property_type == IssueProperty.PropertyType.DATETIME:
        return row.value_datetime.isoformat() if row.value_datetime else None
    return row.value_text


def validate_property_values(issue_property, values, options_by_id, member_ids):
    """Validate a list of raw string values for one property.

    Returns a list of dicts with the model field(s) to write per row.
    Raises ``serializers.ValidationError`` with a plain message on failure.
    """
    values = [v for v in (values or []) if v is not None and v != ""]

    if not issue_property.is_multi and len(values) > 1:
        raise serializers.ValidationError(f"{issue_property.display_name} accepts a single value")

    if issue_property.is_required and not values:
        raise serializers.ValidationError(f"{issue_property.display_name} is required")

    property_type = issue_property.property_type
    rows = []

    for value in values:
        if property_type == IssueProperty.PropertyType.TEXT:
            rows.append({"value_text": str(value)})
        elif property_type == IssueProperty.PropertyType.DECIMAL:
            try:
                rows.append({"value_decimal": float(value)})
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"{issue_property.display_name} expects a number")
        elif property_type == IssueProperty.PropertyType.BOOLEAN:
            normalized = str(value).lower()
            if normalized not in ("true", "false"):
                raise serializers.ValidationError(f"{issue_property.display_name} expects a boolean")
            rows.append({"value_boolean": normalized == "true"})
        elif property_type == IssueProperty.PropertyType.DATETIME:
            parsed = parse_datetime(str(value))
            if parsed is None:
                try:
                    parsed = datetime.fromisoformat(str(value))
                except ValueError:
                    raise serializers.ValidationError(f"{issue_property.display_name} expects a datetime")
            rows.append({"value_datetime": parsed})
        elif property_type == IssueProperty.PropertyType.OPTION:
            option = options_by_id.get(str(value))
            if option is None:
                raise serializers.ValidationError(f"Option is not valid for {issue_property.display_name}")
            rows.append({"value_option_id": option.id, "value_uuid": option.id})
        elif property_type == IssueProperty.PropertyType.RELATION:
            try:
                parsed_uuid = uuid_lib.UUID(str(value))
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"{issue_property.display_name} expects a uuid")
            if issue_property.relation_type == IssueProperty.RelationType.USER and parsed_uuid not in member_ids:
                raise serializers.ValidationError(
                    f"User is not a member of the project for {issue_property.display_name}"
                )
            rows.append({"value_uuid": parsed_uuid})
        else:
            raise serializers.ValidationError(f"Unsupported property type for {issue_property.display_name}")

    return rows


def project_member_ids(project_id):
    return set(ProjectMember.objects.filter(project_id=project_id, is_active=True).values_list("member_id", flat=True))
