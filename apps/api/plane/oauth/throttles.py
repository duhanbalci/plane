# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hashlib
import os

# Third party imports
from rest_framework.throttling import SimpleRateThrottle

# Module imports
from plane.oauth.models import AccessToken


class OAuthTokenRateThrottle(SimpleRateThrottle):
    """
    Per-token budget for OAuth-authenticated API traffic.

    ``ApiKeyRateThrottle`` keys off the X-Api-Key header, which OAuth requests
    do not send, so they would otherwise be unthrottled.
    """

    scope = "oauth_token"
    rate = os.environ.get("OAUTH_TOKEN_RATE_LIMIT", "120/minute")

    def get_cache_key(self, request, view):
        token = getattr(request, "auth", None)
        if not isinstance(token, AccessToken):
            return None
        # Key on the stored checksum rather than the bearer value so the raw
        # token never reaches the cache backend.
        return f"{self.scope}:{hashlib.sha256(str(token.pk).encode()).hexdigest()}"
