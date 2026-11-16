# Changelog

Notable changes to Listzero. Dates are when the change reached the live site.

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
