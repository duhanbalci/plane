# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from io import StringIO

import base64
from datetime import timedelta

import pytest
from django.contrib.auth.hashers import check_password
from django.core.management import call_command
from django.utils import timezone

from plane.oauth.models import AccessToken, Application

pytestmark = pytest.mark.unit

COMMAND = "create_mcp_resource_server_client"


def run(*args):
    out = StringIO()
    call_command(COMMAND, *args, stdout=out)
    return out.getvalue()


def credentials(output):
    values = {}
    for line in output.splitlines():
        if "=" in line and line.startswith("MCP_INTROSPECTION_"):
            key, value = line.split("=", 1)
            values[key] = value
    return values


class TestCreateResourceServerClient:
    def test_creates_a_confidential_client_and_prints_credentials(self, db):
        output = run()

        values = credentials(output)
        application = Application.objects.get(name="Plane MCP server")
        assert values["MCP_INTROSPECTION_CLIENT_ID"] == application.client_id
        assert len(values["MCP_INTROSPECTION_CLIENT_SECRET"]) > 30
        assert application.client_type == Application.CLIENT_CONFIDENTIAL

    def test_printed_secret_is_accepted_by_the_introspection_endpoint(
        self, client, db, create_user, public_application
    ):
        """The end the operator actually cares about: the printed credentials
        let the MCP server introspect a token."""
        values = credentials(run())
        token = AccessToken.objects.create(
            user=create_user,
            application=public_application,
            scope="mcp:read",
            token="a-user-token",
            expires=timezone.now() + timedelta(hours=1),
        )
        raw = f"{values['MCP_INTROSPECTION_CLIENT_ID']}:{values['MCP_INTROSPECTION_CLIENT_SECRET']}".encode()

        response = client.post(
            "/auth/o/introspect/",
            {"token": token.token},
            HTTP_AUTHORIZATION="Basic " + base64.b64encode(raw).decode(),
        )

        assert response.status_code == 200
        assert response.json()["active"] is True

    def test_second_run_refuses_to_clobber_the_existing_client(self, db):
        first = credentials(run())

        output = run()

        assert "already exists" in output
        assert not credentials(output)
        application = Application.objects.get(name="Plane MCP server")
        assert check_password(first["MCP_INTROSPECTION_CLIENT_SECRET"], application.client_secret)

    def test_rotate_issues_a_new_working_secret(self, db):
        first = credentials(run())

        second = credentials(run("--rotate"))

        assert Application.objects.filter(name="Plane MCP server").count() == 1
        application = Application.objects.get(name="Plane MCP server")
        assert check_password(second["MCP_INTROSPECTION_CLIENT_SECRET"], application.client_secret)
        assert not check_password(first["MCP_INTROSPECTION_CLIENT_SECRET"], application.client_secret)
