# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.db import models

# Third party imports
from oauth2_provider.models import (
    AbstractAccessToken,
    AbstractApplication,
    AbstractGrant,
    AbstractIDToken,
    AbstractRefreshToken,
)

# django-oauth-toolkit's models reference each other through the swappable
# settings, so all five are swapped together — swapping only ``Application``
# leaves the token models pointing at the stock one.


class Application(AbstractApplication):
    """
    An OAuth client. Two kinds exist:

    * dynamically registered clients (RFC 7591), created by MCP clients such as
      Claude Desktop or Cursor with no human in the loop;
    * client-ID-metadata-document clients, whose ``client_id`` is the HTTPS URL
      the metadata was fetched from.
    """

    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)

    # Set when the client was created through the dynamic registration
    # endpoint. Used by the cleanup task to expire clients that never completed
    # an authorization.
    is_dynamically_registered = models.BooleanField(default=False)
    # RFC 7592 registration access token, returned once at registration time.
    registration_access_token = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    # Populated for client-ID-metadata-document clients: the URL the document
    # was fetched from (identical to client_id) and when it was last refreshed.
    client_metadata_url = models.URLField(max_length=2000, null=True, blank=True)
    client_metadata_fetched_at = models.DateTimeField(null=True, blank=True)

    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta(AbstractApplication.Meta):
        db_table = "oauth_applications"
        verbose_name = "OAuth Application"
        verbose_name_plural = "OAuth Applications"

    def __str__(self):
        return self.name or self.client_id


class Grant(AbstractGrant):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)
    # RFC 8707 resource indicator carried from /authorize through to the token.
    resource = models.URLField(max_length=2000, null=True, blank=True)

    class Meta(AbstractGrant.Meta):
        db_table = "oauth_grants"


class AccessToken(AbstractAccessToken):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)
    # RFC 8707 audience. The MCP resource server rejects tokens whose resource
    # is not its own URL, so a token minted for another resource server cannot
    # be replayed here.
    resource = models.URLField(max_length=2000, null=True, blank=True)

    class Meta(AbstractAccessToken.Meta):
        db_table = "oauth_access_tokens"


class RefreshToken(AbstractRefreshToken):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)

    class Meta(AbstractRefreshToken.Meta):
        db_table = "oauth_refresh_tokens"


class IDToken(AbstractIDToken):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)

    class Meta(AbstractIDToken.Meta):
        db_table = "oauth_id_tokens"
