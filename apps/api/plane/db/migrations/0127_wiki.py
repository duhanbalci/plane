# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

DEFAULT_COLLECTION_NAME = "General"


def seed_default_collections(apps, schema_editor):
    """Give every existing workspace a default "General" collection."""
    Workspace = apps.get_model("db", "Workspace")
    PageCollection = apps.get_model("db", "PageCollection")

    existing = set(PageCollection.objects.filter(is_default=True).values_list("workspace_id", flat=True))
    collections = [
        PageCollection(
            workspace_id=workspace.id,
            name=DEFAULT_COLLECTION_NAME,
            owned_by_id=workspace.owner_id,
            is_default=True,
            sort_order=65535,
        )
        for workspace in Workspace.objects.all()
        if workspace.id not in existing
    ]
    PageCollection.objects.bulk_create(collections, batch_size=100)


def unseed_default_collections(apps, schema_editor):
    PageCollection = apps.get_model("db", "PageCollection")
    PageCollection.objects.filter(is_default=True, name=DEFAULT_COLLECTION_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0126_project_is_epic_enabled"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PageCollection",
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
                ("description", models.TextField(blank=True)),
                ("logo_props", models.JSONField(default=dict)),
                ("access", models.PositiveSmallIntegerField(choices=[(1, "Private"), (0, "Public")], default=0)),
                ("sort_order", models.FloatField(default=65535)),
                ("is_default", models.BooleanField(default=False)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pagecollection_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pagecollection_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "owned_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_collections",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="page_collections",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Page Collection",
                "verbose_name_plural": "Page Collections",
                "db_table": "page_collections",
                "ordering": ("sort_order",),
            },
        ),
        migrations.AddConstraint(
            model_name="pagecollection",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name"),
                name="page_collection_unique_workspace_name_when_deleted_at_null",
            ),
        ),
        migrations.AddField(
            model_name="page",
            name="collection",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pages",
                to="db.pagecollection",
            ),
        ),
        migrations.RunPython(seed_default_collections, unseed_default_collections),
    ]
