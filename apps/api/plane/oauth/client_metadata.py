# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
OAuth Client ID Metadata Documents (CIMD).

The MCP authorization spec recommends clients identify themselves with an
HTTPS URL as their ``client_id``; the authorization server fetches the JSON
document at that URL to learn the client's name and redirect URIs. This
replaces dynamic registration for clients that can host a static file.

The fetch is an outbound request to a URL an unauthenticated caller chose, so
it goes through ``pinned_fetch`` (DNS-rebinding-safe, private ranges blocked)
exactly like webhook delivery does.
"""

# Python imports
import json
import logging

# Django imports
from django.core.cache import cache
from django.utils import timezone

# Third party imports
import requests

# Module imports
from plane.utils.url_security import pinned_fetch

logger = logging.getLogger("plane.oauth")

# A metadata document is a small JSON file; anything larger is not one.
MAX_DOCUMENT_BYTES = 64 * 1024
FETCH_TIMEOUT_SECONDS = 5
CACHE_TTL_SECONDS = 60 * 60
CACHE_PREFIX = "oauth:cimd:"


class ClientMetadataError(Exception):
    """Raised when a client ID metadata document is missing or invalid."""


def is_metadata_url(client_id):
    """A client_id is a metadata document URL when it is an https:// URL."""
    return isinstance(client_id, str) and client_id.startswith("https://")


def _validate_document(document, client_id):
    if not isinstance(document, dict):
        raise ClientMetadataError("Client metadata document must be a JSON object")

    # The document must claim the exact URL it was served from, otherwise one
    # host could hand out metadata impersonating another.
    if document.get("client_id") != client_id:
        raise ClientMetadataError("client_id in the document does not match the document URL")

    redirect_uris = document.get("redirect_uris")
    if not isinstance(redirect_uris, list) or not redirect_uris:
        raise ClientMetadataError("Client metadata document must list at least one redirect_uri")
    if not all(isinstance(uri, str) and uri for uri in redirect_uris):
        raise ClientMetadataError("redirect_uris must be a list of strings")

    grant_types = document.get("grant_types") or ["authorization_code"]
    if "authorization_code" not in grant_types:
        raise ClientMetadataError("Only the authorization_code grant is supported")

    return {
        "client_id": client_id,
        "client_name": document.get("client_name") or client_id,
        "client_uri": document.get("client_uri"),
        "logo_uri": document.get("logo_uri"),
        "redirect_uris": redirect_uris,
        "grant_types": grant_types,
        "token_endpoint_auth_method": document.get("token_endpoint_auth_method", "none"),
    }


def fetch_client_metadata(client_id, *, use_cache=True):
    """
    Fetch and validate the metadata document at ``client_id``.

    Returns the normalised document, or raises ``ClientMetadataError``. Results
    are cached for an hour; failures are not cached, so a client that fixes a
    broken document is not locked out for the rest of the TTL.
    """
    if not is_metadata_url(client_id):
        raise ClientMetadataError("client_id is not an https URL")

    cache_key = f"{CACHE_PREFIX}{client_id}"
    if use_cache:
        cached = cache.get(cache_key)
        if cached:
            return cached

    try:
        response = pinned_fetch(
            "GET",
            client_id,
            headers={"Accept": "application/json"},
            timeout=FETCH_TIMEOUT_SECONDS,
            stream=True,
        )
    except ValueError as exc:
        # Blocked target (private range, invalid URL, rebinding attempt).
        raise ClientMetadataError(f"Client metadata URL is not reachable: {exc}") from exc
    except requests.RequestException as exc:
        raise ClientMetadataError("Could not fetch the client metadata document") from exc

    try:
        if response.status_code != 200:
            raise ClientMetadataError(f"Client metadata document returned HTTP {response.status_code}")

        body = response.raw.read(MAX_DOCUMENT_BYTES + 1, decode_content=True)
        if len(body) > MAX_DOCUMENT_BYTES:
            raise ClientMetadataError("Client metadata document is too large")

        try:
            document = json.loads(body)
        except (ValueError, UnicodeDecodeError) as exc:
            raise ClientMetadataError("Client metadata document is not valid JSON") from exc
    finally:
        response.close()

    metadata = _validate_document(document, client_id)
    cache.set(cache_key, metadata, CACHE_TTL_SECONDS)
    return metadata


def get_or_create_application(client_id):
    """
    Return the ``Application`` row backing a metadata-document client, creating
    or refreshing it from the document as needed.

    The row exists only so the rest of django-oauth-toolkit has something to
    join against; the document remains the source of truth for the redirect
    URIs and is re-read whenever the cache entry expires.
    """
    from plane.oauth.models import Application

    metadata = fetch_client_metadata(client_id)
    redirect_uris = "\n".join(metadata["redirect_uris"])

    application, _ = Application.objects.update_or_create(
        client_id=client_id,
        defaults={
            "name": metadata["client_name"][:255],
            "redirect_uris": redirect_uris,
            "client_type": Application.CLIENT_PUBLIC,
            "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
            "client_secret": "",
            "skip_authorization": False,
            "client_metadata_url": client_id,
            "client_metadata_fetched_at": timezone.now(),
        },
    )
    return application
