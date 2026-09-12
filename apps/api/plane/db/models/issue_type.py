# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel
from .base import BaseModel
from .workspace import WorkspaceBaseModel


class IssueType(BaseModel):
    workspace = models.ForeignKey("db.Workspace", related_name="issue_types", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    is_epic = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    level = models.FloatField(default=0)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Issue Type"
        verbose_name_plural = "Issue Types"
        db_table = "issue_types"

    def __str__(self):
        return self.name


class ProjectIssueType(ProjectBaseModel):
    issue_type = models.ForeignKey("db.IssueType", related_name="project_issue_types", on_delete=models.CASCADE)
    level = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)

    class Meta:
        unique_together = ["project", "issue_type", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type"],
                condition=Q(deleted_at__isnull=True),
                name="project_issue_type_unique_project_issue_type_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Issue Type"
        verbose_name_plural = "Project Issue Types"
        db_table = "project_issue_types"
        ordering = ("project", "issue_type")

    def __str__(self):
        return f"{self.project} - {self.issue_type}"


class IssueProperty(WorkspaceBaseModel):
    """Custom property definition attached to an issue type."""

    class PropertyType(models.TextChoices):
        TEXT = "text", "Text"
        DECIMAL = "decimal", "Decimal"
        OPTION = "option", "Option"
        BOOLEAN = "boolean", "Boolean"
        DATETIME = "datetime", "Datetime"
        RELATION = "relation", "Relation"

    class RelationType(models.TextChoices):
        USER = "user", "User"

    issue_type = models.ForeignKey("db.IssueType", related_name="properties", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    property_type = models.CharField(max_length=255, choices=PropertyType.choices, default=PropertyType.TEXT)
    relation_type = models.CharField(max_length=255, choices=RelationType.choices, null=True, blank=True)
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_multi = models.BooleanField(default=False)
    default_value = ArrayField(models.TextField(), blank=True, default=list)
    settings = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)
    logo_props = models.JSONField(default=dict)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_unique_issue_type_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Property"
        verbose_name_plural = "Issue Properties"
        db_table = "issue_properties"
        ordering = ("sort_order",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            # Push the new property to the end of its issue type's list
            last_id = IssueProperty.objects.filter(issue_type=self.issue_type).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last_id is not None:
                self.sort_order = last_id + 10000
        super(IssueProperty, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.issue_type} - {self.display_name}"


class IssuePropertyOption(WorkspaceBaseModel):
    """Selectable option of an `option` typed property."""

    property = models.ForeignKey("db.IssueProperty", related_name="options", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["property", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_option_unique_property_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Property Option"
        verbose_name_plural = "Issue Property Options"
        db_table = "issue_property_options"
        ordering = ("sort_order",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            last_id = IssuePropertyOption.objects.filter(property=self.property).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last_id is not None:
                self.sort_order = last_id + 10000
        super(IssuePropertyOption, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.property} - {self.name}"


class IssuePropertyValue(WorkspaceBaseModel):
    """One value of one property on one issue. Multi-select writes several rows."""

    issue = models.ForeignKey("db.Issue", related_name="property_values", on_delete=models.CASCADE)
    property = models.ForeignKey("db.IssueProperty", related_name="values", on_delete=models.CASCADE)
    value_text = models.TextField(blank=True, default="")
    value_decimal = models.FloatField(null=True, blank=True)
    value_boolean = models.BooleanField(default=False)
    value_datetime = models.DateTimeField(null=True, blank=True)
    # Holds an option id or a user id depending on the property type
    value_uuid = models.UUIDField(null=True, blank=True)
    value_option = models.ForeignKey(
        "db.IssuePropertyOption",
        related_name="property_values",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        indexes = [models.Index(fields=["issue", "property"], name="issue_property_value_idx")]
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"
        db_table = "issue_property_values"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue} - {self.property}"
