/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Server as HttpServer } from "node:http";
import {
  createMcpExpressApp,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { OAuthMetadata } from "@modelcontextprotocol/server";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import express from "express";
import { logger } from "@plane/logger";
import { ALLOWED_HOSTS, ISSUER_URL, RESOURCE_URL, env } from "@/env";
import { PlaneTokenVerifier } from "@/auth/verifier";
import { registerTools } from "@/tools";

/** Scopes a token must carry before any tool is reachable. */
const REQUIRED_SCOPES = ["mcp:read"];
const SUPPORTED_SCOPES = ["mcp:read", "mcp:write"];

/**
 * Mirror of the authorization server metadata Plane's API serves at
 * /.well-known/oauth-authorization-server.
 *
 * Served here too so clients that only probe the resource origin — the older
 * discovery behaviour — still find the AS.
 */
const authorizationServerMetadata: OAuthMetadata = {
  issuer: ISSUER_URL,
  authorization_endpoint: `${ISSUER_URL}/auth/o/authorize/`,
  token_endpoint: `${ISSUER_URL}/auth/o/token/`,
  revocation_endpoint: `${ISSUER_URL}/auth/o/revoke/`,
  registration_endpoint: `${ISSUER_URL}/auth/o/register/`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: SUPPORTED_SCOPES,
  token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
};

export class Server {
  private app = createMcpExpressApp(
    ALLOWED_HOSTS.length > 0 ? { host: env.HOST, allowedHosts: ALLOWED_HOSTS } : { host: env.HOST }
  );
  private verifier = new PlaneTokenVerifier();
  private httpServer: HttpServer | null = null;

  initialize(): void {
    const auth = requireBearerAuth({
      verifier: this.verifier,
      requiredScopes: REQUIRED_SCOPES,
      // Drives the WWW-Authenticate challenge on 401, which is how an
      // unauthenticated MCP client discovers where to sign in.
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(RESOURCE_URL),
    });

    this.app.use(
      mcpAuthMetadataRouter({
        oauthMetadata: authorizationServerMetadata,
        resourceServerUrl: RESOURCE_URL,
        scopesSupported: SUPPORTED_SCOPES,
        resourceName: "Plane",
      })
    );

    this.app.get("/health", (_req, res) => {
      res.status(200).json({ status: "ok", version: env.APP_VERSION });
    });

    const node = toNodeHandler(
      createMcpHandler(
        () => {
          const server = new McpServer({ name: "plane", version: env.APP_VERSION });
          registerTools(server);
          return server;
        },
        { onerror: (error) => logger.error("[mcp] handler error", error) }
      )
    );

    this.app.all(env.MCP_BASE_PATH, express.json({ limit: "4mb" }), auth, (req, res) => {
      void node(req, res, req.body);
    });
  }

  listen(): Promise<void> {
    const port = Number(env.PORT);
    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(port, env.HOST, () => {
        logger.info(`[mcp] listening on ${env.HOST}:${this.port}, serving ${RESOURCE_URL.toString()}`);
        resolve();
      });
      this.httpServer.once("error", reject);
    });
  }

  /** The bound port — the configured one, or the assigned one when PORT is 0. */
  get port(): number {
    const address = this.httpServer?.address();
    return address && typeof address === "object" ? address.port : Number(env.PORT);
  }

  async destroy(): Promise<void> {
    await this.verifier.destroy();
    if (this.httpServer) {
      const httpServer = this.httpServer;
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      this.httpServer = null;
    }
  }
}
