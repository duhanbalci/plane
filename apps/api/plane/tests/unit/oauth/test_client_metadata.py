# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json

import pytest
import requests
from django.core.cache import cache

from plane.oauth import client_metadata
from plane.oauth.client_metadata import (
    ClientMetadataError,
    fetch_client_metadata,
    get_or_create_application,
)
from plane.oauth.models import Application

pytestmark = pytest.mark.unit

DOCUMENT_URL = "https://app.example.com/oauth/client-metadata.json"


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.status_code = status_code
        self._body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.raw = self

    def read(self, amount, decode_content=True):
        return self._body[:amount]

    def close(self):
        pass


def valid_document(**overrides):
    document = {
        "client_id": DOCUMENT_URL,
        "client_name": "Example MCP Client",
        "client_uri": "https://app.example.com",
        "redirect_uris": ["http://127.0.0.1:3000/callback"],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    }
    document.update(overrides)
    return document


@pytest.fixture
def fetcher(mocker):
    return mocker.patch.object(client_metadata, "pinned_fetch")


class TestFetchClientMetadata:
    def test_accepts_a_well_formed_document(self, fetcher, db):
        fetcher.return_value = FakeResponse(valid_document())

        metadata = fetch_client_metadata(DOCUMENT_URL, use_cache=False)

        assert metadata["client_name"] == "Example MCP Client"
        assert metadata["redirect_uris"] == ["http://127.0.0.1:3000/callback"]

    def test_rejects_a_document_claiming_another_client_id(self, fetcher, db):
        fetcher.return_value = FakeResponse(valid_document(client_id="https://evil.example.net/x"))

        with pytest.raises(ClientMetadataError):
            fetch_client_metadata(DOCUMENT_URL, use_cache=False)

    def test_rejects_a_non_https_client_id(self, db):
        with pytest.raises(ClientMetadataError):
            fetch_client_metadata("http://app.example.com/metadata.json", use_cache=False)

    def test_rejects_a_document_without_redirect_uris(self, fetcher, db):
        fetcher.return_value = FakeResponse(valid_document(redirect_uris=[]))

        with pytest.raises(ClientMetadataError):
            fetch_client_metadata(DOCUMENT_URL, use_cache=False)

    def test_rejects_an_oversized_document(self, fetcher, db):
        oversized = b"{" + b"x" * (client_metadata.MAX_DOCUMENT_BYTES + 10)
        fetcher.return_value = FakeResponse(oversized)

        with pytest.raises(ClientMetadataError):
            fetch_client_metadata(DOCUMENT_URL, use_cache=False)

    def test_rejects_a_blocked_target(self, fetcher, db):
        # pinned_fetch raises ValueError for private ranges and rebinding.
        fetcher.side_effect = ValueError("resolves to a private address")

        with pytest.raises(ClientMetadataError):
            fetch_client_metadata("https://internal.lan/metadata.json", use_cache=False)

    def test_rejects_a_transport_failure(self, fetcher, db):
        fetcher.side_effect = requests.ConnectionError("boom")

        with pytest.raises(ClientMetadataError):
            fetch_client_metadata(DOCUMENT_URL, use_cache=False)

    def test_rejects_a_non_200_response(self, fetcher, db):
        fetcher.return_value = FakeResponse(valid_document(), status_code=404)

        with pytest.raises(ClientMetadataError):
            fetch_client_metadata(DOCUMENT_URL, use_cache=False)

    def test_caches_a_successful_fetch(self, fetcher, db):
        cache.clear()
        fetcher.return_value = FakeResponse(valid_document())

        fetch_client_metadata(DOCUMENT_URL)
        fetch_client_metadata(DOCUMENT_URL)

        assert fetcher.call_count == 1

    def test_does_not_cache_a_failure(self, fetcher, db):
        cache.clear()
        fetcher.side_effect = requests.ConnectionError("boom")

        for _ in range(2):
            with pytest.raises(ClientMetadataError):
                fetch_client_metadata(DOCUMENT_URL)

        assert fetcher.call_count == 2


class TestApplicationBacking:
    def test_creates_a_public_application_from_the_document(self, fetcher, db):
        fetcher.return_value = FakeResponse(valid_document())

        application = get_or_create_application(DOCUMENT_URL)

        assert application.client_id == DOCUMENT_URL
        assert application.client_type == Application.CLIENT_PUBLIC
        assert application.redirect_uris == "http://127.0.0.1:3000/callback"
        assert application.client_metadata_url == DOCUMENT_URL

    def test_refreshes_redirect_uris_when_the_document_changes(self, fetcher, db):
        cache.clear()
        fetcher.return_value = FakeResponse(valid_document())
        get_or_create_application(DOCUMENT_URL)

        cache.clear()
        fetcher.return_value = FakeResponse(valid_document(redirect_uris=["http://127.0.0.1:4000/callback"]))
        application = get_or_create_application(DOCUMENT_URL)

        assert Application.objects.count() == 1
        assert application.redirect_uris == "http://127.0.0.1:4000/callback"


class TestAuthorizeWithMetadataDocumentClient:
    def test_authorization_request_registers_the_client_on_the_fly(self, browser_client, fetcher, settings, db):
        cache.clear()
        settings.WEB_URL = "https://plane.example.com"
        fetcher.return_value = FakeResponse(valid_document())

        response = browser_client.get(
            "/auth/o/authorize/",
            {
                "client_id": DOCUMENT_URL,
                "redirect_uri": "http://127.0.0.1:3000/callback",
                "response_type": "code",
                "scope": "mcp:read",
                "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
                "code_challenge_method": "S256",
            },
        )

        assert response.status_code == 302
        assert response["Location"].startswith("https://plane.example.com/oauth/authorize")
        assert Application.objects.filter(client_id=DOCUMENT_URL).exists()

    def test_redirect_uri_outside_the_document_is_rejected(self, browser_client, fetcher, settings, db):
        cache.clear()
        fetcher.return_value = FakeResponse(valid_document())

        response = browser_client.get(
            "/auth/o/authorize/",
            {
                "client_id": DOCUMENT_URL,
                "redirect_uri": "http://127.0.0.1:3000/stolen",
                "response_type": "code",
                "scope": "mcp:read",
                "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
                "code_challenge_method": "S256",
            },
        )

        assert response.status_code == 400


class TestClaudeCodeShapedFlow:
    """
    Regression for the shape that failed in production: a metadata document
    listing portless loopback redirects, then an authorization request on an
    ephemeral port. django-oauth-toolkit's exact-match comparison rejected it
    with "Mismatching redirect URI".
    """

    CLAUDE_DOCUMENT_URL = "https://claude.ai/oauth/claude-code-client-metadata"

    def claude_document(self):
        return {
            "client_id": self.CLAUDE_DOCUMENT_URL,
            "client_name": "Claude Code",
            "redirect_uris": ["http://localhost/callback", "http://127.0.0.1/callback"],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        }

    def authorize(self, client, redirect_uri):
        return client.get(
            "/auth/o/authorize/",
            {
                "response_type": "code",
                "client_id": self.CLAUDE_DOCUMENT_URL,
                "code_challenge": "5hKaW5SL6DgyqEWCoCAA3KlMnPlBm8Jnt_KUWmCDr5w",
                "code_challenge_method": "S256",
                "redirect_uri": redirect_uri,
                "state": "_v29yzrT38duv4rykqjecl4-qQxmnyoSMvp0PwQsqXI",
                "scope": "mcp:read mcp:write",
                "resource": "https://plane.example.com/mcp",
            },
        )

    def test_ephemeral_port_reaches_the_consent_screen(self, browser_client, fetcher, settings, db):
        cache.clear()
        settings.WEB_URL = "https://plane.example.com"
        fetcher.return_value = FakeResponse(self.claude_document())

        response = self.authorize(browser_client, "http://localhost:58091/callback")

        assert response.status_code == 302
        assert response["Location"].startswith("https://plane.example.com/oauth/authorize")

    def test_consent_then_token_issues_a_code_to_the_ephemeral_port(self, browser_client, fetcher, settings, db):
        from urllib.parse import parse_qs, urlparse

        cache.clear()
        fetcher.return_value = FakeResponse(self.claude_document())
        redirect_uri = "http://localhost:58091/callback"
        # Register the client the way the authorization hop does.
        self.authorize(browser_client, redirect_uri)

        response = browser_client.post(
            "/auth/o/authorize/",
            {
                "allow": "True",
                "client_id": self.CLAUDE_DOCUMENT_URL,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "mcp:read mcp:write",
                "state": "opaque",
                "code_challenge": "5hKaW5SL6DgyqEWCoCAA3KlMnPlBm8Jnt_KUWmCDr5w",
                "code_challenge_method": "S256",
                "resource": "https://plane.example.com/mcp",
            },
        )

        assert response.status_code == 302, response.content
        location = urlparse(response["Location"])
        assert f"{location.scheme}://{location.netloc}{location.path}" == redirect_uri
        assert parse_qs(location.query)["code"]

    def test_a_different_path_on_the_loopback_port_is_still_rejected(self, browser_client, fetcher, settings, db):
        cache.clear()
        fetcher.return_value = FakeResponse(self.claude_document())

        response = self.authorize(browser_client, "http://localhost:58091/stolen")

        assert response.status_code == 400

    def test_a_document_with_a_public_http_redirect_is_refused(self, browser_client, fetcher, settings, db):
        cache.clear()
        fetcher.return_value = FakeResponse(
            self.claude_document() | {"redirect_uris": ["http://evil.example.net/callback"]}
        )

        response = self.authorize(browser_client, "http://evil.example.net/callback")

        # The document itself is invalid, so no client is registered at all.
        assert response.status_code == 400
        assert not Application.objects.filter(client_id=self.CLAUDE_DOCUMENT_URL).exists()
