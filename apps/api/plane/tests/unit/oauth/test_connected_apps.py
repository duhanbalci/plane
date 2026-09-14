# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
from datetime import timedelta

import pytest
from django.utils import timezone

from plane.oauth.models import AccessToken, Application, Grant, RefreshToken

pytestmark = pytest.mark.unit

LIST_URL = "/auth/o/applications/"


def make_token(user, application, scope="mcp:read mcp:write", token="tok", expired=False):
    return AccessToken.objects.create(
        user=user,
        application=application,
        scope=scope,
        token=token,
        expires=timezone.now() + (timedelta(hours=-1) if expired else timedelta(hours=1)),
    )


@pytest.fixture
def other_user(db, create_user):
    return create_user.__class__.objects.create(email="other@plane.so", username="other@plane.so")


class TestListConnectedApplications:
    def test_lists_an_authorized_application_with_its_scopes(self, session_client, public_application, create_user):
        make_token(create_user, public_application)

        response = session_client.get(LIST_URL)

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["name"] == "Test MCP Client"
        assert body[0]["id"] == str(public_application.id)
        assert [scope["key"] for scope in body[0]["scopes"]] == ["mcp:read", "mcp:write"]
        # The description is what the user actually reads on the screen.
        assert "Read your workspaces" in body[0]["scopes"][0]["description"]

    def test_requires_a_signed_in_user(self, api_client, public_application, create_user, db):
        make_token(create_user, public_application)

        response = api_client.get(LIST_URL)

        assert response.status_code in (401, 403)

    def test_omits_an_application_whose_tokens_all_expired(self, session_client, public_application, create_user):
        make_token(create_user, public_application, expired=True)

        assert session_client.get(LIST_URL).json() == []

    def test_keeps_an_application_that_still_holds_a_refresh_token(
        self, session_client, public_application, create_user
    ):
        access_token = make_token(create_user, public_application, expired=True)
        RefreshToken.objects.create(
            user=create_user, application=public_application, token="refresh", access_token=access_token
        )

        body = session_client.get(LIST_URL).json()

        # An unexpired refresh token can still mint access tokens, so the grant
        # is live and must be revocable from the screen.
        assert [row["id"] for row in body] == [str(public_application.id)]

    def test_does_not_leak_another_user_grant(self, session_client, public_application, other_user):
        make_token(other_user, public_application)

        assert session_client.get(LIST_URL).json() == []

    def test_reports_last_used(self, session_client, public_application, create_user):
        make_token(create_user, public_application)
        public_application.last_used_at = timezone.now()
        public_application.save(update_fields=["last_used_at"])

        assert session_client.get(LIST_URL).json()[0]["last_used_at"] is not None


class TestRevokeConnectedApplication:
    def url(self, application):
        return f"/auth/o/applications/{application.id}/"

    def test_revokes_every_credential_the_application_holds(self, session_client, public_application, create_user):
        access_token = make_token(create_user, public_application)
        RefreshToken.objects.create(
            user=create_user, application=public_application, token="refresh", access_token=access_token
        )
        Grant.objects.create(
            application=public_application,
            user=create_user,
            code="pending",
            expires=timezone.now() + timedelta(minutes=1),
            redirect_uri="http://127.0.0.1:33418/callback",
            scope="mcp:read",
        )

        response = session_client.delete(self.url(public_application))

        assert response.status_code == 204
        assert not AccessToken.objects.filter(user=create_user).exists()
        assert not RefreshToken.objects.filter(user=create_user).exists()
        # An unredeemed code would otherwise still be worth a fresh token.
        assert not Grant.objects.filter(user=create_user).exists()

    def test_leaves_another_user_grant_alone(self, session_client, public_application, create_user, other_user):
        make_token(create_user, public_application, token="mine")
        make_token(other_user, public_application, token="theirs")

        session_client.delete(self.url(public_application))

        assert not AccessToken.objects.filter(user=create_user).exists()
        assert AccessToken.objects.filter(user=other_user).exists()

    def test_requires_a_signed_in_user(self, api_client, public_application, create_user):
        make_token(create_user, public_application)

        response = api_client.delete(self.url(public_application))

        assert response.status_code in (401, 403)
        assert AccessToken.objects.filter(user=create_user).exists()

    def test_unknown_application_is_a_404(self, session_client, db):
        response = session_client.delete("/auth/o/applications/8d2f8b1e-0000-4000-8000-000000000000/")

        assert response.status_code == 404

    def test_revoked_token_stops_working(self, session_client, public_application, create_user, client):
        """The point of the screen: after revoking, the token is dead."""
        make_token(create_user, public_application, token="revoke-me")
        resource_server = Application.objects.create(
            name="Plane MCP server",
            client_type=Application.CLIENT_CONFIDENTIAL,
            authorization_grant_type=Application.GRANT_CLIENT_CREDENTIALS,
            client_secret="rs-secret",
            user=None,
        )
        basic = "Basic " + base64.b64encode(f"{resource_server.client_id}:rs-secret".encode()).decode()

        assert client.post("/auth/o/introspect/", {"token": "revoke-me"}, HTTP_AUTHORIZATION=basic).json()["active"]

        session_client.delete(self.url(public_application))

        assert (
            client.post("/auth/o/introspect/", {"token": "revoke-me"}, HTTP_AUTHORIZATION=basic).json()["active"]
            is False
        )
