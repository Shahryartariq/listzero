# Security

## Reporting a problem

Please report security problems privately:

1. Open **Security → Report a vulnerability** on this repository
   (<https://github.com/Shahryartariq/listzero/security/advisories/new>), or
2. if that is not available to you, open an issue that says only "security report, please contact me" and
   leave the details out until we are in touch.

You should hear back within a week. Please give a fix a reasonable time to ship before publishing details.

## What is in scope

Listzero is a static web app. It has no server, no accounts and no database: tasks are kept in the visitor's
browser (`localStorage`). The things worth reporting are therefore mostly:

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
- **Supply chain:** GitHub Actions are pinned to commit hashes and run with a read-only token; Dependabot
  opens update PRs monthly; CI runs `npm audit` on what ships; CodeQL scans the code.

## What it does not protect against

Tasks are stored unencrypted in the browser. Anyone with access to the device and browser profile, and any
browser extension with access to the page, can read them. Do not put secrets in a to-do list.
