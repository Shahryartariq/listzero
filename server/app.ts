/**
 * The whole API as one function from a Request to a Response, so the same code runs as a Vercel
 * Function in production (server/vercel.ts) and as a small local server for development and the
 * browser tests (server/local.ts).
 *
 *   GET  /api/config   what this deployment offers (accounts on or off, Google, email)
 *   *    /api/auth/*   Better Auth
 *   POST /api/sync     send and fetch task changes (signed-in only)
 *   POST /api/account/set-password   add a password to an account that signs in with Google
 */
import { isAPIError } from "better-auth/api";
import { isPasswordCompromised } from "better-auth/plugins";
import { createAuth, type Database } from "./auth";
import type { Mailer } from "./email";
import type { ServerConfig } from "./env";
import { readSyncRequest, sync, SyncError } from "./sync";

export interface AppDeps {
  /** null when accounts are not set up; the app then answers /api/config and nothing else. */
  config: ServerConfig | null;
  missing: string[];
  db?: Database;
  mailer?: Mailer;
  background?: (promise: Promise<unknown>) => void;
}

/** What the browser needs to know before it shows any sign-in button. */
export interface PublicConfig {
  accounts: boolean;
  google: boolean;
  /** New accounts must confirm their email before signing in. */
  emailVerification: boolean;
  /** Password reset and "delete by email" need a way to send mail. */
  email: boolean;
}

const MAX_BODY = 2 * 1024 * 1024;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const error = (status: number, code: string, message: string) => json({ code, message }, status);

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new SyncError(400, "BAD_REQUEST", "Send JSON");
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    throw new SyncError(413, "TOO_MANY_ITEMS", "That request is too large");
  }
  const text = await request.text();
  if (text.length > MAX_BODY) throw new SyncError(413, "TOO_MANY_ITEMS", "That request is too large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SyncError(400, "BAD_REQUEST", "That is not JSON");
  }
}

export function createApp(deps: AppDeps): (request: Request) => Promise<Response> {
  const { config, db } = deps;
  const auth = config && db ? createAuth({ db, config, mailer: deps.mailer ?? (async () => undefined), background: deps.background }) : null;

  const publicConfig: PublicConfig = {
    accounts: auth !== null,
    google: Boolean(auth && config?.google),
    emailVerification: Boolean(auth && config?.verificationRequired),
    email: Boolean(auth && config?.emailDelivery),
  };

  return async function handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/config") {
        if (request.method !== "GET") return error(405, "METHOD_NOT_ALLOWED", "Use GET");
        return json(publicConfig);
      }

      if (!auth || !config || !db) {
        return error(503, "ACCOUNTS_OFF", "Accounts are not set up on this copy of Listzero");
      }

      if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
        const response = await auth.handler(request);
        response.headers.set("cache-control", "no-store");
        return response;
      }

      // The session cookie is SameSite=Lax, so another site cannot send it with a POST.
      // Checking the Origin as well costs nothing.
      const fromSite = () => {
        const origin = request.headers.get("origin");
        return origin !== null && config.trustedOrigins.includes(origin);
      };

      if (pathname === "/api/account/set-password") {
        // Better Auth only offers this on the server. Signed in already (with Google), the person adds a
        // password and stays signed in everywhere: a reset by email would sign every device out.
        if (request.method !== "POST") return error(405, "METHOD_NOT_ALLOWED", "Use POST");
        if (!fromSite()) return error(403, "FORBIDDEN", "This request did not come from Listzero");
        const body = (await readJson(request)) as { newPassword?: unknown } | null;
        const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
        if (!(await auth.api.getSession({ headers: request.headers }))) return error(401, "UNAUTHORIZED", "Sign in first");
        try {
          if (config.pwnedPasswordCheck && newPassword && (await isPasswordCompromised(newPassword))) {
            return error(400, "PASSWORD_COMPROMISED", "This password has appeared in a data breach. Please choose a different one.");
          }
          await auth.api.setPassword({ body: { newPassword }, headers: request.headers });
        } catch (caught) {
          if (isAPIError(caught)) {
            const detail = caught.body as { code?: string; message?: string } | undefined;
            return error(caught.statusCode, detail?.code ?? "BAD_REQUEST", detail?.message ?? caught.message);
          }
          throw caught;
        }
        return json({ status: true });
      }

      if (pathname === "/api/sync") {
        if (request.method !== "POST") return error(405, "METHOD_NOT_ALLOWED", "Use POST");
        if (!fromSite()) return error(403, "FORBIDDEN", "This request did not come from Listzero");
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return error(401, "UNAUTHORIZED", "Sign in to sync");
        const body = readSyncRequest(await readJson(request));
        return json(await sync(db, session.user.id, body));
      }

      return error(404, "NOT_FOUND", "No such endpoint");
    } catch (caught) {
      if (caught instanceof SyncError) return error(caught.status, caught.code, caught.message);
      console.error("[api]", pathname, caught);
      return error(500, "SERVER_ERROR", "Something went wrong on the server");
    }
  };
}
