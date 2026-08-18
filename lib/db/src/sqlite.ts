import { DatabaseSync } from "node:sqlite";
import {
  drizzle,
  type AsyncRemoteCallback,
  type SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { SCHEMA_DDL } from "./ddl";
import type {
  AdminRow,
  LibrarySourceRow,
  NewAdmin,
  NewLibrarySource,
  NewOrder,
  NewOrderFile,
  NewStudent,
  NewStudyFile,
  OrderFileRow,
  OrderRow,
  OrderStatus,
  StudentRow,
  StudyFileRow,
  StudyRow,
  StudyStore,
  VivaStatus,
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

function toAdminRow(row: typeof schema.adminsTable.$inferSelect): AdminRow {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    name: row.name,
    createdAt: row.createdAt,
  };
}

function toStudentRow(row: typeof schema.studentsTable.$inferSelect): StudentRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    college: row.college,
    program: row.program,
    year: row.year,
    createdAt: row.createdAt,
  };
}

function toOrderRow(row: typeof schema.studentOrdersTable.$inferSelect): OrderRow {
  return {
    id: row.id,
    studentId: row.studentId,
    title: row.title,
    diagnosis: row.diagnosis,
    college: row.college,
    program: row.program,
    notes: row.notes,
    status: row.status as OrderStatus,
    note: row.note,
    producedStudyId: row.producedStudyId,
    deliveryFilename: row.deliveryFilename,
    deliveryPath: row.deliveryPath,
    deliverySize: row.deliverySize,
    vivaBank: row.vivaBank,
    vivaStatus: row.vivaStatus as VivaStatus,
    vivaError: row.vivaError,
    vivaUpdatedAt: row.vivaUpdatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOrderFileRow(row: typeof schema.studentOrderFilesTable.$inferSelect): OrderFileRow {
  return {
    id: row.id,
    orderId: row.orderId,
    kind: row.kind as OrderFileRow["kind"],
    filename: row.filename,
    storedPath: row.storedPath,
    mime: row.mime,
    size: row.size,
    createdAt: row.createdAt,
  };
}

export function createSqliteStore(): StudyStore {
  const db = getSqliteDb();
  const studies = schema.studiesTable;
  const files = schema.studyFilesTable;
  const library = schema.librarySourcesTable;
  const admins = schema.adminsTable;
  const adminSessions = schema.adminSessionsTable;
  const students = schema.studentsTable;
  const sessions = schema.studentSessionsTable;
  const orders = schema.studentOrdersTable;
  const orderFiles = schema.studentOrderFilesTable;

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
      // RETURNING tells us whether a row was actually deleted (SQLite has no
      // reliable rowCount through the proxy driver).
      const deleted = await db.delete(studies).where(eq(studies.id, id)).returning().all();
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

    // --- Studio admins -----------------------------------------------------

    async addAdmin(admin) {
      const [row] = await db.insert(admins).values(admin).returning();
      return toAdminRow(row);
    },

    async getAdminByUsername(username) {
      const [row] = await db.select().from(admins).where(eq(admins.username, username));
      return row ? toAdminRow(row) : null;
    },

    async getAdmin(id) {
      const [row] = await db.select().from(admins).where(eq(admins.id, id));
      return row ? toAdminRow(row) : null;
    },

    async createAdminSession(adminId, token) {
      await db.insert(adminSessions).values({ token, adminId });
    },

    async getAdminByToken(token) {
      const [session] = await db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.token, token));
      if (!session) return null;
      const [row] = await db.select().from(admins).where(eq(admins.id, session.adminId));
      return row ? toAdminRow(row) : null;
    },

    async removeAdminSession(token) {
      const deleted = await db
        .delete(adminSessions)
        .where(eq(adminSessions.token, token))
        .returning()
        .all();
      return deleted.length > 0;
    },

    // --- Student portal ----------------------------------------------------

    async addStudent(student) {
      const [row] = await db.insert(students).values(student).returning();
      return toStudentRow(row);
    },

    async getStudentByEmail(email) {
      const [row] = await db.select().from(students).where(eq(students.email, email));
      return row ? toStudentRow(row) : null;
    },

    async getStudent(id) {
      const [row] = await db.select().from(students).where(eq(students.id, id));
      return row ? toStudentRow(row) : null;
    },

    async createSession(studentId, token) {
      await db.insert(sessions).values({ token, studentId });
    },

    async getStudentByToken(token) {
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token));
      if (!session) return null;
      const [row] = await db.select().from(students).where(eq(students.id, session.studentId));
      return row ? toStudentRow(row) : null;
    },

    async removeSession(token) {
      const deleted = await db.delete(sessions).where(eq(sessions.token, token)).returning().all();
      return deleted.length > 0;
    },

    async addOrder(order) {
      const [row] = await db.insert(orders).values(order).returning();
      return toOrderRow(row);
    },

    async listOrders(studentId) {
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.studentId, studentId))
        .orderBy(desc(orders.id));
      return rows.map(toOrderRow);
    },

    async listAllOrders() {
      const rows = await db.select().from(orders).orderBy(desc(orders.id));
      return rows.map(toOrderRow);
    },

    async getOrder(id) {
      const [row] = await db.select().from(orders).where(eq(orders.id, id));
      return row ? toOrderRow(row) : null;
    },

    async updateOrderStatus(id, status, note = null) {
      const [row] = await db
        .update(orders)
        .set({ status, note, updatedAt: new Date() })
        .where(eq(orders.id, id))
        .returning();
      return row ? toOrderRow(row) : null;
    },

    async setOrderDelivery(id, delivery) {
      const [row] = await db
        .update(orders)
        .set({
          status: "ready",
          deliveryFilename: delivery.filename,
          deliveryPath: delivery.storedPath,
          deliverySize: delivery.size,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();
      return row ? toOrderRow(row) : null;
    },

    async setOrderProduced(id, studyId, note = null) {
      const [row] = await db
        .update(orders)
        .set({
          status: "in_production",
          producedStudyId: studyId,
          note,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();
      return row ? toOrderRow(row) : null;
    },

    async setOrderViva(id, viva) {
      const [row] = await db
        .update(orders)
        .set(
          viva.status === "ready"
            ? {
                vivaBank: viva.bankJson,
                vivaStatus: "ready",
                vivaError: null,
                vivaUpdatedAt: new Date(),
                updatedAt: new Date(),
              }
            : {
                vivaBank: null,
                vivaStatus: "error",
                vivaError: viva.error,
                vivaUpdatedAt: new Date(),
                updatedAt: new Date(),
              },
        )
        .where(eq(orders.id, id))
        .returning();
      return row ? toOrderRow(row) : null;
    },

    async addOrderFile(file) {
      const [row] = await db.insert(orderFiles).values(file).returning();
      return toOrderFileRow(row);
    },

    async listOrderFiles(orderId) {
      const rows = await db
        .select()
        .from(orderFiles)
        .where(eq(orderFiles.orderId, orderId))
        .orderBy(orderFiles.id);
      return rows.map(toOrderFileRow);
    },
  };
}
