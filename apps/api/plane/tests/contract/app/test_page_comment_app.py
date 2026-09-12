# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for inline page comments (Faz G).

Covers create/list/reply, the resolved filter, resolve/unresolve, author-only
edit and delete, guest write denial, reaction toggling and the workspace (wiki)
scoped variant of the same endpoints.
"""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Page,
    PageComment,
    PageCommentReaction,
    Project,
    ProjectMember,
    ProjectPage,
    User,
    WorkspaceMember,
)


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="P", identifier="PGC", workspace=workspace)
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def page(db, workspace, create_user, project):
    page = Page.objects.create(workspace=workspace, owned_by=create_user, name="Doc", access=Page.PUBLIC_ACCESS)
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return page


@pytest.fixture
def wiki_page(db, workspace, create_user):
    return Page.objects.create(
        workspace=workspace, owned_by=create_user, name="Wiki doc", access=Page.PUBLIC_ACCESS, is_global=True
    )


def _member(workspace, project, email, username, role):
    user = User.objects.create(email=email, username=username, first_name="Mem")
    user.set_password("member-password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)
    if project is not None:
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.fixture
def member_client(db, workspace, project):
    return _member(workspace, project, "member@plane.so", "pgc_member", 15)


@pytest.fixture
def guest_client(db, workspace, project):
    return _member(workspace, project, "guest@plane.so", "pgc_guest", 5)


def _comments_url(slug, project_id, page_id):
    return f"/api/workspaces/{slug}/projects/{project_id}/pages/{page_id}/comments/"


def _comment_url(slug, project_id, page_id, pk):
    return f"{_comments_url(slug, project_id, page_id)}{pk}/"


def _resolve_url(slug, project_id, page_id, pk):
    return f"{_comment_url(slug, project_id, page_id, pk)}resolve/"


def _reactions_url(slug, project_id, page_id, pk):
    return f"{_comment_url(slug, project_id, page_id, pk)}reactions/"


def _wiki_comments_url(slug, page_id):
    return f"/api/workspaces/{slug}/pages/{page_id}/comments/"


ANCHOR = {"mark_id": "mark-1", "block_id": "block-1", "quoted_text": "hello"}


@pytest.mark.contract
class TestPageCommentCreate:
    @pytest.mark.django_db
    def test_create_thread_root(self, session_client, workspace, project, page, create_user):
        response = session_client.post(
            _comments_url(workspace.slug, project.id, page.id),
            {"comment_html": "<p>first</p>", "anchor": ANCHOR},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["anchor"]["mark_id"] == "mark-1"
        assert body["comment_stripped"] == "first"
        assert body["parent"] is None
        assert body["actor_detail"]["id"] == str(create_user.id)

    @pytest.mark.django_db
    def test_create_reply(self, session_client, workspace, project, page, create_user):
        root = PageComment.objects.create(workspace=workspace, page=page, actor=create_user, comment_html="<p>root</p>")

        response = session_client.post(
            _comments_url(workspace.slug, project.id, page.id),
            {"comment_html": "<p>reply</p>", "parent": str(root.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["parent"] == str(root.id)

    @pytest.mark.django_db
    def test_guest_cannot_comment_on_a_page_they_do_not_own(self, guest_client, workspace, project, page):
        _user, client = guest_client

        response = client.post(
            _comments_url(workspace.slug, project.id, page.id),
            {"comment_html": "<p>nope</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_guest_can_comment_on_their_own_page(self, guest_client, workspace, project):
        user, client = guest_client
        page = Page.objects.create(workspace=workspace, owned_by=user, name="Mine")
        ProjectPage.objects.create(workspace=workspace, project=project, page=page)

        response = client.post(
            _comments_url(workspace.slug, project.id, page.id),
            {"comment_html": "<p>mine</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.contract
class TestPageCommentList:
    @pytest.mark.django_db
    def test_list_is_flat_and_ordered(self, session_client, workspace, project, page, create_user):
        root = PageComment.objects.create(workspace=workspace, page=page, actor=create_user, comment_html="<p>a</p>")
        reply = PageComment.objects.create(
            workspace=workspace, page=page, actor=create_user, comment_html="<p>b</p>", parent=root
        )

        response = session_client.get(_comments_url(workspace.slug, project.id, page.id))

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert [row["id"] for row in body] == [str(root.id), str(reply.id)]
        assert body[1]["parent"] == str(root.id)

    @pytest.mark.django_db
    def test_resolved_filter(self, session_client, workspace, project, page, create_user):
        open_comment = PageComment.objects.create(
            workspace=workspace, page=page, actor=create_user, comment_html="<p>open</p>"
        )
        done = PageComment.objects.create(
            workspace=workspace, page=page, actor=create_user, comment_html="<p>done</p>", is_resolved=True
        )

        url = _comments_url(workspace.slug, project.id, page.id)
        assert [row["id"] for row in session_client.get(f"{url}?resolved=false").json()] == [str(open_comment.id)]
        assert [row["id"] for row in session_client.get(f"{url}?resolved=true").json()] == [str(done.id)]
        assert len(session_client.get(url).json()) == 2


@pytest.mark.contract
class TestPageCommentMutations:
    @pytest.mark.django_db
    def test_author_can_edit(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(
            workspace=workspace, page=page, actor=create_user, comment_html="<p>old</p>"
        )

        response = session_client.patch(
            _comment_url(workspace.slug, project.id, page.id, comment.id),
            {"comment_html": "<p>new</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["edited_at"] is not None
        comment.refresh_from_db()
        assert comment.comment_stripped == "new"

    @pytest.mark.django_db
    def test_non_author_member_cannot_edit(self, member_client, workspace, project, page, create_user):
        _user, client = member_client
        comment = PageComment.objects.create(
            workspace=workspace, page=page, actor=create_user, comment_html="<p>old</p>"
        )

        response = client.patch(
            _comment_url(workspace.slug, project.id, page.id, comment.id),
            {"comment_html": "<p>hijack</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_author_can_delete(self, member_client, workspace, project, page):
        user, client = member_client
        comment = PageComment.objects.create(workspace=workspace, page=page, actor=user, comment_html="<p>x</p>")

        response = client.delete(_comment_url(workspace.slug, project.id, page.id, comment.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not PageComment.objects.filter(pk=comment.id, deleted_at__isnull=True).exists()

    @pytest.mark.django_db
    def test_resolve_and_unresolve(self, member_client, workspace, project, page, create_user):
        _user, client = member_client
        comment = PageComment.objects.create(workspace=workspace, page=page, actor=create_user, comment_html="<p>x</p>")
        url = _resolve_url(workspace.slug, project.id, page.id, comment.id)

        response = client.post(url, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["is_resolved"] is True
        comment.refresh_from_db()
        assert comment.resolved_at is not None

        response = client.delete(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["is_resolved"] is False
        comment.refresh_from_db()
        assert comment.resolved_by_id is None


@pytest.mark.contract
class TestPageCommentReactions:
    @pytest.mark.django_db
    def test_reaction_toggle(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(workspace=workspace, page=page, actor=create_user, comment_html="<p>x</p>")
        url = _reactions_url(workspace.slug, project.id, page.id, comment.id)

        response = session_client.post(url, {"reaction": "128077"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert PageCommentReaction.objects.filter(comment=comment, deleted_at__isnull=True).count() == 1

        assert session_client.post(url, {"reaction": "128077"}, format="json").status_code == (
            status.HTTP_400_BAD_REQUEST
        )

        response = session_client.delete(f"{url}128077/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not PageCommentReaction.objects.filter(comment=comment, deleted_at__isnull=True).exists()

    @pytest.mark.django_db
    def test_reactions_are_grouped_on_the_comment(self, session_client, workspace, project, page, create_user):
        comment = PageComment.objects.create(workspace=workspace, page=page, actor=create_user, comment_html="<p>x</p>")
        PageCommentReaction.objects.create(workspace=workspace, comment=comment, actor=create_user, reaction="128077")

        body = session_client.get(_comments_url(workspace.slug, project.id, page.id)).json()

        assert [reaction["reaction"] for reaction in body[0]["reactions"]] == ["128077"]


@pytest.mark.contract
class TestWikiPageComments:
    @pytest.mark.django_db
    def test_create_and_list_on_a_wiki_page(self, session_client, workspace, wiki_page):
        url = _wiki_comments_url(workspace.slug, wiki_page.id)

        response = session_client.post(url, {"comment_html": "<p>wiki</p>", "anchor": ANCHOR}, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        body = session_client.get(url).json()
        assert [row["comment_stripped"] for row in body] == ["wiki"]

    @pytest.mark.django_db
    def test_project_page_is_not_reachable_through_the_wiki_route(self, session_client, workspace, page):
        response = session_client.get(_wiki_comments_url(workspace.slug, page.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
