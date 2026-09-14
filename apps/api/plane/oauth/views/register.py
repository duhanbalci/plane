# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
RFC 7591 dynamic client registration.

MCP clients that cannot host a client ID metadata document register here
instead. The endpoint is unauthenticated by specification, so it is rate
limited per IP and the clients it creates are public (PKCE, no secret) and
restricted to the authorization code grant.
"""

# Python imports
import secrets

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# Module imports
from plane.oauth.models import Application
from plane.oauth.rate_limit import DynamicClientRegistrationThrottle
from plane.oauth.redirect_uris import validate_redirect_uri

MAX_REDIRECT_URIS = 10
MAX_CLIENT_NAME_LENGTH = 255


def _error(code, description, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"error": code, "error_description": description}, status=http_status)


class DynamicClientRegistrationEndpoint(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [DynamicClientRegistrationThrottle]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict):
            return _error("invalid_client_metadata", "The request body must be a JSON object")

        redirect_uris = payload.get("redirect_uris")
        if not isinstance(redirect_uris, list) or not redirect_uris:
            return _error("invalid_redirect_uri", "redirect_uris is required and must be a non-empty list")
        if len(redirect_uris) > MAX_REDIRECT_URIS:
            return _error("invalid_redirect_uri", f"At most {MAX_REDIRECT_URIS} redirect URIs are allowed")

        for uri in redirect_uris:
            if not isinstance(uri, str):
                return _error("invalid_redirect_uri", "Every redirect URI must be a string")
            failure = validate_redirect_uri(uri)
            if failure:
                return _error("invalid_redirect_uri", failure)

        grant_types = payload.get("grant_types") or ["authorization_code"]
        unsupported = set(grant_types) - {"authorization_code", "refresh_token"}
        if unsupported:
            return _error(
                "invalid_client_metadata",
                f"Unsupported grant types: {', '.join(sorted(unsupported))}",
            )
        if "authorization_code" not in grant_types:
            return _error("invalid_client_metadata", "The authorization_code grant is required")

        response_types = payload.get("response_types") or ["code"]
        if set(response_types) - {"code"}:
            return _error("invalid_client_metadata", "Only the code response type is supported")

        auth_method = payload.get("token_endpoint_auth_method", "none")
        if auth_method != "none":
            return _error(
                "invalid_client_metadata",
                "Only public clients are supported; use token_endpoint_auth_method=none with PKCE",
            )

        client_name = str(payload.get("client_name") or "MCP client")[:MAX_CLIENT_NAME_LENGTH]
        registration_access_token = secrets.token_urlsafe(32)

        application = Application.objects.create(
            name=client_name,
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="\n".join(redirect_uris),
            client_secret="",
            skip_authorization=False,
            is_dynamically_registered=True,
            registration_access_token=registration_access_token,
            user=None,
        )

        return Response(
            {
                "client_id": application.client_id,
                "client_id_issued_at": int(timezone.now().timestamp()),
                "client_name": application.name,
                "redirect_uris": redirect_uris,
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
                "registration_access_token": registration_access_token,
            },
            status=status.HTTP_201_CREATED,
        )
