# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import calendar
import hashlib
from datetime import timedelta

# Django imports
from django.core.exceptions import ObjectDoesNotExist
from django.http import JsonResponse
from django.utils import timezone

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

    # How stale application.last_used_at may get. Introspection runs on every
    # MCP request that misses the resource server's cache, so writing it every
    # time would be a needless write per request for a field the account screen
    # only shows to the minute.
    LAST_USED_RESOLUTION = timedelta(minutes=5)

    @classmethod
    def touch_last_used(cls, application):
        now = timezone.now()
        if application.last_used_at and now - application.last_used_at < cls.LAST_USED_RESOLUTION:
            return
        application.last_used_at = now
        application.save(update_fields=["last_used_at"])

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
            PlaneIntrospectTokenView.touch_last_used(token.application)
        if token.resource:
            data["aud"] = token.resource

        return JsonResponse(data)
