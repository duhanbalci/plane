# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for the workspace wiki (Faz F).

Covers workspace-scoped page CRUD, the project/workspace scope split, private
page visibility, collection CRUD (delete falls back to the default collection),
cross-collection moves carrying the subtree, guest write denial and the
"move to wiki" endpoint.
"""

from datetime import datetime

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Page,
    PageCollection,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    WorkspaceMember,
)


@pytest.fixture
def default_collection(db, workspace, create_user):
    """The "General" collection every workspace is created with."""
    return PageCollection.objects.create(
        workspace=workspace,
        name="General",
        owned_by=create_user,
        is_default=True,
    )


@pytest.fixture
def other_collection(db, workspace, create_user):
    return PageCollection.objects.create(workspace=workspace, name="Handbook", owned_by=create_user)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="P", identifier="WIK", workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def make_wiki_page(db, workspace, create_user, default_collection):
    def _make(name, parent=None, collection=None, access=Page.PUBLIC_ACCESS, owned_by=None, archived_at=None):
        return Page.objects.create(
            workspace=workspace,
            owned_by=owned_by or create_user,
            access=access,
            name=name,
            parent=parent,
            archived_at=archived_at,
            is_global=True,
            collection=collection or default_collection,
        )

    return _make


@pytest.fixture
def member_client(db, workspace):
    """A second, non-owner workspace MEMBER."""
    user = User.objects.create(email="member@plane.so", username="wiki_member", first_name="Mem")
    user.set_password("member-password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def guest_client(db, workspace):
    user = User.objects.create(email="guest@plane.so", username="wiki_guest", first_name="Gue")
    user.set_password("guest-password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def outsider_client(db):
    user = User.objects.create(email="outsider@plane.so", username="wiki_outsider", first_name="Out")
    user.set_password("outsider-password")
    user.save()
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _pages_url(slug):
    return f"/api/workspaces/{slug}/pages/"


def _page_url(slug, page_id):
    return f"/api/workspaces/{slug}/pages/{page_id}/"


def _move_url(slug, page_id):
    return f"/api/workspaces/{slug}/pages/{page_id}/move/"


def _collections_url(slug):
    return f"/api/workspaces/{slug}/page-collections/"


def _collection_url(slug, collection_id):
    return f"/api/workspaces/{slug}/page-collections/{collection_id}/"


@pytest.mark.contract
class TestWikiPageCreate:
    @pytest.mark.django_db
    def test_create_without_project_lands_in_default_collection(self, session_client, workspace, default_collection):
        response = session_client.post(_pages_url(workspace.slug), {"name": "Handbook"}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["collection"] == str(default_collection.id)
        assert body["is_global"] is True
        page = Page.objects.get(pk=body["id"])
        assert page.is_global is True
        assert not ProjectPage.objects.filter(page_id=page.id).exists()

    @pytest.mark.django_db
    def test_create_in_given_collection(self, session_client, workspace, default_collection, other_collection):
        response = session_client.post(
            _pages_url(workspace.slug),
            {"name": "Runbook", "collection": str(other_collection.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["collection"] == str(other_collection.id)


@pytest.mark.contract
class TestWikiPageList:
    @pytest.mark.django_db
    def test_list_for_member(self, member_client, workspace, make_wiki_page):
        page = make_wiki_page("shared")

        response = member_client.get(_pages_url(workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        assert [p["id"] for p in response.json()] == [str(page.id)]

    @pytest.mark.django_db
    def test_list_denied_for_non_member(self, outsider_client, workspace, make_wiki_page):
        make_wiki_page("shared")

        response = outsider_client.get(_pages_url(workspace.slug))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_private_page_hidden_from_other_member(self, member_client, workspace, make_wiki_page):
        private_page = make_wiki_page("secret", access=Page.PRIVATE_ACCESS)
        public_page = make_wiki_page("open")

        response = member_client.get(_pages_url(workspace.slug))

        assert response.status_code == status.HTTP_200_OK
        ids = {p["id"] for p in response.json()}
        assert str(public_page.id) in ids
        assert str(private_page.id) not in ids

        detail = member_client.get(_page_url(workspace.slug, private_page.id))
        assert detail.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_filter_by_collection(self, session_client, workspace, make_wiki_page, other_collection):
        make_wiki_page("in general")
        scoped = make_wiki_page("in handbook", collection=other_collection)

        response = session_client.get(_pages_url(workspace.slug), {"collection": str(other_collection.id)})

        assert response.status_code == status.HTTP_200_OK
        assert [p["id"] for p in response.json()] == [str(scoped.id)]

    @pytest.mark.django_db
    def test_scopes_do_not_leak(self, session_client, workspace, project, make_wiki_page):
        wiki_page = make_wiki_page("wiki")
        project_page = Page.objects.create(workspace=workspace, owned_by=wiki_page.owned_by, name="project page")
        ProjectPage.objects.create(workspace=workspace, project=project, page=project_page)

        workspace_response = session_client.get(_pages_url(workspace.slug))
        project_response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/")

        assert [p["id"] for p in workspace_response.json()] == [str(wiki_page.id)]
        assert [p["id"] for p in project_response.json()] == [str(project_page.id)]

    @pytest.mark.django_db
    def test_project_route_cannot_reach_wiki_page(self, session_client, workspace, project, make_wiki_page):
        wiki_page = make_wiki_page("wiki")

        response = session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{wiki_page.id}/")

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestWikiPageGuest:
    @pytest.mark.django_db
    def test_guest_can_read_public_page(self, guest_client, workspace, make_wiki_page):
        page = make_wiki_page("open")

        response = guest_client.get(_page_url(workspace.slug, page.id))

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_guest_cannot_create(self, guest_client, workspace, default_collection):
        response = guest_client.post(_pages_url(workspace.slug), {"name": "nope"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_guest_cannot_update_page_of_others(self, guest_client, workspace, make_wiki_page):
        page = make_wiki_page("open")

        response = guest_client.patch(_page_url(workspace.slug, page.id), {"name": "hijacked"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestWikiCollections:
    @pytest.mark.django_db
    def test_list_and_create(self, session_client, workspace, default_collection):
        create_response = session_client.post(_collections_url(workspace.slug), {"name": "Handbook"}, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED

        list_response = session_client.get(_collections_url(workspace.slug))
        assert list_response.status_code == status.HTTP_200_OK
        names = [c["name"] for c in list_response.json()]
        # The default collection is listed first.
        assert names == ["General", "Handbook"]

    @pytest.mark.django_db
    def test_rename(self, session_client, workspace, other_collection):
        response = session_client.patch(
            _collection_url(workspace.slug, other_collection.id), {"name": "Ops"}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        other_collection.refresh_from_db()
        assert other_collection.name == "Ops"

    @pytest.mark.django_db
    def test_delete_moves_pages_to_default(
        self, session_client, workspace, default_collection, other_collection, make_wiki_page
    ):
        page = make_wiki_page("runbook", collection=other_collection)

        response = session_client.delete(_collection_url(workspace.slug, other_collection.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        page.refresh_from_db()
        assert page.collection_id == default_collection.id

    @pytest.mark.django_db
    def test_default_collection_cannot_be_deleted(self, session_client, workspace, default_collection):
        response = session_client.delete(_collection_url(workspace.slug, default_collection.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert PageCollection.objects.filter(pk=default_collection.id).exists()

    @pytest.mark.django_db
    def test_guest_cannot_create_collection(self, guest_client, workspace):
        response = guest_client.post(_collections_url(workspace.slug), {"name": "nope"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestWikiPageMove:
    @pytest.mark.django_db
    def test_move_between_collections_carries_children(
        self, session_client, workspace, other_collection, make_wiki_page
    ):
        root = make_wiki_page("root")
        child = make_wiki_page("child", parent=root)
        grand_child = make_wiki_page("grand child", parent=child)

        response = session_client.post(
            _move_url(workspace.slug, root.id), {"collection": str(other_collection.id)}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        for page in (root, child, grand_child):
            page.refresh_from_db()
            assert page.collection_id == other_collection.id
        # The tree shape is untouched.
        assert child.parent_id == root.id
        assert grand_child.parent_id == child.id

    @pytest.mark.django_db
    def test_move_under_parent(self, session_client, workspace, make_wiki_page):
        parent = make_wiki_page("parent")
        page = make_wiki_page("page")

        response = session_client.post(_move_url(workspace.slug, page.id), {"parent": str(parent.id)}, format="json")

        assert response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.parent_id == parent.id

    @pytest.mark.django_db
    def test_move_into_own_descendant_rejected(self, session_client, workspace, make_wiki_page):
        root = make_wiki_page("root")
        child = make_wiki_page("child", parent=root)

        response = session_client.post(_move_url(workspace.slug, root.id), {"parent": str(child.id)}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestMoveProjectPageToWiki:
    @pytest.mark.django_db
    def test_move_to_wiki(self, session_client, workspace, project, create_user, default_collection):
        root = Page.objects.create(workspace=workspace, owned_by=create_user, name="root")
        ProjectPage.objects.create(workspace=workspace, project=project, page=root)
        child = Page.objects.create(workspace=workspace, owned_by=create_user, name="child", parent=root)
        ProjectPage.objects.create(workspace=workspace, project=project, page=child)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/{root.id}/move-to-wiki/",
            {"collection": str(default_collection.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        for page in (root, child):
            page.refresh_from_db()
            assert page.is_global is True
            assert page.collection_id == default_collection.id
        assert child.parent_id == root.id
        assert not ProjectPage.objects.filter(page_id__in=[root.id, child.id]).exists()

        # It now shows up in the wiki listing and no longer in the project one.
        wiki_ids = {p["id"] for p in session_client.get(_pages_url(workspace.slug)).json()}
        assert {str(root.id), str(child.id)} <= wiki_ids


@pytest.mark.contract
class TestMoveWikiPageToProject:
    @pytest.mark.django_db
    def test_move_to_project(self, session_client, workspace, project, make_wiki_page):
        root = make_wiki_page("root")
        child = make_wiki_page("child", parent=root)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/pages/{root.id}/move-to-project/",
            {"project_id": str(project.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        for page in (root, child):
            page.refresh_from_db()
            assert page.is_global is False
            assert page.collection_id is None
            assert ProjectPage.objects.filter(page_id=page.id, project_id=project.id).exists()
        assert child.parent_id == root.id
        assert root.parent_id is None

        # It is gone from the wiki listing and shows up in the project one.
        wiki_ids = {p["id"] for p in session_client.get(_pages_url(workspace.slug)).json()}
        assert wiki_ids.isdisjoint({str(root.id), str(child.id)})
        project_ids = {
            p["id"]
            for p in session_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/pages/").json()
        }
        assert {str(root.id), str(child.id)} <= project_ids

    @pytest.mark.django_db
    def test_move_requires_project_membership(self, member_client, workspace, project, make_wiki_page):
        page = make_wiki_page("root")

        response = member_client.post(
            f"/api/workspaces/{workspace.slug}/pages/{page.id}/move-to-project/",
            {"project_id": str(project.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        page.refresh_from_db()
        assert page.is_global is True

    @pytest.mark.django_db
    def test_project_page_is_not_movable_through_the_wiki_endpoint(
        self, session_client, workspace, project, create_user
    ):
        page = Page.objects.create(workspace=workspace, owned_by=create_user, name="project page")
        ProjectPage.objects.create(workspace=workspace, project=project, page=page)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/pages/{page.id}/move-to-project/",
            {"project_id": str(project.id)},
            format="json",
        )

        # WorkspacePagePermission already refuses a project page on the wiki route.
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert ProjectPage.objects.filter(page_id=page.id, project_id=project.id).exists()


@pytest.mark.contract
class TestWikiPageArchiveDelete:
    @pytest.mark.django_db
    def test_archive_and_delete(self, session_client, workspace, make_wiki_page):
        page = make_wiki_page("temp")

        archive_response = session_client.post(f"/api/workspaces/{workspace.slug}/pages/{page.id}/archive/")
        assert archive_response.status_code == status.HTTP_200_OK
        page.refresh_from_db()
        assert page.archived_at is not None

        delete_response = session_client.delete(_page_url(workspace.slug, page.id))
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(pk=page.id).exists()

    @pytest.mark.django_db
    def test_delete_requires_archive(self, session_client, workspace, make_wiki_page):
        page = make_wiki_page("temp", archived_at=None)

        response = session_client.delete(_page_url(workspace.slug, page.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_summary(self, session_client, workspace, make_wiki_page):
        make_wiki_page("public one")
        make_wiki_page("private one", access=Page.PRIVATE_ACCESS)
        make_wiki_page("archived one", archived_at=datetime.now().date())

        response = session_client.get(f"/api/workspaces/{workspace.slug}/pages-summary/")

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["public_pages"] == 1
        assert body["private_pages"] == 1
        assert body["archived_pages"] == 1


@pytest.mark.contract
class TestWikiPageExtras:
    @pytest.mark.django_db
    def test_duplicate(self, session_client, workspace, make_wiki_page, default_collection):
        page = make_wiki_page("source")
        make_wiki_page("child", parent=page)

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/pages/{page.id}/duplicate/?include_children=true"
        )

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["name"] == "source (Copy)"
        copy = Page.objects.get(pk=body["id"])
        assert copy.is_global is True
        assert copy.collection_id == default_collection.id
        assert Page.objects.filter(parent_id=copy.id).count() == 1

    @pytest.mark.django_db
    def test_versions_endpoint(self, session_client, workspace, make_wiki_page):
        page = make_wiki_page("versioned")

        response = session_client.get(f"/api/workspaces/{workspace.slug}/pages/{page.id}/versions/")

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    @pytest.mark.django_db
    def test_description_endpoint(self, session_client, workspace, make_wiki_page):
        page = make_wiki_page("described")

        response = session_client.get(f"/api/workspaces/{workspace.slug}/pages/{page.id}/description/")

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_favorite_round_trip(self, session_client, workspace, make_wiki_page):
        page = make_wiki_page("favorite me")

        created = session_client.post(f"/api/workspaces/{workspace.slug}/favorite-pages/{page.id}/")
        assert created.status_code == status.HTTP_204_NO_CONTENT

        removed = session_client.delete(f"/api/workspaces/{workspace.slug}/favorite-pages/{page.id}/")
        assert removed.status_code == status.HTTP_204_NO_CONTENT
