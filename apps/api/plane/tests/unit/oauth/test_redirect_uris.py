# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.oauth.models import Application
from plane.oauth.redirect_uris import loopback_uri_matches, validate_redirect_uri

pytestmark = pytest.mark.unit


class TestValidateRedirectUri:
    @pytest.mark.parametrize(
        "uri",
        [
            "https://app.example.com/callback",
            "http://localhost/callback",
            "http://localhost:3000/callback",
            "http://127.0.0.1/callback",
            "http://[::1]/callback",
            "com.example.app:/oauth/callback",
        ],
    )
    def test_accepts(self, uri):
        assert validate_redirect_uri(uri) is None

    @pytest.mark.parametrize(
        "uri",
        [
            "http://evil.example.net/callback",
            "http://localhost.evil.example.net/callback",
            "/relative/callback",
            "myapp:/callback",
            "javascript:alert(1)",
        ],
    )
    def test_rejects(self, uri):
        assert validate_redirect_uri(uri) is not None


class TestLoopbackUriMatches:
    def test_ignores_the_port_on_a_portless_registration(self):
        assert loopback_uri_matches("http://localhost:58091/callback", "http://localhost/callback")

    def test_honours_a_pinned_port(self):
        # A registration that named a port opted out of the any-port rule.
        assert not loopback_uri_matches("http://localhost:58091/callback", "http://localhost:3000/callback")

    def test_requires_the_same_path(self):
        assert not loopback_uri_matches("http://localhost:58091/stolen", "http://localhost/callback")

    def test_requires_the_same_host_spelling(self):
        assert not loopback_uri_matches("http://127.0.0.1:58091/callback", "http://localhost/callback")

    def test_refuses_a_non_loopback_host(self):
        assert not loopback_uri_matches("http://evil.example.net:80/callback", "http://evil.example.net/callback")

    def test_refuses_https(self):
        assert not loopback_uri_matches("https://localhost:58091/callback", "https://localhost/callback")

    def test_registered_query_must_be_present(self):
        assert loopback_uri_matches("http://localhost:58091/callback?a=1&b=2", "http://localhost/callback?a=1")
        assert not loopback_uri_matches("http://localhost:58091/callback", "http://localhost/callback?a=1")


class TestApplicationRedirectUriAllowed:
    """
    The exact shape Claude Code presents: a client ID metadata document listing
    portless loopback URIs, then an authorization request on an ephemeral port.
    """

    @pytest.fixture
    def application(self, db):
        return Application.objects.create(
            name="Claude Code",
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://localhost/callback\nhttp://127.0.0.1/callback",
            client_secret="",
            user=None,
        )

    @pytest.mark.parametrize(
        "uri",
        [
            "http://localhost:58091/callback",
            "http://localhost/callback",
            "http://127.0.0.1:58091/callback",
            "http://127.0.0.1/callback",
        ],
    )
    def test_allows_any_loopback_port(self, application, uri):
        assert application.redirect_uri_allowed(uri)

    @pytest.mark.parametrize(
        "uri",
        [
            "http://localhost:58091/stolen",
            "http://evil.example.net/callback",
            "https://localhost:58091/callback",
            "http://localhost.evil.example.net:58091/callback",
        ],
    )
    def test_still_rejects_everything_else(self, application, uri):
        assert not application.redirect_uri_allowed(uri)

    def test_a_pinned_registration_is_unaffected(self, db):
        application = Application.objects.create(
            name="Pinned",
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://localhost:3000/callback",
            client_secret="",
            user=None,
        )

        assert application.redirect_uri_allowed("http://localhost:3000/callback")
        assert not application.redirect_uri_allowed("http://localhost:58091/callback")
