import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "@/server";

const realFetch = globalThis.fetch;

let server: Server;
let baseUrl: string;

type ApiCall = { method: string; path: string; query: Record<string, string>; body: unknown };
type Reply = { status?: number; body?: unknown };

let apiCalls: ApiCall[];
let replies: Record<string, Reply>;

const WIKI = "/api/v1/workspaces/korz/wiki";

beforeAll(async () => {
  server = new Server();
  server.initialize();
  await server.listen();
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.destroy();
});

beforeEach(() => {
  apiCalls = [];
  replies = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      if (url.pathname === "/auth/o/introspect/") {
        return new Response(
          JSON.stringify({
            active: true,
            scope: "mcp:read mcp:write",
            exp: Math.floor(Date.now() / 1000) + 3600,
            sub: "user-1",
            aud: "https://plane.example.com/mcp",
            client_id: "claude",
          }),
          { status: 200 }
        );
      }
      const method = init?.method ?? "GET";
      apiCalls.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const reply = replies[`${method} ${url.pathname}`] ?? {};
      if (reply.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const response = await realFetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer good-token",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await response.text();
  const dataLine = body
    .split("\n")
    .map((line) => line.trim())
    .findLast((line) => line.startsWith("data:"));
  const payload = JSON.parse(dataLine ? dataLine.slice("data:".length).trim() : body);
  if (payload.error) throw new Error(`JSON-RPC error: ${JSON.stringify(payload.error)}`);
  return payload.result as ToolResult;
}

const allText = (result: ToolResult) => result.content.map((item) => item.text).join("\n");
const calls = () => apiCalls.map(({ method, path, query, body }) => ({ method, path, query, body }));

describe("wiki collections", () => {
  it("lists collections", async () => {
    await callTool("list_wiki_collections", { workspace_slug: "korz" });

    expect(calls()).toEqual([{ method: "GET", path: `${WIKI}/collections/`, query: {}, body: undefined }]);
  });

  it("creates a private collection, translating access to Plane's number", async () => {
    await callTool("create_wiki_collection", { workspace_slug: "korz", name: "Growth", access: "private" });

    expect(calls()).toEqual([
      { method: "POST", path: `${WIKI}/collections/`, query: {}, body: { name: "Growth", access: 1 } },
    ]);
  });

  it("updates only what was passed", async () => {
    await callTool("update_wiki_collection", {
      workspace_slug: "korz",
      collection_id: "col-1",
      name: "Growth team",
      access: "public",
    });

    expect(calls()).toEqual([
      { method: "PATCH", path: `${WIKI}/collections/col-1/`, query: {}, body: { name: "Growth team", access: 0 } },
    ]);
  });

  it("deletes a collection and says where its pages went", async () => {
    replies[`DELETE ${WIKI}/collections/col-1/`] = { status: 204 };

    const result = await callTool("delete_wiki_collection", { workspace_slug: "korz", collection_id: "col-1" });

    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("moved to the default collection");
  });

  it("surfaces Plane's refusal to delete the default collection", async () => {
    replies[`DELETE ${WIKI}/collections/col-default/`] = {
      status: 400,
      body: { error: "The default collection cannot be deleted" },
    };

    const result = await callTool("delete_wiki_collection", { workspace_slug: "korz", collection_id: "col-default" });

    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("default collection cannot be deleted");
  });
});

describe("wiki pages", () => {
  it("lists pages filtered by collection and level", async () => {
    await callTool("list_wiki_pages", { workspace_slug: "korz", collection_id: "col-1", parent: "root" });

    expect(calls()).toEqual([
      { method: "GET", path: `${WIKI}/pages/`, query: { collection: "col-1", parent: "root" }, body: undefined },
    ]);
  });

  it("creates a sub-page with Plane's field names and repaired HTML", async () => {
    await callTool("create_wiki_page", {
      workspace_slug: "korz",
      name: "Runbook",
      description_html: "&lt;h2&gt;Deploy&lt;/h2&gt;",
      parent_id: "page-1",
      access: "public",
    });

    expect(calls()).toEqual([
      {
        method: "POST",
        path: `${WIKI}/pages/`,
        query: {},
        body: { name: "Runbook", description_html: "<h2>Deploy</h2>", parent: "page-1", access: 0 },
      },
    ]);
  });

  it("renames without touching anything else", async () => {
    await callTool("update_wiki_page", { workspace_slug: "korz", page_id: "page-1", name: "New title" });

    expect(calls()).toEqual([
      { method: "PATCH", path: `${WIKI}/pages/page-1/`, query: {}, body: { name: "New title" } },
    ]);
  });

  it("refuses an update with nothing to change", async () => {
    const result = await callTool("update_wiki_page", { workspace_slug: "korz", page_id: "page-1" });

    expect(result.isError).toBe(true);
    expect(apiCalls).toEqual([]);
  });

  it("replaces the body through the content endpoint", async () => {
    await callTool("update_wiki_page_content", {
      workspace_slug: "korz",
      page_id: "page-1",
      description_html: "&lt;p&gt;fresh&lt;/p&gt;",
    });

    expect(calls()).toEqual([
      { method: "PUT", path: `${WIKI}/pages/page-1/content/`, query: {}, body: { description_html: "<p>fresh</p>" } },
    ]);
  });

  it("moves a page to the top level", async () => {
    await callTool("move_wiki_page", { workspace_slug: "korz", page_id: "page-1", parent_id: null });

    expect(calls()).toEqual([
      { method: "POST", path: `${WIKI}/pages/page-1/move/`, query: {}, body: { parent: null } },
    ]);
  });

  it("keeps the current parent when only the collection changes", async () => {
    // Plane's move always sets the parent, so omitting it would silently lift the page to the top level.
    replies[`GET ${WIKI}/pages/page-1/`] = { body: { id: "page-1", parent: "page-parent" } };

    await callTool("move_wiki_page", { workspace_slug: "korz", page_id: "page-1", collection_id: "col-2" });

    expect(calls()).toEqual([
      { method: "GET", path: `${WIKI}/pages/page-1/`, query: {}, body: undefined },
      {
        method: "POST",
        path: `${WIKI}/pages/page-1/move/`,
        query: {},
        body: { parent: "page-parent", collection: "col-2" },
      },
    ]);
  });

  it("refuses a move with no destination", async () => {
    const result = await callTool("move_wiki_page", { workspace_slug: "korz", page_id: "page-1" });

    expect(result.isError).toBe(true);
    expect(apiCalls).toEqual([]);
  });

  it.each([
    ["archive_wiki_page", { archived: true }, "POST", "archive/"],
    ["archive_wiki_page", { archived: false }, "DELETE", "archive/"],
    ["lock_wiki_page", { locked: true }, "POST", "lock/"],
    ["lock_wiki_page", { locked: false }, "DELETE", "lock/"],
  ])("%s %o sends %s to %s", async (tool, args, method, suffix) => {
    replies[`${method} ${WIKI}/pages/page-1/${suffix}`] = { status: 204 };

    const result = await callTool(tool, { workspace_slug: "korz", page_id: "page-1", ...args });

    expect(result.isError).toBeFalsy();
    expect(calls()).toEqual([{ method, path: `${WIKI}/pages/page-1/${suffix}`, query: {}, body: undefined }]);
  });

  it("duplicates with sub-pages", async () => {
    await callTool("duplicate_wiki_page", { workspace_slug: "korz", page_id: "page-1", include_children: true });

    expect(calls()).toEqual([
      { method: "POST", path: `${WIKI}/pages/page-1/duplicate/`, query: { include_children: "true" }, body: undefined },
    ]);
  });

  it("deletes a page and its sub-pages only when asked", async () => {
    replies[`DELETE ${WIKI}/pages/page-1/`] = { status: 204 };

    await callTool("delete_wiki_page", { workspace_slug: "korz", page_id: "page-1" });
    await callTool("delete_wiki_page", { workspace_slug: "korz", page_id: "page-1", include_children: true });

    expect(apiCalls.map((call) => call.query)).toEqual([{}, { cascade: "true" }]);
  });

  it("surfaces Plane's rule that a page is archived before it is deleted", async () => {
    replies[`DELETE ${WIKI}/pages/page-1/`] = {
      status: 400,
      body: { error: "The page should be archived before deleting" },
    };

    const result = await callTool("delete_wiki_page", { workspace_slug: "korz", page_id: "page-1" });

    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("archived before deleting");
  });
});
