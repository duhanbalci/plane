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
