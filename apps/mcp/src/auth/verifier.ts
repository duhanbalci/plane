/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/express";
import { logger } from "@plane/logger";
import { env, RESOURCE_URL } from "@/env";
import { TokenCache, type CachedIntrospection } from "./token-cache";

type IntrospectionResponse = {
  active: boolean;
  scope?: string;
  exp?: number;
  sub?: string;
  aud?: string;
  client_id?: string;
};

const invalidToken = (message: string) => new OAuthError(OAuthErrorCode.InvalidToken, message);

/** Compare resource identifiers per RFC 8707: exact match minus the fragment. */
const sameResource = (a: string, b: string) => {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = "";
    right.hash = "";
    return left.href.replace(/\/$/, "") === right.href.replace(/\/$/, "");
  } catch {
    return false;
  }
};

export class PlaneTokenVerifier implements OAuthTokenVerifier {
  private readonly cache = new TokenCache();
  private readonly introspectionUrl = new URL("/auth/o/introspect/", env.API_INTERNAL_URL).toString();
  private readonly credentials = Buffer.from(
    `${env.MCP_INTROSPECTION_CLIENT_ID}:${env.MCP_INTROSPECTION_CLIENT_SECRET}`
  ).toString("base64");

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const cached = await this.cache.get(token);
    const introspected = cached ?? (await this.introspect(token));

    if (!cached) {
      await this.cache.set(token, introspected);
    }

    if (introspected.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw invalidToken("The access token has expired");
    }

    // RFC 8707: a token minted for a different resource server must not be
    // accepted here, even though it is a perfectly valid Plane token.
    if (introspected.resource && !sameResource(introspected.resource, RESOURCE_URL.toString())) {
      logger.warn("[mcp] rejected a token issued for another resource", {
        expected: RESOURCE_URL.toString(),
        received: introspected.resource,
      });
      throw invalidToken("The access token was not issued for this MCP server");
    }

    return {
      token,
      clientId: introspected.clientId,
      scopes: introspected.scopes,
      expiresAt: introspected.expiresAt,
      resource: RESOURCE_URL,
      extra: { subject: introspected.subject },
    };
  }

  private async introspect(token: string): Promise<CachedIntrospection> {
    let response: Response;
    try {
      response = await fetch(this.introspectionUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(env.API_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error("[mcp] introspection request failed", error);
      throw new OAuthError(OAuthErrorCode.ServerError, "Could not reach the authorization server");
    }

    if (response.status === 401 || response.status === 403) {
      // Our own client credentials are wrong — an operator problem, not the
      // caller's, so do not report it as an invalid user token.
      logger.error("[mcp] introspection client credentials were rejected by the API");
      throw new OAuthError(OAuthErrorCode.ServerError, "The MCP server is misconfigured");
    }

    if (!response.ok) {
      throw new OAuthError(OAuthErrorCode.ServerError, "Token introspection failed");
    }

    const body = (await response.json()) as IntrospectionResponse;
    if (!body.active) {
      throw invalidToken("The access token is invalid or has been revoked");
    }
    if (!body.exp || !body.sub) {
      throw new OAuthError(OAuthErrorCode.ServerError, "Introspection response is missing exp or sub");
    }

    return {
      clientId: body.client_id ?? "unknown",
      scopes: body.scope ? body.scope.split(" ").filter(Boolean) : [],
      expiresAt: body.exp,
      subject: body.sub,
      resource: body.aud,
    };
  }

  async destroy() {
    await this.cache.destroy();
  }
}
