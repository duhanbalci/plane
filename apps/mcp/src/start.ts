/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { logger } from "@plane/logger";
import { Server } from "./server";

let server: Server | undefined;

async function startServer() {
  try {
    server = new Server();
    server.initialize();
    await server.listen();
  } catch (error) {
    logger.error("[mcp] failed to start", error);
    process.exit(1);
  }
}

void startServer();

const shutdown = async (signal: string, exitCode: number) => {
  logger.info(`[mcp] received ${signal}, shutting down`);
  try {
    await server?.destroy();
  } catch (error) {
    logger.error("[mcp] error during shutdown", error);
    process.exit(1);
  }
  process.exit(exitCode);
};

process.on("SIGTERM", () => void shutdown("SIGTERM", 0));
process.on("SIGINT", () => void shutdown("SIGINT", 1));

process.on("unhandledRejection", (error) => logger.error("[mcp] unhandled rejection", error));
process.on("uncaughtException", (error) => logger.error("[mcp] uncaught exception", error));
