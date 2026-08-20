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

CREATE TABLE IF NOT EXISTS "admins" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "username" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text,
  "created_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "token" text PRIMARY KEY NOT NULL,
  "admin_id" integer NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
  "created_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "students" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "college" text NOT NULL,
  "program" text NOT NULL,
  "year" text,
  "created_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "student_sessions" (
  "token" text PRIMARY KEY NOT NULL,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "created_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "student_orders" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
  "viva_updated_at" integer,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "student_orders_student_id_idx" ON "student_orders" ("student_id");

CREATE TABLE IF NOT EXISTS "student_order_files" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "order_id" integer NOT NULL REFERENCES "student_orders"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "filename" text NOT NULL,
  "stored_path" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "created_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "student_order_files_order_id_idx" ON "student_order_files" ("order_id");
`;
