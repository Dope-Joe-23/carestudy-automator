import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import app from "./app";
import { logger } from "./lib/logger";
import { ensureNurseFlowSeeds } from "./lib/nurseflowContent";
import { draftWorker } from "./lib/draftWorker";
import { closeStudyStore, initializePostgres } from "@workspace/db";

// Load local config from <package>/.env if present (bundled into dist/,
// so resolve relative to this module).
//
// .env values OVERRIDE an inherited OS-level environment on purpose: the
// deployment's config file is more specific than whatever shell/user
// variables happen to be set. Node's process.loadEnvFile() keeps
// already-set variables ("--env-file" semantics), which let a stale
// user-level ANTHROPIC_MODEL shadow a corrected .env value across
// restarts — so values are parsed and assigned explicitly here. Deployments
// that need a different value should edit .env, not the OS environment.
const localEnvPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(localEnvPath)) {
  try {
    const before = { ...process.env };
    const lines = readFileSync(localEnvPath, "utf-8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
      let value = line.slice(eq + 1).trim();
      // Strip surrounding quotes and an inline comment after an unquoted value.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        const hash = value.indexOf(" #");
        if (hash !== -1) value = value.slice(0, hash).trim();
      }
      if (key) process.env[key] = value;
    }
    // Log overrides so stale OS/user-level variables are visible in the log.
    const overridden = Object.keys(process.env).filter(
      (key) => key in before && before[key] !== process.env[key],
    );
    if (overridden.length > 0) {
      logger.warn(
        { keys: overridden },
        ".env overrode inherited environment variables",
      );
    }
    logger.info({ path: localEnvPath }, "Loaded environment from .env (overrides applied)");
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

// Seed the NurseFlow content stores on first boot (a no-op when the store
// files already exist, or when the seed directory itself is absent). Runs
// before the server accepts traffic so the first feed request never sees an
// empty bank on a fresh deployment.
try {
  await ensureNurseFlowSeeds();
} catch (err) {
  logger.error({ err }, "Failed to seed NurseFlow content stores");
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
