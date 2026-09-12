# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for epics (Faz B)."""

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueType, Project, ProjectMember, State

ENABLE_TYPES = "/api/workspaces/{slug}/projects/{project_id}/issue-types/enable/"
PROJECT_DETAIL = "/api/workspaces/{slug}/projects/{project_id}/"
ISSUES = "/api/workspaces/{slug}/projects/{project_id}/issues/"
EPICS = "/api/workspaces/{slug}/projects/{project_id}/epics/"
EPIC_DETAIL = "/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/"
EPIC_ISSUES = "/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/issues/"
EPIC_ISSUE_DETAIL = "/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/issues/{issue_id}/"
EPIC_ANALYTICS = "/api/workspaces/{slug}/projects/{project_id}/epics/{epic_id}/analytics/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Epic Project",
        identifier="EPC",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(name="Todo", project=project, workspace=workspace, group="backlog", default=True)
    State.objects.create(name="Done", project=project, workspace=workspace, group="completed")
    return project


@pytest.fixture
def epic_project(session_client, workspace, project):
    """Project with work item types + epics turned on; returns (project, epic_type)."""
    assert (
        session_client.post(ENABLE_TYPES.format(slug=workspace.slug, project_id=project.id)).status_code
        == status.HTTP_200_OK
    )
    response = session_client.patch(
        PROJECT_DETAIL.format(slug=workspace.slug, project_id=project.id),
        {"is_epic_enabled": True},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    epic_type = IssueType.objects.get(workspace=workspace, is_epic=True)
    return project, epic_type


@pytest.mark.contract
class TestEpicFeatureToggle:
    @pytest.mark.django_db
    def test_enable_requires_work_item_types(self, session_client, workspace, project):
        response = session_client.patch(
            PROJECT_DETAIL.format(slug=workspace.slug, project_id=project.id),
            {"is_epic_enabled": True},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        project.refresh_from_db()
        assert project.is_epic_enabled is False

    @pytest.mark.django_db
    def test_enable_after_types(self, session_client, workspace, epic_project):
        project, _ = epic_project
        project.refresh_from_db()
        assert project.is_epic_enabled is True


@pytest.mark.contract
class TestEpicCrud:
    @pytest.mark.django_db
    def test_epic_hidden_from_issue_list_and_listed_in_epics(self, session_client, workspace, epic_project):
        project, _ = epic_project
        epic = session_client.post(
            EPICS.format(slug=workspace.slug, project_id=project.id), {"name": "Platform"}, format="json"
        )
        assert epic.status_code == status.HTTP_201_CREATED
        epic_id = epic.data["id"]

        issue = session_client.post(
            ISSUES.format(slug=workspace.slug, project_id=project.id), {"name": "Task"}, format="json"
        )
        assert issue.status_code == status.HTTP_201_CREATED
        issue_id = issue.data["id"]

        issues = session_client.get(ISSUES.format(slug=workspace.slug, project_id=project.id))
        issue_ids = [str(row["id"]) for row in issues.data["results"]]
        assert str(issue_id) in issue_ids
        assert str(epic_id) not in issue_ids

        epics = session_client.get(EPICS.format(slug=workspace.slug, project_id=project.id))
        epic_ids = [str(row["id"]) for row in epics.data["results"]]
        assert epic_ids == [str(epic_id)]

        # The epic is not reachable through the issue detail endpoint
        assert (
            session_client.get(ISSUES.format(slug=workspace.slug, project_id=project.id) + f"{epic_id}/").status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            session_client.get(
                EPIC_DETAIL.format(slug=workspace.slug, project_id=project.id, epic_id=epic_id)
            ).status_code
            == status.HTTP_200_OK
        )

    @pytest.mark.django_db
    def test_epic_with_parent_rejected(self, session_client, workspace, epic_project):
        project, _ = epic_project
        parent = session_client.post(
            ISSUES.format(slug=workspace.slug, project_id=project.id), {"name": "Parent"}, format="json"
        )
        response = session_client.post(
            EPICS.format(slug=workspace.slug, project_id=project.id),
            {"name": "Nested", "parent_id": str(parent.data["id"])},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_epic_requires_epic_type(self, session_client, workspace, epic_project):
        project, _ = epic_project
        default_type = IssueType.objects.get(workspace=workspace, is_epic=False)
        response = session_client.post(
            EPICS.format(slug=workspace.slug, project_id=project.id),
            {"name": "Not an epic", "type_id": str(default_type.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestEpicChildren:
    @pytest.mark.django_db
    def test_add_and_remove_child(self, session_client, workspace, epic_project):
        project, _ = epic_project
        epic_id = session_client.post(
            EPICS.format(slug=workspace.slug, project_id=project.id), {"name": "Platform"}, format="json"
        ).data["id"]
        issue_id = session_client.post(
            ISSUES.format(slug=workspace.slug, project_id=project.id), {"name": "Task"}, format="json"
        ).data["id"]

        add = session_client.post(
            EPIC_ISSUES.format(slug=workspace.slug, project_id=project.id, epic_id=epic_id),
            {"issues": [str(issue_id)]},
            format="json",
        )
        assert add.status_code == status.HTTP_200_OK
        assert str(Issue.objects.get(pk=issue_id).parent_id) == str(epic_id)

        children = session_client.get(EPIC_ISSUES.format(slug=workspace.slug, project_id=project.id, epic_id=epic_id))
        assert children.status_code == status.HTTP_200_OK
        assert [str(row["id"]) for row in children.data["sub_issues"]] == [str(issue_id)]

        remove = session_client.delete(
            EPIC_ISSUE_DETAIL.format(slug=workspace.slug, project_id=project.id, epic_id=epic_id, issue_id=issue_id)
        )
        assert remove.status_code == status.HTTP_204_NO_CONTENT
        assert Issue.objects.get(pk=issue_id).parent_id is None

    @pytest.mark.django_db
    def test_epic_cannot_be_a_sub_issue(self, session_client, workspace, epic_project):
        project, _ = epic_project
        epic_id = session_client.post(
            EPICS.format(slug=workspace.slug, project_id=project.id), {"name": "Platform"}, format="json"
        ).data["id"]
        issue_id = session_client.post(
            ISSUES.format(slug=workspace.slug, project_id=project.id), {"name": "Task"}, format="json"
        ).data["id"]

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue_id}/sub-issues/",
            {"sub_issue_ids": [str(epic_id)]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestEpicAnalytics:
    @pytest.mark.django_db
    def test_analytics_counts(self, session_client, workspace, epic_project):
        project, _ = epic_project
        backlog = State.objects.get(project=project, group="backlog")
        completed = State.objects.get(project=project, group="completed")
        epic_id = session_client.post(
            EPICS.format(slug=workspace.slug, project_id=project.id), {"name": "Platform"}, format="json"
        ).data["id"]

        for state in (backlog, backlog, completed):
            issue_id = session_client.post(
                ISSUES.format(slug=workspace.slug, project_id=project.id),
                {"name": "Task", "state_id": str(state.id)},
                format="json",
            ).data["id"]
            session_client.post(
                EPIC_ISSUES.format(slug=workspace.slug, project_id=project.id, epic_id=epic_id),
                {"issues": [str(issue_id)]},
                format="json",
            )

        response = session_client.get(
            EPIC_ANALYTICS.format(slug=workspace.slug, project_id=project.id, epic_id=epic_id)
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["backlog_issues"] == 2
        assert response.data["completed_issues"] == 1
        assert response.data["started_issues"] == 0
        assert response.data["cancelled_issues"] == 0
        assert response.data["unstarted_issues"] == 0
        assert response.data["overdue_issues"] == 0
