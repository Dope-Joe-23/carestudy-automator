// Postgres schema for care study storage — mirrors ./index.ts (SQLite) so the
// same API and study data work against either backend. Used only when
// DB_DRIVER=postgres (e.g. when the app is deployed).

import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const studiesTable = pgTable("studies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studyVersionsTable = pgTable(
  "study_versions",
  {
    id: serial("id").primaryKey(),
    studyId: integer("study_id")
      .notNull()
      .references(() => studiesTable.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("study_versions_study_id_idx").on(table.studyId)],
);

export const studyFilesTable = pgTable(
  "study_files",
  {
    id: serial("id").primaryKey(),
    studyId: integer("study_id")
      .notNull()
      .references(() => studiesTable.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    storedPath: text("stored_path").notNull(),
    kind: text("kind").notNull().default("clinical"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    status: text("status").notNull().default("indexing"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("study_files_study_id_idx").on(table.studyId)],
);

export const librarySourcesTable = pgTable("library_sources", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  year: text("year"),
  venue: text("venue"),
  citeKey: text("cite_key"),
  url: text("url"),
  filename: text("filename").notNull(),
  storedPath: text("stored_path").notNull(),
  status: text("status").notNull().default("indexing"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Study = typeof studiesTable.$inferSelect;
export type InsertStudy = typeof studiesTable.$inferInsert;
export type StudyVersion = typeof studyVersionsTable.$inferSelect;
export type InsertStudyVersion = typeof studyVersionsTable.$inferInsert;
export type StudyFile = typeof studyFilesTable.$inferSelect;
export type InsertStudyFile = typeof studyFilesTable.$inferInsert;
export type LibrarySource = typeof librarySourcesTable.$inferSelect;
export type InsertLibrarySource = typeof librarySourcesTable.$inferInsert;
