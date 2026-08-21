import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import app from "./app";
import { logger } from "./lib/logger";
import { draftWorker } from "./lib/draftWorker";
import { closeStudyStore, initializePostgres } from "@workspace/db";

// Load local config from <package>/..env if present (bundled into dist/,
// so resolve relative to this module). Values already set in the process
// environment take precedence, so this is a safe fallback for local dev.
const localEnvPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(localEnvPath)) {
  try {
    process.loadEnvFile(localEnvPath);
    logger.info({ path: localEnvPath }, "Loaded environment from .env");
  } catch (err) {
    logger.warn({ err, path: localEnvPath }, "Failed to load .env");
  }
}

// Local dev default: keep the SQLite database at the repository root unless
// SQLITE_PATH is set explicitly. Set before any lazy db import so study
// storage and the migrate script agree on the file location.
if (!process.env.SQLITE_PATH) {
  process.env.SQLITE_PATH = fileURLToPath(new URL("../../../carestudy.db", import.meta.url));
}

const rawPort = process.env["PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await initializePostgres();
  logger.info("Postgres schema ready");
} catch (err) {
  logger.error({ err }, "Failed to initialize Postgres schema");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Make sure the long-lived Python drafting worker is torn down with the
// server so it doesn't linger as an orphaned process, and the storage backend
// is released (notably the Postgres pool, which keeps the event loop alive).
process.on("exit", () => draftWorker.shutdown());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "Shutting down");
    draftWorker.shutdown();
    // Give the storage backend a bounded window to release its connections
    // (notably pool.end()); exit regardless so a stuck pool can't hang shutdown.
    const shutdown = Promise.race([
      closeStudyStore(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    void shutdown.finally(() => process.exit(0));
  });
}
