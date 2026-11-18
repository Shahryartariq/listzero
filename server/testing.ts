/**
 * A whole Listzero API in memory, for tests: a real Postgres (PGlite) with the real migrations,
 * the real auth and sync code, and an outbox in place of an email account.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createApp } from "./app";
import type { Database } from "./auth";
import { outboxMailer, type Mail } from "./email";
import { readConfig } from "./env";
import * as schema from "./schema";

export const SITE = "http://localhost:4173";

export async function testApp(env: Record<string, string> = {}) {
  const { config, missing } = readConfig(
    {
      DATABASE_URL: "pglite://memory",
      BETTER_AUTH_SECRET: "test-only-secret-with-more-than-32-characters",
      BETTER_AUTH_URL: SITE,
      PWNED_PASSWORD_CHECK: "false",
      ...env,
    },
    { emailOutbox: true },
  );
  if (!config) throw new Error(missing.join("; "));
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  const outbox: Mail[] = [];
  const app = createApp({ config, missing, db: db as unknown as Database, mailer: outboxMailer(outbox, false) });
  return { app, outbox, db: db as unknown as Database, config, close: () => client.close() };
}

/** A browser, as far as the API can tell: it keeps cookies and sends the site's Origin. */
export function browser(app: (request: Request) => Promise<Response>) {
  const cookies = new Map<string, string>();

  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await app(
      new Request(`${SITE}${path}`, {
        method,
        redirect: "manual",
        headers: {
          origin: SITE,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(cookies.size > 0 ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, value);
    }
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data: data as Record<string, unknown> | null, location: response.headers.get("location") };
  }

  return {
    cookies,
    get: (path: string) => call("GET", path),
    post: (path: string, body: unknown = {}, headers?: Record<string, string>) => call("POST", path, body, headers),
    /** Follows a link from an email (it points at the site; the API is what answers). */
    visit: (url: string) => call("GET", url.replace(SITE, "")),
  };
}

/** The first link in the newest email to an address. */
export function linkFor(outbox: Mail[], to: string): string {
  const mail = outbox.filter((m) => m.to === to).at(-1);
  const link = mail ? /https?:\/\/\S+/.exec(mail.text)?.[0] : undefined;
  if (!link) throw new Error(`No email with a link for ${to}`);
  return link;
}
