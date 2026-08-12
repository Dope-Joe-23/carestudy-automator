import { DatabaseSync } from "node:sqlite";
import {
  drizzle,
  type AsyncRemoteCallback,
  type SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { SCHEMA_DDL } from "./ddl";
import type {
  LibrarySourceRow,
  NewLibrarySource,
  NewStudyFile,
  StudyFileRow,
  StudyRow,
  StudyStore,
  StudyVersionRow,
  StudyVersionSummaryRow,
} from "./store";

// SQLite for development: a single local file, no provisioning, no native
// modules (Node's built-in `node:sqlite`). Point SQLITE_PATH elsewhere to
// relocate the database file.

let db: SqliteRemoteDatabase<typeof schema> | null = null;
let sqlite: DatabaseSync | null = null;

function dbPath(): string {
  return process.env.SQLITE_PATH ?? "carestudy.db";
}

function openSqlite(): DatabaseSync {
  sqlite = new DatabaseSync(dbPath());
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  // Auto-create tables on first use (idempotent).
  sqlite.exec(SCHEMA_DDL);
  return sqlite;
}

/** Lazily-created typed Drizzle client (SQLite). Safe to call any time. */
export function getSqliteDb(): SqliteRemoteDatabase<typeof schema> {
  if (!db) {
    const sqlite = openSqlite();
    db = drizzle(
      (async (sql, params, method): Promise<{ rows: unknown[]; lastInsertRowid?: number }> => {
        const statement = sqlite.prepare(sql);
        // node:sqlite returns rows keyed by column name; the proxy driver
        // expects positional arrays, so map using the statement's columns.
        const columns = statement
          .columns()
          .map((column) => (column.name ?? column.column) as string);
        const rowToArray = (row: Record<string, unknown>) => columns.map((name) => row[name]);
        if (method === "run") {
          const result = statement.run(...params);
          return { rows: [], lastInsertRowid: Number(result.lastInsertRowid) };
        }
        if (method === "get") {
          const row = statement.get(...params) as Record<string, unknown> | undefined;
          // The proxy driver expects `rows` to be the row itself for "get";
          // `undefined` signals "no row" (cast because the driver types it loosely).
          return {
            rows: row ? rowToArray(row) : (undefined as unknown as unknown[]),
          };
        }
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { rows: rows.map(rowToArray) };
      }) as AsyncRemoteCallback,
      { schema },
    );
  }
  return db;
}

/**
 * Close the database file handle (no-op when never opened). Used on shutdown
 * to release the file; safe to call again later (the store reopens lazily).
 */
export function closeSqlite(): void {
  if (sqlite) {
    try {
      sqlite.close();
    } finally {
      sqlite = null;
      db = null;
    }
  }
}

function toRow(row: typeof schema.studiesTable.$inferSelect): StudyRow {
  return {
    id: row.id,
    name: row.name,
    data: row.data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLibraryRow(row: typeof schema.librarySourcesTable.$inferSelect): LibrarySourceRow {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    year: row.year,
    venue: row.venue,
    citeKey: row.citeKey,
    url: row.url,
    filename: row.filename,
    storedPath: row.storedPath,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFileRow(row: typeof schema.studyFilesTable.$inferSelect): StudyFileRow {
  return {
    id: row.id,
    studyId: row.studyId,
    filename: row.filename,
    storedPath: row.storedPath,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
  };
}

export function createSqliteStore(): StudyStore {
  const db = getSqliteDb();
  const studies = schema.studiesTable;
  const versions = schema.studyVersionsTable;
  const files = schema.studyFilesTable;
  const library = schema.librarySourcesTable;

  return {
    async list() {
      const rows = await db
        .select()
        .from(studies)
        .orderBy(desc(studies.updatedAt), desc(studies.id));
      return rows.map(toRow);
    },

    async create(name, data) {
      // Study + first version in one transaction so a failed version insert
      // can never leave a study without its history entry.
      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(studies).values({ name, data }).returning();
        await tx.insert(versions).values({ studyId: row.id, data });
        return row;
      });
      return toRow(created);
    },

    async get(id) {
      const [row] = await db.select().from(studies).where(eq(studies.id, id));
      return row ? toRow(row) : null;
    },

    async update(id, name, data) {
      // Update + new version atomically so the history always matches.
      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(studies)
          .set({ name, data, updatedAt: new Date() })
          .where(eq(studies.id, id))
          .returning();
        if (!updated) return null;
        await tx.insert(versions).values({ studyId: id, data });
        return updated;
      });
      return row ? toRow(row) : null;
    },

    async remove(id) {
      // RETURNING tells us whether a row was actually deleted (SQLite has no
      // reliable rowCount through the proxy driver).
      const deleted = await db.delete(studies).where(eq(studies.id, id)).returning().all();
      return deleted.length > 0;
    },

    async listVersions(studyId) {
      const rows = await db
        .select({ id: versions.id, createdAt: versions.createdAt })
        .from(versions)
        .where(eq(versions.studyId, studyId))
        .orderBy(desc(versions.createdAt), desc(versions.id));
      return rows.map(
        (row): StudyVersionSummaryRow => ({ id: row.id, createdAt: row.createdAt }),
      );
    },

    async getVersion(studyId, versionId) {
      const [row] = await db
        .select()
        .from(versions)
        .where(and(eq(versions.studyId, studyId), eq(versions.id, versionId)));
      if (!row) return null;
      const result: StudyVersionRow = { id: row.id, data: row.data, createdAt: row.createdAt };
      return result;
    },

    async listFiles(studyId) {
      const rows = await db
        .select()
        .from(files)
        .where(eq(files.studyId, studyId))
        .orderBy(files.id);
      return rows.map(toFileRow);
    },

    async addFile(file) {
      const [row] = await db.insert(files).values(file).returning();
      return toFileRow(row);
    },

    async getFile(id) {
      const [row] = await db.select().from(files).where(eq(files.id, id));
      return row ? toFileRow(row) : null;
    },

    async setFileStatus(id, status, error = null) {
      const [row] = await db
        .update(files)
        .set({ status, error })
        .where(eq(files.id, id))
        .returning();
      return row ? toFileRow(row) : null;
    },

    async removeFile(id) {
      const deleted = await db.delete(files).where(eq(files.id, id)).returning().all();
      return deleted.length > 0;
    },

    async listLibrary() {
      const rows = await db.select().from(library).orderBy(library.id);
      return rows.map(toLibraryRow);
    },

    async addLibrarySource(source) {
      const [row] = await db.insert(library).values(source).returning();
      return toLibraryRow(row);
    },

    async getLibrarySource(id) {
      const [row] = await db.select().from(library).where(eq(library.id, id));
      return row ? toLibraryRow(row) : null;
    },

    async setLibrarySourceStatus(id, status, error = null) {
      const [row] = await db
        .update(library)
        .set({ status, error, updatedAt: new Date() })
        .where(eq(library.id, id))
        .returning();
      return row ? toLibraryRow(row) : null;
    },

    async updateLibrarySource(id, fields) {
      const [row] = await db
        .update(library)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(library.id, id))
        .returning();
      return row ? toLibraryRow(row) : null;
    },

    async removeLibrarySource(id) {
      const deleted = await db.delete(library).where(eq(library.id, id)).returning().all();
      return deleted.length > 0;
    },
  };
}
