# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for ``ProjectJoinAPIEndpoint`` (v1).

Adding a member through ``/members/`` needs a project admin, so a workspace
admin who is not in a project had no way in over the API — and every
project-scoped call, reads included, answered 403. ``/join/`` mirrors the web
app's "Join project": workspace admins and members may join public projects,
only workspace admins may join secret ones.
"""

from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Project, ProjectMember, ProjectUserProperty, User, Workspace, WorkspaceMember
from plane.db.models.project import ProjectNetwork


def join_url(slug, project_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/join/"


def states_url(slug, project_id):
    return f"/api/v1/workspaces/{slug}/projects/{project_id}/states/"


def make_user(prefix):
    unique_id = uuid4().hex[:8]
    return User.objects.create(email=f"{prefix}-{unique_id}@plane.so", username=f"{prefix}_{unique_id}")


def make_project(workspace, network=ProjectNetwork.PUBLIC.value, identifier="JOIN"):
    """A project the token holder is not a member of."""
    owner = make_user("owner")
    WorkspaceMember.objects.create(workspace=workspace, member=owner, role=20)
    project = Project.objects.create(
        name=f"Project {identifier}",
        identifier=identifier,
        workspace=workspace,
        created_by=owner,
        network=network,
    )
    ProjectMember.objects.create(project=project, member=owner, workspace=workspace, role=20)
    return project


def set_workspace_role(workspace, user, role):
    WorkspaceMember.objects.filter(workspace=workspace, member=user).update(role=role)


@pytest.mark.contract
class TestProjectJoin:
    @pytest.mark.django_db
    def test_workspace_admin_joins_and_can_then_read_the_project(self, api_key_client, workspace, create_user):
        project = make_project(workspace)

        # The situation the endpoint exists for: an admin locked out of a project's reads.
        assert api_key_client.get(states_url(workspace.slug, project.id)).status_code == status.HTTP_403_FORBIDDEN

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert str(response.data["member"]) == str(create_user.id)
        assert response.data["role"] == 20
        member = ProjectMember.objects.get(project=project, member=create_user)
        assert member.is_active and member.role == 20
        assert ProjectUserProperty.objects.filter(project=project, user=create_user).exists()
        assert api_key_client.get(states_url(workspace.slug, project.id)).status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_workspace_member_joins_public_project_with_member_role(self, api_key_client, workspace, create_user):
        set_workspace_role(workspace, create_user, 15)
        project = make_project(workspace)

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_201_CREATED, response.data
        # The project role follows the workspace role; joining never escalates.
        assert ProjectMember.objects.get(project=project, member=create_user).role == 15

    @pytest.mark.django_db
    def test_workspace_member_cannot_join_secret_project(self, api_key_client, workspace, create_user):
        set_workspace_role(workspace, create_user, 15)
        project = make_project(workspace, network=ProjectNetwork.SECRET.value)

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ProjectMember.objects.filter(project=project, member=create_user).exists()

    @pytest.mark.django_db
    def test_workspace_admin_can_join_secret_project(self, api_key_client, workspace, create_user):
        project = make_project(workspace, network=ProjectNetwork.SECRET.value)

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_201_CREATED, response.data

    @pytest.mark.django_db
    def test_workspace_guest_cannot_join(self, api_key_client, workspace, create_user):
        set_workspace_role(workspace, create_user, 5)
        project = make_project(workspace)

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ProjectMember.objects.filter(project=project, member=create_user).exists()

    @pytest.mark.django_db
    def test_joining_twice_is_a_no_op(self, api_key_client, workspace, create_user):
        project = make_project(workspace)

        first = api_key_client.post(join_url(workspace.slug, project.id))
        second = api_key_client.post(join_url(workspace.slug, project.id))

        assert first.status_code == status.HTTP_201_CREATED
        assert second.status_code == status.HTTP_200_OK
        assert ProjectMember.objects.filter(project=project, member=create_user).count() == 1

    @pytest.mark.django_db
    def test_former_member_rejoins_at_current_workspace_role(self, api_key_client, workspace, create_user):
        set_workspace_role(workspace, create_user, 15)
        project = make_project(workspace)
        ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=5, is_active=False)

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_201_CREATED, response.data
        member = ProjectMember.objects.get(project=project, member=create_user)
        assert member.is_active and member.role == 15

    @pytest.mark.django_db
    def test_cannot_join_a_project_in_another_workspace(self, api_key_client, workspace, create_user):
        """The URL's workspace must own the project, or a public project elsewhere could be joined."""
        other_owner = make_user("other")
        other_workspace = Workspace.objects.create(name="Other", owner=other_owner, slug=f"other-{uuid4().hex[:6]}")
        foreign = make_project(other_workspace, identifier="FRGN")

        response = api_key_client.post(join_url(workspace.slug, foreign.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not ProjectMember.objects.filter(project=foreign, member=create_user).exists()

    @pytest.mark.django_db
    def test_cannot_join_an_archived_project(self, api_key_client, workspace, create_user):
        project = make_project(workspace)
        Project.objects.filter(pk=project.pk).update(archived_at=timezone.now())

        response = api_key_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_non_workspace_member_is_refused(self, api_client, workspace):
        from plane.db.models import APIToken

        outsider = make_user("outsider")
        token = APIToken.objects.create(user=outsider, label="outsider", token=f"outsider-{uuid4().hex}")
        api_client.credentials(HTTP_X_API_KEY=token.token)
        project = make_project(workspace)

        response = api_client.post(join_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not ProjectMember.objects.filter(project=project, member=outsider).exists()
