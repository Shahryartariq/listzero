import { defineConfig } from "drizzle-kit";

// `npm run db:generate` compares server/schema.ts with the migrations in drizzle/ and writes
// the next SQL file. It needs no database. Migrations run against the real database at deploy
// time (scripts/migrate.mjs).
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/schema.ts",
  out: "./drizzle",
});
