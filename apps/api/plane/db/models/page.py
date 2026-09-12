# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.conf import settings
from django.utils import timezone

# Django imports
from django.contrib.postgres.fields import ArrayField
from django.db import models

# Module imports
from plane.utils.html_processor import strip_tags

from .base import BaseModel


def get_view_props():
    return {"full_width": False}


class PageCollection(BaseModel):
    """A folder grouping workspace (wiki) pages."""

    PRIVATE_ACCESS = 1
    PUBLIC_ACCESS = 0

    ACCESS_CHOICES = ((PRIVATE_ACCESS, "Private"), (PUBLIC_ACCESS, "Public"))
    DEFAULT_SORT_ORDER = 65535

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_collections")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    access = models.PositiveSmallIntegerField(choices=ACCESS_CHOICES, default=PUBLIC_ACCESS)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="page_collections")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Page Collection"
        verbose_name_plural = "Page Collections"
        db_table = "page_collections"
        ordering = ("sort_order",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="page_collection_unique_workspace_name_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            # Label-style auto bump so a new collection lands at the end.
            last_order = PageCollection.objects.filter(workspace=self.workspace).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last_order is not None:
                self.sort_order = last_order + 10000
        super(PageCollection, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.workspace.name} <{self.name}>"


class Page(BaseModel):
    PRIVATE_ACCESS = 1
    PUBLIC_ACCESS = 0
    DEFAULT_SORT_ORDER = 65535

    ACCESS_CHOICES = ((PRIVATE_ACCESS, "Private"), (PUBLIC_ACCESS, "Public"))

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pages")
    name = models.TextField(blank=True)
    description_json = models.JSONField(default=dict, blank=True)
    description_binary = models.BinaryField(null=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pages")
    access = models.PositiveSmallIntegerField(choices=((0, "Public"), (1, "Private")), default=0)
    color = models.CharField(max_length=255, blank=True)
    labels = models.ManyToManyField("db.Label", blank=True, related_name="pages", through="db.PageLabel")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_page",
    )
    archived_at = models.DateField(null=True)
    is_locked = models.BooleanField(default=False)
    view_props = models.JSONField(default=get_view_props)
    logo_props = models.JSONField(default=dict)
    is_global = models.BooleanField(default=False)
    # Wiki pages (is_global=True) live in a collection; project pages keep it null.
    collection = models.ForeignKey(
        "db.PageCollection",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pages",
    )
    projects = models.ManyToManyField("db.Project", related_name="pages", through="db.ProjectPage")
    moved_to_page = models.UUIDField(null=True, blank=True)
    moved_to_project = models.UUIDField(null=True, blank=True)
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER)

    external_id = models.CharField(max_length=255, null=True, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Page"
        verbose_name_plural = "Pages"
        db_table = "pages"
        ordering = ("-created_at",)
        indexes = [
            # Sibling lookups for the nested page tree.
            models.Index(fields=["parent", "sort_order"], name="page_parent_sort_order_idx")
        ]

    def __str__(self):
        """Return owner email and page name"""
        return f"{self.owned_by.email} <{self.name}>"

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(Page, self).save(*args, **kwargs)


class PageLog(BaseModel):
    TYPE_CHOICES = (
        ("to_do", "To Do"),
        ("issue", "issue"),
        ("image", "Image"),
        ("video", "Video"),
        ("file", "File"),
        ("link", "Link"),
        ("cycle", "Cycle"),
        ("module", "Module"),
        ("back_link", "Back Link"),
        ("forward_link", "Forward Link"),
        ("page_mention", "Page Mention"),
        ("user_mention", "User Mention"),
        ("page_embed", "Page Embed"),
        ("attachment", "Attachment"),
    )
    transaction = models.UUIDField(default=uuid.uuid4)
    page = models.ForeignKey(Page, related_name="page_log", on_delete=models.CASCADE)
    entity_identifier = models.UUIDField(null=True, blank=True)
    entity_name = models.CharField(max_length=30, verbose_name="Transaction Type")
    entity_type = models.CharField(max_length=30, verbose_name="Entity Type", null=True, blank=True)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_log")

    class Meta:
        unique_together = ["page", "transaction"]
        verbose_name = "Page Log"
        verbose_name_plural = "Page Logs"
        db_table = "page_logs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["entity_type"], name="pagelog_entity_type_idx"),
            models.Index(fields=["entity_identifier"], name="pagelog_entity_id_idx"),
            models.Index(fields=["entity_name"], name="pagelog_entity_name_idx"),
            models.Index(fields=["entity_type", "entity_identifier"], name="pagelog_type_id_idx"),
            models.Index(fields=["entity_name", "entity_identifier"], name="pagelog_name_id_idx"),
        ]

    def __str__(self):
        return f"{self.page.name} {self.entity_name}"


class PageLabel(BaseModel):
    label = models.ForeignKey("db.Label", on_delete=models.CASCADE, related_name="page_labels")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="page_labels")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_label")

    class Meta:
        verbose_name = "Page Label"
        verbose_name_plural = "Page Labels"
        db_table = "page_labels"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.page.name} {self.label.name}"


class ProjectPage(BaseModel):
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="project_pages")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="project_pages")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_pages")

    class Meta:
        unique_together = ["project", "page", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "page"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_page_unique_project_page_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Page"
        verbose_name_plural = "Project Pages"
        db_table = "project_pages"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name} {self.page.name}"


class PageVersion(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_versions")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="page_versions")
    last_saved_at = models.DateTimeField(default=timezone.now)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="page_versions")
    description_binary = models.BinaryField(null=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    description_json = models.JSONField(default=dict, blank=True)
    sub_pages_data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Page Version"
        verbose_name_plural = "Page Versions"
        db_table = "page_versions"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(PageVersion, self).save(*args, **kwargs)


class PageComment(BaseModel):
    """An inline comment thread anchored to a range of a page's document."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_comments")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="comments")
    # System generated comments have no actor.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="page_comments",
        null=True,
        blank=True,
    )
    comment_stripped = models.TextField(verbose_name="Comment", blank=True)
    comment_json = models.JSONField(blank=True, default=dict)
    comment_html = models.TextField(blank=True, default="<p></p>")
    attachments = ArrayField(models.URLField(), size=10, blank=True, default=list)
    # Replies point at the thread root.
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    # {"mark_id": str, "block_id": str | None, "quoted_text": str}
    anchor = models.JSONField(default=dict, blank=True)
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="resolved_page_comments",
        null=True,
        blank=True,
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Page Comment"
        verbose_name_plural = "Page Comments"
        db_table = "page_comments"
        ordering = ("created_at",)
        indexes = [models.Index(fields=["page", "created_at"], name="page_comment_page_created_idx")]

    def save(self, *args, **kwargs):
        self.comment_stripped = strip_tags(self.comment_html) if self.comment_html else ""
        super(PageComment, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.page.name} <{self.id}>"


class PageCommentReaction(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_comment_reactions")
    comment = models.ForeignKey(
        "db.PageComment",
        on_delete=models.CASCADE,
        related_name="page_comment_reactions",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="page_comment_reactions",
    )
    reaction = models.CharField(max_length=20)

    class Meta:
        verbose_name = "Page Comment Reaction"
        verbose_name_plural = "Page Comment Reactions"
        db_table = "page_comment_reactions"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "actor", "reaction"],
                condition=models.Q(deleted_at__isnull=True),
                name="page_comment_reaction_unique_when_deleted_at_null",
            )
        ]

    def __str__(self):
        return f"{self.comment_id} {self.reaction}"
