# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Redirect URI rules shared by dynamic client registration and client ID
metadata documents. Both accept redirect URIs from an unauthenticated caller,
so both have to apply the same policy.
"""

# Python imports
from urllib.parse import parse_qsl, urlparse

# Loopback hosts a native client may redirect to over plain http (RFC 8252
# §7.3). "localhost" is included because clients register it in practice, even
# though the RFC prefers the IP literal.
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


def validate_redirect_uri(uri):
    """Return an error string, or None when the URI is acceptable."""
    try:
        parsed = urlparse(uri)
    except ValueError:
        return f"{uri} is not a valid URI"

    if not parsed.scheme:
        return f"{uri} must be absolute"

    if parsed.scheme == "https":
        return None

    if parsed.scheme == "http":
        if parsed.hostname in LOOPBACK_HOSTS:
            return None
        # Anything else over http would hand the authorization code to a
        # network attacker in cleartext.
        return f"{uri} must use https unless it is a loopback address"

    # Private-use URI scheme (com.example.app:/callback) — allowed for native
    # clients, but it must be a reverse-domain scheme rather than a bare word,
    # so it cannot collide with a well-known scheme.
    if "." in parsed.scheme:
        return None

    return f"{uri} uses an unsupported scheme"


def loopback_uri_matches(requested, allowed):
    """
    Whether a requested loopback redirect URI matches a registered one,
    ignoring the port.

    RFC 8252 §7.3 requires the authorization server to allow any port on a
    loopback redirect, because native clients take an ephemeral port from the
    OS at request time. django-oauth-toolkit implements this, but only for the
    "127.0.0.1" and "::1" spellings; clients that register
    "http://localhost/callback" — Claude Code among them — would otherwise fail
    the exact-match comparison as soon as a port is appended.
    """
    requested_parsed = urlparse(requested)
    allowed_parsed = urlparse(allowed)

    if requested_parsed.scheme != "http" or allowed_parsed.scheme != "http":
        return False
    if allowed_parsed.hostname not in LOOPBACK_HOSTS:
        return False
    if allowed_parsed.hostname != requested_parsed.hostname:
        return False
    # Only a registration that declined to pin a port opts into any port.
    if allowed_parsed.port is not None:
        return False
    if allowed_parsed.path != requested_parsed.path:
        return False

    # Same rule django-oauth-toolkit applies: registered query parameters must
    # all be present in the request, extras are allowed.
    return set(parse_qsl(allowed_parsed.query)).issubset(set(parse_qsl(requested_parsed.query)))
