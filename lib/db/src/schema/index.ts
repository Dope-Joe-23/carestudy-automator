// Care study storage - SQLite-backed workspace history.
//
// `studies` holds the latest snapshot of each saved care study (the full
// workspace: title-page metadata plus every chapter/section's collected data,
// notes, and drafts). `study_versions` keeps an append-only history of every
// save, so earlier states can be restored.
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

export type Study = typeof studiesTable.$inferSelect;
export type InsertStudy = typeof studiesTable.$inferInsert;
export type StudyVersion = typeof studyVersionsTable.$inferSelect;
export type InsertStudyVersion = typeof studyVersionsTable.$inferInsert;
export type StudyFile = typeof studyFilesTable.$inferSelect;
export type InsertStudyFile = typeof studyFilesTable.$inferInsert;
export type LibrarySource = typeof librarySourcesTable.$inferSelect;
export type InsertLibrarySource = typeof librarySourcesTable.$inferInsert;
