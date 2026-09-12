# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import uuid
from datetime import datetime
from django.core.serializers.json import DjangoJSONEncoder

# Django imports
from django.db import connection
from django.db.models import (
    Exists,
    Max,
    OuterRef,
    Q,
    Value,
    UUIDField,
    Count,
    Case,
    When,
    IntegerField,
)
from django.http import StreamingHttpResponse
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models.functions import Coalesce

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_permission, ROLE
from plane.app.serializers import (
    PageSerializer,
    PageCollectionSerializer,
    PageDetailSerializer,
    PageBinaryUpdateSerializer,
)
from plane.db.models import (
    Page,
    PageCollection,
    PageLog,
    UserFavorite,
    ProjectMember,
    ProjectPage,
    Project,
    UserRecentVisit,
    Workspace,
    WorkspaceMember,
)
from plane.utils.error_codes import ERROR_CODES
from plane.utils.order_queryset import PAGE_ORDER_BY_ALLOWLIST, sanitize_order_by

# Local imports
from ..base import BaseAPIView, BaseViewSet
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.copy_s3_object import copy_s3_objects_of_description_and_assets
from plane.app.permissions import ProjectPagePermission, WorkspacePagePermission


def unarchive_archive_page_and_descendants(page_id, archived_at):
    # Your SQL query
    sql = """
    WITH RECURSIVE descendants AS (
        SELECT id FROM pages WHERE id = %s
        UNION ALL
        SELECT pages.id FROM pages, descendants WHERE pages.parent_id = descendants.id
    )
    UPDATE pages SET archived_at = %s WHERE id IN (SELECT id FROM descendants);
    """

    # Execute the SQL query
    with connection.cursor() as cursor:
        cursor.execute(sql, [page_id, archived_at])


def page_and_descendant_ids(page_id):
    """Return the page id and every descendant id (recursive CTE, self first)."""
    sql = """
    WITH RECURSIVE descendants AS (
        SELECT id FROM pages WHERE id = %s AND deleted_at IS NULL
        UNION ALL
        SELECT pages.id FROM pages, descendants
        WHERE pages.parent_id = descendants.id AND pages.deleted_at IS NULL
    )
    SELECT id FROM descendants;
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, [page_id])
        return [row[0] for row in cursor.fetchall()]


def parse_uuid(value):
    """Parse a uuid, returning None for anything malformed."""
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


class PageScopeMixin:
    """Project (`/projects/<id>/pages/`) vs workspace (`/pages/`, wiki) scoping.

    Wiki pages have no ProjectPage row, so the membership join goes through
    `workspace__workspace_member` and the rows are filtered by `is_global`.
    """

    scope = "project"

    def get_permissions(self):
        if self.scope == "workspace":
            return [WorkspacePagePermission()]
        return [ProjectPagePermission()]

    @property
    def is_workspace_scope(self):
        return self.scope == "workspace"

    def scoped_pages(self, slug, project_id):
        if self.is_workspace_scope:
            return Page.objects.filter(workspace__slug=slug, is_global=True)
        return Page.objects.filter(
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        )

    def get_page(self, slug, project_id, page_id):
        return self.scoped_pages(slug, project_id).get(pk=page_id)

    def is_admin(self, slug, project_id, user):
        if self.is_workspace_scope:
            return WorkspaceMember.objects.filter(workspace__slug=slug, member=user, role=20, is_active=True).exists()
        return ProjectMember.objects.filter(
            workspace__slug=slug, project_id=project_id, member=user, role=20, is_active=True
        ).exists()

    def can_manage_page(self, slug, project_id, page, user):
        """Archive/unarchive: the owner, or an admin of the enclosing scope."""
        return page.owned_by_id == user.id or self.is_admin(slug, project_id, user)

    def default_collection(self, slug):
        return PageCollection.objects.filter(workspace__slug=slug, is_default=True).first()


class PageViewSet(PageScopeMixin, BaseViewSet):
    serializer_class = PageSerializer
    model = Page
    permission_classes = [ProjectPagePermission]
    search_fields = ["name"]

    def get_queryset(self):
        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="page",
            entity_identifier=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
        )
        base = super().get_queryset().filter(workspace__slug=self.kwargs.get("slug"))
        if self.is_workspace_scope:
            # Wiki pages: workspace membership, no project join at all.
            base = base.filter(
                workspace__workspace_member__member=self.request.user,
                workspace__workspace_member__is_active=True,
                is_global=True,
            )
        else:
            base = base.filter(
                projects__project_projectmember__member=self.request.user,
                projects__project_projectmember__is_active=True,
                projects__archived_at__isnull=True,
                is_global=False,
            )
        queryset = self.filter_queryset(
            base.filter(Q(owned_by=self.request.user) | Q(access=0))
            .prefetch_related("projects")
            .select_related("workspace")
            .select_related("owned_by")
            .annotate(is_favorite=Exists(subquery))
            .prefetch_related("labels")
            # Sanitize the user-supplied order_by against an allowlist: Django
            # resolves the field at call time, so an unknown field raises
            # FieldError (500 DoS) and a relation path (e.g. owned_by__password)
            # enables ORM relational traversal. Favourites stay
            # pinned first; the sanitized user ordering is the secondary sort
            # (a single .order_by() so it is not overridden), with id as a
            # stable tiebreak for pagination.
            .order_by(
                "-is_favorite",
                sanitize_order_by(
                    self.request.GET.get("order_by", "-created_at"),
                    PAGE_ORDER_BY_ALLOWLIST,
                    default="-created_at",
                ),
                "id",
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .annotate(
                sub_pages_count=Count(
                    "child_page",
                    filter=Q(
                        child_page__deleted_at__isnull=True,
                        child_page__archived_at__isnull=True,
                    ),
                    distinct=True,
                )
            )
            .distinct()
        )
        if not self.is_workspace_scope:
            queryset = queryset.annotate(
                project=Exists(
                    ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=self.kwargs.get("project_id"))
                )
            ).filter(project=True)
        else:
            queryset = self.filter_by_collection(queryset)
        return self.filter_by_parent(queryset)

    def filter_by_collection(self, queryset):
        """`?collection=<uuid>` narrows a wiki listing to one collection."""
        collection = self.request.GET.get("collection")
        if not collection:
            return queryset
        collection_id = parse_uuid(collection)
        if collection_id is None:
            return queryset.none()
        return queryset.filter(collection_id=collection_id)

    def filter_by_parent(self, queryset):
        """`?parent=` selects the slice of the tree: absent/`all` → flat list of
        every page, `root` → top level only, `<uuid>` → direct children."""
        parent = self.request.GET.get("parent", "all")
        if not parent or parent == "all":
            return queryset
        if parent == "root":
            return queryset.filter(parent__isnull=True)
        parent_id = parse_uuid(parent)
        if parent_id is None:
            return queryset.none()
        return queryset.filter(parent_id=parent_id)

    def create(self, request, slug, project_id=None):
        serializer = PageSerializer(
            data=request.data,
            context={
                "project_id": project_id,
                "workspace_id": (
                    Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()
                    if self.is_workspace_scope
                    else None
                ),
                "owned_by_id": request.user.id,
                "description_json": request.data.get("description_json", {}),
                "description_binary": request.data.get("description_binary", None),
                "description_html": request.data.get("description_html", "<p></p>"),
            },
        )

        if serializer.is_valid():
            serializer.save()
            # capture the page transaction
            page_transaction.delay(
                new_description_html=request.data.get("description_html", "<p></p>"),
                old_description_html=None,
                page_id=serializer.data["id"],
            )
            page = self.get_queryset().get(pk=serializer.data["id"])
            serializer = PageDetailSerializer(page)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, project_id=None, page_id=None):
        try:
            page = self.get_page(slug, project_id, page_id)

            if page.is_locked:
                return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

            parent = request.data.get("parent", None)
            if parent:
                _ = self.get_page(slug, project_id, parent)

            # Only update access if the page owner is the requesting  user
            if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
                return Response(
                    {"error": "Access cannot be updated since this page is owned by someone else"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = PageDetailSerializer(page, data=request.data, partial=True)
            page_description = page.description_html
            if serializer.is_valid():
                serializer.save()
                # capture the page transaction
                if request.data.get("description_html"):
                    page_transaction.delay(
                        new_description_html=request.data.get("description_html", "<p></p>"),
                        old_description_html=page_description,
                        page_id=page_id,
                    )

                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Page.DoesNotExist:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def retrieve(self, request, slug, project_id=None, page_id=None):
        page = self.get_queryset().filter(pk=page_id).first()
        track_visit = request.query_params.get("track_visit", "true").lower() == "true"

        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the page
        """

        if (
            not self.is_workspace_scope
            and not Project.objects.filter(pk=project_id, guest_view_all_features=True).exists()
            and ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not page.owned_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue_ids = PageLog.objects.filter(page_id=page_id, entity_name="issue").values_list(
            "entity_identifier", flat=True
        )
        data = PageDetailSerializer(page).data
        data["issue_ids"] = issue_ids
        if track_visit:
            # `project_id` is None for wiki pages; UserRecentVisit allows it.
            recent_visited_task.delay(
                slug=slug,
                entity_name="page",
                entity_identifier=page_id,
                user_id=request.user.id,
                project_id=project_id,
            )
        return Response(data, status=status.HTTP_200_OK)

    def lock(self, request, slug, project_id=None, page_id=None):
        page = self.get_page(slug, project_id, page_id)

        page.is_locked = True
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def unlock(self, request, slug, project_id=None, page_id=None):
        page = self.get_page(slug, project_id, page_id)

        page.is_locked = False
        page.save()

        return Response(status=status.HTTP_204_NO_CONTENT)

    def access(self, request, slug, project_id=None, page_id=None):
        access = request.data.get("access", 0)
        page = self.get_page(slug, project_id, page_id)

        # Only update access if the page owner is the requesting user
        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.access = access
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def list(self, request, slug, project_id=None):
        queryset = self.get_queryset()
        if (
            not self.is_workspace_scope
            and not Project.objects.filter(pk=project_id, guest_view_all_features=True).exists()
            and ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
        ):
            queryset = queryset.filter(owned_by=request.user)
        pages = PageSerializer(queryset, many=True).data
        return Response(pages, status=status.HTTP_200_OK)

    def move(self, request, slug, project_id=None, page_id=None):
        """Re-parent a page and/or place it between its siblings."""
        page = self.get_page(slug, project_id, page_id)

        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

        # Cross-project move is a different operation (not implemented yet);
        # refuse instead of silently re-parenting the page to root.
        if request.data.get("new_project_id"):
            return Response(
                {"error": "Moving a page to another project is not supported"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parent_param = request.data.get("parent", None)
        parent = None
        if parent_param:
            parent_id = parse_uuid(parent_param)
            if parent_id is None:
                return Response({"error": "Invalid parent"}, status=status.HTTP_400_BAD_REQUEST)
            parent = self.scoped_pages(slug, project_id).filter(pk=parent_id).first()
            if parent is None:
                return Response({"error": "Parent page not found"}, status=status.HTTP_404_NOT_FOUND)
            if parent.archived_at:
                return Response(
                    {"error": "A page cannot be moved under an archived page"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Cycle guard: the target cannot be the page itself or one of its
            # descendants.
            if str(parent.id) in {str(pk) for pk in page_and_descendant_ids(page.id)}:
                return Response(
                    {"error": "A page cannot be moved under itself or one of its sub pages"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        sort_order = request.data.get("sort_order", None)
        if sort_order is None:
            last_sort_order = (
                self.scoped_pages(slug, project_id)
                .filter(parent=parent)
                .exclude(pk=page.id)
                .aggregate(max_order=Max("sort_order"))
                .get("max_order")
            )
            sort_order = (last_sort_order or 0) + Page.DEFAULT_SORT_ORDER
        else:
            try:
                sort_order = float(sort_order)
            except (TypeError, ValueError):
                return Response({"error": "Invalid sort_order"}, status=status.HTTP_400_BAD_REQUEST)

        collection = None
        collection_changed = False
        if self.is_workspace_scope and "collection" in request.data:
            collection_id = parse_uuid(request.data.get("collection"))
            if collection_id is None:
                return Response({"error": "Invalid collection"}, status=status.HTTP_400_BAD_REQUEST)
            collection = PageCollection.objects.filter(pk=collection_id, workspace__slug=slug).first()
            if collection is None:
                return Response({"error": "Collection not found"}, status=status.HTTP_404_NOT_FOUND)
            collection_changed = True

        page.parent = parent
        page.sort_order = sort_order
        update_fields = ["parent", "sort_order", "updated_at"]
        if collection_changed:
            page.collection = collection
            update_fields.append("collection")
        page.save(update_fields=update_fields)

        if collection_changed:
            # The whole subtree follows the page into the new collection.
            descendant_ids = [pk for pk in page_and_descendant_ids(page.id) if pk != page.id]
            if descendant_ids:
                Page.objects.filter(id__in=descendant_ids).update(collection=collection)

        moved_page = self.get_queryset().filter(pk=page.id).first()
        serializer = PageDetailSerializer(moved_page if moved_page is not None else page)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def archive(self, request, slug, project_id=None, page_id=None):
        page = self.get_page(slug, project_id, page_id)

        # only the owner or admin can archive the page
        if not self.can_manage_page(slug, project_id, page, request.user):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=page_id,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()

        unarchive_archive_page_and_descendants(page_id, datetime.now())

        return Response({"archived_at": str(datetime.now())}, status=status.HTTP_200_OK)

    def unarchive(self, request, slug, project_id=None, page_id=None):
        page = self.get_page(slug, project_id, page_id)

        # only the owner or admin can un archive the page
        if not self.can_manage_page(slug, project_id, page, request.user):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # if parent archived then page will be un archived breaking hierarchy
        if page.parent_id and page.parent.archived_at:
            page.parent = None
            page.save(update_fields=["parent"])

        unarchive_archive_page_and_descendants(page_id, None)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def destroy(self, request, slug, project_id=None, page_id=None):
        page = self.get_page(slug, project_id, page_id)

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.owned_by_id != request.user.id and not self.is_admin(slug, project_id, request.user):
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        cascade = request.query_params.get("cascade", "false").lower() == "true"

        if cascade:
            # Delete the whole subtree; the root is deleted below.
            deleted_ids = page_and_descendant_ids(page_id)
            for descendant in Page.objects.filter(id__in=deleted_ids).exclude(pk=page_id):
                descendant.delete()
        else:
            deleted_ids = [page.id]
            # remove parent from all the children
            _ = self.scoped_pages(slug, project_id).filter(parent_id=page_id).update(parent=None)

        page.delete()
        # Delete the user favorite pages
        UserFavorite.objects.filter(
            project=project_id,
            workspace__slug=slug,
            entity_identifier__in=deleted_ids,
            entity_type="page",
        ).delete()
        # Delete the pages from recent visit
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier__in=deleted_ids,
            entity_name="page",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def summary(self, request, slug, project_id=None):
        queryset = Page.objects.filter(workspace__slug=slug)
        if self.is_workspace_scope:
            queryset = queryset.filter(
                workspace__workspace_member__member=self.request.user,
                workspace__workspace_member__is_active=True,
                is_global=True,
            ).filter(Q(owned_by=request.user) | Q(access=0))
            queryset = self.filter_by_collection(queryset.distinct())
        else:
            queryset = (
                queryset.filter(
                    projects__project_projectmember__member=self.request.user,
                    projects__project_projectmember__is_active=True,
                    projects__archived_at__isnull=True,
                    is_global=False,
                )
                .filter(Q(owned_by=request.user) | Q(access=0))
                .annotate(
                    project=Exists(
                        ProjectPage.objects.filter(page_id=OuterRef("id"), project_id=self.kwargs.get("project_id"))
                    )
                )
                .filter(project=True)
                .distinct()
            )
        queryset = self.filter_by_parent(queryset)

        if (
            not self.is_workspace_scope
            and not Project.objects.filter(pk=project_id, guest_view_all_features=True).exists()
            and ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=ROLE.GUEST.value,
                is_active=True,
            ).exists()
        ):
            queryset = queryset.filter(owned_by=request.user)

        stats = queryset.aggregate(
            public_pages=Count(
                Case(
                    When(access=Page.PUBLIC_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            private_pages=Count(
                Case(
                    When(access=Page.PRIVATE_ACCESS, archived_at__isnull=True, then=1),
                    output_field=IntegerField(),
                )
            ),
            archived_pages=Count(Case(When(archived_at__isnull=False, then=1), output_field=IntegerField())),
        )

        return Response(stats, status=status.HTTP_200_OK)


class PageFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id=None, page_id=None):
        _ = UserFavorite.objects.create(
            project_id=project_id,
            entity_identifier=page_id,
            entity_type="page",
            user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id=None, page_id=None):
        page_favorite = UserFavorite.objects.get(
            project=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        )
        page_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspacePageFavoriteViewSet(BaseViewSet):
    """Favourite a wiki page: same rows as PageFavoriteViewSet, project_id null."""

    model = UserFavorite

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def create(self, request, slug, page_id):
        workspace_id = Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()
        _ = UserFavorite.objects.create(
            workspace_id=workspace_id,
            entity_identifier=page_id,
            entity_type="page",
            user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, page_id):
        page_favorite = UserFavorite.objects.get(
            project__isnull=True,
            user=request.user,
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
        )
        page_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PagesDescriptionViewSet(PageScopeMixin, BaseViewSet):
    permission_classes = [ProjectPagePermission]

    def get_description_page(self, slug, project_id, page_id):
        return self.scoped_pages(slug, project_id).get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
        )

    def retrieve(self, request, slug, project_id=None, page_id=None):
        page = self.get_description_page(slug, project_id, page_id)
        binary_data = page.description_binary

        def stream_data():
            if binary_data:
                yield binary_data
            else:
                yield b""

        response = StreamingHttpResponse(stream_data(), content_type="application/octet-stream")
        response["Content-Disposition"] = 'attachment; filename="page_description.bin"'
        return response

    def partial_update(self, request, slug, project_id=None, page_id=None):
        page = self.get_description_page(slug, project_id, page_id)

        if page.is_locked:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_LOCKED"],
                    "error_message": "PAGE_LOCKED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.archived_at:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_ARCHIVED"],
                    "error_message": "PAGE_ARCHIVED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store the old description_html before saving (needed for both tasks)
        old_description_html = page.description_html

        # Serialize the existing instance
        existing_instance = json.dumps({"description_html": old_description_html}, cls=DjangoJSONEncoder)

        # Use serializer for validation and update
        serializer = PageBinaryUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()

            # Capture the page transaction
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=page_id,
                )

            # Run background tasks
            track_page_version.delay(
                page_id=page_id,
                existing_instance=existing_instance,
                user_id=request.user.id,
            )
            return Response({"message": "Updated successfully"})
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PageDuplicateEndpoint(PageScopeMixin, BaseAPIView):
    permission_classes = [ProjectPagePermission]

    def copy_page(self, page, request, slug, project_id, name=None, parent_id=None):
        """Copy a single page row (with its project links and assets)."""
        # get all the project ids where page is present
        project_ids = list(ProjectPage.objects.filter(page_id=page.id).values_list("project_id", flat=True))
        description_html = page.description_html

        page.pk = None
        page.name = name if name is not None else page.name
        page.description_binary = None
        page.parent_id = parent_id
        page.owned_by = request.user
        page.created_by = request.user
        page.updated_by = request.user
        page.save()

        for page_project_id in project_ids:
            ProjectPage.objects.create(
                workspace_id=page.workspace_id,
                project_id=page_project_id,
                page_id=page.id,
                created_by_id=page.created_by_id,
                updated_by_id=page.updated_by_id,
            )

        page_transaction.delay(
            new_description_html=description_html,
            old_description_html=None,
            page_id=page.id,
        )

        # Copy the s3 objects uploaded in the page
        copy_s3_objects_of_description_and_assets.delay(
            entity_name="PAGE",
            entity_identifier=page.id,
            project_id=project_id,
            slug=slug,
            user_id=request.user.id,
        )
        return page

    def copy_subtree(self, source_id, request, slug, project_id, parent_id):
        """Copy the direct children of `source_id` recursively, keeping the tree shape."""
        children = self.scoped_pages(slug, project_id).filter(parent_id=source_id).order_by("sort_order")

        for child in children:
            child_id = child.id
            copied_child = self.copy_page(child, request, slug, project_id, parent_id=parent_id)
            self.copy_subtree(child_id, request, slug, project_id, copied_child.id)

    def post(self, request, slug, project_id=None, page_id=None):
        page = self.get_page(slug, project_id, page_id)

        # check for permission
        if page.access == Page.PRIVATE_ACCESS and page.owned_by_id != request.user.id:
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        include_children = request.query_params.get("include_children", "false").lower() == "true"

        copied_page = self.copy_page(
            page,
            request,
            slug,
            project_id,
            name=f"{page.name} (Copy)",
            parent_id=page.parent_id,
        )

        if include_children:
            self.copy_subtree(page_id, request, slug, project_id, copied_page.id)

        page = (
            Page.objects.filter(pk=copied_page.id)
            .annotate(
                project_ids=Coalesce(
                    ArrayAgg("projects__id", distinct=True, filter=~Q(projects__id=True)),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .first()
        )
        serializer = PageDetailSerializer(page)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PageCollectionViewSet(BaseViewSet):
    """Wiki collections: the folders workspace pages are grouped in."""

    serializer_class = PageCollectionSerializer
    model = PageCollection
    permission_classes = [WorkspacePagePermission]
    search_fields = ["name"]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(
                workspace__workspace_member__member=self.request.user,
                workspace__workspace_member__is_active=True,
            )
            .filter(Q(owned_by=self.request.user) | Q(access=PageCollection.PUBLIC_ACCESS))
            .select_related("workspace", "owned_by")
            .annotate(
                page_count=Count(
                    "pages",
                    filter=Q(pages__deleted_at__isnull=True, pages__archived_at__isnull=True),
                    distinct=True,
                )
            )
            .distinct()
            .order_by("-is_default", "sort_order", "id")
        )

    def is_workspace_admin(self, slug):
        return WorkspaceMember.objects.filter(
            workspace__slug=slug, member=self.request.user, role=20, is_active=True
        ).exists()

    def can_write(self, slug, collection):
        """Public collection → ADMIN/MEMBER (already gated), private → owner or admin."""
        if collection.access == PageCollection.PRIVATE_ACCESS:
            return collection.owned_by_id == self.request.user.id or self.is_workspace_admin(slug)
        return True

    def list(self, request, slug):
        return Response(PageCollectionSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PageCollectionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace_id=workspace.id, owned_by=request.user)
            collection = self.get_queryset().filter(pk=serializer.instance.id).first()
            return Response(
                PageCollectionSerializer(collection or serializer.instance).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, pk):
        collection = PageCollection.objects.get(pk=pk, workspace__slug=slug)
        if not self.can_write(slug, collection):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        serializer = PageCollectionSerializer(collection, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, slug, pk):
        collection = PageCollection.objects.get(pk=pk, workspace__slug=slug)
        if collection.is_default:
            return Response(
                {"error": "The default collection cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not self.can_write(slug, collection):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        # The pages survive the collection: they fall back to the default one.
        default_collection = PageCollection.objects.filter(workspace__slug=slug, is_default=True).first()
        Page.objects.filter(collection_id=collection.id).update(collection=default_collection)
        collection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PageMoveToWikiEndpoint(BaseAPIView):
    """Turn a project page (and its subtree) into a workspace (wiki) page."""

    permission_classes = [ProjectPagePermission]

    def post(self, request, slug, project_id, page_id):
        page = Page.objects.filter(
            pk=page_id,
            workspace__slug=slug,
            projects__id=project_id,
            project_pages__deleted_at__isnull=True,
        ).first()
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        if not WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role__in=[20, 15], is_active=True
        ).exists():
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        collection = None
        collection_param = request.data.get("collection")
        if collection_param:
            collection_id = parse_uuid(collection_param)
            if collection_id is None:
                return Response({"error": "Invalid collection"}, status=status.HTTP_400_BAD_REQUEST)
            collection = PageCollection.objects.filter(pk=collection_id, workspace__slug=slug).first()
            if collection is None:
                return Response({"error": "Collection not found"}, status=status.HTTP_404_NOT_FOUND)
        if collection is None:
            collection = PageCollection.objects.filter(workspace__slug=slug, is_default=True).first()

        moved_ids = page_and_descendant_ids(page.id)
        # The moved page becomes a wiki root; its children keep their parents.
        Page.objects.filter(id__in=moved_ids).update(is_global=True, collection=collection)
        Page.objects.filter(pk=page.id).update(parent=None)
        ProjectPage.objects.filter(page_id__in=moved_ids).delete()
        UserFavorite.objects.filter(entity_type="page", entity_identifier__in=moved_ids).update(project=None)

        page.refresh_from_db()
        return Response(PageDetailSerializer(page).data, status=status.HTTP_200_OK)


class PageMoveToProjectEndpoint(BaseAPIView):
    """Turn a workspace (wiki) page (and its subtree) into a project page."""

    permission_classes = [WorkspacePagePermission]

    def post(self, request, slug, page_id):
        page = Page.objects.filter(pk=page_id, workspace__slug=slug, is_global=True).first()
        if page is None or ProjectPage.objects.filter(page_id=page_id, deleted_at__isnull=True).exists():
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        project_id = parse_uuid(request.data.get("project_id"))
        if project_id is None:
            return Response({"error": "Invalid project"}, status=status.HTTP_400_BAD_REQUEST)

        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        # The caller has to be able to write both sides of the move.
        if not WorkspaceMember.objects.filter(
            workspace__slug=slug, member=request.user, role__in=[20, 15], is_active=True
        ).exists():
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        if not ProjectMember.objects.filter(
            project_id=project.id, member=request.user, role__in=[20, 15], is_active=True
        ).exists():
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        moved_ids = page_and_descendant_ids(page.id)
        # The moved page becomes a project page root; its children keep their parents.
        Page.objects.filter(id__in=moved_ids).update(is_global=False, collection=None)
        Page.objects.filter(pk=page.id).update(parent=None)
        existing_ids = set(
            ProjectPage.objects.filter(page_id__in=moved_ids, deleted_at__isnull=True).values_list("page_id", flat=True)
        )
        ProjectPage.objects.bulk_create(
            [
                ProjectPage(page_id=moved_id, project_id=project.id, workspace_id=page.workspace_id)
                for moved_id in moved_ids
                if moved_id not in existing_ids
            ]
        )
        UserFavorite.objects.filter(entity_type="page", entity_identifier__in=moved_ids).update(project=project)

        page.refresh_from_db()
        return Response(PageDetailSerializer(page).data, status=status.HTTP_200_OK)
