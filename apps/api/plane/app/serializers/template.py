# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid as uuid_lib

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    Label,
    Module,
    ProjectIssueType,
    ProjectMember,
    State,
    Template,
)

PRIORITIES = ["urgent", "high", "medium", "low", "none"]

WORK_ITEM_KEYS = {
    "name",
    "description_html",
    "type_id",
    "state_id",
    "priority",
    "label_ids",
    "assignee_ids",
    "module_ids",
    "properties",
    "sub_work_items",
}

SUB_WORK_ITEM_KEYS = {"name", "type_id", "priority", "label_ids", "assignee_ids", "properties"}


def _as_uuid(value):
    """Return the canonical string form of a uuid, else None."""
    if not value:
        return None
    try:
        return str(uuid_lib.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def _clean_id_list(value, field):
    if not isinstance(value, list):
        raise serializers.ValidationError({field: "Must be a list of ids"})
    cleaned = []
    for item in value:
        parsed = _as_uuid(item)
        if parsed is None:
            raise serializers.ValidationError({field: f"Invalid id: {item}"})
        if parsed not in cleaned:
            cleaned.append(parsed)
    return cleaned


def _clean_properties(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError({"properties": "Must be an object keyed by property id"})
    cleaned = {}
    for property_id, values in value.items():
        parsed = _as_uuid(property_id)
        if parsed is None:
            raise serializers.ValidationError({"properties": f"Invalid property id: {property_id}"})
        if not isinstance(values, list) or any(not isinstance(item, str) for item in values):
            raise serializers.ValidationError({"properties": "Property values must be a list of strings"})
        cleaned[parsed] = values
    return cleaned


def _clean_priority(value):
    if value is None:
        return "none"
    if value not in PRIORITIES:
        raise serializers.ValidationError({"priority": f"Invalid priority: {value}"})
    return value


def _clean_optional_id(value, field):
    if value in (None, ""):
        return None
    parsed = _as_uuid(value)
    if parsed is None:
        raise serializers.ValidationError({field: f"Invalid id: {value}"})
    return parsed


def clean_work_item_template_data(data):
    """Validate the work item template payload; unknown keys are rejected."""
    if not isinstance(data, dict):
        raise serializers.ValidationError({"template_data": "Must be an object"})

    unknown = set(data.keys()) - WORK_ITEM_KEYS
    if unknown:
        raise serializers.ValidationError({"template_data": f"Unknown keys: {', '.join(sorted(unknown))}"})

    name = data.get("name", "")
    description_html = data.get("description_html", "<p></p>")
    if not isinstance(name, str) or not isinstance(description_html, str):
        raise serializers.ValidationError({"template_data": "name and description_html must be strings"})

    cleaned = {
        "name": name,
        "description_html": description_html,
        "type_id": _clean_optional_id(data.get("type_id"), "type_id"),
        "state_id": _clean_optional_id(data.get("state_id"), "state_id"),
        "priority": _clean_priority(data.get("priority", "none")),
        "label_ids": _clean_id_list(data.get("label_ids", []), "label_ids"),
        "assignee_ids": _clean_id_list(data.get("assignee_ids", []), "assignee_ids"),
        "module_ids": _clean_id_list(data.get("module_ids", []), "module_ids"),
        "properties": _clean_properties(data.get("properties", {})),
        "sub_work_items": [],
    }

    sub_work_items = data.get("sub_work_items", [])
    if not isinstance(sub_work_items, list):
        raise serializers.ValidationError({"sub_work_items": "Must be a list"})
    for sub in sub_work_items:
        if not isinstance(sub, dict):
            raise serializers.ValidationError({"sub_work_items": "Each entry must be an object"})
        unknown = set(sub.keys()) - SUB_WORK_ITEM_KEYS
        if unknown:
            raise serializers.ValidationError({"sub_work_items": f"Unknown keys: {', '.join(sorted(unknown))}"})
        sub_name = sub.get("name", "")
        if not isinstance(sub_name, str) or not sub_name.strip():
            raise serializers.ValidationError({"sub_work_items": "name is required"})
        cleaned["sub_work_items"].append(
            {
                "name": sub_name,
                "type_id": _clean_optional_id(sub.get("type_id"), "type_id"),
                "priority": _clean_priority(sub.get("priority", "none")),
                "label_ids": _clean_id_list(sub.get("label_ids", []), "label_ids"),
                "assignee_ids": _clean_id_list(sub.get("assignee_ids", []), "assignee_ids"),
                "properties": _clean_properties(sub.get("properties", {})),
            }
        )

    return cleaned


def resolve_work_item_template_data(data, project_id):
    """Drop ids that no longer exist or no longer belong to the project."""
    if not isinstance(data, dict) or not project_id:
        return data

    label_ids = {str(id) for id in Label.objects.filter(project_id=project_id).values_list("id", flat=True)}
    module_ids = {str(id) for id in Module.objects.filter(project_id=project_id).values_list("id", flat=True)}
    state_ids = {str(id) for id in State.objects.filter(project_id=project_id).values_list("id", flat=True)}
    member_ids = {
        str(id)
        for id in ProjectMember.objects.filter(project_id=project_id, is_active=True).values_list(
            "member_id", flat=True
        )
    }
    type_ids = {
        str(id)
        for id in ProjectIssueType.objects.filter(project_id=project_id).values_list("issue_type_id", flat=True)
    }
    properties = {
        str(property_id): property_type
        for property_id, property_type in IssueProperty.objects.filter(
            issue_type_id__in=type_ids or []
        ).values_list("id", "property_type")
    }
    option_ids = {
        str(id)
        for id in IssuePropertyOption.objects.filter(property_id__in=list(properties.keys()) or []).values_list(
            "id", flat=True
        )
    }

    def resolve_properties(values):
        resolved = {}
        for property_id, property_values in (values or {}).items():
            property_type = properties.get(property_id)
            if property_type is None:
                continue
            if property_type == IssueProperty.PropertyType.OPTION:
                property_values = [value for value in property_values if value in option_ids]
                if not property_values:
                    continue
            if property_type == IssueProperty.PropertyType.RELATION:
                property_values = [value for value in property_values if value in member_ids]
                if not property_values:
                    continue
            resolved[property_id] = property_values
        return resolved

    resolved = dict(data)
    resolved["type_id"] = data.get("type_id") if data.get("type_id") in type_ids else None
    resolved["state_id"] = data.get("state_id") if data.get("state_id") in state_ids else None
    resolved["label_ids"] = [id for id in data.get("label_ids", []) if id in label_ids]
    resolved["assignee_ids"] = [id for id in data.get("assignee_ids", []) if id in member_ids]
    resolved["module_ids"] = [id for id in data.get("module_ids", []) if id in module_ids]
    resolved["properties"] = resolve_properties(data.get("properties", {}))
    resolved["sub_work_items"] = [
        {
            **sub,
            "type_id": sub.get("type_id") if sub.get("type_id") in type_ids else None,
            "label_ids": [id for id in sub.get("label_ids", []) if id in label_ids],
            "assignee_ids": [id for id in sub.get("assignee_ids", []) if id in member_ids],
            "properties": resolve_properties(sub.get("properties", {})),
        }
        for sub in data.get("sub_work_items", [])
    ]
    return resolved


class TemplateSerializer(BaseSerializer):
    source = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = [
            "id",
            "name",
            "description_html",
            "template_type",
            "template_data",
            "is_active",
            "workspace",
            "project",
            "source",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "source",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_source(self, obj):
        return "workspace" if obj.project_id is None else "project"

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Template name is required")
        return value

    def validate(self, attrs):
        template_type = attrs.get(
            "template_type",
            getattr(self.instance, "template_type", Template.TemplateType.WORKITEM),
        )
        if "template_data" in attrs:
            if template_type == Template.TemplateType.WORKITEM:
                attrs["template_data"] = clean_work_item_template_data(attrs["template_data"])
            elif not isinstance(attrs["template_data"], dict):
                raise serializers.ValidationError({"template_data": "Must be an object"})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Project templates are resolved against their own project; workspace templates
        # carry no project scope, so the frontend resolves them at apply time.
        if instance.template_type == Template.TemplateType.WORKITEM and instance.project_id:
            data["template_data"] = resolve_work_item_template_data(
                data.get("template_data") or {}, instance.project_id
            )
        return data
