# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The v1 cycle endpoints accept bare YYYY-MM-DD dates.

The MCP server's create_cycle / update_cycle tools send dates in that form, so
this pins it: the fields are DateTimeFields and a regression to strict
datetime parsing would break those tools with a 400.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Cycle, Project, ProjectMember


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Dated", identifier="DAT", workspace=workspace, created_by=create_user, cycle_view=True
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    return project


def cycles_url(slug, project_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/cycles/"


@pytest.mark.contract
class TestCycleDateStrings:
    @pytest.mark.django_db
    def test_create_and_reschedule_with_date_only_strings(self, api_key_client, workspace, project):
        start = date.today() + timedelta(days=3)
        end = start + timedelta(days=13)

        with patch("plane.api.views.cycle.model_activity"), patch("plane.api.views.cycle.issue_activity"):
            created = api_key_client.post(
                cycles_url(workspace.slug, project.id),
                {"name": "Sprint 1", "start_date": start.isoformat(), "end_date": end.isoformat()},
                format="json",
            )
            assert created.status_code == status.HTTP_201_CREATED, created.data

            cycle = Cycle.objects.get(pk=created.data["id"])
            assert cycle.start_date.date() == start
            assert cycle.end_date.date() == end

            new_end = end + timedelta(days=7)
            updated = api_key_client.patch(
                f"{cycles_url(workspace.slug, project.id)}{cycle.id}/",
                {"start_date": start.isoformat(), "end_date": new_end.isoformat()},
                format="json",
            )

        assert updated.status_code == status.HTTP_200_OK, updated.data
        cycle.refresh_from_db()
        assert cycle.end_date.date() == new_end
