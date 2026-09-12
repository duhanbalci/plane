# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for work item types and custom properties (Faz A)."""

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
)

WORKSPACE_TYPES = "/api/workspaces/{slug}/issue-types/"
WORKSPACE_TYPE_DETAIL = "/api/workspaces/{slug}/issue-types/{type_id}/"
PROJECT_TYPES = "/api/workspaces/{slug}/projects/{project_id}/issue-types/"
PROJECT_TYPE_DETAIL = "/api/workspaces/{slug}/projects/{project_id}/issue-types/{type_id}/"
ENABLE = "/api/workspaces/{slug}/projects/{project_id}/issue-types/enable/"
PROPERTIES = "/api/workspaces/{slug}/projects/{project_id}/issue-types/{type_id}/properties/"
PROPERTY_DETAIL = "/api/workspaces/{slug}/projects/{project_id}/issue-types/{type_id}/properties/{property_id}/"
OPTIONS = "/api/workspaces/{slug}/projects/{project_id}/issue-types/{type_id}/properties/{property_id}/options/"
PROPERTY_VALUES = "/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/property-values/"
ISSUES = "/api/workspaces/{slug}/projects/{project_id}/issues/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Types Project",
        identifier="TYP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(name="Todo", project=project, workspace=workspace, group="backlog", default=True)
    return project


@pytest.fixture
def enabled_project(session_client, workspace, project):
    """Project with work item types turned on; returns (project, default_type)."""
    response = session_client.post(ENABLE.format(slug=workspace.slug, project_id=project.id))
    assert response.status_code == status.HTTP_200_OK
    default_type = IssueType.objects.get(
        workspace=workspace,
        project_issue_types__project_id=project.id,
        project_issue_types__is_default=True,
    )
    return project, default_type


def make_property(workspace, project, issue_type, **kwargs):
    defaults = {
        "name": "priority_level",
        "display_name": "Priority level",
        "property_type": IssueProperty.PropertyType.TEXT,
    }
    defaults.update(kwargs)
    return IssueProperty.objects.create(workspace=workspace, project=project, issue_type=issue_type, **defaults)


@pytest.mark.contract
class TestIssueTypeCRUD:
    @pytest.mark.django_db
    def test_workspace_type_crud(self, session_client, workspace, project):
        create = session_client.post(
            WORKSPACE_TYPES.format(slug=workspace.slug),
            {"name": "Bug", "description": "Defect"},
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        type_id = create.data["id"]
        assert create.data["project_ids"] == []

        listing = session_client.get(WORKSPACE_TYPES.format(slug=workspace.slug))
        assert listing.status_code == status.HTTP_200_OK
        assert [str(row["id"]) for row in listing.data] == [str(type_id)]

        # Duplicate names are rejected within the workspace
        duplicate = session_client.post(WORKSPACE_TYPES.format(slug=workspace.slug), {"name": "Bug"}, format="json")
        assert duplicate.status_code == status.HTTP_400_BAD_REQUEST

        patch = session_client.patch(
            WORKSPACE_TYPE_DETAIL.format(slug=workspace.slug, type_id=type_id),
            {"name": "Defect", "is_active": False},
            format="json",
        )
        assert patch.status_code == status.HTTP_200_OK
        assert patch.data["name"] == "Defect"
        assert patch.data["is_active"] is False

        delete = session_client.delete(WORKSPACE_TYPE_DETAIL.format(slug=workspace.slug, type_id=type_id))
        assert delete.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueType.objects.filter(pk=type_id).exists()

    @pytest.mark.django_db
    def test_project_type_create_links_and_default(self, session_client, workspace, project):
        first = session_client.post(
            PROJECT_TYPES.format(slug=workspace.slug, project_id=project.id),
            {"name": "Story", "is_default": True},
            format="json",
        )
        assert first.status_code == status.HTTP_201_CREATED
        assert str(project.id) in [str(pid) for pid in first.data["project_ids"]]

        second = session_client.post(
            PROJECT_TYPES.format(slug=workspace.slug, project_id=project.id),
            {"name": "Chore", "is_default": True},
            format="json",
        )
        assert second.status_code == status.HTTP_201_CREATED

        # Only one default per project
        defaults = ProjectIssueType.objects.filter(project_id=project.id, is_default=True)
        assert defaults.count() == 1
        assert str(defaults.first().issue_type_id) == str(second.data["id"])

        listing = session_client.get(PROJECT_TYPES.format(slug=workspace.slug, project_id=project.id))
        assert listing.status_code == status.HTTP_200_OK
        assert len(listing.data) == 2

        # DELETE only unlinks the type from the project
        unlink = session_client.delete(
            PROJECT_TYPE_DETAIL.format(slug=workspace.slug, project_id=project.id, type_id=first.data["id"])
        )
        assert unlink.status_code == status.HTTP_204_NO_CONTENT
        assert IssueType.objects.filter(pk=first.data["id"]).exists()
        assert not ProjectIssueType.objects.filter(project_id=project.id, issue_type_id=first.data["id"]).exists()


@pytest.mark.contract
class TestEnable:
    @pytest.mark.django_db
    def test_enable_seeds_and_is_idempotent(self, session_client, workspace, project):
        untyped = Issue.objects.create(name="Old work item", project=project, workspace=workspace)

        url = ENABLE.format(slug=workspace.slug, project_id=project.id)
        first = session_client.post(url)
        assert first.status_code == status.HTTP_200_OK
        assert len(first.data) == 2

        project.refresh_from_db()
        assert project.is_issue_type_enabled is True

        task = IssueType.objects.get(workspace=workspace, name="Task")
        epic = IssueType.objects.get(workspace=workspace, is_epic=True)
        assert epic.level == 1
        assert ProjectIssueType.objects.get(project=project, issue_type=task).is_default is True

        untyped.refresh_from_db()
        assert untyped.type_id == task.id

        # Second call changes nothing
        second = session_client.post(url)
        assert second.status_code == status.HTTP_200_OK
        assert IssueType.objects.filter(workspace=workspace).count() == 2
        assert ProjectIssueType.objects.filter(project=project).count() == 2

    @pytest.mark.django_db
    def test_issue_create_defaults_to_project_default_type(self, session_client, workspace, enabled_project, mocker):
        project, default_type = enabled_project
        mocker.patch("plane.app.views.issue.base.issue_activity.delay")

        response = session_client.post(
            ISSUES.format(slug=workspace.slug, project_id=project.id),
            {"name": "Typed work item"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        issue = Issue.objects.get(pk=response.data["id"])
        assert issue.type_id == default_type.id

    @pytest.mark.django_db
    def test_issue_create_rejects_unlinked_type(self, session_client, workspace, enabled_project, mocker):
        project, _ = enabled_project
        mocker.patch("plane.app.views.issue.base.issue_activity.delay")
        stranger = IssueType.objects.create(workspace=workspace, name="Unlinked")

        response = session_client.post(
            ISSUES.format(slug=workspace.slug, project_id=project.id),
            {"name": "Bad type", "type": str(stranger.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestProperties:
    @pytest.mark.django_db
    def test_property_and_option_crud(self, session_client, workspace, enabled_project):
        project, default_type = enabled_project
        create = session_client.post(
            PROPERTIES.format(slug=workspace.slug, project_id=project.id, type_id=default_type.id),
            {"name": "severity", "display_name": "Severity", "property_type": "option"},
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        property_id = create.data["id"]
        assert create.data["options"] == []

        option = session_client.post(
            OPTIONS.format(
                slug=workspace.slug,
                project_id=project.id,
                type_id=default_type.id,
                property_id=property_id,
            ),
            {"name": "High"},
            format="json",
        )
        assert option.status_code == status.HTTP_201_CREATED

        listing = session_client.get(
            PROPERTIES.format(slug=workspace.slug, project_id=project.id, type_id=default_type.id)
        )
        assert listing.status_code == status.HTTP_200_OK
        assert [opt["name"] for opt in listing.data[0]["options"]] == ["High"]

        patch = session_client.patch(
            PROPERTY_DETAIL.format(
                slug=workspace.slug,
                project_id=project.id,
                type_id=default_type.id,
                property_id=property_id,
            ),
            {"display_name": "Severity level", "is_multi": True},
            format="json",
        )
        assert patch.status_code == status.HTTP_200_OK
        assert patch.data["display_name"] == "Severity level"

    @pytest.mark.django_db
    def test_options_rejected_on_non_option_property(self, session_client, workspace, enabled_project):
        project, default_type = enabled_project
        text_property = make_property(workspace, project, default_type)
        response = session_client.post(
            OPTIONS.format(
                slug=workspace.slug,
                project_id=project.id,
                type_id=default_type.id,
                property_id=text_property.id,
            ),
            {"name": "Nope"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestPropertyValues:
    @pytest.fixture
    def issue(self, db, workspace, enabled_project):
        project, default_type = enabled_project
        return Issue.objects.create(name="Work item", project=project, workspace=workspace, type=default_type)

    @pytest.mark.django_db
    def test_patch_and_get_round_trip(self, session_client, workspace, enabled_project, issue, mocker):
        project, default_type = enabled_project
        mocker.patch("plane.app.views.issue_type.value.issue_activity.delay")
        text_property = make_property(workspace, project, default_type)

        url = PROPERTY_VALUES.format(slug=workspace.slug, project_id=project.id, issue_id=issue.id)
        patch = session_client.patch(url, {str(text_property.id): ["urgent"]}, format="json")
        assert patch.status_code == status.HTTP_200_OK
        assert patch.data[str(text_property.id)] == ["urgent"]

        read = session_client.get(url)
        assert read.status_code == status.HTTP_200_OK
        assert read.data[str(text_property.id)] == ["urgent"]

        # A second write replaces the previous rows instead of appending
        session_client.patch(url, {str(text_property.id): ["calm"]}, format="json")
        assert IssuePropertyValue.objects.filter(issue=issue, property=text_property).count() == 1

    @pytest.mark.django_db
    def test_required_property_missing_returns_400(self, session_client, workspace, enabled_project, issue, mocker):
        project, default_type = enabled_project
        mocker.patch("plane.app.views.issue_type.value.issue_activity.delay")
        required = make_property(workspace, project, default_type, name="owner_note", is_required=True)

        url = PROPERTY_VALUES.format(slug=workspace.slug, project_id=project.id, issue_id=issue.id)
        response = session_client.patch(url, {str(required.id): []}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required" in str(response.data["error"]).lower()

    @pytest.mark.django_db
    def test_single_value_property_rejects_multiple(self, session_client, workspace, enabled_project, issue, mocker):
        project, default_type = enabled_project
        mocker.patch("plane.app.views.issue_type.value.issue_activity.delay")
        single = make_property(workspace, project, default_type, name="single_note")
        multi = make_property(workspace, project, default_type, name="multi_note", is_multi=True)

        url = PROPERTY_VALUES.format(slug=workspace.slug, project_id=project.id, issue_id=issue.id)
        bad = session_client.patch(url, {str(single.id): ["a", "b"]}, format="json")
        assert bad.status_code == status.HTTP_400_BAD_REQUEST

        good = session_client.patch(url, {str(multi.id): ["a", "b"]}, format="json")
        assert good.status_code == status.HTTP_200_OK
        assert sorted(good.data[str(multi.id)]) == ["a", "b"]

    @pytest.mark.django_db
    def test_option_must_belong_to_property(self, session_client, workspace, enabled_project, issue, mocker):
        project, default_type = enabled_project
        mocker.patch("plane.app.views.issue_type.value.issue_activity.delay")
        first = make_property(
            workspace, project, default_type, name="first_opt", property_type=IssueProperty.PropertyType.OPTION
        )
        second = make_property(
            workspace, project, default_type, name="second_opt", property_type=IssueProperty.PropertyType.OPTION
        )
        foreign_option = IssuePropertyOption.objects.create(
            workspace=workspace, project=project, property=second, name="Foreign"
        )

        url = PROPERTY_VALUES.format(slug=workspace.slug, project_id=project.id, issue_id=issue.id)
        response = session_client.patch(url, {str(first.id): [str(foreign_option.id)]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_property_of_another_type_is_rejected(self, session_client, workspace, enabled_project, issue, mocker):
        project, _ = enabled_project
        mocker.patch("plane.app.views.issue_type.value.issue_activity.delay")
        other_type = IssueType.objects.create(workspace=workspace, name="Other")
        other_property = make_property(workspace, project, other_type, name="other_prop")

        url = PROPERTY_VALUES.format(slug=workspace.slug, project_id=project.id, issue_id=issue.id)
        response = session_client.patch(url, {str(other_property.id): ["x"]}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestIssueTypeFilters:
    @pytest.mark.django_db
    def test_filter_and_group_by_type(self, session_client, workspace, enabled_project):
        project, default_type = enabled_project
        epic_type = IssueType.objects.get(workspace=workspace, is_epic=True)
        typed = Issue.objects.create(name="Typed", project=project, workspace=workspace, type=default_type)
        Issue.objects.create(name="Epic one", project=project, workspace=workspace, type=epic_type)

        url = ISSUES.format(slug=workspace.slug, project_id=project.id)
        filtered = session_client.get(url, {"issue_type": str(default_type.id)})
        assert filtered.status_code == status.HTTP_200_OK
        ids = [str(row["id"]) for row in filtered.data["results"]]
        assert ids == [str(typed.id)]

        grouped = session_client.get(url, {"group_by": "type_id"})
        assert grouped.status_code == status.HTTP_200_OK
        assert str(default_type.id) in grouped.data["results"]
