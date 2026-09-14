import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "@/server";

const realFetch = globalThis.fetch;

let server: Server;
let baseUrl: string;

/** Call the service under test with the process-level fetch, not the mock. */
const call = (path: string, init?: RequestInit) => realFetch(`${baseUrl}${path}`, init);

/** Response bodies in these tests are plain JSON documents. */
const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

const jsonRpc = (method: string) => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} });

beforeAll(async () => {
  server = new Server();
  server.initialize();
  await server.listen();
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.destroy();
});

describe("discovery documents", () => {
  it("serves protected resource metadata naming Plane as the authorization server", async () => {
    const response = await call("/.well-known/oauth-protected-resource/mcp");

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.resource).toBe("https://plane.example.com/mcp");
    expect(body.authorization_servers).toContain("https://plane.example.com");
    expect(body.scopes_supported).toEqual(["mcp:read", "mcp:write"]);
  });

  it("mirrors the authorization server metadata for clients that probe this origin", async () => {
    const response = await call("/.well-known/oauth-authorization-server");

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.token_endpoint).toBe("https://plane.example.com/auth/o/token/");
    expect(body.registration_endpoint).toBe("https://plane.example.com/auth/o/register/");
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("answers health checks without authentication", async () => {
    const response = await call("/health");

    expect(response.status).toBe(200);
    expect((await json(response)).status).toBe("ok");
  });
});

describe("authentication on /mcp", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("challenges an unauthenticated request and points at the metadata document", async () => {
    const response = await call("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: jsonRpc("tools/list"),
    });

    expect(response.status).toBe(401);
    const challenge = response.headers.get("WWW-Authenticate") ?? "";
    expect(challenge).toContain("Bearer");
    // Without this pointer a client cannot find where to sign in.
    expect(challenge).toContain("resource_metadata=");
    expect(challenge).toContain("/.well-known/oauth-protected-resource/mcp");
  });

  it("rejects a token the authorization server says is inactive", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ active: false }), { status: 200 }));

    const response = await call("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer revoked-token",
      },
      body: jsonRpc("tools/list"),
    });

    expect(response.status).toBe(401);
  });

  it("refuses a token that lacks mcp:read", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          active: true,
          scope: "some:other:scope",
          exp: Math.floor(Date.now() / 1000) + 3600,
          sub: "user-1",
          client_id: "claude",
        }),
        { status: 200 }
      )
    );

    const response = await call("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer scopeless-token",
      },
      body: jsonRpc("tools/list"),
    });

    expect(response.status).toBe(403);
  });

  it("lists the tools once a valid token is presented", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          active: true,
          scope: "mcp:read mcp:write",
          exp: Math.floor(Date.now() / 1000) + 3600,
          sub: "user-1",
          aud: "https://plane.example.com/mcp",
          client_id: "claude",
        }),
        { status: 200 }
      )
    );

    const response = await call("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer good-token",
      },
      body: jsonRpc("tools/list"),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("list_workspaces");
    expect(text).toContain("create_work_item");
  });
});
