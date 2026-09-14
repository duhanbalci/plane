import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneTokenVerifier } from "@/auth/verifier";

const future = () => Math.floor(Date.now() / 1000) + 3600;

const introspectionOk = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      active: true,
      scope: "mcp:read mcp:write",
      exp: future(),
      sub: "11111111-1111-1111-1111-111111111111",
      aud: "https://plane.example.com/mcp",
      client_id: "claude",
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

describe("PlaneTokenVerifier", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a live token and reports its scopes", async () => {
    fetchMock.mockResolvedValue(introspectionOk());

    const auth = await new PlaneTokenVerifier().verifyAccessToken("good-token");

    expect(auth.clientId).toBe("claude");
    expect(auth.scopes).toEqual(["mcp:read", "mcp:write"]);
    expect(auth.resource?.toString()).toBe("https://plane.example.com/mcp");
    expect(auth.extra?.subject).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("authenticates to the introspection endpoint as a confidential client", async () => {
    fetchMock.mockResolvedValue(introspectionOk());

    await new PlaneTokenVerifier().verifyAccessToken("good-token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.internal:8000/auth/o/introspect/");
    const expected = Buffer.from("resource-server:resource-server-secret").toString("base64");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${expected}`);
    // The user's token travels in the body, never in a URL that might be logged.
    expect(String(url)).not.toContain("good-token");
  });

  it("rejects a revoked token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ active: false }), { status: 200 }));

    await expect(new PlaneTokenVerifier().verifyAccessToken("revoked")).rejects.toThrow(/invalid or has been revoked/);
  });

  it("rejects a token minted for another resource server", async () => {
    fetchMock.mockResolvedValue(introspectionOk({ aud: "https://other.example.com/mcp" }));

    await expect(new PlaneTokenVerifier().verifyAccessToken("wrong-audience")).rejects.toThrow(
      /not issued for this MCP server/
    );
  });

  it("accepts a token whose audience differs only by a trailing slash", async () => {
    fetchMock.mockResolvedValue(introspectionOk({ aud: "https://plane.example.com/mcp/" }));

    await expect(new PlaneTokenVerifier().verifyAccessToken("trailing-slash")).resolves.toBeDefined();
  });

  it("accepts a token with no audience recorded", async () => {
    fetchMock.mockResolvedValue(introspectionOk({ aud: undefined }));

    await expect(new PlaneTokenVerifier().verifyAccessToken("no-audience")).resolves.toBeDefined();
  });

  it("rejects an already expired token", async () => {
    fetchMock.mockResolvedValue(introspectionOk({ exp: Math.floor(Date.now() / 1000) - 10 }));

    await expect(new PlaneTokenVerifier().verifyAccessToken("stale")).rejects.toThrow(/expired/);
  });

  it("reports a server error, not an invalid token, when its own credentials are refused", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));

    // Misconfiguration on our side must not be blamed on the caller's token,
    // which would send clients into a pointless re-authorization loop.
    await expect(new PlaneTokenVerifier().verifyAccessToken("any")).rejects.toThrow(/MCP server is misconfigured/);
  });

  it("reports a server error when the authorization server is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(new PlaneTokenVerifier().verifyAccessToken("any")).rejects.toThrow(
      /Could not reach the authorization server/
    );
  });

  it("serves a repeated check from cache instead of introspecting again", async () => {
    fetchMock.mockResolvedValue(introspectionOk());
    const verifier = new PlaneTokenVerifier();

    await verifier.verifyAccessToken("cached-token");
    await verifier.verifyAccessToken("cached-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejection", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ active: false }), { status: 200 }));
    const verifier = new PlaneTokenVerifier();

    await expect(verifier.verifyAccessToken("bad")).rejects.toThrow();
    await expect(verifier.verifyAccessToken("bad")).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches separate tokens separately", async () => {
    // A fresh Response per call: a Response body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(introspectionOk()));
    const verifier = new PlaneTokenVerifier();

    await verifier.verifyAccessToken("token-a");
    await verifier.verifyAccessToken("token-b");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
