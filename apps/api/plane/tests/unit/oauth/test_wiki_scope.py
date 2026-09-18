# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The v1 wiki views reuse app viewsets; the OAuth scope check must still apply to them."""

from datetime import timedelta

import pytest
from django.utils import timezone

from plane.db.models import PageCollection, Workspace, WorkspaceMember
from plane.oauth.models import AccessToken

pytestmark = pytest.mark.unit


@pytest.fixture
def workspace(db, create_user):
    workspace = Workspace.objects.create(name="Acme", slug="acme", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    PageCollection.objects.create(workspace=workspace, name="General", owned_by=create_user, is_default=True)
    return workspace


def bearer(api_client, application, user, scope):
    token = AccessToken.objects.create(
        user=user,
        application=application,
        scope=scope,
        token=f"wiki-{scope.replace(':', '-').replace(' ', '-')}",
        expires=timezone.now() + timedelta(hours=1),
        resource="https://plane.example.com/mcp",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.token}")
    return api_client


class TestWikiScope:
    def test_read_scope_reads_the_wiki(self, api_client, public_application, create_user, workspace):
        client = bearer(api_client, public_application, create_user, "mcp:read")

        assert client.get(f"/api/v1/workspaces/{workspace.slug}/wiki/collections/").status_code == 200
        assert client.get(f"/api/v1/workspaces/{workspace.slug}/wiki/pages/").status_code == 200

    def test_read_scope_cannot_write_the_wiki(self, api_client, public_application, create_user, workspace):
        client = bearer(api_client, public_application, create_user, "mcp:read")

        collection = client.post(f"/api/v1/workspaces/{workspace.slug}/wiki/collections/", {"name": "X"}, format="json")
        page = client.post(f"/api/v1/workspaces/{workspace.slug}/wiki/pages/", {"name": "X"}, format="json")

        assert collection.status_code == 403
        assert page.status_code == 403
        assert PageCollection.objects.filter(workspace=workspace).count() == 1

    def test_write_scope_writes_the_wiki(self, api_client, public_application, create_user, workspace):
        client = bearer(api_client, public_application, create_user, "mcp:read mcp:write")

        response = client.post(f"/api/v1/workspaces/{workspace.slug}/wiki/collections/", {"name": "X"}, format="json")

        assert response.status_code == 201, response.data
