# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

import pytest
from django.utils import timezone

from plane.bgtasks.oauth_cleanup_task import (
    delete_abandoned_oauth_clients,
    delete_expired_oauth_grants,
)
from plane.oauth.models import AccessToken, Application, Grant

pytestmark = pytest.mark.unit


def make_client(created_days_ago=0, dynamic=True):
    application = Application.objects.create(
        name="Client",
        client_type=Application.CLIENT_PUBLIC,
        authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
        redirect_uris="http://127.0.0.1:3000/callback",
        client_secret="",
        is_dynamically_registered=dynamic,
        user=None,
    )
    if created_days_ago:
        Application.objects.filter(pk=application.pk).update(
            created=timezone.now() - timedelta(days=created_days_ago)
        )
    return application


class TestExpiredGrantCleanup:
    def test_removes_only_expired_codes(self, db, create_user):
        application = make_client()
        expired = Grant.objects.create(
            application=application,
            user=create_user,
            code="expired",
            expires=timezone.now() - timedelta(minutes=5),
            redirect_uri="http://127.0.0.1:3000/callback",
            scope="mcp:read",
        )
        live = Grant.objects.create(
            application=application,
            user=create_user,
            code="live",
            expires=timezone.now() + timedelta(minutes=1),
            redirect_uri="http://127.0.0.1:3000/callback",
            scope="mcp:read",
        )

        delete_expired_oauth_grants()

        assert not Grant.objects.filter(pk=expired.pk).exists()
        assert Grant.objects.filter(pk=live.pk).exists()


class TestAbandonedClientCleanup:
    def test_removes_an_old_client_that_never_authorized(self, db):
        abandoned = make_client(created_days_ago=3)

        delete_abandoned_oauth_clients()

        assert not Application.objects.filter(pk=abandoned.pk).exists()

    def test_keeps_a_client_that_holds_a_token(self, db, create_user):
        used = make_client(created_days_ago=3)
        AccessToken.objects.create(
            user=create_user,
            application=used,
            scope="mcp:read",
            token="still-in-use",
            expires=timezone.now() + timedelta(hours=1),
        )

        delete_abandoned_oauth_clients()

        assert Application.objects.filter(pk=used.pk).exists()

    def test_keeps_a_freshly_registered_client(self, db):
        fresh = make_client()

        delete_abandoned_oauth_clients()

        assert Application.objects.filter(pk=fresh.pk).exists()

    def test_keeps_manually_created_clients(self, db):
        manual = make_client(created_days_ago=90, dynamic=False)

        delete_abandoned_oauth_clients()

        assert Application.objects.filter(pk=manual.pk).exists()
