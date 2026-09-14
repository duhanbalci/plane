# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging
import os
from datetime import timedelta

# Django imports
from django.db.models import Exists, OuterRef
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.oauth.models import AccessToken, Application, Grant, RefreshToken
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")

# How long a dynamically registered client may sit without a single
# authorization before it is treated as registration spam.
ABANDONED_CLIENT_HOURS = int(os.environ.get("OAUTH_ABANDONED_CLIENT_HOURS", 24))


@shared_task
def delete_expired_oauth_grants():
    """Authorization codes live for a minute; expired rows are pure litter."""
    try:
        deleted, _ = Grant.objects.filter(expires__lt=timezone.now()).delete()
        if deleted:
            logger.info("Deleted %s expired OAuth authorization codes", deleted)
    except Exception as e:
        log_exception(e)


@shared_task
def delete_abandoned_oauth_clients():
    """
    Drop dynamically registered clients that never completed an authorization.

    The registration endpoint is unauthenticated by specification, so anyone
    can create rows there. A real MCP client authorizes within seconds of
    registering; anything still tokenless a day later was never used.
    """
    try:
        cutoff = timezone.now() - timedelta(hours=ABANDONED_CLIENT_HOURS)
        abandoned = (
            Application.objects.filter(is_dynamically_registered=True, created__lt=cutoff)
            .annotate(
                has_token=Exists(AccessToken.objects.filter(application=OuterRef("pk"))),
                has_refresh_token=Exists(RefreshToken.objects.filter(application=OuterRef("pk"))),
                has_grant=Exists(Grant.objects.filter(application=OuterRef("pk"))),
            )
            .filter(has_token=False, has_refresh_token=False, has_grant=False)
        )

        deleted, _ = abandoned.delete()
        if deleted:
            logger.info("Deleted %s abandoned dynamically registered OAuth clients", deleted)
    except Exception as e:
        log_exception(e)
