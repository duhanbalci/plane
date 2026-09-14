# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.utils import timezone
from datetime import timedelta

from plane.db.models import Workspace, WorkspaceMember
from plane.oauth.models import AccessToken

pytestmark = pytest.mark.unit


@pytest.fixture
def workspace(db, create_user):
    workspace = Workspace.objects.create(
        name="Acme", slug="acme", owner=create_user
    )
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    return workspace


def issue_token(application, user, scope):
    return AccessToken.objects.create(
        user=user,
        application=application,
        scope=scope,
        token=f"test-token-{scope.replace(':', '-').replace(' ', '-')}",
        expires=timezone.now() + timedelta(hours=1),
        resource="https://plane.example.com/mcp",
    )


def bearer(api_client, token):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.token}")
    return api_client


class TestOAuthApiAccess:
    def test_read_scope_can_list_projects(
        self, api_client, public_application, create_user, workspace
    ):
        token = issue_token(public_application, create_user, "mcp:read")

        response = bearer(api_client, token).get(f"/api/v1/workspaces/{workspace.slug}/projects/")

        assert response.status_code == 200

    def test_read_scope_cannot_write(
        self, api_client, public_application, create_user, workspace
    ):
        token = issue_token(public_application, create_user, "mcp:read")

        response = bearer(api_client, token).post(
            f"/api/v1/workspaces/{workspace.slug}/projects/",
            {"name": "New project", "identifier": "NEW"},
            format="json",
        )

        assert response.status_code == 403

    def test_write_scope_can_write(
        self, api_client, public_application, create_user, workspace
    ):
        token = issue_token(public_application, create_user, "mcp:read mcp:write")

        response = bearer(api_client, token).post(
            f"/api/v1/workspaces/{workspace.slug}/projects/",
            {"name": "New project", "identifier": "NEW"},
            format="json",
        )

        assert response.status_code == 201, response.content

    def test_expired_token_is_rejected(
        self, api_client, public_application, create_user, workspace
    ):
        token = issue_token(public_application, create_user, "mcp:read")
        token.expires = timezone.now() - timedelta(seconds=1)
        token.save(update_fields=["expires"])

        response = bearer(api_client, token).get(f"/api/v1/workspaces/{workspace.slug}/projects/")

        assert response.status_code == 401

    def test_token_for_a_workspace_the_user_is_not_in_sees_nothing(
        self, api_client, public_application, create_user, workspace, db
    ):
        # A token is workspace-agnostic; membership, not the token, decides
        # which workspaces it can reach.
        other_owner = create_user.__class__.objects.create(
            email="other@plane.so", username="other@plane.so"
        )
        Workspace.objects.create(name="Other", slug="other", owner=other_owner)
        token = issue_token(public_application, create_user, "mcp:read")

        response = bearer(api_client, token).get("/api/v1/workspaces/other/projects/")

        assert response.status_code in (403, 404)

    def test_api_key_requests_are_unaffected_by_scope_checks(
        self, api_key_client, workspace, create_user
    ):
        response = api_key_client.post(
            f"/api/v1/workspaces/{workspace.slug}/projects/",
            {"name": "Via API key", "identifier": "KEY"},
            format="json",
        )

        assert response.status_code == 201, response.content
