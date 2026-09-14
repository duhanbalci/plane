# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path
from oauth2_provider.views import RevokeTokenView, TokenView

from plane.oauth.views import (
    AuthorizationInfoEndpoint,
    DynamicClientRegistrationEndpoint,
    PlaneAuthorizationView,
    PlaneIntrospectTokenView,
)

app_name = "oauth"

urlpatterns = [
    path("authorize/", PlaneAuthorizationView.as_view(), name="authorize"),
    # Consulted by the web consent screen to describe the pending request.
    path("authorize/info/", AuthorizationInfoEndpoint.as_view(), name="authorize-info"),
    path("token/", TokenView.as_view(), name="token"),
    path("revoke/", RevokeTokenView.as_view(), name="revoke-token"),
    path("introspect/", PlaneIntrospectTokenView.as_view(), name="introspect"),
    path("register/", DynamicClientRegistrationEndpoint.as_view(), name="register"),
]
