// SQLite DDL mirroring ./schema — run automatically on first connection so a
// developer never has to provision anything or run a migration to get started.

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS "studies" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" text NOT NULL,
  "data" text NOT NULL,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "study_versions" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "study_id" integer NOT NULL REFERENCES "studies"("id") ON DELETE CASCADE,
  "data" text NOT NULL,
  "created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "study_versions_study_id_idx" ON "study_versions" ("study_id");

CREATE TABLE IF NOT EXISTS "study_files" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "study_id" integer NOT NULL REFERENCES "studies"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "stored_path" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'clinical',
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'indexing',
  "error" text,
  "created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "study_files_study_id_idx" ON "study_files" ("study_id");

CREATE TABLE IF NOT EXISTS "library_sources" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);
`;
