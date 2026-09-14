# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
import hashlib

import pytest

from plane.oauth.models import Application


def pkce_pair(verifier="plane-test-code-verifier-0123456789abcdefghijklmnop"):
    """Return a (verifier, S256 challenge) pair."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


@pytest.fixture
def redirect_uri():
    return "http://127.0.0.1:33418/callback"


@pytest.fixture
def public_application(db, redirect_uri):
    return Application.objects.create(
        name="Test MCP Client",
        client_type=Application.CLIENT_PUBLIC,
        authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
        redirect_uris=redirect_uri,
        client_secret="",
        skip_authorization=False,
        is_dynamically_registered=True,
        user=None,
    )


@pytest.fixture
def browser_client(client, create_user):
    """
    A session-authenticated Django test client.

    The authorization endpoint is a plain Django view driven by a browser, not
    a DRF view, so DRF's force_authenticate does not apply to it.
    """
    client.force_login(create_user)
    return client


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    """
    The registration endpoint is throttled per IP and the cache is shared
    across tests, so one test's requests would otherwise exhaust the next
    test's budget.
    """
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()
