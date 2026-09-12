# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .workspace import WorkspaceBaseModel


class Template(WorkspaceBaseModel):
    """Reusable blueprint for creating entities; today only work items."""

    class TemplateType(models.TextChoices):
        WORKITEM = "workitem", "Work item"
        PROJECT = "project", "Project"
        PAGE = "page", "Page"

    name = models.CharField(max_length=255)
    description_html = models.TextField(blank=True, default="<p></p>")
    template_type = models.CharField(max_length=255, choices=TemplateType.choices, default=TemplateType.WORKITEM)
    template_data = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            # Project templates are unique per project, workspace templates per workspace.
            # Two constraints are needed because NULL project ids never compare equal in SQL.
            models.UniqueConstraint(
                fields=["workspace", "project", "template_type", "name"],
                condition=Q(deleted_at__isnull=True, project__isnull=False),
                name="template_unique_project_type_name_when_deleted_at_null",
            ),
            models.UniqueConstraint(
                fields=["workspace", "template_type", "name"],
                condition=Q(deleted_at__isnull=True, project__isnull=True),
                name="template_unique_workspace_type_name_when_deleted_at_null",
            ),
        ]
        verbose_name = "Template"
        verbose_name_plural = "Templates"
        db_table = "templates"
        ordering = ("name",)

    def __str__(self):
        return f"{self.template_type} - {self.name}"
