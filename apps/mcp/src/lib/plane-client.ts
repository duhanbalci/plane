/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { env } from "@/env";

export class PlaneApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(detail);
    this.name = "PlaneApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

/**
 * Thin client over Plane's public v1 API.
 *
 * The caller's own bearer token is forwarded on every request rather than a
 * service credential, so the API's existing workspace and project permission
 * checks — and the token's mcp:read / mcp:write scope — remain the only
 * authority on what a tool call can reach. This server grants nothing.
 */
export class PlaneClient {
  constructor(private readonly accessToken: string) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`/api/v1${path}`, env.API_INTERNAL_URL);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(env.API_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PlaneApiError(503, `Could not reach the Plane API: ${(error as Error).message}`);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      throw new PlaneApiError(response.status, describeError(response.status, payload));
    }

    return payload as T;
  }
}

function describeError(status: number, payload: unknown): string {
  const detail =
    typeof payload === "string"
      ? payload
      : ((payload as { error?: string; detail?: string } | null)?.error ??
        (payload as { detail?: string } | null)?.detail ??
        JSON.stringify(payload));

  switch (status) {
    case 401:
      return "The access token is no longer valid. Sign in to Plane again.";
    case 403:
      // Two very different causes, and the caller can act on either.
      return `Not permitted: ${detail}. Either this token lacks the mcp:write scope, or you do not have the required role in this workspace or project.`;
    case 404:
      return `Not found: ${detail}`;
    case 429:
      return "Plane is rate limiting this token. Retry in a moment.";
    default:
      return `Plane API error (${status}): ${detail}`;
  }
}
