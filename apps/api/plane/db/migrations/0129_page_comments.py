# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
import django.contrib.postgres.fields
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def base_fields():
    """The BaseModel columns every table below repeats."""
    return [
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
    ]


def audit_fields(model_name):
    return [
        (
            "created_by",
            models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name=f"{model_name}_created_by",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Created By",
            ),
        ),
        (
            "updated_by",
            models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name=f"{model_name}_updated_by",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Last Modified By",
            ),
        ),
    ]


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0128_templates"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PageComment",
            fields=base_fields()
            + [
                ("comment_stripped", models.TextField(blank=True, verbose_name="Comment")),
                ("comment_json", models.JSONField(blank=True, default=dict)),
                ("comment_html", models.TextField(blank=True, default="<p></p>")),
                (
                    "attachments",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.URLField(), blank=True, default=list, size=10
                    ),
                ),
                ("anchor", models.JSONField(blank=True, default=dict)),
                ("is_resolved", models.BooleanField(default=False)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
            ]
            + audit_fields("pagecomment")
            + [
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="page_comments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "resolved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="resolved_page_comments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "page",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="comments",
                        to="db.page",
                    ),
                ),
                (
                    "parent",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="replies",
                        to="db.pagecomment",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_comments",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Page Comment",
                "verbose_name_plural": "Page Comments",
                "db_table": "page_comments",
                "ordering": ("created_at",),
            },
        ),
        migrations.CreateModel(
            name="PageCommentReaction",
            fields=base_fields()
            + [("reaction", models.CharField(max_length=20))]
            + audit_fields("pagecommentreaction")
            + [
                (
                    "actor",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_comment_reactions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "comment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_comment_reactions",
                        to="db.pagecomment",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_comment_reactions",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Page Comment Reaction",
                "verbose_name_plural": "Page Comment Reactions",
                "db_table": "page_comment_reactions",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="pagecomment",
            index=models.Index(fields=["page", "created_at"], name="page_comment_page_created_idx"),
        ),
        migrations.AddConstraint(
            model_name="pagecommentreaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("comment", "actor", "reaction"),
                name="page_comment_reaction_unique_when_deleted_at_null",
            ),
        ),
    ]
