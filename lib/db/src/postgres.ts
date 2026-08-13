import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema/postgres";
import type {
  LibrarySourceRow,
  NewLibrarySource,
  NewStudyFile,
  StudyFileRow,
  StudyRow,
  StudyStore,
} from "./store";

// Postgres backend for deployment (DB_DRIVER=postgres). Requires DATABASE_URL;
// tables are created with `pnpm --filter @workspace/db run push:pg`.

let db: NodePgDatabase<typeof schema> | null = null;
let pool: pg.Pool | null = null;

/** Lazily-created Postgres client. Throws only when first used. */
export function getPostgresDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DB_DRIVER=postgres requires DATABASE_URL to be set (a Postgres connection string). " +
          "Create the tables with `pnpm --filter @workspace/db run push:pg`.",
      );
    }
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}

/**
 * Close the connection pool (no-op when never opened). Without this an open
 * pool keeps the Node event loop alive and a graceful shutdown would hang.
 */
export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
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

export function createPostgresStore(): StudyStore {
  const db = getPostgresDb();
  const studies = schema.studiesTable;
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
      const [row] = await db.insert(studies).values({ name, data }).returning();
      return toRow(row);
    },

    async get(id) {
      const [row] = await db.select().from(studies).where(eq(studies.id, id));
      return row ? toRow(row) : null;
    },

    async update(id, name, data) {
      const [updated] = await db
        .update(studies)
        .set({ name, data, updatedAt: new Date() })
        .where(eq(studies.id, id))
        .returning();
      return updated ? toRow(updated) : null;
    },

    async remove(id) {
      const deleted = await db.delete(studies).where(eq(studies.id, id)).returning();
      return deleted.length > 0;
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
      const deleted = await db.delete(files).where(eq(files.id, id)).returning();
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
      const deleted = await db.delete(library).where(eq(library.id, id)).returning();
      return deleted.length > 0;
    },
  };
}
