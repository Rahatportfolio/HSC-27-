# প্রস্তুতি — HSC 27 Study Planner

A Bengali-first, date-wise study companion for an HSC 2027 science student (Sylhet board), with Higher Mathematics as the fourth subject. Built with React, TypeScript and Vite; no account, backend or paid API is required.

## The plan

Default start: **14 November 2026**. Change it in **Settings** without deleting chapter progress.

| Phase | Dates | Days | What happens |
|---|---|---:|---|
| Syllabus | 14 Nov 2026 – 13 Feb 2027 | 92 | Every listed chapter/unit, foundations first; weekly catch-up sessions |
| Revision | 14 Feb – 13 Apr 2027 | 59 | Two revision rounds for science chapters, language/ICT practice |
| Model tests | 14 Apr – 13 May 2027 | 30 | 13 full-paper personal model tests, correction days, final light review |

These are **3 + 2 + 1 calendar months**, counted inclusively: **181 dates**. The daily target is **8 net study hours**; breaks are additional. The start time, daily target (6/8/10 hours), name and board are editable.

The complete default plan is also checked in as **[HSC-27-STUDY-PLAN.md](HSC-27-STUDY-PLAN.md)**. The app can export an updated Markdown copy that includes your own progress, notes and model-test scores.

## Features

- Today view with timed sessions, completion checkboxes, daily notes and a persistent 25/50-minute focus timer.
- Monthly calendar, date picker, subject/phase filters and an overdue-task backlog.
- Seven subjects, 13 papers, chapter/unit priorities, scheduled dates and per-chapter confidence.
- `Ctrl/⌘ + K` search across chapters and dated sessions.
- Model-test score entry and a mistake notebook with resolved/unresolved states.
- Progress by subject and phase; weekly bars show **planned minutes of completed tasks**, not measured study time.
- `.ics` export for today, the next seven days, or the whole remaining plan, with `VALARM` reminders and `Asia/Dhaka` time.
- Browser notifications while the app is open, plus a test-notification button.
- Installable PWA with a precached production shell for offline use after the first successful online visit.
- Validated JSON backup/import, cross-tab updates, local persistence and explicit destructive-action confirmations.
- Responsive Bengali interface, locally bundled fonts, keyboard-accessible dialogs and reduced-motion support.

## Run locally

Requires Node.js 22+.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The dev server binds to `0.0.0.0` and accepts the Arena preview host.

```bash
npm test          # planner, date, export and backup validation tests
npm run typecheck
npm run build     # production build in dist/
npm run preview   # serve the production build on port 3000
npm run plan      # regenerate HSC-27-STUDY-PLAN.md with default settings
npm run icons     # regenerate PNG PWA icons from public/icon.svg
```

If your npm version has a peer-resolution problem, use `npm ci --legacy-peer-deps`. The checked-in lockfile is the source of truth.

Optional production-browser smoke test (progress, reminders, ICS, backup, offline reload, responsive widths):

```bash
npm install --no-save playwright-core
npm run build && npm run preview
# In another terminal, point CHROMIUM_PATH at a Chrome/Chromium executable:
CHROMIUM_PATH=/path/to/chrome node scripts/browser-smoke.mjs
```

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` tests and builds the app, then deploys `dist/`.

1. Push this branch to GitHub.
2. In the repository, open **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source.
3. Run the **Build and deploy Prostuti** workflow (or push to the configured branch).
4. Open the URL shown by the deploy job / Pages settings.

Vite uses a relative base (`./`), so project-page URLs such as `https://<user>.github.io/<repo>/` work without changing the router. Navigation uses hashes, not server-side routes.

## Reminders — what actually works

- **Calendar alarms:** download an `.ics` file from Reminders, then import it into Google Calendar, Apple Calendar or Outlook. Each event carries an alarm (default: 10 minutes before). Keep the calendar app's notification permission enabled. Alarm delivery depends on the calendar/device.
- **Browser notifications:** available on HTTPS/localhost after permission is granted. They are checked while the app or tab is open. **There is no background Web Push server**, so closing the app stops these reminders. Use calendar alarms for closed-app reminders.
- **Changing the schedule:** export and import again. Stable event UIDs help some calendars update events, but the safest approach is a dedicated HSC calendar: remove its old events, then import the new file. Previously imported calendars do not sync automatically.
- Completed tasks are omitted from new exports. Existing calendar events are not deleted automatically.

## Data and privacy

Progress, settings, notes, confidence, scores and mistakes live in this browser's `localStorage` under `hsc27-prostuti-v1`. The focus timer and notification deduplication use separate local keys. The service worker caches only public app assets, not personal data.

There is no login, analytics, cloud sync or cross-device account. Use **Settings → ব্যাকআপ রাখো** regularly; import that JSON on another device to transfer your data. Clearing browser storage removes local progress. Reset asks for confirmation and does not remove calendar events you already imported.

If saved data ever fails validation, the app keeps the raw payload under a recovery key when storage allows it and shows a **রিকভারি ফাইল** download in Settings instead of silently discarding it.

## Syllabus and exam-date caution

This is a **textbook-based planning aid**, not an officially approved syllabus, a prediction of questions, or a guarantee of GPA 5/Golden A+.

- `A` means “study earlier” and `B` means “study next”; neither is an official board category. No listed chapter is dropped, and no chapter is claimed to have a 100% chance of appearing.
- Science chapter names follow common NCTB textbook organisation. Bangla and English use skill-based units so a different/new Class XI edition is not silently imposed on an HSC 2027 candidate. Match lesson numbers to your own exam-year books.
- Biology 2nd Paper chapter 12 is edition-sensitive and explicitly flagged in the app.
- Verify the current notice and your textbooks at [NCTB](https://nctb.gov.bd/pages/notices/), the [NCTB textbook page](https://nctb.gov.bd/pages/static-pages/6ae03d7be0cf994829342115), and [Sylhet Board](https://sylhetboard.gov.bd/). The app's chapter list has not been certified against a final board notice.
- The final month's tests are **personal model tests**, not board exams. Confirm the real board routine separately. Practical work follows your teacher's prescribed list.

## Source layout

```text
src/data.ts             subjects, chapters, papers and source links
src/planner.ts          date helpers and deterministic 3-phase schedule
src/storage.ts          validated local data and backup import
src/exports.ts          RFC-style ICS folding/alarms and Markdown export
src/hooks.ts            focus timer and open-app browser reminders
src/views/              Today, Calendar, Syllabus, Exams, Progress, Reminders, Settings
public/sw.js            production offline shell (precache list injected at build)
scripts/export-plan.ts  checked-in Markdown plan generator
```
