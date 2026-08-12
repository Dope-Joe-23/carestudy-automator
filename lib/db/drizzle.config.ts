import { defineConfig } from "drizzle-kit";
import path from "path";

// Same DB_DRIVER flag the runtime uses: postgres for deployment, sqlite
// (default) for local development.
const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();

export default defineConfig(
  driver === "postgres"
    ? {
        dialect: "postgresql",
        schema: path.join(__dirname, "./src/schema/postgres.ts"),
        dbCredentials: {
          url: process.env.DATABASE_URL ?? "",
        },
      }
    : {
        dialect: "sqlite",
        schema: path.join(__dirname, "./src/schema/index.ts"),
        dbCredentials: {
          url: process.env.SQLITE_PATH ?? path.resolve(__dirname, "../carestudy.db"),
        },
      },
);
