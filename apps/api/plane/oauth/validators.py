# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging

# Third party imports
from oauth2_provider.oauth2_validators import OAuth2Validator

# Module imports
from plane.oauth.client_metadata import (
    ClientMetadataError,
    get_or_create_application,
    is_metadata_url,
)
from plane.oauth.scopes import DEFAULT_SCOPES

logger = logging.getLogger("plane.oauth")


class PlaneOAuth2Validator(OAuth2Validator):
    """
    Adds the two pieces of the MCP authorization profile that
    django-oauth-toolkit does not ship: client ID metadata documents
    (client_id is an https URL) and RFC 8707 resource indicators.
    """

    # -- client ID metadata documents -------------------------------------

    def validate_client_id(self, client_id, request, *args, **kwargs):
        if super().validate_client_id(client_id, request, *args, **kwargs):
            return True

        # No local Application row. If the client identified itself with an
        # https URL, the document at that URL is its registration.
        if not is_metadata_url(client_id):
            return False

        try:
            request.client = get_or_create_application(client_id)
        except ClientMetadataError as exc:
            logger.info("Rejected client ID metadata document for %s: %s", client_id, exc)
            return False

        return True

    def authenticate_client_id(self, client_id, request, *args, **kwargs):
        # Runs on the token request for public clients; the Application row may
        # still be missing if this process never served the /authorize hop.
        if not request.client and is_metadata_url(client_id):
            try:
                request.client = get_or_create_application(client_id)
            except ClientMetadataError as exc:
                logger.info("Rejected client ID metadata document for %s: %s", client_id, exc)
                return False
        return super().authenticate_client_id(client_id, request, *args, **kwargs)

    # -- scopes -----------------------------------------------------------

    def get_default_scopes(self, client_id, request, *args, **kwargs):
        return list(DEFAULT_SCOPES)

    def is_pkce_required(self, client_id, request):
        # OAuth 2.1: PKCE is mandatory for every authorization code request,
        # not only for public clients.
        return True

    # -- RFC 8707 resource indicators -------------------------------------

    @staticmethod
    def _requested_resource(request):
        """
        The ``resource`` parameter as sent on /authorize or /token.

        oauthlib exposes unknown parameters as attributes, and raises
        AttributeError when they were not sent at all. Multiple resource
        indicators are allowed by the RFC; MCP clients send exactly one, so
        only the first is kept.
        """
        resource = getattr(request, "resource", None)
        if isinstance(resource, (list, tuple)):
            resource = resource[0] if resource else None
        return resource or None

    def _create_authorization_code(self, request, code, expires=None):
        grant = super()._create_authorization_code(request, code, expires=expires)
        resource = self._requested_resource(request)
        if resource:
            grant.resource = resource
            grant.save(update_fields=["resource"])
        return grant

    def validate_code(self, client_id, code, client, request, *args, **kwargs):
        valid = super().validate_code(client_id, code, client, request, *args, **kwargs)
        if valid:
            # Carry the resource recorded at /authorize through to the access
            # token; the grant row is deleted once the code is redeemed.
            from plane.oauth.models import Grant

            grant = Grant.objects.filter(code=code, application=client).first()
            if grant is not None and grant.resource:
                request._plane_resource = grant.resource
        return valid

    def get_original_scopes(self, refresh_token, request, *args, **kwargs):
        # A refresh keeps the audience the original token was minted for.
        # ``refresh_token`` is the raw token string here; validate_refresh_token
        # has already attached the loaded row to the request.
        instance = getattr(request, "refresh_token_instance", None)
        access_token = getattr(instance, "access_token", None)
        if access_token is not None and access_token.resource:
            request._plane_resource = access_token.resource
        return super().get_original_scopes(refresh_token, request, *args, **kwargs)

    def _create_access_token(self, expires, request, token, source_refresh_token=None):
        access_token = super()._create_access_token(
            expires, request, token, source_refresh_token=source_refresh_token
        )
        resource = getattr(request, "_plane_resource", None) or self._requested_resource(request)
        if resource:
            access_token.resource = resource
            access_token.save(update_fields=["resource"])
        return access_token
