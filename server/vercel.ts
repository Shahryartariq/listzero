/**
 * The API on Vercel. `npm run build` bundles this file into api/_bundle.js, and api/index.js
 * (the Vercel Function) re-exports it. vercel.json sends every /api/* address here.
 */
import { attachDatabasePool, waitUntil } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createApp } from "./app";
import type { Database } from "./auth";
import { noMailer, smtpMailer } from "./email";
import { readConfig } from "./env";
import * as schema from "./schema";

const { config, missing } = readConfig(process.env);

let db: Database | undefined;
if (config) {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
  // Lets Vercel close idle connections before it suspends the function.
  attachDatabasePool(pool);
  db = drizzle(pool, { schema }) as unknown as Database;
} else if (process.env.DATABASE_URL || process.env.BETTER_AUTH_SECRET) {
  // Half set up: say what is missing. With nothing set, accounts are simply off, and that is quiet.
  console.warn(`[api] accounts are off: ${missing.join("; ")}`);
}

const app = createApp({
  config,
  missing,
  db,
  mailer: config?.smtp ? smtpMailer(config.smtp, config.emailFrom) : noMailer,
  background: waitUntil,
});

export default {
  fetch(request: Request): Promise<Response> {
    return app(request);
  },
};
