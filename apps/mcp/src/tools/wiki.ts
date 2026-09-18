/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { z } from "zod";
import { normalizeHtml } from "@/lib/html";
import { DESTRUCTIVE, MUTATES, READ_ONLY, handler, text, type ToolRegistrar } from "./context";

const workspaceSlug = z.string().describe("Workspace slug, from list_workspaces");
const collectionId = z.string().describe("Collection id, from list_wiki_collections");
const pageId = z.string().describe("Wiki page id, from list_wiki_pages");

/** Plane stores access as a number. */
const ACCESS = { public: 0, private: 1 } as const;
const access = z
  .enum(["public", "private"])
  .describe("public: every workspace member can see it. private: only you (and it stays hidden from admins).");

const pageBody = z.string().describe("Page body as raw HTML, e.g. <h2>Goal</h2><p>…</p>. Do not entity-encode it.");

const wiki = (slug: string, path = "") => `/workspaces/${slug}/wiki${path}`;

export const registerWikiTools: ToolRegistrar = (server) => {
  // ------------------------------------------------------------ collections

  server.registerTool(
    "list_wiki_collections",
    {
      title: "List wiki collections",
      description:
        "List the workspace wiki's collections (the folders wiki pages are grouped in), with their page counts. " +
        "One of them is the default, where pages without a collection go.",
      inputSchema: z.object({ workspace_slug: workspaceSlug }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug }, client) => text(await client.request(wiki(workspace_slug, "/collections/"))))
  );

  server.registerTool(
    "create_wiki_collection",
    {
      title: "Create a wiki collection",
      description:
        "Create a collection in the workspace wiki. Names are unique per workspace. Workspace admins and members " +
        "can do this. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        name: z.string().min(1),
        description: z.string().optional(),
        access: access.optional(),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, access: level, ...body }, client) =>
      text(
        await client.request(wiki(workspace_slug, "/collections/"), {
          method: "POST",
          body: { ...body, ...(level && { access: ACCESS[level] }) },
        })
      )
    )
  );

  server.registerTool(
    "update_wiki_collection",
    {
      title: "Update a wiki collection",
      description:
        "Rename, redescribe, reorder or change the access of a wiki collection. Only the fields you pass change. " +
        "A private collection can be changed only by its owner or a workspace admin. Requires a token with the " +
        "mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        collection_id: collectionId,
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        access: access.optional(),
        sort_order: z.number().optional().describe("Position among collections; lower comes first"),
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, collection_id, access: level, ...body }, client) =>
      text(
        await client.request(wiki(workspace_slug, `/collections/${collection_id}/`), {
          method: "PATCH",
          body: { ...body, ...(level && { access: ACCESS[level] }) },
        })
      )
    )
  );

  server.registerTool(
    "delete_wiki_collection",
    {
      title: "Delete a wiki collection",
      description:
        "Delete a wiki collection. Its pages are kept and move to the default collection, which itself cannot be " +
        "deleted. Requires a token with the mcp:write scope.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, collection_id: collectionId }),
      annotations: DESTRUCTIVE,
    },
    handler(async ({ workspace_slug, collection_id }, client) => {
      await client.request(wiki(workspace_slug, `/collections/${collection_id}/`), { method: "DELETE" });
      return text(`Deleted collection ${collection_id}; its pages moved to the default collection.`);
    })
  );

  // ------------------------------------------------------------------ pages

  server.registerTool(
    "list_wiki_pages",
    {
      title: "List wiki pages",
      description:
        "List workspace wiki pages without their bodies; call get_wiki_page to read one. Narrow it to a " +
        "collection, and to the top level or the children of one page.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        collection_id: z.string().optional().describe("Only pages in this collection"),
        parent: z
          .string()
          .optional()
          .describe('"root" for top-level pages only, or a page id for that page\'s direct children'),
      }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, collection_id, parent }, client) =>
      text(await client.request(wiki(workspace_slug, "/pages/"), { query: { collection: collection_id, parent } }))
    )
  );

  server.registerTool(
    "get_wiki_page",
    {
      title: "Read a wiki page",
      description: "Read one wiki page, including its body as HTML.",
      inputSchema: z.object({ workspace_slug: workspaceSlug, page_id: pageId }),
      annotations: READ_ONLY,
    },
    handler(async ({ workspace_slug, page_id }, client) =>
      text(await client.request(wiki(workspace_slug, `/pages/${page_id}/`)))
    )
  );

  server.registerTool(
    "create_wiki_page",
    {
      title: "Create a wiki page",
      description:
        "Create a page in the workspace wiki. Without a collection it goes to the default one; a sub-page always " +
        "joins its parent's collection. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        name: z.string().min(1).describe("Page title"),
        description_html: pageBody.optional(),
        collection_id: z.string().optional().describe("Collection id, from list_wiki_collections"),
        parent_id: z.string().optional().describe("Parent page id, to create this as a sub-page"),
        access: access.optional(),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, description_html, collection_id, parent_id, access: level, name }, client) =>
      text(
        await client.request(wiki(workspace_slug, "/pages/"), {
          method: "POST",
          body: {
            name,
            ...(description_html !== undefined && { description_html: normalizeHtml(description_html) }),
            ...(collection_id && { collection: collection_id }),
            ...(parent_id && { parent: parent_id }),
            ...(level && { access: ACCESS[level] }),
          },
        })
      )
    )
  );

  server.registerTool(
    "update_wiki_page",
    {
      title: "Rename a wiki page or change its access",
      description:
        "Change a wiki page's title or access. Only its owner can change access. To change the body use " +
        "update_wiki_page_content; to move it, move_wiki_page. Locked pages refuse changes. Requires a token " +
        "with the mcp:write scope.",
      inputSchema: z
        .object({
          workspace_slug: workspaceSlug,
          page_id: pageId,
          name: z.string().min(1).optional(),
          access: access.optional(),
        })
        .refine((value) => value.name !== undefined || value.access !== undefined, {
          message: "Pass name, access or both",
        }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, page_id, name, access: level }, client) =>
      text(
        await client.request(wiki(workspace_slug, `/pages/${page_id}/`), {
          method: "PATCH",
          body: { ...(name !== undefined && { name }), ...(level && { access: ACCESS[level] }) },
        })
      )
    )
  );

  server.registerTool(
    "update_wiki_page_content",
    {
      title: "Replace a wiki page's body",
      description:
        "Replace a wiki page's whole body with new HTML. Read it first with get_wiki_page if you mean to edit " +
        "rather than rewrite. Locked or archived pages refuse this. If someone has the page open in the editor " +
        "right now, their session can overwrite this change. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        page_id: pageId,
        description_html: pageBody,
      }),
      annotations: { ...MUTATES, destructiveHint: true, idempotentHint: true },
    },
    handler(async ({ workspace_slug, page_id, description_html }, client) =>
      text(
        await client.request(wiki(workspace_slug, `/pages/${page_id}/content/`), {
          method: "PUT",
          body: { description_html: normalizeHtml(description_html) },
        })
      )
    )
  );

  server.registerTool(
    "move_wiki_page",
    {
      title: "Move a wiki page",
      description:
        "Move a wiki page under another page, to the top level, and/or into another collection. Its sub-pages " +
        "come with it. Requires a token with the mcp:write scope.",
      inputSchema: z
        .object({
          workspace_slug: workspaceSlug,
          page_id: pageId,
          parent_id: z
            .string()
            .nullable()
            .optional()
            .describe("New parent page id, or null for the top level. Omit to keep the current parent."),
          collection_id: z.string().optional().describe("Collection to move the page and its sub-pages into"),
        })
        .refine((value) => value.parent_id !== undefined || value.collection_id !== undefined, {
          message: "Pass parent_id, collection_id or both",
        }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, page_id, parent_id, collection_id }, client) => {
      // move always sets the parent, so keeping the current one means sending it back.
      const parent =
        parent_id !== undefined
          ? parent_id
          : ((await client.request<{ parent: string | null }>(wiki(workspace_slug, `/pages/${page_id}/`))).parent ??
            null);
      return text(
        await client.request(wiki(workspace_slug, `/pages/${page_id}/move/`), {
          method: "POST",
          body: { parent, ...(collection_id && { collection: collection_id }) },
        })
      );
    })
  );

  server.registerTool(
    "archive_wiki_page",
    {
      title: "Archive or restore a wiki page",
      description:
        "Archive a wiki page together with its sub-pages, or restore it. Only its owner or a workspace admin can. " +
        "A page must be archived before it can be deleted. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        page_id: pageId,
        archived: z.boolean().describe("true to archive, false to restore"),
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, page_id, archived }, client) => {
      await client.request(wiki(workspace_slug, `/pages/${page_id}/archive/`), {
        method: archived ? "POST" : "DELETE",
      });
      return text(`${archived ? "Archived" : "Restored"} page ${page_id}.`);
    })
  );

  server.registerTool(
    "lock_wiki_page",
    {
      title: "Lock or unlock a wiki page",
      description:
        "Lock a wiki page against edits, or unlock it. A locked page refuses renames, moves and body changes. " +
        "Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        page_id: pageId,
        locked: z.boolean().describe("true to lock, false to unlock"),
      }),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    handler(async ({ workspace_slug, page_id, locked }, client) => {
      await client.request(wiki(workspace_slug, `/pages/${page_id}/lock/`), { method: locked ? "POST" : "DELETE" });
      return text(`${locked ? "Locked" : "Unlocked"} page ${page_id}.`);
    })
  );

  server.registerTool(
    "duplicate_wiki_page",
    {
      title: "Duplicate a wiki page",
      description:
        'Copy a wiki page next to the original, named "<title> (Copy)". Requires a token with the mcp:write scope.',
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        page_id: pageId,
        include_children: z.boolean().optional().describe("Also copy its sub-pages"),
      }),
      annotations: MUTATES,
    },
    handler(async ({ workspace_slug, page_id, include_children }, client) =>
      text(
        await client.request(wiki(workspace_slug, `/pages/${page_id}/duplicate/`), {
          method: "POST",
          query: { include_children },
        })
      )
    )
  );

  server.registerTool(
    "delete_wiki_page",
    {
      title: "Delete a wiki page",
      description:
        "Permanently delete an archived wiki page (archive it first with archive_wiki_page). Only its owner or a " +
        "workspace admin can. Sub-pages move to the top level unless include_children is true, which deletes " +
        "them too. Requires a token with the mcp:write scope.",
      inputSchema: z.object({
        workspace_slug: workspaceSlug,
        page_id: pageId,
        include_children: z.boolean().optional().describe("Delete its sub-pages as well"),
      }),
      annotations: DESTRUCTIVE,
    },
    handler(async ({ workspace_slug, page_id, include_children }, client) => {
      await client.request(wiki(workspace_slug, `/pages/${page_id}/`), {
        method: "DELETE",
        query: { cascade: include_children },
      });
      return text(`Deleted page ${page_id}${include_children ? " and its sub-pages" : ""}.`);
    })
  );
};
