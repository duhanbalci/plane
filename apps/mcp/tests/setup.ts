/**
 * Environment the config module validates at import time. Set before any
 * `@/env` import so the process does not exit during collection.
 */
process.env.APP_BASE_URL = "https://plane.example.com";
process.env.API_INTERNAL_URL = "http://api.internal:8000";
process.env.MCP_BASE_PATH = "/mcp";
process.env.MCP_INTROSPECTION_CLIENT_ID = "resource-server";
process.env.MCP_INTROSPECTION_CLIENT_SECRET = "resource-server-secret";
process.env.TOKEN_CACHE_TTL = "45";
process.env.APP_VERSION = "test";
// Bind to an ephemeral loopback port; the env module reads these at import.
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
delete process.env.REDIS_URL;
