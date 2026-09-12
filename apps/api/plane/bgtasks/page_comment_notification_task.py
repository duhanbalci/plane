# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from bs4 import BeautifulSoup
from celery import shared_task

# Module imports
from plane.db.models import Notification, Page, ProjectPage, User, WorkspaceMember
from plane.utils.exception_logger import log_exception


def extract_page_comment_mentions(comment_html):
    """Return the user ids mentioned in a comment body."""
    try:
        soup = BeautifulSoup(comment_html or "", "html.parser")
        tags = soup.find_all("mention-component", attrs={"entity_name": "user_mention"})
        return list({tag["entity_identifier"] for tag in tags if tag.get("entity_identifier")})
    except Exception:
        return []


@shared_task
def page_comment_notification(page_id, comment_id, comment_html, actor_id):
    """Notify every user mentioned in a page comment."""
    try:
        mentions = extract_page_comment_mentions(comment_html)
        mentions = [mention for mention in mentions if str(mention) != str(actor_id)]
        if not mentions:
            return

        page = Page.objects.filter(pk=page_id).first()
        if page is None:
            return

        # Only workspace members may be notified.
        receivers = list(
            WorkspaceMember.objects.filter(
                workspace_id=page.workspace_id, member_id__in=mentions, is_active=True
            ).values_list("member_id", flat=True)
        )
        if not receivers:
            return

        project_id = (
            ProjectPage.objects.filter(page_id=page.id, deleted_at__isnull=True)
            .values_list("project_id", flat=True)
            .first()
        )
        actor = User.objects.filter(pk=actor_id).first()

        Notification.objects.bulk_create(
            [
                Notification(
                    workspace_id=page.workspace_id,
                    project_id=project_id,
                    sender="in_app:page_comment:mentioned",
                    triggered_by_id=actor_id,
                    receiver_id=receiver_id,
                    entity_identifier=page.id,
                    entity_name="page_comment",
                    title=f"{actor.display_name if actor else 'Someone'} mentioned you in a page comment",
                    message_html=comment_html or "<p></p>",
                    data={
                        "page": {"id": str(page.id), "name": page.name, "is_global": page.is_global},
                        "page_comment": {"id": str(comment_id)},
                    },
                )
                for receiver_id in receivers
            ],
            batch_size=100,
        )
    except Exception as e:
        log_exception(e)
