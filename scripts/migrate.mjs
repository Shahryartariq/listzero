// Brings the production database up to date with the SQL files in drizzle/.
// Runs during the production build on Vercel, and only when a database is configured, so a copy
// of Listzero with accounts off builds exactly as before. Safe to run again: applied files are skipped.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Neon's direct connection when there is one: schema changes should not go through the pooler.
const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)?.trim();
const production = process.env.VERCEL_ENV === "production" || process.argv.includes("--force");

if (!url) {
  console.log("migrate: no DATABASE_URL, accounts are off, nothing to do");
} else if (!production) {
  console.log("migrate: not a production build, skipped (run with --force to apply anyway)");
} else {
  // Check the server's certificate explicitly (see verifiedTls in server/env.ts).
  const connectionString = url.replace(/([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
    console.log("migrate: database is up to date");
  } finally {
    await pool.end();
  }
}
