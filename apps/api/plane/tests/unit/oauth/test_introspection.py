# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
from datetime import timedelta

import pytest
from django.utils import timezone

from plane.oauth.models import AccessToken, Application

pytestmark = pytest.mark.unit

RESOURCE = "https://plane.example.com/mcp"


@pytest.fixture
def resource_server_client(db):
    """The confidential client the MCP server authenticates as."""
    secret = "mcp-resource-server-secret"
    application = Application.objects.create(
        name="Plane MCP server",
        client_type=Application.CLIENT_CONFIDENTIAL,
        authorization_grant_type=Application.GRANT_CLIENT_CREDENTIALS,
        client_secret=secret,
        user=None,
    )
    return application, secret


@pytest.fixture
def basic_auth(resource_server_client):
    application, secret = resource_server_client
    raw = f"{application.client_id}:{secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


@pytest.fixture
def user_token(db, public_application, create_user):
    return AccessToken.objects.create(
        user=create_user,
        application=public_application,
        scope="mcp:read mcp:write",
        token="introspect-me",
        expires=timezone.now() + timedelta(hours=1),
        resource=RESOURCE,
    )


class TestIntrospection:
    url = "/auth/o/introspect/"

    def test_returns_the_claims_the_mcp_server_needs(
        self, client, basic_auth, user_token, create_user
    ):
        response = client.post(
            self.url, {"token": user_token.token}, HTTP_AUTHORIZATION=basic_auth
        )

        assert response.status_code == 200
        body = response.json()
        assert body["active"] is True
        assert body["sub"] == str(create_user.id)
        assert body["aud"] == RESOURCE
        assert body["scope"] == "mcp:read mcp:write"
        assert body["token_type"] == "Bearer"

    def test_expired_token_is_inactive(self, client, basic_auth, user_token):
        user_token.expires = timezone.now() - timedelta(seconds=1)
        user_token.save(update_fields=["expires"])

        response = client.post(
            self.url, {"token": user_token.token}, HTTP_AUTHORIZATION=basic_auth
        )

        assert response.json() == {"active": False}

    def test_token_of_a_deactivated_user_is_inactive(
        self, client, basic_auth, user_token, create_user
    ):
        create_user.is_active = False
        create_user.save(update_fields=["is_active"])

        response = client.post(
            self.url, {"token": user_token.token}, HTTP_AUTHORIZATION=basic_auth
        )

        # Deactivating a user has to cut off their MCP sessions too, not just
        # their browser sessions.
        assert response.json() == {"active": False}

    def test_unknown_token_is_inactive(self, client, basic_auth):
        response = client.post(
            self.url, {"token": "not-a-real-token"}, HTTP_AUTHORIZATION=basic_auth
        )

        assert response.json() == {"active": False}

    def test_requires_client_authentication(self, client, user_token):
        response = client.post(self.url, {"token": user_token.token})

        assert response.status_code == 403
