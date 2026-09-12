# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for nested pages (Faz E).

Covers the `?parent=` list slices, the move endpoint (happy path, cycle guard,
archived parent), cascade delete and the `sub_pages_count` annotation.
"""

from datetime import datetime

import pytest
from rest_framework import status

from plane.db.models import Page, Project, ProjectMember, ProjectPage


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="P", identifier="NST", workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def make_page(db, workspace, project, create_user):
    def _make_page(name, parent=None, archived_at=None, sort_order=65535):
        page = Page.objects.create(
            workspace=workspace,
            owned_by=create_user,
            access=Page.PUBLIC_ACCESS,
            name=name,
            parent=parent,
            archived_at=archived_at,
            sort_order=sort_order,
        )
        ProjectPage.objects.create(workspace=workspace, project=project, page=page)
        return page

    return _make_page


def _pages_url(slug, project_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/"


def _page_url(slug, project_id, page_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/"


def _move_url(slug, project_id, page_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/move/"


@pytest.mark.contract
class TestNestedPageList:
    @pytest.mark.django_db
    def test_list_defaults_to_flat_tree(self, session_client, workspace, project, make_page):
        root = make_page("root")
        child = make_page("child", parent=root)

        response = session_client.get(_pages_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        pages = {p["id"]: p for p in response.json()}
        assert {str(root.id), str(child.id)} == set(pages.keys())
        assert pages[str(child.id)]["parent"] == str(root.id)

    @pytest.mark.django_db
    def test_list_root_only(self, session_client, workspace, project, make_page):
        root = make_page("root")
        make_page("child", parent=root)

        response = session_client.get(_pages_url(workspace.slug, project.id), {"parent": "root"})

        assert response.status_code == status.HTTP_200_OK
        assert [p["id"] for p in response.json()] == [str(root.id)]

    @pytest.mark.django_db
    def test_list_children_of_page(self, session_client, workspace, project, make_page):
        root = make_page("root")
        child = make_page("child", parent=root)
        make_page("other root")

        response = session_client.get(_pages_url(workspace.slug, project.id), {"parent": str(root.id)})

        assert response.status_code == status.HTTP_200_OK
        assert [p["id"] for p in response.json()] == [str(child.id)]

    @pytest.mark.django_db
    def test_list_invalid_parent_is_empty(self, session_client, workspace, project, make_page):
        make_page("root")

        response = session_client.get(_pages_url(workspace.slug, project.id), {"parent": "not-a-uuid"})

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    @pytest.mark.django_db
    def test_sub_pages_count(self, session_client, workspace, project, make_page):
        root = make_page("root")
        make_page("child", parent=root)
        make_page("archived child", parent=root, archived_at=datetime.now().date())

        response = session_client.get(_pages_url(workspace.slug, project.id), {"parent": "root"})

        assert response.status_code == status.HTTP_200_OK
        # Archived children are not counted.
        assert [p["sub_pages_count"] for p in response.json()] == [1]


@pytest.mark.contract
class TestNestedPageMove:
    @pytest.mark.django_db
    def test_move_under_parent(self, session_client, workspace, project, make_page):
        parent = make_page("parent", sort_order=1000)
        make_page("sibling", parent=parent, sort_order=1000)
        page = make_page("page")

        response = session_client.post(
            _move_url(workspace.slug, project.id, page.id), {"parent": str(parent.id)}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["parent"] == str(parent.id)
        page.refresh_from_db()
        assert page.parent_id == parent.id
        # Placed after the last sibling.
        assert page.sort_order == 1000 + Page.DEFAULT_SORT_ORDER

    @pytest.mark.django_db
    def test_move_to_root_with_sort_order(self, session_client, workspace, project, make_page):
        parent = make_page("parent")
        page = make_page("page", parent=parent)

        response = session_client.post(
            _move_url(workspace.slug, project.id, page.id), {"parent": None, "sort_order": 42.5}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.parent_id is None
        assert page.sort_order == 42.5

    @pytest.mark.django_db
    def test_move_into_own_descendant_rejected(self, session_client, workspace, project, make_page):
        root = make_page("root")
        child = make_page("child", parent=root)
        grand_child = make_page("grand child", parent=child)

        response = session_client.post(
            _move_url(workspace.slug, project.id, root.id), {"parent": str(grand_child.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        root.refresh_from_db()
        assert root.parent_id is None

    @pytest.mark.django_db
    def test_move_into_itself_rejected(self, session_client, workspace, project, make_page):
        page = make_page("page")

        response = session_client.post(
            _move_url(workspace.slug, project.id, page.id), {"parent": str(page.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_move_into_archived_parent_rejected(self, session_client, workspace, project, make_page):
        archived = make_page("archived", archived_at=datetime.now().date())
        page = make_page("page")

        response = session_client.post(
            _move_url(workspace.slug, project.id, page.id), {"parent": str(archived.id)}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.parent_id is None


@pytest.mark.contract
class TestNestedPageDelete:
    @pytest.mark.django_db
    def test_delete_orphans_children_by_default(self, session_client, workspace, project, make_page):
        root = make_page("root", archived_at=datetime.now().date())
        child = make_page("child", parent=root, archived_at=datetime.now().date())

        response = session_client.delete(_page_url(workspace.slug, project.id, root.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        child.refresh_from_db()
        assert child.parent_id is None
        assert child.deleted_at is None

    @pytest.mark.django_db
    def test_cascade_delete_removes_subtree(self, session_client, workspace, project, make_page):
        root = make_page("root", archived_at=datetime.now().date())
        child = make_page("child", parent=root, archived_at=datetime.now().date())
        grand_child = make_page("grand child", parent=child, archived_at=datetime.now().date())

        response = session_client.delete(_page_url(workspace.slug, project.id, root.id) + "?cascade=true")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(id__in=[root.id, child.id, grand_child.id]).exists()
        # Soft delete only.
        soft_deleted = Page.all_objects.filter(
            id__in=[root.id, child.id, grand_child.id], deleted_at__isnull=False
        )
        assert soft_deleted.count() == 3
