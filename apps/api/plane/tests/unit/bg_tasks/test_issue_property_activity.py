# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the custom property activity handler."""

import json

import pytest

from plane.bgtasks.issue_activities_task import update_issue_property_activity
from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssueType,
    Project,
    ProjectMember,
)


@pytest.fixture
def issue_property_fixture(db, workspace, create_user):
    project = Project.objects.create(
        name="Activity Project", identifier="ACT", workspace=workspace, created_by=create_user
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    issue_type = IssueType.objects.create(workspace=workspace, name="Task", is_default=True)
    issue = Issue.objects.create(name="Item", project=project, workspace=workspace, type=issue_type)
    issue_property = IssueProperty.objects.create(
        workspace=workspace,
        project=project,
        issue_type=issue_type,
        name="severity",
        display_name="Severity",
        property_type=IssueProperty.PropertyType.OPTION,
    )
    option = IssuePropertyOption.objects.create(
        workspace=workspace, project=project, property=issue_property, name="High"
    )
    return project, issue, issue_property, option


@pytest.mark.unit
class TestIssuePropertyActivity:
    @pytest.mark.django_db
    def test_option_change_creates_one_row(self, issue_property_fixture, create_user):
        project, issue, issue_property, option = issue_property_fixture
        activities = []

        update_issue_property_activity(
            requested_data=json.dumps({"property_values": {str(issue_property.id): [str(option.id)]}}),
            current_instance=json.dumps({"property_values": {str(issue_property.id): []}}),
            issue_id=str(issue.id),
            project_id=str(project.id),
            workspace_id=str(project.workspace_id),
            actor_id=str(create_user.id),
            issue_activities=activities,
            epoch=0,
        )

        assert len(activities) == 1
        activity = activities[0]
        assert activity.field == "Severity"
        assert activity.old_value is None
        assert activity.new_value == "High"
        assert activity.verb == "updated"

    @pytest.mark.django_db
    def test_unchanged_values_create_no_row(self, issue_property_fixture, create_user):
        project, issue, issue_property, option = issue_property_fixture
        activities = []
        payload = json.dumps({"property_values": {str(issue_property.id): [str(option.id)]}})

        update_issue_property_activity(
            requested_data=payload,
            current_instance=payload,
            issue_id=str(issue.id),
            project_id=str(project.id),
            workspace_id=str(project.workspace_id),
            actor_id=str(create_user.id),
            issue_activities=activities,
            epoch=0,
        )

        assert activities == []
