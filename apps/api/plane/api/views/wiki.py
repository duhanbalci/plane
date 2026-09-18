# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
The workspace wiki over the public v1 API.

These reuse the web app's wiki views, so who may read, edit, archive, lock or
delete what stays defined in one place, and swap in the v1 authentication
(API key or OAuth token, with the token's scope enforced). Two app behaviours
are unsafe for an API client and are overridden here:

- Content. The editor keeps a page in a Yjs document (``description_binary``)
  and only regenerates it from ``description_html`` when the binary is empty.
  Writing HTML alone would be invisible in the editor and overwritten by its
  next save, so content is written only through ``WikiPageContentAPIEndpoint``,
  which clears the binary.
- Structure. The app's PATCH accepts ``parent`` without the cycle and
  collection checks ``move`` makes, so re-parenting goes through ``move``.
"""

# Django imports
from django.db.models import Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.serializers import PageDetailSerializer, PageSerializer
from plane.app.views.page.base import (
    PageCollectionViewSet,
    PageDuplicateEndpoint,
    PageScopeMixin,
    PageViewSet,
    parse_uuid,
)
from plane.app.views.base import BaseAPIView as AppBaseAPIView
from plane.bgtasks.page_transaction_task import page_transaction
from plane.db.models import PageCollection, Workspace
from plane.utils.content_validator import validate_html_content

from .base import ExternalAPIAuthMixin

EMPTY_DOCUMENT = "<p></p>"

# What a page create accepts. The binary and JSON forms of the content are
# left out on purpose: the editor derives both from the HTML.
CREATE_FIELDS = ("name", "access", "collection", "parent", "color", "logo_props", "view_props")

# What a page PATCH accepts. Content and structure have their own endpoints.
UPDATE_FIELDS = {"name", "access", "color", "logo_props", "view_props"}


def sanitize_html(html):
    """Return (clean_html, error). An empty body becomes an empty paragraph."""
    if html is None or html == "":
        return EMPTY_DOCUMENT, None
    if not isinstance(html, str):
        return None, "description_html must be a string"
    is_valid, error, clean_html = validate_html_content(html)
    if not is_valid:
        return None, error
    return clean_html or EMPTY_DOCUMENT, None


def visible_collection(slug, collection, user):
    """Whether the user may file pages into this collection: theirs, or a public one."""
    collection_id = parse_uuid(collection)
    return (
        collection_id is not None
        and PageCollection.objects.filter(workspace__slug=slug, pk=collection_id)
        .filter(Q(owned_by=user) | Q(access=PageCollection.PUBLIC_ACCESS))
        .exists()
    )


class WikiCollectionViewSet(ExternalAPIAuthMixin, PageCollectionViewSet):
    """List, create, rename, reorder and delete wiki collections."""


class WikiPageViewSet(ExternalAPIAuthMixin, PageViewSet):
    """Wiki pages. Listing, reading, archive, lock, access and delete are the app's."""

    scope = "workspace"

    def create(self, request, slug, project_id=None):
        if "description_binary" in request.data or "description_json" in request.data:
            return Response(
                {"error": "Send the content as description_html only"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        description_html, error = sanitize_html(request.data.get("description_html"))
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        data = {field: request.data[field] for field in CREATE_FIELDS if field in request.data}
        workspace_id = Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()

        if data.get("parent"):
            parent_id = parse_uuid(data["parent"])
            parent = (
                self.scoped_pages(slug, None)
                .filter(Q(owned_by=request.user) | Q(access=0), pk=parent_id, archived_at__isnull=True)
                .first()
                if parent_id
                else None
            )
            if parent is None:
                return Response({"error": "Parent page not found"}, status=status.HTTP_404_NOT_FOUND)
            # A child lives in its parent's collection, as move keeps whole subtrees together.
            data["collection"] = parent.collection_id
        elif data.get("collection") and not visible_collection(slug, data["collection"], request.user):
            return Response({"error": "Collection not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = PageSerializer(
            data=data,
            context={
                "project_id": None,
                "workspace_id": workspace_id,
                "owned_by_id": request.user.id,
                "description_json": {},
                "description_binary": None,
                "description_html": description_html,
            },
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        page_transaction.delay(
            new_description_html=description_html,
            old_description_html=None,
            page_id=serializer.data["id"],
        )
        page = self.get_queryset().get(pk=serializer.data["id"])
        return Response(PageDetailSerializer(page).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, project_id=None, page_id=None):
        unsupported = sorted(set(request.data) - UPDATE_FIELDS)
        if unsupported:
            return Response(
                {
                    "error": f"Cannot update {', '.join(unsupported)} here. Change content through the "
                    "content endpoint, and parent or collection through move."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().partial_update(request, slug, project_id=project_id, page_id=page_id)

    def move(self, request, slug, project_id=None, page_id=None):
        # The app looks the target collection up without its access rule, which
        # would let a page (and its subtree) land in someone's private collection.
        if "collection" in request.data and not visible_collection(slug, request.data.get("collection"), request.user):
            return Response({"error": "Collection not found"}, status=status.HTTP_404_NOT_FOUND)
        return super().move(request, slug, project_id=project_id, page_id=page_id)


class WikiPageDuplicateAPIEndpoint(ExternalAPIAuthMixin, PageDuplicateEndpoint):
    """Copy a wiki page, optionally with its sub-pages."""

    scope = "workspace"


class WikiPageContentAPIEndpoint(ExternalAPIAuthMixin, PageScopeMixin, AppBaseAPIView):
    """Replace a wiki page's content with HTML."""

    scope = "workspace"

    def put(self, request, slug, page_id):
        page = self.scoped_pages(slug, None).filter(Q(owned_by=request.user) | Q(access=0), pk=page_id).first()
        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)
        if page.is_locked:
            return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)
        if page.archived_at:
            return Response({"error": "Page is archived"}, status=status.HTTP_400_BAD_REQUEST)
        if "description_html" not in request.data:
            return Response({"error": "description_html is required"}, status=status.HTTP_400_BAD_REQUEST)

        description_html, error = sanitize_html(request.data.get("description_html"))
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        old_description_html = page.description_html
        page.description_html = description_html
        # Drop the editor's document so it is rebuilt from this HTML when the
        # page is next opened; kept, it would hide the change and overwrite it.
        page.description_binary = None
        page.description_json = {}
        page.save()

        page_transaction.delay(
            new_description_html=description_html,
            old_description_html=old_description_html,
            page_id=str(page.id),
        )
        return Response(PageDetailSerializer(page).data, status=status.HTTP_200_OK)
