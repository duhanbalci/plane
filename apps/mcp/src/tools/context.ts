/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { PlaneApiError, PlaneClient } from "@/lib/plane-client";

/** Shape of the per-request context the SDK hands tool callbacks. */
type ToolContext = { http?: { authInfo?: { token: string; scopes: string[] } } };

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

export const failure = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/**
 * Build a Plane client bound to the caller's own token.
 *
 * `requireBearerAuth` has already rejected anonymous requests, so a missing
 * token here would mean the route was mounted without the middleware.
 */
export function clientFor(ctx: ToolContext): PlaneClient {
  const token = ctx.http?.authInfo?.token;
  if (!token) {
    throw new Error("No access token on the request; the /mcp route is missing its auth middleware");
  }
  return new PlaneClient(token);
}

/**
 * Wrap a tool body so Plane API errors come back as readable tool results
 * rather than protocol-level failures the model cannot act on.
 */
export function handler<Args>(
  run: (args: Args, client: PlaneClient) => Promise<ToolResult>
): (args: Args, ctx: ToolContext) => Promise<ToolResult> {
  return async (args, ctx) => {
    try {
      return await run(args, clientFor(ctx));
    } catch (error) {
      if (error instanceof PlaneApiError) return failure(error.detail);
      throw error;
    }
  };
}

export type ToolRegistrar = (server: McpServer) => void;
