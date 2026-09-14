# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from urllib.parse import parse_qs, urlparse

import pytest

from plane.oauth.models import AccessToken, Grant
from plane.tests.unit.oauth.conftest import pkce_pair

pytestmark = pytest.mark.unit

RESOURCE = "https://plane.example.com/mcp"


def authorize_params(application, redirect_uri, challenge, scope="mcp:read mcp:write"):
    return {
        "client_id": application.client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": "opaque-state",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": RESOURCE,
    }


def complete_authorization(client, application, redirect_uri, challenge, scope="mcp:read mcp:write"):
    """Approve the consent screen and return the authorization code."""
    params = authorize_params(application, redirect_uri, challenge, scope)
    response = client.post("/auth/o/authorize/", {**params, "allow": "True"})
    assert response.status_code == 302, response.content
    return parse_qs(urlparse(response["Location"]).query)["code"][0]


class TestAuthorizationEndpoint:
    def test_anonymous_request_is_sent_to_the_web_consent_screen(
        self, api_client, public_application, redirect_uri, settings
    ):
        settings.WEB_URL = "https://plane.example.com"
        _, challenge = pkce_pair()

        response = api_client.get(
            "/auth/o/authorize/", authorize_params(public_application, redirect_uri, challenge)
        )

        assert response.status_code == 302
        location = urlparse(response["Location"])
        assert location.path == "/oauth/authorize"
        # The whole request has to survive the hop, PKCE and resource included.
        carried = parse_qs(location.query)
        assert carried["client_id"] == [public_application.client_id]
        assert carried["code_challenge"] == [challenge]
        assert carried["resource"] == [RESOURCE]

    def test_authenticated_request_still_shows_consent(
        self, browser_client, public_application, redirect_uri, settings
    ):
        settings.WEB_URL = "https://plane.example.com"
        _, challenge = pkce_pair()

        response = browser_client.get(
            "/auth/o/authorize/", authorize_params(public_application, redirect_uri, challenge)
        )

        # REQUEST_APPROVAL_PROMPT is "force": a previous grant never silently
        # re-authorizes a third-party MCP client.
        assert response.status_code == 302
        assert urlparse(response["Location"]).path == "/oauth/authorize"

    def test_request_without_pkce_is_rejected(
        self, browser_client, public_application, redirect_uri
    ):
        params = authorize_params(public_application, redirect_uri, challenge="")
        params.pop("code_challenge")
        params.pop("code_challenge_method")

        response = browser_client.get("/auth/o/authorize/", params)

        assert response.status_code == 302
        error = parse_qs(urlparse(response["Location"]).query).get("error")
        assert error == ["invalid_request"]

    def test_unknown_redirect_uri_is_rejected(
        self, browser_client, public_application, redirect_uri
    ):
        _, challenge = pkce_pair()
        params = authorize_params(public_application, redirect_uri, challenge)
        params["redirect_uri"] = "http://127.0.0.1:9999/stolen"

        response = browser_client.get("/auth/o/authorize/", params)

        # A mismatched redirect URI must never be redirected to.
        assert response.status_code == 400


class TestAuthorizationInfoEndpoint:
    def test_describes_the_pending_request(
        self, browser_client, public_application, redirect_uri, create_user
    ):
        _, challenge = pkce_pair()

        response = browser_client.get(
            "/auth/o/authorize/info/",
            authorize_params(public_application, redirect_uri, challenge),
        )

        assert response.status_code == 200
        body = response.json()
        assert body["client_name"] == "Test MCP Client"
        assert body["is_dynamically_registered"] is True
        assert body["resource"] == RESOURCE
        assert [scope["key"] for scope in body["scopes"]] == ["mcp:read", "mcp:write"]
        assert body["user"]["email"] == create_user.email

    def test_requires_a_signed_in_user(self, api_client, public_application, redirect_uri):
        _, challenge = pkce_pair()

        response = api_client.get(
            "/auth/o/authorize/info/",
            authorize_params(public_application, redirect_uri, challenge),
        )

        assert response.status_code == 401

    def test_rejects_an_unknown_client(self, browser_client, redirect_uri, db):
        _, challenge = pkce_pair()

        response = browser_client.get(
            "/auth/o/authorize/info/",
            {
                "client_id": "does-not-exist",
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "mcp:read",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )

        assert response.status_code == 400


class TestTokenExchange:
    def test_full_authorization_code_flow(
        self, browser_client, api_client, public_application, redirect_uri, create_user
    ):
        verifier, challenge = pkce_pair()

        code = complete_authorization(browser_client, public_application, redirect_uri, challenge)

        response = api_client.post(
            "/auth/o/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": public_application.client_id,
                "code_verifier": verifier,
                "resource": RESOURCE,
            },
        )

        assert response.status_code == 200, response.content
        body = response.json()
        assert body["token_type"] == "Bearer"
        assert set(body["scope"].split()) == {"mcp:read", "mcp:write"}
        assert body["refresh_token"]

        token = AccessToken.objects.get(user=create_user)
        # RFC 8707: the audience recorded at /authorize survives to the token,
        # so the MCP server can refuse tokens minted for another resource.
        assert token.resource == RESOURCE

    def test_wrong_code_verifier_is_rejected(
        self, browser_client, api_client, public_application, redirect_uri
    ):
        _, challenge = pkce_pair()
        code = complete_authorization(browser_client, public_application, redirect_uri, challenge)

        response = api_client.post(
            "/auth/o/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": public_application.client_id,
                "code_verifier": "a-different-verifier-that-is-long-enough-to-pass",
            },
        )

        assert response.status_code == 400
        assert not AccessToken.objects.exists()

    def test_authorization_code_is_single_use(
        self, browser_client, api_client, public_application, redirect_uri
    ):
        verifier, challenge = pkce_pair()
        code = complete_authorization(browser_client, public_application, redirect_uri, challenge)
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": public_application.client_id,
            "code_verifier": verifier,
        }

        assert api_client.post("/auth/o/token/", payload).status_code == 200
        assert api_client.post("/auth/o/token/", payload).status_code == 400

    def test_denying_consent_issues_no_grant(
        self, browser_client, public_application, redirect_uri
    ):
        _, challenge = pkce_pair()
        params = authorize_params(public_application, redirect_uri, challenge)

        response = browser_client.post("/auth/o/authorize/", {**params, "allow": ""})

        assert response.status_code == 302
        assert parse_qs(urlparse(response["Location"]).query)["error"] == ["access_denied"]
        assert not Grant.objects.exists()

    def test_refresh_keeps_the_original_audience(
        self, browser_client, api_client, public_application, redirect_uri
    ):
        verifier, challenge = pkce_pair()
        code = complete_authorization(browser_client, public_application, redirect_uri, challenge)
        first = api_client.post(
            "/auth/o/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": public_application.client_id,
                "code_verifier": verifier,
                "resource": RESOURCE,
            },
        ).json()

        response = api_client.post(
            "/auth/o/token/",
            {
                "grant_type": "refresh_token",
                "refresh_token": first["refresh_token"],
                "client_id": public_application.client_id,
            },
        )

        assert response.status_code == 200, response.content
        refreshed = AccessToken.objects.get(token=response.json()["access_token"])
        assert refreshed.resource == RESOURCE
