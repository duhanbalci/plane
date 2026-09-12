# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for work item templates (Faz C)."""

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Label,
    Project,
    ProjectMember,
    State,
    Template,
    User,
    WorkspaceMember,
)

WORKSPACE_TEMPLATES = "/api/workspaces/{slug}/templates/"
WORKSPACE_TEMPLATE_DETAIL = "/api/workspaces/{slug}/templates/{template_id}/"
PROJECT_TEMPLATES = "/api/workspaces/{slug}/projects/{project_id}/templates/"
PROJECT_TEMPLATE_DETAIL = "/api/workspaces/{slug}/projects/{project_id}/templates/{template_id}/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Templates Project",
        identifier="TMP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(name="Todo", project=project, workspace=workspace, group="backlog", default=True)
    return project


@pytest.fixture
def member_client(db, workspace, project):
    """A workspace + project member (role 15) client; may read but not write templates."""
    user = User.objects.create(
        email="member@plane.so", username="template_member", first_name="Mem", last_name="Ber"
    )
    user.set_password("member-password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=15)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def work_item_data(**overrides):
    data = {
        "name": "Bug report",
        "description_html": "<p>Steps</p>",
        "priority": "high",
        "label_ids": [],
        "assignee_ids": [],
        "module_ids": [],
        "properties": {},
        "sub_work_items": [],
    }
    data.update(overrides)
    return data


@pytest.mark.contract
class TestWorkspaceTemplates:
    @pytest.mark.django_db
    def test_crud(self, session_client, workspace):
        create = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Bug", "description_html": "<p>When to use</p>", "template_data": work_item_data()},
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        template_id = create.data["id"]
        assert create.data["source"] == "workspace"
        assert create.data["template_type"] == "workitem"
        assert create.data["template_data"]["priority"] == "high"

        listing = session_client.get(WORKSPACE_TEMPLATES.format(slug=workspace.slug) + "?type=workitem")
        assert listing.status_code == status.HTTP_200_OK
        assert [str(row["id"]) for row in listing.data] == [str(template_id)]

        duplicate = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Bug", "template_data": work_item_data()},
            format="json",
        )
        assert duplicate.status_code == status.HTTP_400_BAD_REQUEST

        patch = session_client.patch(
            WORKSPACE_TEMPLATE_DETAIL.format(slug=workspace.slug, template_id=template_id),
            {"name": "Defect", "is_active": False},
            format="json",
        )
        assert patch.status_code == status.HTTP_200_OK
        assert patch.data["name"] == "Defect"
        assert patch.data["is_active"] is False

        delete = session_client.delete(
            WORKSPACE_TEMPLATE_DETAIL.format(slug=workspace.slug, template_id=template_id)
        )
        assert delete.status_code == status.HTTP_204_NO_CONTENT
        assert not Template.objects.filter(pk=template_id).exists()

    @pytest.mark.django_db
    def test_member_cannot_write(self, member_client, workspace):
        response = member_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Nope", "template_data": work_item_data()},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

        listing = member_client.get(WORKSPACE_TEMPLATES.format(slug=workspace.slug))
        assert listing.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_invalid_template_data(self, session_client, workspace):
        unknown_key = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Bad", "template_data": work_item_data(surprise="boom")},
            format="json",
        )
        assert unknown_key.status_code == status.HTTP_400_BAD_REQUEST

        bad_priority = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Bad", "template_data": work_item_data(priority="sometime")},
            format="json",
        )
        assert bad_priority.status_code == status.HTTP_400_BAD_REQUEST

        bad_id = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Bad", "template_data": work_item_data(label_ids=["not-a-uuid"])},
            format="json",
        )
        assert bad_id.status_code == status.HTTP_400_BAD_REQUEST

        bad_sub = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Bad", "template_data": work_item_data(sub_work_items=[{"name": ""}])},
            format="json",
        )
        assert bad_sub.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestProjectTemplates:
    @pytest.mark.django_db
    def test_crud_and_union_list(self, session_client, workspace, project):
        create = session_client.post(
            PROJECT_TEMPLATES.format(slug=workspace.slug, project_id=project.id),
            {"name": "Project bug", "template_data": work_item_data()},
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        assert create.data["source"] == "project"
        project_template_id = str(create.data["id"])

        workspace_template = session_client.post(
            WORKSPACE_TEMPLATES.format(slug=workspace.slug),
            {"name": "Workspace bug", "template_data": work_item_data()},
            format="json",
        )
        assert workspace_template.status_code == status.HTTP_201_CREATED
        workspace_template_id = str(workspace_template.data["id"])

        listing = session_client.get(PROJECT_TEMPLATES.format(slug=workspace.slug, project_id=project.id))
        assert listing.status_code == status.HTTP_200_OK
        sources = {str(row["id"]): row["source"] for row in listing.data}
        assert sources == {project_template_id: "project", workspace_template_id: "workspace"}

        patch = session_client.patch(
            PROJECT_TEMPLATE_DETAIL.format(
                slug=workspace.slug, project_id=project.id, template_id=project_template_id
            ),
            {"name": "Project defect"},
            format="json",
        )
        assert patch.status_code == status.HTTP_200_OK

        # Workspace templates are read-only through the project route
        forbidden = session_client.patch(
            PROJECT_TEMPLATE_DETAIL.format(
                slug=workspace.slug, project_id=project.id, template_id=workspace_template_id
            ),
            {"name": "Hijack"},
            format="json",
        )
        assert forbidden.status_code == status.HTTP_403_FORBIDDEN

        forbidden_delete = session_client.delete(
            PROJECT_TEMPLATE_DETAIL.format(
                slug=workspace.slug, project_id=project.id, template_id=workspace_template_id
            )
        )
        assert forbidden_delete.status_code == status.HTTP_403_FORBIDDEN

        delete = session_client.delete(
            PROJECT_TEMPLATE_DETAIL.format(
                slug=workspace.slug, project_id=project.id, template_id=project_template_id
            )
        )
        assert delete.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_member_cannot_write_project_template(self, member_client, workspace, project):
        response = member_client.post(
            PROJECT_TEMPLATES.format(slug=workspace.slug, project_id=project.id),
            {"name": "Nope", "template_data": work_item_data()},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_dangling_ids_dropped_on_read(self, session_client, workspace, project):
        label = Label.objects.create(name="regression", project=project, workspace=workspace)
        create = session_client.post(
            PROJECT_TEMPLATES.format(slug=workspace.slug, project_id=project.id),
            {"name": "With label", "template_data": work_item_data(label_ids=[str(label.id)])},
            format="json",
        )
        assert create.status_code == status.HTTP_201_CREATED
        template_id = create.data["id"]
        assert create.data["template_data"]["label_ids"] == [str(label.id)]

        label.delete()

        detail = session_client.get(
            PROJECT_TEMPLATE_DETAIL.format(slug=workspace.slug, project_id=project.id, template_id=template_id)
        )
        assert detail.status_code == status.HTTP_200_OK
        assert detail.data["template_data"]["label_ids"] == []
        # the stored payload keeps the id; only the read is resolved
        assert Template.objects.get(pk=template_id).template_data["label_ids"] == [str(label.id)]
