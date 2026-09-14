# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os

# Third party imports
from rest_framework.throttling import AnonRateThrottle


class DynamicClientRegistrationThrottle(AnonRateThrottle):
    """
    The registration endpoint is unauthenticated by design (RFC 7591), so it is
    the one place an anonymous caller can create rows. Keep the per-IP budget
    tight — a real MCP client registers once per installation.
    """

    # Deliberately low, but not so low that a team onboarding behind one NAT
    # locks itself out. Tune with OAUTH_REGISTRATION_RATE_LIMIT.
    rate = os.environ.get("OAUTH_REGISTRATION_RATE_LIMIT", "20/hour")
    scope = "oauth_registration"
