# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.oauth.models import Application

pytestmark = pytest.mark.unit


class TestAuthorizationServerMetadata:
    def test_advertises_the_endpoints_mcp_clients_need(self, api_client, settings):
        settings.APP_BASE_URL = "https://plane.example.com"

        response = api_client.get("/.well-known/oauth-authorization-server")

        assert response.status_code == 200
        body = response.json()
        assert body["issuer"] == "https://plane.example.com"
        assert body["authorization_endpoint"] == "https://plane.example.com/auth/o/authorize/"
        assert body["token_endpoint"] == "https://plane.example.com/auth/o/token/"
        assert body["registration_endpoint"] == "https://plane.example.com/auth/o/register/"
        assert body["code_challenge_methods_supported"] == ["S256"]
        assert body["grant_types_supported"] == ["authorization_code", "refresh_token"]
        assert set(body["scopes_supported"]) == {"mcp:read", "mcp:write"}

    def test_ignores_a_forged_host_header(self, api_client, settings):
        settings.APP_BASE_URL = "https://plane.example.com"

        response = api_client.get(
            "/.well-known/oauth-authorization-server", HTTP_HOST="evil.example.net"
        )

        assert response.json()["issuer"] == "https://plane.example.com"


class TestDynamicClientRegistration:
    url = "/auth/o/register/"

    def test_registers_a_public_client(self, api_client, db):
        response = api_client.post(
            self.url,
            {
                "client_name": "Claude",
                "redirect_uris": ["http://127.0.0.1:33418/callback"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )

        assert response.status_code == 201
        body = response.json()
        assert body["token_endpoint_auth_method"] == "none"
        assert body["registration_access_token"]

        application = Application.objects.get(client_id=body["client_id"])
        assert application.client_type == Application.CLIENT_PUBLIC
        assert application.is_dynamically_registered is True
        assert application.skip_authorization is False

    def test_rejects_a_non_loopback_http_redirect(self, api_client, db):
        response = api_client.post(
            self.url,
            {"redirect_uris": ["http://evil.example.net/callback"]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json()["error"] == "invalid_redirect_uri"
        assert not Application.objects.exists()

    def test_allows_a_private_use_scheme(self, api_client, db):
        response = api_client.post(
            self.url,
            {"redirect_uris": ["com.example.app:/oauth/callback"]},
            format="json",
        )

        assert response.status_code == 201

    def test_rejects_a_bare_word_scheme(self, api_client, db):
        response = api_client.post(
            self.url, {"redirect_uris": ["myapp:/callback"]}, format="json"
        )

        assert response.status_code == 400

    def test_rejects_a_confidential_client(self, api_client, db):
        response = api_client.post(
            self.url,
            {
                "redirect_uris": ["https://app.example.com/callback"],
                "token_endpoint_auth_method": "client_secret_basic",
            },
            format="json",
        )

        assert response.status_code == 400
        assert response.json()["error"] == "invalid_client_metadata"

    def test_rejects_an_unsupported_grant(self, api_client, db):
        response = api_client.post(
            self.url,
            {
                "redirect_uris": ["https://app.example.com/callback"],
                "grant_types": ["password"],
            },
            format="json",
        )

        assert response.status_code == 400

    def test_requires_at_least_one_redirect_uri(self, api_client, db):
        response = api_client.post(self.url, {"redirect_uris": []}, format="json")

        assert response.status_code == 400
        assert response.json()["error"] == "invalid_redirect_uri"
