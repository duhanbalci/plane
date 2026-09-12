# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0127_wiki"),
    ]

    operations = [
        migrations.CreateModel(
            name="Template",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("description_html", models.TextField(blank=True, default="<p></p>")),
                (
                    "template_type",
                    models.CharField(
                        choices=[("workitem", "Work item"), ("project", "Project"), ("page", "Page")],
                        default="workitem",
                        max_length=255,
                    ),
                ),
                ("template_data", models.JSONField(default=dict)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Template",
                "verbose_name_plural": "Templates",
                "db_table": "templates",
                "ordering": ("name",),
            },
        ),
        migrations.AddConstraint(
            model_name="template",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("project__isnull", False)),
                fields=("workspace", "project", "template_type", "name"),
                name="template_unique_project_type_name_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="template",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("project__isnull", True)),
                fields=("workspace", "template_type", "name"),
                name="template_unique_workspace_type_name_when_deleted_at_null",
            ),
        ),
    ]
