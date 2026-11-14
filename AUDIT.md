# Audit, roadmap and implementation report

## Before changes

On 2026-11-14 the checked-out repository at base `5008b0b31feb4ee82d7292768dcb9f78b1b12170` contained only the existing README. There was no application code, framework, package manifest, backend, API, authentication, database, storage integration or deployment configuration to audit or reuse. There was no existing app data or functioning UI to migrate or preserve. Accordingly this branch adds a new app rather than replacing an existing one.

## Roadmap and status

1. **Foundation:** add a lightweight app shell, mobile navigation, subject/chapter management and dashboard. Implemented as a local-only single-user app; no accounts.
2. **Core:** planner, timer, study sessions and review. Implemented with limitations below.
3. **Learning:** notes, formulas, resource links, revision schedules, practice and results. Implemented as user-entered trackers, not a source of official content or a full exam engine.
4. **Advanced:** basic charts and in-app reminders, offline shell. Implemented in part; AI, scheduled/background notifications and synchronization are not implemented.
5. **Quality/release:** backup, basic validation, unit/DOM/service-worker tests and documentation. Not yet verified on an actual Android device, deployed, or comprehensively tested for accessibility or security.

## Architecture and data

Static HTML/CSS and vanilla JS, no runtime dependencies or build step. The router and delegated handlers are in `js/app.js`; views are in `js/views/`; calculations and date helpers are in `js/utils.js`; state and backup functions are in `js/store.js`. Browser `localStorage` key `hsc27_state_v1` holds a single JSON object with schema version 1. There is no relational database, server migration, index, user table, account or sync conflict resolver.

State has `settings` (target, theme, intervals, exam date and notification preferences), and arrays: `subjects`, `chapters`, `tasks`, `sessions`, `revisions`, `practice`, `exams`, `examResults`, `notes`, `formulas`, `resources`, `weaknesses`, `journal`, `weeklyReviews`, `milestones`, `questionBank`. Most records have an ID; references use `subjectId`, `chapterId` or `examId` where relevant. Formula subject uses `subject`. Timestamps are ISO; calendar dates use `YYYY-MM-DD` with Bangladesh time for current dates. Study totals are derived from sessions. Restore checks the version and top-level structure, not every field or relationship; import trusted backups only. No migrations are needed from the original README-only repository. Unknown saved versions are not deliberately overwritten on load.

13 subject names are seeded; chapter data is empty until the user enters or imports it. Demo data is opt-in and is not official syllabus data. Personal chapter completion percentages and priorities are user judgments, not board data. The app makes no GPA guarantee.

## Feature summary and limitations

- Dashboard displays locally recorded time, tasks, exam date and completion. Lowest completion is **not** a measure of conceptual weakness.
- Chapters can be added, edited, reordered and imported. Revisions are scheduled on completion using configurable day offsets. The planner shows day/week/month and carries unfinished tasks when the app starts; it is not a full automatic scheduling or rescheduling engine.
- Timer offers stopwatch, countdown and Pomodoro-style focus/break phases, plus manual study records. Elapsed wall-clock time helps with throttling while the page survives, but timer state is not persisted on termination. No reliable Android background execution or long-break cycle is guaranteed.
- Practice, mistakes, question bank, notes, formulas, videos, weaknesses, journal and exams are manually entered. Exam records calculate an illustrative grade from total marks; they do not administer timed examinations, independently assess paper components or guarantee official grading rules. Exam chapter association and detailed comparisons/weak-chapter identification are incomplete. Document/PDF links are supported; uploads are not. No YouTube scraping or offline video downloading.
- The weekly review stores answers and a basic recorded-data summary; it does not automatically generate next-week plans. Analytics are derived from recorded data but do not cover every requested metric or advanced trends. Milestones/challenge mode, recently opened resource tracking, and complete chapter-test linkage are not implemented.
- UI is English with support for user-entered Bangla Unicode text; a translated Bangla UI is not implemented. Accessibility and low-end device performance have not been formally audited.
- In-app reminder bar checks revisions, user-set exam date, study target and weekly review while open. Optional browser notifications are limited to timer phase alerts when the browser permits them; missed-task notifications, scheduled daily summaries and background push are not implemented.
- AI is not implemented. A future provider integration must run server-side with authorization and protected credentials; no provider key is placed in browser code. Do not label generated questions as official.
- There is no multi-device sync, offline queue, accounts or conflict resolution. Local changes are saved directly on the current device. JSON export/restore is a manual transfer mechanism, **not** synchronization. Backup files are unencrypted. Android installation, actual offline behavior and timer behavior with a locked screen must be verified on the target device.

## Security and reliability

No keys are required or bundled. Personal data remains in local browser storage until explicitly exported; physical device access, other code running on the same origin, browser clearing or malicious browser extensions can expose or remove it. Backups are plaintext. Input validation, HTML escaping and HTTP(S) URL checks are used, but this is not a formal security audit; import only trusted files. There is no server authorization or RLS because there is no backend. A future multi-user backend must include authentication, per-user authorization, RLS and secure file access. Local storage failures are surfaced and unreadable storage is not automatically overwritten. Regular backups are essential.

The service worker caches the app shell, not remote video or AI. Increment its cache version on releases. It requires HTTPS or localhost. Browser storage may be unavailable, cleared or evicted. No production deployment URL is currently available; Pages status lookup returned HTTP 403 due to the integration's permissions.

## Tests run

`npm ci && npm test`: 10 utility unit checks, 10 store unit checks, 20 view render checks plus a form render check, a jsdom interaction scenario (chapter create/edit, revision scheduling, planner association and month, persistence, manual and timer edge cases, modal navigation), and mocked service-worker installation/cache/fallback checks. Basic HTTP requests for shell assets returned 200 from a local static server. These tests do **not** cover every form, navigation action, restore scenario or timer path; the service worker is mocked, not exercised in a real browser. No actual Android, installation, lock-screen, synchronization, authentication, database, real offline browser or deployed-host tests were performed; sync/auth/database do not exist. Follow-up manual testing is required before relying on the app for daily use.

## Configuration and installation

No paid services are needed. Deploy the repository to an HTTPS static host, then open the resulting URL on Android Chrome and choose Install app/Add to Home screen. No production URL has been created or verified. The app must be loaded online first; use Backup & restore regularly and keep copies private. See [README.md](README.md) for commands and update procedure.
