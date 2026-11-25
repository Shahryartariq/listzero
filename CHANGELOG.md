# Changelog

Notable changes to Listzero. Dates are when the change reached the live site.

## 1.1.0 (unreleased)

### Accounts and sync, optional

- Sign in with email and password, a username and password, Google, or a passkey.
- Email confirmation, password reset by email, and refusal of passwords known from data leaks.
- Two-factor codes from an authenticator app, with backup codes.
- Tasks and lists sync between devices, including changes made offline.
- Guests and accounts each have their own tasks. Signing in with guest tasks asks once whether to add them to the
  account; signing out takes the account's tasks off the browser and shows the guest tasks again. Two people who
  share a browser never see each other's tasks.
- A front page that says what Listzero is, with a working Today to try, and the ways in: as a guest, with Google,
  or with email. Someone already signed in goes straight to Today.
- The browser is asked to keep Listzero's data (persistent storage) once the first task is saved.
- An Account page (profile, password, two-factor, passkeys, Google, signed-in devices, sign out, delete account)
  and an admin page for managing accounts.
- Without the server settings, nothing changes: no sign-in is shown and tasks stay in the browser.

### Shared lists

- Share a list with a few people. Make a new shared list, or move one of your own lists there with its tasks.
- A Share dialog like Google Drive's: add people by email, or let anyone with the link join (after signing in).
  Each person can edit or only view. The owner can change roles, remove people, hand the list on, make a new link
  or delete the list for everyone.
- Start means "I'm on it": the others see who is on a task, and finished tasks show who finished them. A task
  someone else is on can be taken over.
- Shared tasks stay in their list: never in Today, Upcoming, Board, the Focus queue or backups. Search finds them
  and Focus works on one.
- Changes show for the others within about ten seconds while the list is open, and offline edits go out later.
- Deleting an account deletes the shared lists it owns, and says which first.

### Admin panel

- Admins sign in at their own address. The panel shows the numbers at a glance, who is online now, everyone
  (searchable and filterable), and one person's details: sign-in methods, two-factor, devices, and counts of their
  tasks and lists, never the tasks themselves.
- To anyone who isn't an admin it is a page that doesn't exist, and search engines are told not to index it.
- Only the addresses in `ADMIN_EMAILS` are admins, checked at every sign-in and server start; roles can't be
  changed from the app. With Google sign-in on, the admin signs in with Google only.

## 1.0.0 (2026-11-16)

The first release.

### The app

- **Quick add** that reads the day, time, repeat, list, priority and length out of a sentence, shows what it
  understood as chips, and turns a pasted list into one task per line.
- **Views:** Inbox, Today (a count down to zero, carried-over tasks, an offer to lighten a full day),
  Upcoming, Board (To do, Doing, Done today), Done, Focus (one task at a time with a timer), Search, and
  your own colour-coded lists.
- **Tasks:** steps, notes, day and time, repeats, priority, colour and length.
- **Display** on every task view: list, cards, board, calendar or table; six sort orders; filters by
  priority, colour, list, in progress and quick tasks; a note that says how many tasks a filter hides.
- **Appearance:** six low-glare palettes in light and dark, soft glass surfaces, larger text, a "name
  only" mode and a no-motion mode.
- **Your data:** saved in the browser, works offline, installs as an app, syncs between tabs, and can be
  saved to and loaded from a backup file. Undo on every change that removes or moves something.

### For this release

- Visit counting with Google Analytics on the public site. It sends the kind of screen only, never task,
  list or search text; it can be turned off in Settings and is off under Do Not Track and Global Privacy
  Control.
- Search engines: structured data, share-card tags, a dated sitemap, `llms.txt`, a real page head for
  `/about`, `noindex` on the app's own screens, and a real 404 for addresses that do not exist.
- Faster first load: the theme script is inline, the service worker registers after load, and rarely used
  screens load on demand.
- Flows fixed: add a task straight onto a calendar day; a clear page for a list that no longer exists; a
  warning with a download when saved data cannot be read; a different warning when storage is full; Undo
  after reopening a task; the Focus timer says when time is up, in the tab too.
- Security: a tighter Content-Security-Policy and more response headers, `SECURITY.md`, `security.txt`,
  CodeQL scanning, and a release workflow.
