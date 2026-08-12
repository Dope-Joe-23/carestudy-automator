// Create (or update) the local SQLite database and tables.
//
// This is only a convenience: the API server already auto-creates the tables
// on first use. Run it explicitly when you want to (re)build the file:
//
//   pnpm --filter @workspace/db run migrate
//
// Uses Node's built-in `node:sqlite` — no native modules required.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { SCHEMA_DDL } = await import("../src/ddl.ts");

const dbPath =
  process.env.SQLITE_PATH ??
  // scripts/ -> lib/db -> repo root, matching the API server's default.
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../carestudy.db");

const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec(SCHEMA_DDL);
sqlite.close();

console.log(`SQLite database ready at ${dbPath}`);
