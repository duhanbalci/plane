# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework.permissions import BasePermission

# Module imports
from plane.oauth.models import AccessToken
from plane.oauth.scopes import READ, SAFE_METHODS, WRITE


class OAuthScopePermission(BasePermission):
    """
    Enforce ``mcp:read`` / ``mcp:write`` on requests authenticated with an
    OAuth access token.

    Requests authenticated any other way (API key, session) carry no OAuth
    token and pass straight through — the existing workspace and project
    permission classes remain the authority on what the user may touch. This
    class only narrows what a *token* may do on that user's behalf.
    """

    message = "This token does not carry the scope required for this request."

    def has_permission(self, request, view):
        token = getattr(request, "auth", None)
        if not isinstance(token, AccessToken):
            return True

        required_scope = READ if request.method in SAFE_METHODS else WRITE
        return token.is_valid([required_scope])
