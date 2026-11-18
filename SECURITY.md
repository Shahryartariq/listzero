# Security

## Reporting a problem

Please report security problems privately:

1. Open **Security → Report a vulnerability** on this repository
   (<https://github.com/Shahryartariq/listzero/security/advisories/new>), or
2. if that is not available to you, open an issue that says only "security report, please contact me" and
   leave the details out until we are in touch.

You should hear back within a week. Please give a fix a reasonable time to ship before publishing details.

## What is in scope

Listzero is a web app that keeps tasks in the visitor's browser (`localStorage`). Accounts are optional: with
one, a small API (`server/`, served at `/api`) signs people in with Better Auth and syncs their tasks through
Postgres. The things worth reporting are mostly:

- reading or changing another account's tasks, or signing in as someone else
- getting past email confirmation, two-factor, rate limits, a suspension, or the admin role's limits
- a sign-in, reset or confirmation link that can be reused, guessed or sent somewhere else

- script injection through task text, list names, a backup file or the address bar
- anything that lets one site or tab read or change another visitor's saved tasks
- a way around the Content-Security-Policy or the other response headers in `vercel.json`
- task content, list names or search words reaching Google Analytics (only the kind of screen should)
- a vulnerable dependency that ships to the browser (`npm audit --omit=dev`)

## How it is protected

- **Content-Security-Policy:** scripts and styles only from the site itself, one inline script allowed by
  hash, and the Google Analytics hosts by name. No `unsafe-inline`, no `unsafe-eval`. The browser tests run
  under this same policy.
- **Other headers:** HSTS, `nosniff`, no framing, a strict referrer policy, an isolated opener, and a
  Permissions-Policy that turns off the camera, microphone, location and similar features.
- **Untrusted data:** everything read from storage, from another tab or from a backup file goes through one
  validator (`src/lib/backup.ts`) that checks and clamps every field. Backup files over 5 MB are refused.
- **Analytics:** addresses and titles are replaced with fixed ones before anything is sent
  (`src/lib/analytics.ts`), and it is off under Do Not Track and Global Privacy Control.
- **Accounts:** passwords are hashed by Better Auth (scrypt) and checked against known leaks; sessions are
  `HttpOnly`, `Secure`, `SameSite=Lax` cookies; requests from other origins are refused; sign-in, sign-up and
  reset are rate-limited per address in the database; email must be confirmed before the first sign-in; reset
  and confirmation links expire. The admin role can list, suspend, sign out and delete accounts, and is refused
  impersonation and setting someone's password. Admins are named in `ADMIN_EMAILS` and only get the role once
  that email is confirmed.
- **Sync:** every request needs a session and a same-origin `Origin`; every task and list is checked by the same
  validator as backup files; an account is capped at 5,000 tasks and 100 lists, and a request body at 2 MB.
  Rows are always read and written by the signed-in account's id.
- **Supply chain:** GitHub Actions are pinned to commit hashes and run with a read-only token; Dependabot
  opens update PRs monthly; CI runs `npm audit` on what ships; CodeQL scans the code.

## What it does not protect against

Tasks are stored unencrypted in the browser, and for accounts unencrypted in the database (the database is
encrypted at rest by the host). Anyone with access to the device and browser profile, and any
browser extension with access to the page, can read them. Do not put secrets in a to-do list.
