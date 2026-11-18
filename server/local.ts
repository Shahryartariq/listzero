/**
 * The API on your own machine, for `npm run dev` and for the browser tests.
 *
 * It keeps the database in memory (PGlite: real Postgres, compiled to run inside Node), so nothing
 * needs installing, and it keeps every email in an outbox instead of sending it. Vite forwards
 * /api to this server, so the browser sees one site.
 *
 *   npm run api                   starts it on http://localhost:8787
 *   GET /api/__test/outbox?to=…   the emails "sent" so far (only exists here, never in production)
 */
import { createServer, type IncomingMessage } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createApp } from "./app";
import type { Database } from "./auth";
import { outboxMailer, type Mail } from "./email";
import { readConfig } from "./env";
import * as schema from "./schema";

const port = Number(process.env.PORT ?? 8787);
const site = process.env.SITE_URL ?? "http://localhost:5173";

const { config, missing } = readConfig(
  {
    DATABASE_URL: "pglite://memory",
    // Only ever used on this machine, with a database that vanishes when the server stops.
    BETTER_AUTH_SECRET: "local-development-only-secret-not-used-anywhere-else",
    BETTER_AUTH_URL: site,
    PWNED_PASSWORD_CHECK: "false",
    ADMIN_EMAILS: "admin@listzero.test",
    ...process.env,
  },
  { emailOutbox: true },
);
if (!config) throw new Error(`Cannot start the local API: ${missing.join("; ")}`);

const client = new PGlite(process.env.PGLITE_DIR);
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });

const outbox: Mail[] = [];
const app = createApp({
  config,
  missing,
  db: db as unknown as Database,
  mailer: outboxMailer(outbox, process.env.QUIET !== "1"),
});

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", site);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const chunks: Buffer[] = [];
  if (hasBody) for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Request(url, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}

createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    const { pathname, searchParams } = new URL(request.url);
    const response =
      pathname === "/api/__test/outbox"
        ? Response.json(outbox.filter((m) => !searchParams.get("to") || m.to === searchParams.get("to")))
        : await app(request);
    res.statusCode = response.status;
    // Set-Cookie must stay as separate headers; everything else can be copied as is.
    for (const [name, value] of response.headers) if (name !== "set-cookie") res.setHeader(name, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader("set-cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[local api]", error);
    res.statusCode = 500;
    res.end("Server error");
  }
}).listen(port, () => {
  console.info(`Listzero API for ${site} on http://localhost:${port} (in-memory database, emails kept in an outbox)`);
});
