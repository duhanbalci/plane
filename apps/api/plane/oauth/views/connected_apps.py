# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
The user-facing side of OAuth: which applications hold a grant on this
account, and how to take it back.

Without this a user who authorizes an MCP client has no way to undo it —
the token simply lives until it expires.
"""

# Django imports
from django.db.models import Max, Min
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# Module imports
from plane.oauth.models import AccessToken, Application, Grant, RefreshToken
from plane.oauth.scopes import SCOPES


def describe_scopes(scope_string):
    """Turn a space-separated scope string into labelled entries for the UI."""
    return [
        {"key": scope, "description": SCOPES.get(scope, scope)} for scope in sorted(set(scope_string.split())) if scope
    ]


class ConnectedApplicationsEndpoint(APIView):
    """List the applications this user has authorized."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        live_tokens = AccessToken.objects.filter(user=request.user, expires__gt=timezone.now())

        # An application is "connected" while it holds a live access token or a
        # refresh token it could still trade in for one.
        application_ids = set(live_tokens.values_list("application_id", flat=True))
        application_ids.update(
            RefreshToken.objects.filter(user=request.user, revoked__isnull=True).values_list(
                "application_id", flat=True
            )
        )
        application_ids.discard(None)

        applications = Application.objects.filter(id__in=application_ids).order_by("name")

        # Scopes differ per token, so the screen shows the union of what the
        # application currently holds rather than any single token's scopes.
        token_spans = {
            row["application_id"]: row
            for row in AccessToken.objects.filter(user=request.user, application_id__in=application_ids)
            .values("application_id")
            .annotate(first_authorized=Min("created"), last_authorized=Max("created"))
        }
        scopes_by_application = {}
        for application_id, scope in live_tokens.values_list("application_id", "scope"):
            scopes_by_application.setdefault(application_id, set()).update(scope.split())

        payload = []
        for application in applications:
            span = token_spans.get(application.id, {})
            payload.append(
                {
                    "id": str(application.id),
                    "name": application.name,
                    "client_id": application.client_id,
                    "client_uri": application.client_metadata_url,
                    "is_dynamically_registered": application.is_dynamically_registered,
                    "scopes": describe_scopes(" ".join(sorted(scopes_by_application.get(application.id, set())))),
                    "authorized_at": span.get("first_authorized"),
                    "last_authorized_at": span.get("last_authorized"),
                    "last_used_at": application.last_used_at,
                }
            )

        return Response(payload, status=status.HTTP_200_OK)


class ConnectedApplicationDetailEndpoint(APIView):
    """Revoke everything one application holds on this account."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        application = Application.objects.filter(pk=pk).first()
        if application is None:
            return Response({"error": "Application not found"}, status=status.HTTP_404_NOT_FOUND)

        # Scoped to the requesting user: revoking must never touch anybody
        # else's grant on the same application.
        deleted, _ = AccessToken.objects.filter(user=request.user, application=application).delete()
        RefreshToken.objects.filter(user=request.user, application=application).delete()
        # Unredeemed authorization codes would otherwise still mint a token.
        Grant.objects.filter(user=request.user, application=application).delete()

        if not deleted:
            # Nothing to revoke either way; report it so the UI can refresh
            # instead of leaving a stale row on screen.
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(status=status.HTTP_204_NO_CONTENT)
