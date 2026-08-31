import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema/postgres";
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
  StaffInviteRow,
  NewStaffInvite,
  StudyStore,
  VivaStatus,
} from "./store";

// Postgres backend for deployment (DB_DRIVER=postgres). Requires DATABASE_URL;
// tables are provisioned automatically at server startup.

let db: NodePgDatabase<typeof schema> | null = null;
let pool: pg.Pool | null = null;

const POSTGRES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "studies" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "study_versions" (
  "id" serial PRIMARY KEY,
  "study_id" integer NOT NULL REFERENCES "studies"("id") ON DELETE CASCADE,
  "data" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "study_versions_study_id_idx" ON "study_versions" ("study_id");
CREATE TABLE IF NOT EXISTS "study_files" (
  "id" serial PRIMARY KEY,
  "study_id" integer NOT NULL REFERENCES "studies"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "stored_path" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'clinical',
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'indexing',
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "study_files_study_id_idx" ON "study_files" ("study_id");
CREATE TABLE IF NOT EXISTS "library_sources" (
  "id" serial PRIMARY KEY,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "author" text,
  "year" text,
  "venue" text,
  "cite_key" text,
  "url" text,
  "filename" text NOT NULL,
  "stored_path" text NOT NULL,
  "status" text NOT NULL DEFAULT 'indexing',
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "admins" (
  "id" serial PRIMARY KEY,
  "username" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text,
  "role" text NOT NULL DEFAULT 'staff',
  "email" text,
  "invited_by" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "token" text PRIMARY KEY,
  "admin_id" integer NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "students" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "username" text NOT NULL UNIQUE,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "college" text NOT NULL,
  "program" text NOT NULL,
  "year" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "student_sessions" (
  "token" text PRIMARY KEY,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "student_orders" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "diagnosis" text,
  "college" text NOT NULL,
  "program" text NOT NULL,
  "notes" text,
  "correction_scope" text,
  "correction_text" text,
  "status" text NOT NULL DEFAULT 'submitted',
  "note" text,
  "produced_study_id" integer,
  "delivery_filename" text,
  "delivery_path" text,
  "delivery_size" integer,
  "viva_bank" text,
  "viva_status" text NOT NULL DEFAULT 'none',
  "viva_error" text,
  "viva_updated_at" timestamptz,
  "payment_status" text NOT NULL DEFAULT 'none',
  "paid_scope" text,
  "paid_amount" integer,
  "paystack_ref" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "student_orders_student_id_idx" ON "student_orders" ("student_id");
CREATE TABLE IF NOT EXISTS "student_order_files" (
  "id" serial PRIMARY KEY,
  "order_id" integer NOT NULL REFERENCES "student_orders"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "filename" text NOT NULL,
  "stored_path" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "student_order_files_order_id_idx" ON "student_order_files" ("order_id");

-- Migration: add columns that may be missing from older deployments ----------
-- Students: add username nullable, backfill, then constrain
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "username" text;
UPDATE "students" SET "username" = split_part("email", '@', 1) || '_' || "id" WHERE "username" IS NULL;
ALTER TABLE "students" ALTER COLUMN "username" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "students" ADD CONSTRAINT "students_username_unique" UNIQUE ("username");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins: add new columns (role has a safe DEFAULT)
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'staff';
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "invited_by" integer;

-- Student orders: add payment columns (paymentStatus has a safe DEFAULT)
ALTER TABLE "student_orders" ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'none';
ALTER TABLE "student_orders" ADD COLUMN IF NOT EXISTS "paid_scope" text;
ALTER TABLE "student_orders" ADD COLUMN IF NOT EXISTS "paid_amount" integer;
ALTER TABLE "student_orders" ADD COLUMN IF NOT EXISTS "paystack_ref" text;
`;

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

/** Provision a fresh deployment database before accepting requests. */
export async function initializePostgres(): Promise<void> {
  if ((process.env.DB_DRIVER || "sqlite").toLowerCase() !== "postgres") return;
  getPostgresDb();
  await pool!.query(POSTGRES_SCHEMA_SQL);
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

function toAdminRow(row: typeof schema.adminsTable.$inferSelect): AdminRow {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    name: row.name,
    role: row.role ?? "staff",
    email: row.email ?? null,
    invitedBy: row.invitedBy ?? null,
    createdAt: row.createdAt,
  };
}

function toStaffInviteRow(row: typeof schema.staffInvitesTable.$inferSelect): StaffInviteRow {
  return {
    id: row.id,
    token: row.token,
    createdBy: row.createdBy,
    label: row.label ?? null,
    usedAt: row.usedAt ?? null,
    usedBy: row.usedBy ?? null,
    createdAt: row.createdAt,
  };
}

function toStudentRow(row: typeof schema.studentsTable.$inferSelect): StudentRow {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
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
    correctionScope: row.correctionScope as OrderRow["correctionScope"],
    correctionText: row.correctionText,
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
    paymentStatus: (row.paymentStatus ?? "none") as OrderRow["paymentStatus"],
    paidScope: (row.paidScope ?? null) as OrderRow["paidScope"],
    paidAmount: row.paidAmount ?? null,
    paystackRef: row.paystackRef ?? null,
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

export function createPostgresStore(): StudyStore {
  const db = getPostgresDb();
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

    // --- Student portal ----------------------------------------------------

    async addStudent(student) {
      const [row] = await db.insert(students).values(student).returning();
      return toStudentRow(row);
    },

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
      const deleted = await db.delete(adminSessions).where(eq(adminSessions.token, token)).returning();
      return deleted.length > 0;
    },

    // --- Staff management --------------------------------------------------

    async listAdmins() {
      const rows = await db.select().from(admins).orderBy(desc(admins.id));
      return rows.map(toAdminRow);
    },

    async updateAdmin(id, fields) {
      const [row] = await db
        .update(admins)
        .set(fields)
        .where(eq(admins.id, id))
        .returning();
      return row ? toAdminRow(row) : null;
    },

    async createStaffInvite(invite) {
      const [row] = await db.insert(schema.staffInvitesTable).values(invite).returning();
      return toStaffInviteRow(row);
    },

    async listStaffInvites() {
      const rows = await db
        .select()
        .from(schema.staffInvitesTable)
        .orderBy(desc(schema.staffInvitesTable.id));
      return rows.map(toStaffInviteRow);
    },

    async getStaffInviteByToken(token) {
      const [row] = await db
        .select()
        .from(schema.staffInvitesTable)
        .where(eq(schema.staffInvitesTable.token, token));
      return row ? toStaffInviteRow(row) : null;
    },

    async useStaffInvite(id, usedByAdminId) {
      const [row] = await db
        .update(schema.staffInvitesTable)
        .set({ usedAt: new Date(), usedBy: usedByAdminId })
        .where(eq(schema.staffInvitesTable.id, id))
        .returning();
      return row ? toStaffInviteRow(row) : null;
    },

    async listAllStudents() {
      const rows = await db.select().from(students).orderBy(desc(students.id));
      return rows.map(toStudentRow);
    },

    async getStudentByUsername(username) {
      const [row] = await db.select().from(students).where(eq(students.username, username));
      return row ? toStudentRow(row) : null;
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
      const deleted = await db.delete(sessions).where(eq(sessions.token, token)).returning();
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

    async setOrderPaymentPending(id, paystackRef, scope) {
      const [row] = await db
        .update(orders)
        .set({
          paymentStatus: "pending",
          paystackRef,
          paidScope: scope,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();
      return row ? toOrderRow(row) : null;
    },

    async setOrderPaymentVerified(id, paystackRef, scope, amount) {
      const [row] = await db
        .update(orders)
        .set({
          paymentStatus: "verified",
          paystackRef,
          paidScope: scope,
          paidAmount: Math.round(amount * 100),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();
      return row ? toOrderRow(row) : null;
    },

    async setOrderPaymentFailed(id, paystackRef) {
      const [row] = await db
        .update(orders)
        .set({
          paymentStatus: "failed",
          paystackRef,
          updatedAt: new Date(),
        })
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
