# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the v1 wiki endpoints (``plane/api/views/wiki.py``).

The views reuse the web app's wiki viewsets for their rules, so these tests
focus on what v1 adds or changes: API-key access, content written as HTML with
the editor's binary cleared, and structure changes kept to ``move``.
"""

from unittest.mock import patch
from uuid import uuid4

import pytest
from rest_framework import status

from plane.db.models import APIToken, Page, PageCollection, User, Workspace, WorkspaceMember

BASE = "/api/v1/workspaces/{slug}/wiki"


def url(workspace, path=""):
    return BASE.format(slug=workspace.slug) + path


@pytest.fixture(autouse=True)
def quiet_tasks():
    """Page writes queue Celery tasks; none of them matter to these contracts."""
    with (
        patch("plane.api.views.wiki.page_transaction"),
        patch("plane.app.views.page.base.page_transaction"),
        patch("plane.app.views.page.base.recent_visited_task"),
        patch("plane.app.views.page.base.copy_s3_objects_of_description_and_assets"),
    ):
        yield


@pytest.fixture
def default_collection(db, workspace, create_user):
    """The collection every workspace gets on creation, which the model fixture skips."""
    return PageCollection.objects.create(workspace=workspace, name="General", owned_by=create_user, is_default=True)


def make_user(workspace, role):
    unique_id = uuid4().hex[:8]
    user = User.objects.create(email=f"u-{unique_id}@plane.so", username=f"u_{unique_id}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return user


def client_for(api_client, user):
    token = APIToken.objects.create(user=user, label="test", token=f"token-{uuid4().hex}")
    api_client.credentials(HTTP_X_API_KEY=token.token)
    return api_client


def make_page(workspace, owner, collection, **fields):
    return Page.objects.create(
        workspace=workspace,
        owned_by=owner,
        collection=collection,
        is_global=True,
        name=fields.pop("name", "Page"),
        **fields,
    )


@pytest.mark.contract
class TestWikiCollections:
    @pytest.mark.django_db
    def test_create_list_rename_and_delete(self, api_key_client, workspace, default_collection):
        created = api_key_client.post(url(workspace, "/collections/"), {"name": "Growth"}, format="json")
        assert created.status_code == status.HTTP_201_CREATED, created.data
        collection_id = created.data["id"]

        listed = api_key_client.get(url(workspace, "/collections/"))
        assert {c["name"] for c in listed.data} == {"General", "Growth"}

        renamed = api_key_client.patch(
            url(workspace, f"/collections/{collection_id}/"), {"name": "Growth team"}, format="json"
        )
        assert renamed.status_code == status.HTTP_200_OK, renamed.data
        assert renamed.data["name"] == "Growth team"

        deleted = api_key_client.delete(url(workspace, f"/collections/{collection_id}/"))
        assert deleted.status_code == status.HTTP_204_NO_CONTENT
        assert not PageCollection.objects.filter(pk=collection_id).exists()

    @pytest.mark.django_db
    def test_deleting_a_collection_keeps_its_pages_in_the_default(
        self, api_key_client, workspace, create_user, default_collection
    ):
        doomed = PageCollection.objects.create(workspace=workspace, name="Old", owned_by=create_user)
        page = make_page(workspace, create_user, doomed)

        response = api_key_client.delete(url(workspace, f"/collections/{doomed.id}/"))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        page.refresh_from_db()
        assert page.collection_id == default_collection.id

    @pytest.mark.django_db
    def test_default_collection_cannot_be_deleted(self, api_key_client, workspace, default_collection):
        response = api_key_client.delete(url(workspace, f"/collections/{default_collection.id}/"))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert PageCollection.objects.filter(pk=default_collection.pk).exists()

    @pytest.mark.django_db
    def test_private_collection_is_hidden_from_other_members(
        self, api_client, workspace, create_user, default_collection
    ):
        PageCollection.objects.create(workspace=workspace, name="Mine", owned_by=create_user, access=1)
        other = make_user(workspace, 15)

        listed = client_for(api_client, other).get(url(workspace, "/collections/"))

        assert listed.status_code == status.HTTP_200_OK
        assert [c["name"] for c in listed.data] == ["General"]

    @pytest.mark.django_db
    def test_guest_cannot_create_a_collection(self, api_client, workspace, default_collection):
        guest = make_user(workspace, 5)

        response = client_for(api_client, guest).post(url(workspace, "/collections/"), {"name": "X"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_non_member_is_refused(self, api_client, workspace, default_collection):
        outsider = User.objects.create(email="out@plane.so", username="outsider")

        response = client_for(api_client, outsider).get(url(workspace, "/collections/"))

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestWikiPageCreate:
    @pytest.mark.django_db
    def test_creates_a_wiki_page_from_html_without_an_editor_document(
        self, api_key_client, workspace, default_collection
    ):
        response = api_key_client.post(
            url(workspace, "/pages/"),
            {"name": "Runbook", "description_html": "<h1>Deploy</h1><p>Steps</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        page = Page.objects.get(pk=response.data["id"])
        assert page.is_global
        assert page.collection_id == default_collection.id
        assert page.description_html == "<h1>Deploy</h1><p>Steps</p>"
        # No binary, so the editor builds its document from the HTML on first open.
        assert page.description_binary is None
        assert response.data["description_html"] == "<h1>Deploy</h1><p>Steps</p>"

    @pytest.mark.django_db
    def test_sanitizes_the_html(self, api_key_client, workspace, default_collection):
        response = api_key_client.post(
            url(workspace, "/pages/"),
            {"name": "X", "description_html": '<p onclick="steal()">Hi</p><script>alert(1)</script>'},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        html = Page.objects.get(pk=response.data["id"]).description_html
        assert "script" not in html
        assert "onclick" not in html
        assert "Hi" in html

    @pytest.mark.django_db
    def test_refuses_a_raw_editor_document(self, api_key_client, workspace, default_collection):
        response = api_key_client.post(
            url(workspace, "/pages/"), {"name": "X", "description_binary": "AAAA"}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Page.objects.exists()

    @pytest.mark.django_db
    def test_places_the_page_in_a_named_collection(self, api_key_client, workspace, create_user, default_collection):
        growth = PageCollection.objects.create(workspace=workspace, name="Growth", owned_by=create_user)

        response = api_key_client.post(
            url(workspace, "/pages/"), {"name": "X", "collection": str(growth.id)}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert Page.objects.get(pk=response.data["id"]).collection_id == growth.id

    @pytest.mark.django_db
    def test_a_sub_page_joins_its_parents_collection(self, api_key_client, workspace, create_user, default_collection):
        growth = PageCollection.objects.create(workspace=workspace, name="Growth", owned_by=create_user)
        parent = make_page(workspace, create_user, growth, name="Parent")

        response = api_key_client.post(
            url(workspace, "/pages/"),
            # A conflicting collection is overridden by the parent's.
            {"name": "Child", "parent": str(parent.id), "collection": str(default_collection.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        child = Page.objects.get(pk=response.data["id"])
        assert child.parent_id == parent.id
        assert child.collection_id == growth.id

    @pytest.mark.django_db
    def test_cannot_nest_under_a_page_in_another_workspace(
        self, api_key_client, workspace, create_user, default_collection
    ):
        other_workspace = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws")
        foreign_collection = PageCollection.objects.create(
            workspace=other_workspace, name="General", owned_by=create_user, is_default=True
        )
        foreign = make_page(other_workspace, create_user, foreign_collection)

        response = api_key_client.post(
            url(workspace, "/pages/"), {"name": "X", "parent": str(foreign.id)}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not Page.objects.filter(workspace=workspace).exists()

    @pytest.mark.django_db
    def test_cannot_file_into_someone_elses_private_collection(
        self, api_client, workspace, create_user, default_collection
    ):
        private = PageCollection.objects.create(workspace=workspace, name="Secret", owned_by=create_user, access=1)
        other = make_user(workspace, 15)

        response = client_for(api_client, other).post(
            url(workspace, "/pages/"), {"name": "X", "collection": str(private.id)}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not Page.objects.exists()


@pytest.mark.contract
class TestWikiPageUpdate:
    @pytest.mark.django_db
    def test_renames_a_page(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection)

        response = api_key_client.patch(url(workspace, f"/pages/{page.id}/"), {"name": "Renamed"}, format="json")

        assert response.status_code == status.HTTP_200_OK, response.data
        page.refresh_from_db()
        assert page.name == "Renamed"

    @pytest.mark.django_db
    def test_refuses_content_and_structure_changes(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection, description_html="<p>old</p>")
        other = make_page(workspace, create_user, default_collection)

        for body in ({"description_html": "<p>new</p>"}, {"parent": str(other.id)}, {"collection": None}):
            response = api_key_client.patch(url(workspace, f"/pages/{page.id}/"), body, format="json")
            assert response.status_code == status.HTTP_400_BAD_REQUEST, body

        page.refresh_from_db()
        assert page.description_html == "<p>old</p>"
        assert page.parent_id is None

    @pytest.mark.django_db
    def test_moves_a_page_under_another(self, api_key_client, workspace, create_user, default_collection):
        parent = make_page(workspace, create_user, default_collection, name="Parent")
        page = make_page(workspace, create_user, default_collection)

        response = api_key_client.post(
            url(workspace, f"/pages/{page.id}/move/"), {"parent": str(parent.id)}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        page.refresh_from_db()
        assert page.parent_id == parent.id

    @pytest.mark.django_db
    def test_moving_to_another_collection_takes_the_subtree(
        self, api_key_client, workspace, create_user, default_collection
    ):
        growth = PageCollection.objects.create(workspace=workspace, name="Growth", owned_by=create_user)
        page = make_page(workspace, create_user, default_collection, name="Parent")
        child = make_page(workspace, create_user, default_collection, name="Child", parent=page)

        response = api_key_client.post(
            url(workspace, f"/pages/{page.id}/move/"), {"parent": None, "collection": str(growth.id)}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        child.refresh_from_db()
        assert child.collection_id == growth.id

    @pytest.mark.django_db
    def test_cannot_move_into_someone_elses_private_collection(
        self, api_client, workspace, create_user, default_collection
    ):
        private = PageCollection.objects.create(workspace=workspace, name="Secret", owned_by=create_user, access=1)
        other = make_user(workspace, 15)
        page = make_page(workspace, other, default_collection)

        response = client_for(api_client, other).post(
            url(workspace, f"/pages/{page.id}/move/"), {"collection": str(private.id)}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        page.refresh_from_db()
        assert page.collection_id == default_collection.id

    @pytest.mark.django_db
    def test_lock_blocks_edits_until_unlocked(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection)
        detail = url(workspace, f"/pages/{page.id}/")

        assert api_key_client.post(f"{detail}lock/").status_code == status.HTTP_204_NO_CONTENT
        locked = api_key_client.patch(detail, {"name": "Nope"}, format="json")
        assert locked.status_code == status.HTTP_400_BAD_REQUEST
        assert api_key_client.delete(f"{detail}lock/").status_code == status.HTTP_204_NO_CONTENT
        assert api_key_client.patch(detail, {"name": "Yes"}, format="json").status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_only_the_owner_changes_access(self, api_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection)
        other = make_user(workspace, 15)

        response = client_for(api_client, other).post(
            url(workspace, f"/pages/{page.id}/access/"), {"access": 1}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.access == 0

    @pytest.mark.django_db
    def test_delete_requires_archiving_first(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection)
        detail = url(workspace, f"/pages/{page.id}/")

        assert api_key_client.delete(detail).status_code == status.HTTP_400_BAD_REQUEST
        assert api_key_client.post(f"{detail}archive/").status_code == status.HTTP_200_OK
        assert api_key_client.delete(detail).status_code == status.HTTP_204_NO_CONTENT
        assert not Page.objects.filter(pk=page.pk).exists()

    @pytest.mark.django_db
    def test_duplicates_a_page(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection, name="Original", description_html="<p>x</p>")

        response = api_key_client.post(url(workspace, f"/pages/{page.id}/duplicate/"))

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert Page.objects.filter(workspace=workspace, is_global=True).count() == 2


@pytest.mark.contract
class TestWikiPageContent:
    @pytest.mark.django_db
    def test_replaces_content_and_drops_the_stale_editor_document(
        self, api_key_client, workspace, create_user, default_collection
    ):
        page = make_page(
            workspace,
            create_user,
            default_collection,
            description_html="<p>old</p>",
            description_binary=b"stale-yjs-state",
            description_json={"type": "doc"},
        )

        response = api_key_client.put(
            url(workspace, f"/pages/{page.id}/content/"),
            {"description_html": "<h2>New</h2><ul><li>one</li></ul>"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        page.refresh_from_db()
        assert page.description_html == "<h2>New</h2><ul><li>one</li></ul>"
        assert page.description_binary is None
        assert page.description_json == {}
        assert page.description_stripped == "Newone"

    @pytest.mark.django_db
    def test_sanitizes_content(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection)

        api_key_client.put(
            url(workspace, f"/pages/{page.id}/content/"),
            {"description_html": "<p>ok</p><img src=x onerror=alert(1)>"},
            format="json",
        )

        page.refresh_from_db()
        assert "onerror" not in page.description_html

    @pytest.mark.django_db
    def test_refuses_locked_and_archived_pages(self, api_key_client, workspace, create_user, default_collection):
        from datetime import date

        locked = make_page(workspace, create_user, default_collection, is_locked=True, description_html="<p>a</p>")
        archived = make_page(
            workspace, create_user, default_collection, archived_at=date.today(), description_html="<p>b</p>"
        )

        for page in (locked, archived):
            response = api_key_client.put(
                url(workspace, f"/pages/{page.id}/content/"), {"description_html": "<p>changed</p>"}, format="json"
            )
            assert response.status_code == status.HTTP_400_BAD_REQUEST
            page.refresh_from_db()
            assert "changed" not in page.description_html

    @pytest.mark.django_db
    def test_requires_description_html(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection, description_html="<p>keep</p>")

        response = api_key_client.put(url(workspace, f"/pages/{page.id}/content/"), {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        page.refresh_from_db()
        assert page.description_html == "<p>keep</p>"

    @pytest.mark.django_db
    def test_someone_elses_private_page_is_out_of_reach(self, api_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection, access=1, description_html="<p>mine</p>")
        admin = make_user(workspace, 20)

        response = client_for(api_client, admin).put(
            url(workspace, f"/pages/{page.id}/content/"), {"description_html": "<p>theirs</p>"}, format="json"
        )

        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)
        page.refresh_from_db()
        assert page.description_html == "<p>mine</p>"

    @pytest.mark.django_db
    def test_a_project_page_is_not_a_wiki_page(self, api_key_client, workspace, create_user, default_collection):
        project_page = Page.objects.create(
            workspace=workspace, owned_by=create_user, is_global=False, name="Project page"
        )

        response = api_key_client.put(
            url(workspace, f"/pages/{project_page.id}/content/"), {"description_html": "<p>x</p>"}, format="json"
        )

        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    @pytest.mark.django_db
    def test_reading_a_page_returns_its_html(self, api_key_client, workspace, create_user, default_collection):
        page = make_page(workspace, create_user, default_collection, description_html="<p>body</p>")

        response = api_key_client.get(url(workspace, f"/pages/{page.id}/"))

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["description_html"] == "<p>body</p>"
