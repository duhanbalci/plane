/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  APP_VERSION: z.string().default("1.0.0"),
  PORT: z.string().default("3000"),
  HOST: z.string().default("0.0.0.0"),

  /** Public origin of this Plane deployment, e.g. https://plane.example.com. */
  APP_BASE_URL: z.url("APP_BASE_URL must be a valid URL"),
  /** Where this service reaches the Plane API from inside the network. */
  API_INTERNAL_URL: z.url("API_INTERNAL_URL must be a valid URL").default("http://api:8000"),
  /** Path this server is mounted at behind the proxy. */
  MCP_BASE_PATH: z.string().default("/mcp"),

  /**
   * Confidential OAuth client this service authenticates as when it calls the
   * introspection endpoint. Created with the `create_mcp_client` management
   * command on the API side.
   */
  MCP_INTROSPECTION_CLIENT_ID: z.string().min(1),
  MCP_INTROSPECTION_CLIENT_SECRET: z.string().min(1),

  /** How long a positive introspection result may be reused, in seconds. */
  TOKEN_CACHE_TTL: z.string().default("45").transform(Number),

  REDIS_URL: z.string().optional(),

  /**
   * Comma-separated hostnames this server will answer to, for DNS rebinding
   * protection. Leave unset behind a trusted reverse proxy, where the proxy
   * already fixes the Host header.
   */
  MCP_ALLOWED_HOSTS: z.string().default(""),

  /** Outbound request timeout to the Plane API, in milliseconds. */
  API_TIMEOUT_MS: z.string().default("15000").transform(Number),
});

const validateEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(z.treeifyError(result.error), null, 4));
    process.exit(1);
  }
  return result.data;
};

export const env = validateEnv();

/** The RFC 8707 resource identifier clients must request tokens for. */
export const RESOURCE_URL = new URL(
  env.MCP_BASE_PATH.replace(/^\/?/, "/"),
  env.APP_BASE_URL.endsWith("/") ? env.APP_BASE_URL : `${env.APP_BASE_URL}/`
);

export const ALLOWED_HOSTS = env.MCP_ALLOWED_HOSTS.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export const ISSUER_URL = env.APP_BASE_URL.replace(/\/$/, "");
