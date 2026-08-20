// Care study storage - SQLite-backed workspace history.
//
// `studies` holds the latest snapshot of each saved care study (the full
// workspace: title-page metadata plus every chapter/section's collected data,
// notes, and drafts). The app autosaves this snapshot in place, so there is
// no version history to restore.
//
// SQLite is the development storage: a single local file (carestudy.db) with
// zero provisioning. See ddl.ts for the matching CREATE TABLE statements that
// are run automatically on first use.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const studiesTable = sqliteTable("studies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const studyVersionsTable = sqliteTable(
  "study_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studyId: integer("study_id")
      .notNull()
      .references(() => studiesTable.id, { onDelete: "cascade" }),
    data: text("data", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("study_versions_study_id_idx").on(table.studyId)],
);

export const studyFilesTable = sqliteTable(
  "study_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studyId: integer("study_id")
      .notNull()
      .references(() => studiesTable.id, { onDelete: "cascade" }),
    /** Original client filename (display only — never used as a path). */
    filename: text("filename").notNull(),
    /** Absolute or root-relative path on disk where the bytes live. */
    storedPath: text("stored_path").notNull(),
    /** What the upload is used for: "clinical" (patient evidence) for now. */
    kind: text("kind").notNull().$defaultFn(() => "clinical"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    /** "indexing" | "ready" | "error" — text extraction + index state. */
    status: text("status").notNull().$defaultFn(() => "indexing"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("study_files_study_id_idx").on(table.studyId)],
);

export const librarySourcesTable = sqliteTable("library_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** "ebook" | "notes" | "article" | "url" — what kind of source this is. */
  kind: text("kind").notNull(),
  /** Display title (auto-derived from the filename until the user edits it). */
  title: text("title").notNull(),
  author: text("author"),
  year: text("year"),
  venue: text("venue"),
  citeKey: text("cite_key"),
  url: text("url"),
  /** Original client filename (display only). */
  filename: text("filename").notNull(),
  storedPath: text("stored_path").notNull(),
  status: text("status").notNull().$defaultFn(() => "indexing"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Studio admins — the only people who can open the studio / order bin
// ---------------------------------------------------------------------------
// The studio (studies, library, uploads, order bin, drafts, exports) is
// production surface: every studio API route sits behind requireAdmin. An
// admin is bootstrapped from ADMIN_USERNAME / ADMIN_PASSWORD env vars on
// first login if none exists yet.

export const adminsTable = sqliteTable("admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Login username (unique, case-sensitive). */
  username: text("username").notNull().unique(),
  /** scrypt hash "salt:hash" — never the plaintext password. */
  passwordHash: text("password_hash").notNull(),
  /** Display name (optional, e.g. "Ama — Academic Team"). */
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** One row per logged-in admin session; the token is the bearer credential. */
export const adminSessionsTable = sqliteTable("admin_sessions", {
  token: text("token").primaryKey(),
  adminId: integer("admin_id")
    .notNull()
    .references(() => adminsTable.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Student portal — accounts, sessions, and care-study orders
// ---------------------------------------------------------------------------
// Students create accounts, place orders (with their project materials), and
// track the order until the completed study is delivered. The production
// happens in the studio; the student only ever sees their own orders.

/** A student account on the client portal. */
export const studentsTable = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** Lowercased login email (unique). */
  email: text("email").notNull().unique(),
  /** scrypt hash "salt:hash" — never the plaintext password. */
  passwordHash: text("password_hash").notNull(),
  college: text("college").notNull(),
  /** e.g. "RGN" | "RM" | "RCN" | "BSc Nursing" … */
  program: text("program").notNull(),
  /** Year of study, e.g. "Year 3". */
  year: text("year"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** One row per logged-in session; the token is the bearer credential. */
export const studentSessionsTable = sqliteTable("student_sessions", {
  token: text("token").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const studentOrdersTable = sqliteTable(
  "student_orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "cascade" }),
    /** Project title, e.g. "Patient/Family Care Study — Pulmonary Tuberculosis". */
    title: text("title").notNull(),
    /** Patient's diagnosis / condition under study. */
    diagnosis: text("diagnosis"),
    college: text("college").notNull(),
    program: text("program").notNull(),
    /** Free-form project information: patient data, requirements, instructions. */
    notes: text("notes"),
    /** Correction request scope and exact extracted source text, when applicable. */
    correctionScope: text("correction_scope"),
    correctionText: text("correction_text"),
    /** "submitted" | "in_production" | "ready" | "cancelled". */
    status: text("status").notNull().$defaultFn(() => "submitted"),
    /** Studio note to the student (status context / feedback). */
    note: text("note"),
    /** The study created from this order in the studio (null until produced). */
    producedStudyId: integer("produced_study_id"),
    deliveryFilename: text("delivery_filename"),
    deliveryPath: text("delivery_path"),
    deliverySize: integer("delivery_size"),
    /** Generated viva question bank (JSON) — cached on the order once produced. */
    vivaBank: text("viva_bank"),
    /** "none" | "pending" | "ready" | "error". */
    vivaStatus: text("viva_status").notNull().$defaultFn(() => "none"),
    vivaError: text("viva_error"),
    vivaUpdatedAt: integer("viva_updated_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("student_orders_student_id_idx").on(table.studentId)],
);

/** A document the student attached to their order (guidelines / clinical notes / references). */
export const studentOrderFilesTable = sqliteTable(
  "student_order_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => studentOrdersTable.id, { onDelete: "cascade" }),
    /** "guidelines" | "clinical" | "reference" — what the file is used for. */
    kind: text("kind").notNull(),
    /** Original client filename (display only — never used as a path). */
    filename: text("filename").notNull(),
    /** Path on disk where the bytes live (set by the storage layer). */
    storedPath: text("stored_path").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("student_order_files_order_id_idx").on(table.orderId)],
);

export type Study = typeof studiesTable.$inferSelect;
export type InsertStudy = typeof studiesTable.$inferInsert;
export type StudyVersion = typeof studyVersionsTable.$inferSelect;
export type InsertStudyVersion = typeof studyVersionsTable.$inferInsert;
export type StudyFile = typeof studyFilesTable.$inferSelect;
export type InsertStudyFile = typeof studyFilesTable.$inferInsert;
export type LibrarySource = typeof librarySourcesTable.$inferSelect;
export type InsertLibrarySource = typeof librarySourcesTable.$inferInsert;
export type Student = typeof studentsTable.$inferSelect;
export type InsertStudent = typeof studentsTable.$inferInsert;
export type StudentSession = typeof studentSessionsTable.$inferSelect;
export type StudentOrder = typeof studentOrdersTable.$inferSelect;
export type InsertStudentOrder = typeof studentOrdersTable.$inferInsert;
export type StudentOrderFile = typeof studentOrderFilesTable.$inferSelect;
export type InsertStudentOrderFile = typeof studentOrderFilesTable.$inferInsert;
