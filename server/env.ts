/**
 * Server settings, read once from environment variables.
 *
 * Accounts are optional. With no database or no secret the app runs exactly as it did before
 * accounts existed: local only, no sign-in. `readConfig` then returns `null` plus the reasons,
 * so a half-configured deployment says what is missing instead of failing in odd ways.
 */

export interface ServerConfig {
  production: boolean;
  /** The address people use, e.g. https://listzero.vercel.app. Cookies, links in emails and passkeys depend on it. */
  baseURL: string;
  trustedOrigins: string[];
  secret: string;
  databaseUrl: string;
  google: { clientId: string; clientSecret: string } | null;
  smtp: { host: string; port: number; user: string; password: string } | null;
  emailFrom: string;
  /** Emails that become admins when they sign up with a proven address. */
  adminEmails: string[];
  pwnedPasswordCheck: boolean;
  /** True when some way of delivering email exists (SMTP, or a test outbox). */
  emailDelivery: boolean;
  /** New accounts must click a link in an email before they can sign in. Needs email delivery. */
  verificationRequired: boolean;
}

type Env = Record<string, string | undefined>;

const value = (env: Env, key: string): string | undefined => {
  const v = env[key]?.trim();
  return v ? v : undefined;
};

const origin = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
};

/** Where this deployment is reached. Vercel tells us; BETTER_AUTH_URL overrides it. */
function addresses(env: Env): string[] {
  const hosts = [
    value(env, "BETTER_AUTH_URL"),
    env.VERCEL_ENV === "production" && value(env, "VERCEL_PROJECT_PRODUCTION_URL")
      ? `https://${value(env, "VERCEL_PROJECT_PRODUCTION_URL")}`
      : undefined,
    value(env, "VERCEL_BRANCH_URL") ? `https://${value(env, "VERCEL_BRANCH_URL")}` : undefined,
    value(env, "VERCEL_URL") ? `https://${value(env, "VERCEL_URL")}` : undefined,
  ];
  const found = hosts.map((h) => (h ? origin(h) : null)).filter((h): h is string => h !== null);
  return [...new Set(found)];
}

export interface ConfigResult {
  config: ServerConfig | null;
  /** Why accounts are off, in words a person can act on. Empty when they are on. */
  missing: string[];
}

export function readConfig(env: Env, options: { emailOutbox?: boolean } = {}): ConfigResult {
  const missing: string[] = [];
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";

  const databaseUrl = value(env, "DATABASE_URL");
  if (!databaseUrl) missing.push("DATABASE_URL is not set");

  const secret = value(env, "BETTER_AUTH_SECRET");
  if (!secret) missing.push("BETTER_AUTH_SECRET is not set");
  else if (secret.length < 32) missing.push("BETTER_AUTH_SECRET must be at least 32 characters");

  const [baseURL, ...others] = addresses(env);
  if (!baseURL) missing.push("BETTER_AUTH_URL is not set (the address of the site)");

  if (missing.length > 0 || !databaseUrl || !secret || !baseURL) return { config: null, missing };

  const googleId = value(env, "GOOGLE_CLIENT_ID");
  const googleSecret = value(env, "GOOGLE_CLIENT_SECRET");

  const smtpUser = value(env, "SMTP_USER");
  const smtpPassword = value(env, "SMTP_PASSWORD");
  const smtp =
    smtpUser && smtpPassword
      ? {
          host: value(env, "SMTP_HOST") ?? "smtp.gmail.com",
          port: Number(value(env, "SMTP_PORT") ?? 465),
          user: smtpUser,
          // Gmail shows app passwords in groups of four with spaces; the spaces are not part of it.
          password: smtpPassword.replace(/\s+/g, ""),
        }
      : null;

  // Outside production, emails are kept in memory or printed, so every flow can be tried.
  const emailDelivery = smtp !== null || options.emailOutbox === true || !production;

  return {
    missing,
    config: {
      production,
      baseURL,
      trustedOrigins: [baseURL, ...others],
      secret,
      databaseUrl,
      google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
      smtp,
      emailFrom: value(env, "EMAIL_FROM") ?? (smtpUser ? `Listzero <${smtpUser}>` : "Listzero <no-reply@localhost>"),
      adminEmails: (value(env, "ADMIN_EMAILS") ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
      pwnedPasswordCheck: value(env, "PWNED_PASSWORD_CHECK") !== "false",
      emailDelivery,
      verificationRequired: emailDelivery && value(env, "REQUIRE_EMAIL_VERIFICATION") !== "false",
    },
  };
}

/**
 * Whether a new user should get the admin role from ADMIN_EMAILS.
 * Only when the address is proven: verification is required before anyone can sign in, or the
 * provider (Google) already verified it. Otherwise anyone could sign up with the admin's address.
 */
export function isListedAdmin(
  user: { email: string; emailVerified: boolean },
  adminEmails: string[],
  verificationRequired: boolean,
): boolean {
  const proven = verificationRequired || user.emailVerified;
  return proven && adminEmails.includes(user.email.trim().toLowerCase());
}

/**
 * Asks Postgres to check the server's certificate, in so many words. Neon's addresses say
 * `sslmode=require`, which node-postgres treats as `verify-full` today (with a warning) but will
 * treat as "encrypt without checking" in its next major version. Spelling it out keeps the check.
 */
export function verifiedTls(databaseUrl: string): string {
  return databaseUrl.replace(/([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
}
