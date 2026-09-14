/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createHash } from "node:crypto";
import Redis from "ioredis";
import { logger } from "@plane/logger";
import { env } from "@/env";

export type CachedIntrospection = {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  subject: string;
  resource?: string;
};

const KEY_PREFIX = "mcp:token:";

/**
 * Short-lived cache for introspection results.
 *
 * Without it every MCP request costs a round trip to the API. The TTL is
 * deliberately short: a revoked token keeps working for at most that long, and
 * the entry is capped by the token's own expiry so an expired token is never
 * served from cache.
 *
 * Falls back to an in-process Map when Redis is not configured, which is
 * correct but not shared across replicas.
 */
export class TokenCache {
  private redis: Redis | null = null;
  private local = new Map<string, { value: CachedIntrospection; expiresAt: number }>();

  constructor() {
    if (env.REDIS_URL) {
      this.redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
      this.redis.on("error", (error) => logger.error("[mcp] token cache redis error", error));
    }
  }

  // Never key the cache on the bearer value itself.
  private key(token: string) {
    return KEY_PREFIX + createHash("sha256").update(token).digest("hex");
  }

  private ttlSeconds(value: CachedIntrospection) {
    const untilExpiry = value.expiresAt - Math.floor(Date.now() / 1000);
    return Math.max(0, Math.min(env.TOKEN_CACHE_TTL, untilExpiry));
  }

  async get(token: string): Promise<CachedIntrospection | null> {
    const key = this.key(token);

    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as CachedIntrospection) : null;
      } catch (error) {
        // A cache outage must not take authentication down with it.
        logger.warn("[mcp] token cache read failed, falling back to introspection", error);
        return null;
      }
    }

    const entry = this.local.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.local.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(token: string, value: CachedIntrospection): Promise<void> {
    const ttl = this.ttlSeconds(value);
    if (ttl <= 0) return;

    const key = this.key(token);
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), "EX", ttl);
      } catch (error) {
        logger.warn("[mcp] token cache write failed", error);
      }
      return;
    }

    this.local.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  }

  async destroy(): Promise<void> {
    this.local.clear();
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
