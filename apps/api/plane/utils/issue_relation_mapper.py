# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Q


def get_inverse_relation(relation_type):
    relation_mapping = {
        "start_after": "start_before",
        "finish_after": "finish_before",
        "blocked_by": "blocking",
        "blocking": "blocked_by",
        "start_before": "start_after",
        "finish_before": "finish_after",
        "implemented_by": "implements",
        "implements": "implemented_by",
    }
    return relation_mapping.get(relation_type, relation_type)


def get_actual_relation(relation_type):
    # This function is used to get the actual relation type which is stored in database
    actual_relation = {
        "start_after": "start_before",
        "finish_after": "finish_before",
        "blocking": "blocked_by",
        "blocked_by": "blocked_by",
        "start_before": "start_before",
        "finish_before": "finish_before",
        "implemented_by": "implemented_by",
        "implements": "implemented_by",
    }

    return actual_relation.get(relation_type, relation_type)


# Relation types that impose a date constraint between two work items.
# Stored (canonical) types only; the UI also sends their inverses.
DEPENDENCY_RELATION_TYPES = ("blocked_by", "start_before", "finish_before")


def get_dependency_edge(relation_type, issue_id, related_issue_id):
    """Return the (predecessor, dependent) pair for a dependency relation.

    A row is stored as ``(issue, related_issue, relation_type)``. For
    ``blocked_by`` the related issue is the predecessor ("issue is blocked by
    related"), while ``start_before``/``finish_before`` read the other way
    round ("issue starts/finishes before related"). Non dependency relations
    return ``None``.
    """
    if relation_type == "blocked_by":
        return (related_issue_id, issue_id)
    if relation_type in ("start_before", "finish_before"):
        return (issue_id, related_issue_id)
    return None


def has_dependency_path(workspace_id, source_id, target_id, max_nodes=500):
    """Whether a dependency chain already leads from ``source`` to ``target``.

    Breadth first walk over ``IssueRelation`` rows of the workspace following
    predecessor -> dependent edges. Bounded to ``max_nodes`` visited work items
    so a pathological graph cannot stall the request.
    """
    # Local import to avoid a circular import at module load time
    from plane.db.models import IssueRelation

    if str(source_id) == str(target_id):
        return True

    visited = {str(source_id)}
    frontier = [source_id]

    while frontier and len(visited) <= max_nodes:
        rows = (
            IssueRelation.objects.filter(workspace_id=workspace_id, deleted_at__isnull=True)
            .filter(
                Q(relation_type="blocked_by", related_issue_id__in=frontier)
                | Q(
                    relation_type__in=("start_before", "finish_before"),
                    issue_id__in=frontier,
                )
            )
            .values_list("issue_id", "related_issue_id", "relation_type")
        )

        next_frontier = []
        for row_issue_id, row_related_id, relation_type in rows:
            edge = get_dependency_edge(relation_type, row_issue_id, row_related_id)
            if edge is None:
                continue
            dependent = str(edge[1])
            if dependent == str(target_id):
                return True
            if dependent not in visited:
                visited.add(dependent)
                next_frontier.append(edge[1])

        frontier = next_frontier

    return False
