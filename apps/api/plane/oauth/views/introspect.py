# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import calendar
import hashlib

# Django imports
from django.core.exceptions import ObjectDoesNotExist
from django.http import JsonResponse

# Third party imports
from oauth2_provider.models import get_access_token_model
from oauth2_provider.views.introspect import IntrospectTokenView


class PlaneIntrospectTokenView(IntrospectTokenView):
    """
    RFC 7662 introspection, extended with the two claims the MCP resource
    server needs: the Plane user id it will act as, and the RFC 8707 audience
    the token was minted for (so a token issued for another resource server
    cannot be replayed against /mcp).
    """

    @staticmethod
    def get_token_response(token_value=None):
        if not token_value:
            return JsonResponse({"active": False}, status=200)

        token_checksum = hashlib.sha256(token_value.encode("utf-8")).hexdigest()
        try:
            token = (
                get_access_token_model()
                .objects.select_related("user", "application")
                .get(token_checksum=token_checksum)
            )
        except ObjectDoesNotExist:
            return JsonResponse({"active": False}, status=200)

        if not token.is_valid() or not token.user or not token.user.is_active:
            return JsonResponse({"active": False}, status=200)

        data = {
            "active": True,
            "scope": token.scope,
            "exp": int(calendar.timegm(token.expires.timetuple())),
            "sub": str(token.user_id),
            "username": token.user.get_username(),
            "email": token.user.email,
            "token_type": "Bearer",
        }
        if token.application:
            data["client_id"] = token.application.client_id
            data["client_name"] = token.application.name
        if token.resource:
            data["aud"] = token.resource

        return JsonResponse(data)
