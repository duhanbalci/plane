# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for dependency relations on ``IssueRelationViewSet``.

Timeline dependencies (FS/SS/FF) propagate dates along the relation graph, so
the graph must stay acyclic and the delete activity must log the real inverse
relation instead of the hardcoded ``blocked_by``/``blocking`` flip.
"""

import json

import pytest
from rest_framework import status

from plane.bgtasks.issue_activities_task import delete_issue_relation_activity
from plane.db.models import Issue, IssueRelation, Project, ProjectMember

RELATION_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/issue-relation/"


@pytest.fixture
def project(db, workspace, create_user):
    """A project the caller is an admin member of."""
    project = Project.objects.create(
        name="Timeline",
        identifier="TL",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


def _make_issue(name, project, workspace, author):
    issue = Issue(name=name, project=project, workspace=workspace)
    issue.save(created_by_id=author.id)
    return issue


@pytest.fixture
def issues(db, workspace, project, create_user):
    return {name: _make_issue(name, project, workspace, create_user) for name in ("a", "b", "c")}


def _create_relation(client, workspace, project, issue_id, relation_type, related_ids):
    url = RELATION_URL.format(slug=workspace.slug, project_id=project.id, issue_id=issue_id)
    return client.post(
        url,
        {"relation_type": relation_type, "issues": [str(i) for i in related_ids]},
        format="json",
    )


@pytest.mark.contract
class TestIssueRelationCycleGuard:
    """Dependency relations must never close a loop."""

    @pytest.mark.django_db
    def test_direct_cycle_rejected(self, session_client, workspace, project, issues):
        """A blocks B, then B blocks A -> 400 ``relation_cycle``."""
        first = _create_relation(session_client, workspace, project, issues["a"].id, "blocking", [issues["b"].id])
        assert first.status_code == status.HTTP_201_CREATED, f"Got {first.status_code}: {first.data!r}"

        second = _create_relation(session_client, workspace, project, issues["b"].id, "blocking", [issues["a"].id])
        assert second.status_code == status.HTTP_400_BAD_REQUEST, f"Got {second.status_code}: {second.data!r}"
        assert second.data == {"error": "relation_cycle"}
        assert IssueRelation.objects.count() == 1, "Cycle relation was persisted"

    @pytest.mark.django_db
    def test_transitive_cycle_rejected(self, session_client, workspace, project, issues):
        """A -> B -> C, then C -> A -> 400 ``relation_cycle``."""
        assert (
            _create_relation(
                session_client, workspace, project, issues["a"].id, "blocking", [issues["b"].id]
            ).status_code
            == status.HTTP_201_CREATED
        )
        assert (
            _create_relation(
                session_client, workspace, project, issues["b"].id, "blocking", [issues["c"].id]
            ).status_code
            == status.HTTP_201_CREATED
        )

        response = _create_relation(session_client, workspace, project, issues["c"].id, "blocking", [issues["a"].id])
        assert response.status_code == status.HTTP_400_BAD_REQUEST, f"Got {response.status_code}: {response.data!r}"
        assert response.data == {"error": "relation_cycle"}
        assert IssueRelation.objects.count() == 2

    @pytest.mark.django_db
    def test_mixed_kind_cycle_rejected(self, session_client, workspace, project, issues):
        """The guard spans relation kinds: A blocks B, then B starts before A."""
        assert (
            _create_relation(
                session_client, workspace, project, issues["a"].id, "blocking", [issues["b"].id]
            ).status_code
            == status.HTTP_201_CREATED
        )

        response = _create_relation(
            session_client, workspace, project, issues["b"].id, "start_before", [issues["a"].id]
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST, f"Got {response.status_code}: {response.data!r}"
        assert response.data == {"error": "relation_cycle"}

    @pytest.mark.django_db
    def test_self_relation_rejected(self, session_client, workspace, project, issues):
        response = _create_relation(session_client, workspace, project, issues["a"].id, "blocking", [issues["a"].id])
        assert response.status_code == status.HTTP_400_BAD_REQUEST, f"Got {response.status_code}: {response.data!r}"
        assert response.data == {"error": "relation_self"}
        assert IssueRelation.objects.count() == 0

    @pytest.mark.django_db
    def test_diamond_is_allowed(self, session_client, workspace, project, issues):
        """Two predecessors of the same dependent are not a cycle."""
        assert (
            _create_relation(
                session_client, workspace, project, issues["c"].id, "blocked_by", [issues["a"].id]
            ).status_code
            == status.HTTP_201_CREATED
        )
        response = _create_relation(session_client, workspace, project, issues["c"].id, "blocked_by", [issues["b"].id])
        assert response.status_code == status.HTTP_201_CREATED, f"Got {response.status_code}: {response.data!r}"
        assert IssueRelation.objects.count() == 2


@pytest.mark.contract
class TestStartStartRelation:
    """SS relations are stored canonically and answered with the inverse."""

    @pytest.mark.django_db
    def test_start_after_stored_as_start_before(self, session_client, workspace, project, issues):
        """``start_after`` on B with A flips the row and reports ``start_before``."""
        response = _create_relation(session_client, workspace, project, issues["b"].id, "start_after", [issues["a"].id])
        assert response.status_code == status.HTTP_201_CREATED, f"Got {response.status_code}: {response.data!r}"

        # The response describes the counterpart work item (A) from B's side
        assert [str(row["id"]) for row in response.data] == [str(issues["a"].id)]
        assert response.data[0]["relation_type"] == "start_before"

        relation = IssueRelation.objects.get()
        assert relation.issue_id == issues["a"].id
        assert relation.related_issue_id == issues["b"].id
        assert relation.relation_type == "start_before"


@pytest.mark.contract
class TestDeleteRelationActivity:
    """The inverse activity row must name the real inverse relation."""

    @pytest.mark.django_db
    def test_start_before_delete_logs_start_after(self, workspace, project, issues, create_user):
        issue_activities = []
        delete_issue_relation_activity(
            requested_data=json.dumps({"related_issue": str(issues["b"].id), "relation_type": "start_before"}),
            current_instance=None,
            issue_id=str(issues["a"].id),
            project_id=str(project.id),
            workspace_id=str(workspace.id),
            actor_id=str(create_user.id),
            issue_activities=issue_activities,
            epoch=1,
        )

        assert [activity.field for activity in issue_activities] == ["start_before", "start_after"]
        assert issue_activities[1].issue_id == str(issues["b"].id)
