import { closePostgres, createPostgresStore } from "./postgres";
import { closeSqlite, createSqliteStore } from "./sqlite";
import type { StudyStore } from "./store";

/**
 * Storage backend for study history, selected by the DB_DRIVER env flag:
 *
 *   - "sqlite"   (default)  — a single local file (carestudy.db), zero setup,
 *                             tables auto-created on first use. For development.
 *   - "postgres"            — a real Postgres database via DATABASE_URL, tables
 *                             created with `pnpm --filter @workspace/db run push:pg`.
 *                             For deployment.
 *
 * Throws only when the configured driver cannot be initialized (unknown driver,
 * or DB_DRIVER=postgres without DATABASE_URL). Callers should surface that as a
 * clean 503 rather than crashing.
 */
// The backend that was created, so shutdown can release it. Only the *first*
// backend created is tracked; getStudyStore() is called once per server run.
let activeClose: (() => Promise<void> | void) | null = null;

export function getStudyStore(): StudyStore {
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
  if (driver === "sqlite") {
    activeClose = closeSqlite;
    return createSqliteStore();
  }
  if (driver === "postgres") {
    activeClose = closePostgres;
    return createPostgresStore();
  }
  throw new Error(
    `Unknown DB_DRIVER "${driver}". Use "sqlite" (default) or "postgres".`,
  );
}

/**
 * Release the storage backend (connection pool / file handle). Safe to call
 * any time — a no-op when no store was created. Call on server shutdown so
 * the process exits cleanly; most importantly Postgres, where an open pool
 * keeps the event loop alive and would hang a graceful shutdown.
 */
export async function closeStudyStore(): Promise<void> {
  if (activeClose) {
    const close = activeClose;
    activeClose = null;
    await close();
  }
}

export * from "./store";
export type { StudyStore } from "./store";
// Keep the SQLite schema available via the root export (and "./schema").
export * from "./schema";
