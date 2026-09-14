# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from urllib.parse import urlencode

# Django imports
from django.http import JsonResponse
from django.shortcuts import redirect
from django.template.response import TemplateResponse

# Third party imports
from oauth2_provider.exceptions import OAuthToolkitError
from oauth2_provider.models import get_application_model
from oauth2_provider.scopes import get_scopes_backend
from oauth2_provider.views.base import AuthorizationView

# Module imports
from plane.authentication.utils.host import base_host
from plane.oauth.forms import PlaneAllowForm

Application = get_application_model()

# Query parameters that make up an authorization request and therefore have to
# be carried across to the consent screen and back.
AUTHORIZATION_PARAMS = (
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "nonce",
    "resource",
    "prompt",
)


def consent_url(request):
    """The Plane web consent screen, carrying the original request verbatim."""
    params = {key: value for key, value in request.GET.items() if key in AUTHORIZATION_PARAMS}
    # base_host returns None when neither APP_BASE_URL nor WEB_URL is set; the
    # web app is served from this same origin, so a relative URL is correct.
    base = (base_host(request=request, is_app=True) or "").rstrip("/")
    return f"{base}/oauth/authorize?{urlencode(params)}"


class PlaneAuthorizationView(AuthorizationView):
    """
    The OAuth authorization endpoint.

    django-oauth-toolkit renders its own Django-template consent screen; Plane's
    UI lives in the React app, so the GET hop redirects there instead and the
    app posts the decision back to this same endpoint.
    """

    form_class = PlaneAllowForm

    def handle_no_permission(self):
        # Anonymous callers are sent to the consent route as well — the web
        # app's own auth guard bounces them through the normal sign-in flow and
        # back, so there is one login path rather than two.
        return redirect(consent_url(self.request))

    def get(self, request, *args, **kwargs):
        response = super().get(request, *args, **kwargs)

        # A 200 TemplateResponse means DOT wanted to show its own consent
        # screen: replace it with a redirect to ours. Errors it cannot redirect
        # to the client (an unregistered redirect_uri, say) are also rendered
        # from a template but carry a 4xx status, and must keep their status
        # rather than be laundered into a consent prompt.
        if isinstance(response, TemplateResponse) and response.status_code == 200:
            return redirect(consent_url(request))
        return response

    def form_valid(self, form):
        # Thread the resource indicator into the credentials oauthlib builds
        # the grant from; AllowForm alone would drop it at the consent screen.
        resource = form.cleaned_data.get("resource")
        if resource:
            self.request.GET = self.request.GET.copy()
            self.request.GET["resource"] = resource
        return super().form_valid(form)

    def get_initial(self):
        initial = super().get_initial()
        initial["resource"] = self.oauth2_data.get("resource", self.request.GET.get("resource"))
        return initial


class AuthorizationInfoEndpoint(PlaneAuthorizationView):
    """
    JSON description of a pending authorization request, for the consent screen.

    Validates the request exactly as the authorization endpoint does, so a
    malformed or unknown client is rejected before anything is shown to the
    user — the screen never renders a client Plane would refuse to authorize.
    """

    def handle_no_permission(self):
        return JsonResponse({"error": "unauthenticated"}, status=401)

    def get(self, request, *args, **kwargs):
        try:
            scopes, credentials = self.validate_authorization_request(request)
        except OAuthToolkitError as error:
            return JsonResponse({"error": str(error.oauthlib_error.error)}, status=400)

        application = Application.objects.get(client_id=credentials["client_id"])
        all_scopes = get_scopes_backend().get_all_scopes()

        return JsonResponse(
            {
                "client_id": application.client_id,
                "client_name": application.name,
                "client_uri": application.client_metadata_url,
                "is_dynamically_registered": application.is_dynamically_registered,
                "redirect_uri": credentials["redirect_uri"],
                "resource": request.GET.get("resource"),
                "scopes": [{"key": scope, "description": all_scopes.get(scope, scope)} for scope in scopes],
                "user": {
                    "id": str(request.user.id),
                    "email": request.user.email,
                    "display_name": request.user.display_name,
                },
            }
        )

    def post(self, request, *args, **kwargs):
        return JsonResponse({"error": "method_not_allowed"}, status=405)
