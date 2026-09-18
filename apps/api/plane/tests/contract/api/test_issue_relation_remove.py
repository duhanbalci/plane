# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for ``IssueRelationRemoveAPIEndpoint`` (v1).

The v1 API could create relations but not remove them. A relation is stored
once, from one side — "A blocking B" is saved as B blocked_by A — so removal
has to find the pair whichever way round it was recorded.
"""

from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueRelation, Project, ProjectMember, State
from plane.utils.issue_relation_mapper import get_actual_relation


def relations_url(slug, project_id, issue_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/work-items/{issue_id}/relations/"


def remove_url(slug, project_id, issue_id):
    return f"{relations_url(slug, project_id, issue_id)}remove/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(name="Relations", identifier="REL", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.create(
        name="Backlog",
        color="#000000",
        group="backlog",
        default=True,
        project=project,
        workspace=workspace,
        created_by=create_user,
    )
    return project


@pytest.fixture
def issues(db, project, workspace, create_user):
    return [
        Issue.objects.create(name=name, project=project, workspace=workspace, created_by=create_user)
        for name in ("First", "Second", "Third")
    ]


def relate(issue, related, relation_type):
    """Store a relation the way the create endpoint does: reverse types flip the pair."""
    is_reverse = relation_type in ("blocking", "start_after", "finish_after")
    return IssueRelation.objects.create(
        issue=related if is_reverse else issue,
        related_issue=issue if is_reverse else related,
        relation_type=get_actual_relation(relation_type),
        project=issue.project,
        workspace=issue.workspace,
    )


@pytest.mark.contract
class TestIssueRelationRemove:
    @pytest.mark.django_db
    def test_removes_a_relation_created_from_this_side(self, api_key_client, workspace, project, issues):
        first, second, third = issues
        relate(first, second, "relates_to")
        relate(first, third, "relates_to")

        with patch("plane.api.views.issue.issue_activity") as activity:
            response = api_key_client.post(
                remove_url(workspace.slug, project.id, first.id), {"related_issue": str(second.id)}, format="json"
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        pairs = {(str(r.issue_id), str(r.related_issue_id)) for r in IssueRelation.objects.all()}
        assert pairs == {(str(first.id), str(third.id))}, "only the named relation goes"
        activity.delay.assert_called_once()
        assert activity.delay.call_args.kwargs["type"] == "issue_relation.activity.deleted"

    @pytest.mark.django_db
    def test_removes_a_reverse_relation_from_either_side(self, api_key_client, workspace, project, issues):
        first, second, _ = issues
        # "first blocking second" is stored as second blocked_by first.
        relate(first, second, "blocking")
        assert IssueRelation.objects.filter(issue_id=second.id, related_issue_id=first.id).exists()

        with patch("plane.api.views.issue.issue_activity"):
            response = api_key_client.post(
                remove_url(workspace.slug, project.id, first.id), {"related_issue": str(second.id)}, format="json"
            )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueRelation.objects.exists()

    @pytest.mark.django_db
    def test_unrelated_pair_is_not_found(self, api_key_client, workspace, project, issues):
        first, second, _ = issues

        response = api_key_client.post(
            remove_url(workspace.slug, project.id, first.id), {"related_issue": str(second.id)}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_rejects_a_missing_or_malformed_related_issue(self, api_key_client, workspace, project, issues):
        first = issues[0]

        for body in ({}, {"related_issue": "not-a-uuid"}):
            response = api_key_client.post(remove_url(workspace.slug, project.id, first.id), body, format="json")
            assert response.status_code == status.HTTP_400_BAD_REQUEST, body

    @pytest.mark.django_db
    def test_work_item_must_belong_to_the_project_in_the_url(
        self, api_key_client, workspace, project, issues, create_user
    ):
        """Membership of one project must not reach a relation on another project's work item."""
        first, second, _ = issues
        relate(first, second, "relates_to")
        other = Project.objects.create(name="Other", identifier="OTH", workspace=workspace, created_by=create_user)
        ProjectMember.objects.create(project=other, member=create_user, role=20, is_active=True)

        response = api_key_client.post(
            remove_url(workspace.slug, other.id, first.id), {"related_issue": str(second.id)}, format="json"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert IssueRelation.objects.count() == 1

    @pytest.mark.django_db
    def test_non_project_member_is_refused(self, api_key_client, workspace, project, issues, create_user):
        first, second, _ = issues
        relate(first, second, "relates_to")
        ProjectMember.objects.filter(project=project, member=create_user).update(is_active=False)

        response = api_key_client.post(
            remove_url(workspace.slug, project.id, first.id), {"related_issue": str(second.id)}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert IssueRelation.objects.count() == 1
