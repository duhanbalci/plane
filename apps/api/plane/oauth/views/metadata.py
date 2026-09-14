# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.http import JsonResponse
from django.urls import reverse
from django.views import View

# Module imports
from plane.oauth.scopes import SCOPES


def issuer_url(request):
    """
    The authorization server's issuer identifier.

    Prefer the configured base URL over the request's Host header so a forged
    Host cannot make Plane advertise endpoints on an attacker's domain.
    """
    base = settings.APP_BASE_URL or settings.WEB_URL
    if base:
        return base.rstrip("/")
    return request.build_absolute_uri("/").rstrip("/")


class AuthorizationServerMetadataView(View):
    """
    RFC 8414 authorization server metadata.

    MCP clients read this after discovering the authorization server through
    the resource server's RFC 9728 document, and use it to locate the
    authorization, token and registration endpoints.
    """

    def get(self, request, *args, **kwargs):
        issuer = issuer_url(request)

        return JsonResponse(
            {
                "issuer": issuer,
                "authorization_endpoint": issuer + reverse("oauth:authorize"),
                "token_endpoint": issuer + reverse("oauth:token"),
                "revocation_endpoint": issuer + reverse("oauth:revoke-token"),
                "introspection_endpoint": issuer + reverse("oauth:introspect"),
                "registration_endpoint": issuer + reverse("oauth:register"),
                "scopes_supported": sorted(SCOPES.keys()),
                "response_types_supported": ["code"],
                "grant_types_supported": ["authorization_code", "refresh_token"],
                # OAuth 2.1: PKCE with S256 only; "plain" is not offered.
                "code_challenge_methods_supported": ["S256"],
                "token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
                "resource_indicators_supported": True,
                "client_id_metadata_document_supported": True,
                "service_documentation": "https://developers.plane.so/",
            }
        )
