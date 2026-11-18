/**
 * Sign-in for Listzero, built on Better Auth with the same choices as Authforge:
 * email (or username) and password, Google, required email verification, password reset,
 * two-factor codes, passkeys, an admin role, leaked-password checks and rate limits.
 */
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, haveIBeenPwned, lastLoginMethod, twoFactor, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deleteAccount, resetPassword, verifyEmail, type Mailer } from "./email";
import { isListedAdmin, type ServerConfig } from "./env";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * ONE_HOUR;
const APP_NAME = "Listzero";

/** Usernames: 3 to 30 letters, numbers, dots, dashes or underscores. Stored in lower case. */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,28})[a-z0-9]$/i;

// What an admin may do. Deliberately less than Better Auth's default: no impersonation (an admin
// "signed in as" someone would sync their own device's tasks into that person's account), and no
// setting another person's password or email.
const access = createAccessControl(defaultStatements);
const roles = {
  admin: access.newRole({ user: ["list", "get", "set-role", "ban", "delete"], session: ["list", "revoke", "delete"] }),
  user: access.newRole({ user: [], session: [] }),
};

export interface AuthDeps {
  db: Database;
  config: ServerConfig;
  mailer: Mailer;
  /** Keeps the server alive until a promise settles (sending an email after the reply has gone out). */
  background?: (promise: Promise<unknown>) => void;
}

export function createAuth({ db, config, mailer, background }: AuthDeps) {
  return betterAuth({
    appName: APP_NAME,
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: config.verificationRequired,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: ONE_HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer({ to: user.email, ...resetPassword(user.name, url) });
      },
    },
    emailVerification: {
      sendOnSignUp: config.verificationRequired,
      // Someone who tries to sign in before confirming gets a fresh link.
      sendOnSignIn: config.verificationRequired,
      autoSignInAfterVerification: true,
      expiresIn: ONE_HOUR,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer({ to: user.email, ...verifyEmail(user.name, url) });
      },
    },
    socialProviders: config.google
      ? { google: { ...config.google, prompt: "select_account" as const } }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // Google has checked the address, so an account with the same email is linked, not duplicated.
        trustedProviders: ["google"],
      },
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: {
        enabled: true,
        // Confirmed by email when email works; otherwise the password (or a fresh sign-in) is the confirmation.
        ...(config.emailDelivery
          ? {
              sendDeleteAccountVerification: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
                await mailer({ to: user.email, ...deleteAccount(user.name, url) });
              },
            }
          : {}),
      },
    },
    session: {
      expiresIn: 30 * ONE_DAY,
      updateAge: ONE_DAY,
      // No cookie cache: every request checks the session in the database, so signing out
      // elsewhere, a password change or a ban takes effect at once.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: config.production,
      // Stored in the database, because each serverless instance has its own memory.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-in/username": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 5 * 60, max: 3 },
        "/send-verification-email": { window: 5 * 60, max: 3 },
        "/two-factor/*": { window: 60, max: 5 },
        "/passkey/*": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (isListedAdmin(user, config.adminEmails, config.verificationRequired)) {
              return { data: { ...user, role: "admin" } };
            }
          },
        },
      },
    },
    advanced: {
      useSecureCookies: config.baseURL.startsWith("https://"),
      database: { generateId: "uuid" },
      ...(background ? { backgroundTasks: { handler: background } } : {}),
    },
    telemetry: { enabled: false },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (name) => USERNAME_PATTERN.test(name),
      }),
      twoFactor({ issuer: APP_NAME, backupCodeOptions: { amount: 10, length: 10 } }),
      passkey({ rpID: new URL(config.baseURL).hostname, rpName: APP_NAME, origin: config.baseURL }),
      admin({ defaultRole: "user", adminRoles: ["admin"], ac: access, roles }),
      lastLoginMethod(),
      ...(config.pwnedPasswordCheck
        ? [
            haveIBeenPwned({
              customPasswordCompromisedMessage:
                "This password has appeared in a data breach. Please choose a different one.",
            }),
          ]
        : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
