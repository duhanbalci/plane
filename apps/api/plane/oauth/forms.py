# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django import forms
from oauth2_provider.forms import AllowForm


class PlaneAllowForm(AllowForm):
    """
    django-oauth-toolkit's consent form plus the RFC 8707 resource indicator,
    which has to survive the round trip through the consent screen so the
    issued token is bound to the MCP server the client actually asked for.
    """

    resource = forms.CharField(required=False, widget=forms.HiddenInput())
