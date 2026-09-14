# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
OAuth scopes exposed by Plane's authorization server.

Scopes are intentionally coarse and workspace-agnostic: a token identifies a
user, not a workspace. Every request carries the workspace slug in the URL and
the existing ``WorkspaceMember`` checks in ``plane.api`` decide what that user
may actually see. Narrower scopes (``mcp:work_items:write`` and friends) can be
added later; widening a scope after the fact is not possible without a new
consent round, so start small.
"""

READ = "mcp:read"
WRITE = "mcp:write"

SCOPES = {
    READ: "Read your workspaces, projects, work items and comments",
    WRITE: "Create and update work items, comments and related content",
}

DEFAULT_SCOPES = [READ]

# Scopes that are always required for a token to be usable against the MCP
# server. Kept separate from DEFAULT_SCOPES so the MCP resource server and the
# authorization server agree on the minimum.
REQUIRED_SCOPES = [READ]

# HTTP methods that may be performed with a read-only token.
SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
