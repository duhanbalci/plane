# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import secrets

# Django imports
from django.core.management.base import BaseCommand

# Module imports
from plane.oauth.models import Application

CLIENT_NAME = "Plane MCP server"


class Command(BaseCommand):
    help = (
        "Create (or rotate) the confidential OAuth client the MCP server uses to introspect "
        "access tokens. Prints the credentials to set as MCP_INTROSPECTION_CLIENT_ID and "
        "MCP_INTROSPECTION_CLIENT_SECRET."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--rotate",
            action="store_true",
            help="Issue a new secret for the existing client instead of failing.",
        )

    def handle(self, *args, **options):
        secret = secrets.token_urlsafe(48)
        existing = Application.objects.filter(name=CLIENT_NAME).first()

        if existing and not options["rotate"]:
            self.stdout.write(
                self.style.WARNING(
                    f"A client named {CLIENT_NAME!r} already exists (client_id: {existing.client_id}).\n"
                    "Its secret is hashed and cannot be read back. Re-run with --rotate to issue a new one."
                )
            )
            return

        if existing:
            # Assigning the plaintext secret is correct: the model hashes it on save.
            existing.client_secret = secret
            existing.save(update_fields=["client_secret"])
            application = existing
            action = "Rotated"
        else:
            application = Application.objects.create(
                name=CLIENT_NAME,
                client_type=Application.CLIENT_CONFIDENTIAL,
                authorization_grant_type=Application.GRANT_CLIENT_CREDENTIALS,
                client_secret=secret,
                user=None,
            )
            action = "Created"

        self.stdout.write(self.style.SUCCESS(f"{action} the MCP resource server client."))
        self.stdout.write("")
        self.stdout.write(f"MCP_INTROSPECTION_CLIENT_ID={application.client_id}")
        self.stdout.write(f"MCP_INTROSPECTION_CLIENT_SECRET={secret}")
        self.stdout.write("")
        self.stdout.write(self.style.WARNING("The secret is hashed on save and will not be shown again. Store it now."))
