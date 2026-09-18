import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "@/server";

const realFetch = globalThis.fetch;

let server: Server;
let baseUrl: string;

type ApiCall = { method: string; path: string; query: Record<string, string>; body: unknown };
type Reply = { status?: number; body?: unknown };

/** Every call this server made to the Plane API during the test, in order. */
let apiCalls: ApiCall[];
/** Canned API replies, keyed by "METHOD /path/". Anything unlisted answers 200 {}. */
let replies: Record<string, Reply>;

const BASE = "/api/v1/workspaces/korz/projects/p1";

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

/** Invoke a tool over the real /mcp transport, as a client would. */
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

describe("create_label", () => {
  it("creates the label in the project", async () => {
    replies[`POST ${BASE}/labels/`] = { status: 201, body: { id: "label-1", name: "seo" } };

    const result = await callTool("create_label", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "seo",
      color: "#3A86FF",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls).toEqual([
      { method: "POST", path: `${BASE}/labels/`, query: {}, body: { name: "seo", color: "#3A86FF" } },
    ]);
    expect(allText(result)).toContain("label-1");
  });

  it("rejects a colour that is not a hex code before calling Plane", async () => {
    const result = await callTool("create_label", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "seo",
      color: "blue",
    });

    expect(result.isError).toBe(true);
    expect(apiCalls).toEqual([]);
  });
});

describe("create_work_item", () => {
  const created = { status: 201, body: { id: "wi-1", name: "Ship it" } };

  it("sends the planning fields Plane accepts on the work item itself", async () => {
    replies[`POST ${BASE}/issues/`] = created;

    await callTool("create_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Ship it",
      start_date: "2026-09-21",
      target_date: "2026-10-08",
      parent: "wi-parent",
      estimate_point: "ep-3",
      type_id: "type-epic",
      labels: ["label-1"],
    });

    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].body).toEqual({
      name: "Ship it",
      start_date: "2026-09-21",
      target_date: "2026-10-08",
      parent: "wi-parent",
      estimate_point: "ep-3",
      type_id: "type-epic",
      labels: ["label-1"],
    });
  });

  it("adds the new work item to its cycle and module through their own endpoints", async () => {
    replies[`POST ${BASE}/issues/`] = created;

    const result = await callTool("create_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Ship it",
      cycle_id: "c1",
      module_id: "m1",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      // cycle_id and module_id are not work item fields; they must not leak into the create.
      { method: "POST", path: `${BASE}/issues/`, body: { name: "Ship it" } },
      { method: "POST", path: `${BASE}/cycles/c1/cycle-issues/`, body: { issues: ["wi-1"] } },
      { method: "POST", path: `${BASE}/modules/m1/module-issues/`, body: { issues: ["wi-1"] } },
    ]);
    expect(result.content).toHaveLength(1);
  });

  it("reports a failed cycle link as a warning, not an error, so the client does not create it twice", async () => {
    replies[`POST ${BASE}/issues/`] = created;
    replies[`POST ${BASE}/cycles/c-done/cycle-issues/`] = {
      status: 400,
      body: { error: "The Cycle has already been completed so no new issues can be added" },
    };

    const result = await callTool("create_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Ship it",
      cycle_id: "c-done",
      module_id: "m1",
    });

    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("wi-1");
    expect(allText(result)).toContain("Warning: the work item was saved, but adding it to cycle c-done failed");
    expect(allText(result)).toContain("already been completed");
    // The module link is still attempted after the cycle one fails.
    expect(apiCalls.map((call) => call.path)).toContain(`${BASE}/modules/m1/module-issues/`);
    expect(apiCalls.filter((call) => call.path === `${BASE}/issues/`)).toHaveLength(1);
  });

  it("does not try to link anything when the create itself fails", async () => {
    replies[`POST ${BASE}/issues/`] = { status: 400, body: { error: "Invalid state" } };

    const result = await callTool("create_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Ship it",
      cycle_id: "c1",
    });

    expect(result.isError).toBe(true);
    expect(apiCalls).toHaveLength(1);
  });

  it("repairs an entity-encoded description instead of storing the escaped tags", async () => {
    replies[`POST ${BASE}/issues/`] = created;

    await callTool("create_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Ship it",
      description_html: "&lt;p&gt;&lt;strong&gt;Goal&lt;/strong&gt;&lt;/p&gt;",
    });

    expect((apiCalls[0].body as { description_html: string }).description_html).toBe("<p><strong>Goal</strong></p>");
  });

  it("rejects a date that is not YYYY-MM-DD", async () => {
    const result = await callTool("create_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Ship it",
      start_date: "21/09/2026",
    });

    expect(result.isError).toBe(true);
    expect(apiCalls).toEqual([]);
  });
});

describe("update_work_item", () => {
  const path = `${BASE}/issues/wi-1/`;

  it("clears fields passed as null and leaves omitted ones out of the patch", async () => {
    await callTool("update_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      target_date: null,
      parent: null,
      start_date: "2026-09-22",
    });

    expect(apiCalls).toEqual([
      {
        method: "PATCH",
        path,
        query: {},
        body: { target_date: null, parent: null, start_date: "2026-09-22" },
      },
    ]);
  });

  it("moves an item to a cycle without an empty patch", async () => {
    replies[`GET ${path}`] = { body: { id: "wi-1" } };

    const result = await callTool("update_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      cycle_id: "c2",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls.map(({ method, path: p, body }) => ({ method, path: p, body }))).toEqual([
      { method: "GET", path, body: undefined },
      { method: "POST", path: `${BASE}/cycles/c2/cycle-issues/`, body: { issues: ["wi-1"] } },
    ]);
  });

  it("repairs an entity-encoded description on update too", async () => {
    await callTool("update_work_item", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      description_html: "&lt;p&gt;fixed&lt;/p&gt;",
    });

    expect(apiCalls[0].body).toEqual({ description_html: "<p>fixed</p>" });
  });
});

describe("list_work_items", () => {
  it("leaves description_html out by default", async () => {
    await callTool("list_work_items", { workspace_slug: "korz", project_id: "p1" });

    const fields = apiCalls[0].query.fields.split(",");
    expect(fields).toContain("name");
    expect(fields).toContain("state");
    expect(fields).not.toContain("description_html");
  });

  it("passes requested fields and ordering through", async () => {
    await callTool("list_work_items", {
      workspace_slug: "korz",
      project_id: "p1",
      fields: ["id", "name", "description_html"],
      order_by: "-target_date",
      priority: "high",
    });

    expect(apiCalls[0].query).toEqual({
      fields: "id,name,description_html",
      order_by: "-target_date",
      priority: "high",
    });
  });
});

describe("add_work_item_comment", () => {
  it("repairs an entity-encoded comment", async () => {
    await callTool("add_work_item_comment", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      comment_html: "&lt;p&gt;done&lt;/p&gt;",
    });

    expect(apiCalls[0].body).toEqual({ comment_html: "<p>done</p>" });
  });
});

describe("permission errors", () => {
  it("points a refused read at project membership", async () => {
    replies[`GET ${BASE}/states/`] = {
      status: 403,
      body: { detail: "You do not have permission to perform this action." },
    };

    const result = await callTool("list_project_states", { workspace_slug: "korz", project_id: "p1" });

    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("project membership");
    expect(allText(result)).not.toContain("mcp:write");
    expect(allText(result)).not.toContain("..");
  });

  it("points a scope refusal on a write at the read-only token", async () => {
    replies[`POST ${BASE}/labels/`] = {
      status: 403,
      body: { detail: "This token does not carry the scope required for this request." },
    };

    const result = await callTool("create_label", { workspace_slug: "korz", project_id: "p1", name: "seo" });

    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("read-only");
  });
});

describe("project membership", () => {
  it("joins a project through the v1 join endpoint", async () => {
    replies[`POST ${BASE}/join/`] = { status: 201, body: { id: "pm-1", member: "user-1", role: 20 } };

    const result = await callTool("join_project", { workspace_slug: "korz", project_id: "p1" });

    expect(result.isError).toBeFalsy();
    expect(apiCalls).toEqual([{ method: "POST", path: `${BASE}/join/`, query: {}, body: undefined }]);
  });

  it("adds a member with Plane's numeric role, defaulting to member", async () => {
    await callTool("add_project_member", { workspace_slug: "korz", project_id: "p1", member: "user-2" });
    await callTool("add_project_member", {
      workspace_slug: "korz",
      project_id: "p1",
      member: "user-3",
      role: "admin",
    });

    expect(apiCalls.map((call) => call.body)).toEqual([
      { member: "user-2", role: 15 },
      { member: "user-3", role: 20 },
    ]);
    expect(apiCalls.every((call) => call.path === `${BASE}/members/`)).toBe(true);
  });
});

describe("work item relations", () => {
  const relations = `/api/v1/workspaces/korz/projects/p1/work-items/wi-1/relations/`;

  it("relates work items, sending Plane's field names", async () => {
    await callTool("add_work_item_relation", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      relation_type: "blocking",
      related_work_item_ids: ["wi-2", "wi-3"],
    });

    expect(apiCalls).toEqual([
      { method: "POST", path: relations, query: {}, body: { relation_type: "blocking", issues: ["wi-2", "wi-3"] } },
    ]);
  });

  it("rejects an unknown relation type before calling Plane", async () => {
    const result = await callTool("add_work_item_relation", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      relation_type: "depends_on",
      related_work_item_ids: ["wi-2"],
    });

    expect(result.isError).toBe(true);
    expect(apiCalls).toEqual([]);
  });

  it("removes a relation and reports it despite the empty 204", async () => {
    replies[`POST ${relations}remove/`] = { status: 204 };

    const result = await callTool("remove_work_item_relation", {
      workspace_slug: "korz",
      project_id: "p1",
      work_item_id: "wi-1",
      related_work_item_id: "wi-2",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls).toEqual([
      { method: "POST", path: `${relations}remove/`, query: {}, body: { related_issue: "wi-2" } },
    ]);
    expect(allText(result)).toContain("Removed the relation between wi-1 and wi-2");
  });

  it("lists relations", async () => {
    await callTool("list_work_item_relations", { workspace_slug: "korz", project_id: "p1", work_item_id: "wi-1" });

    expect(apiCalls).toEqual([{ method: "GET", path: relations, query: {}, body: undefined }]);
  });
});

describe("cycles", () => {
  it("creates a scheduled cycle", async () => {
    replies[`POST ${BASE}/cycles/`] = { status: 201, body: { id: "c1" } };

    const result = await callTool("create_cycle", {
      workspace_slug: "korz",
      project_id: "p1",
      name: "Sprint 1",
      start_date: "2026-09-21",
      end_date: "2026-10-04",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls).toEqual([
      {
        method: "POST",
        path: `${BASE}/cycles/`,
        query: {},
        body: { name: "Sprint 1", start_date: "2026-09-21", end_date: "2026-10-04" },
      },
    ]);
  });

  it("creates a draft cycle without dates", async () => {
    await callTool("create_cycle", { workspace_slug: "korz", project_id: "p1", name: "Someday" });

    expect(apiCalls[0].body).toEqual({ name: "Someday" });
  });

  it.each(["create_cycle", "update_cycle"])(
    "%s refuses one date without the other, which Plane would reject",
    async (tool) => {
      const result = await callTool(tool, {
        workspace_slug: "korz",
        project_id: "p1",
        cycle_id: "c1",
        name: "Sprint 1",
        start_date: "2026-09-21",
      });

      expect(result.isError).toBe(true);
      expect(apiCalls).toEqual([]);
    }
  );

  it("patches only the fields passed to update_cycle", async () => {
    await callTool("update_cycle", {
      workspace_slug: "korz",
      project_id: "p1",
      cycle_id: "c1",
      name: "Sprint 1b",
    });

    expect(apiCalls).toEqual([{ method: "PATCH", path: `${BASE}/cycles/c1/`, query: {}, body: { name: "Sprint 1b" } }]);
  });

  it("surfaces Plane's refusal to edit a completed cycle", async () => {
    replies[`PATCH ${BASE}/cycles/c-old/`] = {
      status: 400,
      body: { error: "The Cycle has already been completed so it cannot be edited" },
    };

    const result = await callTool("update_cycle", {
      workspace_slug: "korz",
      project_id: "p1",
      cycle_id: "c-old",
      name: "Renamed",
    });

    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("already been completed");
  });

  it("lists a cycle's work items in the compact shape", async () => {
    await callTool("list_cycle_work_items", { workspace_slug: "korz", project_id: "p1", cycle_id: "c1" });

    expect(apiCalls[0].path).toBe(`${BASE}/cycles/c1/cycle-issues/`);
    expect(apiCalls[0].query.fields.split(",")).not.toContain("description_html");
  });

  it("removes a work item from a cycle", async () => {
    replies[`DELETE ${BASE}/cycles/c1/cycle-issues/wi-1/`] = { status: 204 };

    const result = await callTool("remove_work_item_from_cycle", {
      workspace_slug: "korz",
      project_id: "p1",
      cycle_id: "c1",
      work_item_id: "wi-1",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls).toEqual([
      { method: "DELETE", path: `${BASE}/cycles/c1/cycle-issues/wi-1/`, query: {}, body: undefined },
    ]);
  });
});

describe("modules", () => {
  it("lists a module's work items in the compact shape", async () => {
    await callTool("list_module_work_items", { workspace_slug: "korz", project_id: "p1", module_id: "m1" });

    expect(apiCalls[0].path).toBe(`${BASE}/modules/m1/module-issues/`);
    expect(apiCalls[0].query.fields.split(",")).not.toContain("description_html");
  });

  it("removes a work item from a module", async () => {
    replies[`DELETE ${BASE}/modules/m1/module-issues/wi-1/`] = { status: 204 };

    const result = await callTool("remove_work_item_from_module", {
      workspace_slug: "korz",
      project_id: "p1",
      module_id: "m1",
      work_item_id: "wi-1",
    });

    expect(result.isError).toBeFalsy();
    expect(apiCalls[0]).toEqual({
      method: "DELETE",
      path: `${BASE}/modules/m1/module-issues/wi-1/`,
      query: {},
      body: undefined,
    });
  });
});
