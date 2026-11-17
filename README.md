# প্রস্তুতি — HSC 27 Study Planner

A Bengali-first, offline study companion for HSC 2027 science preparation (Sylhet board), with Higher Mathematics as the fourth subject. React, TypeScript, Vite and Capacitor; no account, backend, cloud database or paid API.

**Working update: 2.42.0 — date/time cascade.** The repository version is not a publication claim. The previously published APK is [v2.41.0](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.41.0); this update has not yet been released or deployed to the public PWA.

## What changed

- New profiles start on **20 November 2026**. Phase dates, chapter hours/dates, the calendar, countdowns, exports and reminder inputs derive from the saved settings rather than an old static timetable.
- Changing the start moves linked personal targets, planned custom dates, day/time overrides and pending task references in one validated transaction. Preview the complete customised plan before confirming.
- Completed timestamps, journal entries, measured sessions, marks, recall history and real appointments retain their actual dates. Partial completion references move without duplicating evidence; undo followed by a reverse date change cannot revive an old tick.
- Locked dates, conflicting records and custom work outside the new horizon block an unsafe transaction without changing the original data.
- Incomplete syllabus allocation, missing accompanying practice, revision/mock shortages, overlapping pending sessions and work beyond the deadline are warnings, not hidden behind a “full preparation” promise.
- Lectures cannot silently extend the board-preparation target or split a full mock paper into a misleading partial exam. Adaptive replacements roll back when displaced work has no safe slot.
- Settings and the running app use the same final-plan projection. The Weakness screen describes the actual adaptation rather than applying it again.
- Before the start, the dashboard explicitly identifies a future routine and offers a first-day preview instead of claiming an assigned study target for today.
- Follow-up recheck: promoted split completion is counted once in lecture-plan capacity; overlapping ranges are deduplicated and clipped to the current source duration. Malformed legacy task references remain in backups without crashing the app/restore or certifying completion. Video ticks cannot certify content beyond the actual class duration.
- Boost controls describe the configured date rather than assuming “next month”; high-hour options no longer imply full preparation, and the UI explicitly asks users to leave time for breaks, meals and sleep.

## Dates: personal targets, not an official routine

**An official HSC 2027 examination date and this student's college-test notice could not be verified.** NCTB notice retrieval was incomplete, Dhaka Board retrieval was blocked by a challenge, and the fetched Sylhet HSC/college notice pages did not establish either date. This is **not proof that no notice exists**. Blogs and dates for SSC or HSC 2026 are not substitutes.

Official starting points: [NCTB notices](https://nctb.gov.bd/pages/notices/), [Sylhet HSC Corner](https://sylhetboard.gov.bd/corner/hsc), [Sylhet college notices](https://sylhetboard.gov.bd/order/college), [Dhaka Board HSC notices](https://dhakaeducationboard.gov.bd/index.php/site/product/hsccorner). Verification was attempted on **16 November 2026**; check the issuing board and your college before relying on a real examination deadline.

Current **new-profile defaults**:

| Setting | Value | Meaning |
|---|---|---|
| Routine start | 20 Nov 2026 | Confirmed requested start |
| First session | 06:30 | Bangladesh time (Asia/Dhaka, UTC+6) |
| Initial daily target | 8 net hours | Breaks are additional |
| Boost | 7 Dec 2026, 16 net hours | Editable personal workload; reduce it to leave adequate rest |
| Test-preparation target | 1 Feb 2027 | **Personal**, not a verified college examination date |
| Board-preparation target | 6 Jun 2027 | **Personal**, not a verified HSC routine |
| Target policy | Move with the start | Switch to **fixed** once an external deadline is confirmed |

| Default phase | Dates (inclusive) | Planning days |
|---|---|---:|
| Syllabus & test preparation | 20 Nov 2026 – 31 Jan 2027 | 73 |
| Revision & question practice | 1 Feb – 6 May 2027 | 95 |
| Model tests & final preparation | 7 May – 5 Jun 2027 | 30 |

Total: **198 planning dates, 827 tasks**. Initial chapter allocation ends on **29 January** in the default plan. Allocation is not completion, and a high daily target is not a recommendation or a result guarantee. Different hours, custom slots, lectures or fixed deadlines can change capacity; inspect the warnings. Late starts reserve the final night so sessions do not spill into a target date.

### Change the start safely

1. Take a JSON backup, then open **Settings & backup → Routine start date**.
2. Keep **Move personal targets with the start**, or choose **Keep college/board deadlines fixed** for a confirmed external date.
3. Review the phase preview and capacity warnings, then **Save → Update routine**.

For example, **20 → 26 November** moves the boost to **13 December**, the personal test target to **7 February**, and the personal board target to **12 June**. With the fixed policy the two exam targets do not move. A routine change cannot postpone a real exam.

**Explicit day/task start times keep priority** over the default session time. Weekly classes remain tied to their weekday/clock time; real appointments and actual study history are not redated. Existing saved profiles are **not silently reset to the new defaults**: choose the new start in Settings and inspect all target dates before applying it. Invalid legacy profiles remain available for repair rather than being replaced with empty data.

Export a fresh `.ics` after a schedule change. Previously imported calendar events cannot update themselves; a separate calendar that can be replaced is the safest option.

The regenerated default is checked in as **[HSC-27-STUDY-PLAN.md](HSC-27-STUDY-PLAN.md)**. The app exports a customised Markdown copy with progress and scores.

## Study features and limits

- **23 views:** home, calendar, syllabus, video links, study/offline workspace, scanner, PDFs, test prep, flashcards, revision, timer, practice, exam simulator, weakness, heatmap, backlog, audit, exams/GPA, analytics, library, reminders, storage and settings.
- **114 chapters/units, 7 subjects, 13 papers:** Physics, Chemistry, Biology, Higher Math, ICT, Bangla and English. A/B/C and star ratings are editorial study priorities, not board-issued categories or question predictions.
- **Study loop:** task completion, measured sessions, carryover, chapter notes/confidence, spaced recall (1/3/7/14/30 days), MCQ/CQ practice, timed MCQ simulation, retry questions, marks and GPA arithmetic.
- **Timer:** stopwatch, countdown and Pomodoro; restart-safe anchors, subject/chapter logging, Android foreground service and floating-clock integration where supported.
- **Libraries:** personal notes, permitted local videos/PDFs, YouTube links, formulas, flashcards and full media backup/restore. YouTube playback needs internet; an ordinary YouTube URL is not an offline download permission.
- **Content honesty:** the 1,176-item starter MCQ bank is authored practice material, **not 1,176 verified board questions**. Separately there are 10 recovered board questions across 6/114 chapters, 24 source-coverage rows and 3 rejected sources. Coverage rows are not questions; question generation is rule-based, not a server-side AI.
- **Language:** Bengali-first. English mode translates navigation and most controls; chapter names and some long-form study content remain Bengali.
- **Not provided:** cloud sync, login, a final certified syllabus, guaranteed questions, a guaranteed GPA, or automatic verification of new board notices.

Match the syllabus to your own HSC-year textbooks and current official notice. Edition-sensitive content is flagged; the final month's papers are personal mocks, not board examination sessions.

## Run locally

Requires Node.js 22+.

```bash
npm ci
npm run dev          # 0.0.0.0:3000; accepts the Arena preview host
```

Open http://localhost:3000 locally, or the live-preview address provided by the workspace.

```bash
npx tsc --noEmit
npm test                         # full Vitest unit + jsdom UI suite
npm run test:date-guards          # targeted fault injection; do NOT run beside a dev server/test run
npm run build                    # production PWA in dist/
npm run preview                  # serve dist/ on 0.0.0.0:3000
npm run plan                     # regenerate the default Markdown plan
```

Real-browser regressions require an installed Chromium/Chrome (not downloaded by these scripts):

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:responsive
CHROMIUM_PATH=/path/to/chrome npm run test:study-browser
# Against the running production preview:
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:date-browser
```

Responsive checks cover all 23 views at 320/360/390/768px, large text, English/dark mode, selected dialogs and the running timer. Study-browser checks use a real generated WebM and production-PWA offline reload. Date-browser checks exercise actual Settings save/cancel/reload and Markdown/ICS downloads in Dhaka and New York device timezones.

The mutation runner changes one guard at a time, requires an unmodified passing control and assertion failures, then restores source bytes. Logs, backups, screenshots and generated reports stay under ignored `.cache/`. Targeted fault injection is not exhaustive coverage or proof of zero bugs. Native notification tests mock Capacitor; a physical Android device remains a separate verification step.

## Android and public PWA

- **Published APK:** [v2.41.0](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.41.0). Back up before installing or updating.
- **Published PWA:** https://rahatportfolio.github.io/HSC-27-/ — this is not a link to the unreleased working update.
- `.github/workflows/android-apk.yml` builds on `main` and `arena/**` pushes and on `v*` tags. It runs unit/UI and browser checks, builds a debug APK, and attaches tagged builds to Releases. Optional signing secrets also enable signed release APK/AAB output.
- `.github/workflows/static.yml` tests/builds and deploys `dist/` to GitHub Pages from `main` (or workflow dispatch). Pages must use **GitHub Actions** as its build source.
- Working Android metadata: **versionName 2.42.0 / versionCode 22**. This does not mean an APK has been built or installed for this update.

Local Android builds need JDK 21 and Android SDK 36:

```bash
npm run android:apk
# android/app/build/outputs/apk/debug/app-debug.apk
```

An APK signed with the same key/app id normally updates in place. Different signatures can require uninstalling the old app, which loses local data; take a JSON/full-media backup first.

## Reminders, data and privacy

- Native reminders schedule upcoming tasks, recall cards and important dates locally, and cancel stale study alarms after a schedule change. Battery optimisation, permission and exact-alarm policies can delay delivery; verify on your device.
- PWA notifications work only in supported secure contexts while the tab/app can run. There is no push server keeping a closed browser alive.
- The validated snapshot is stored in `localStorage` under `hsc27-prostuti-v1`; Android also mirrors it to SQLite where available. Files use local device/IndexedDB storage. Full backup includes media; JSON backup covers structured data.
- Clearing browser/app storage or uninstalling can delete progress. No account or cloud copy exists. The offline service worker caches public app assets, not a remote copy of personal data.
- Invalid saved data is retained under a recovery key where possible and offered for download in Settings. Keep regular external backups.

## Source map

```text
src/planner.ts          settings, date helpers, deterministic phase/task generation
src/studyPlan.ts        shared ordinary/final projection and adaptive explanation
src/reschedule.ts       atomic date/settings transaction and task-reference migration
src/planHealth.ts       syllabus/practice/revision/mock/deadline/conflict warnings
src/smartSchedule.ts    lecture allocations, completed ranges and deferred workload
src/adaptive.ts         weakness-based, bounded, lossless replacement planning
src/study.ts            completion, split promotion/undo, sessions and carryover
src/storage.ts          validation, migration, backup import and local save
src/revision.ts         actual-completion-based spaced recall
src/native.ts          Android reminders and timer integration
src/exports.ts         ICS, Markdown and CSV
src/views/             study screens
scripts/               plan, mutation and real-browser regression runners
android/               Capacitor Android project
```

[AUDIT.md](AUDIT.md) and [FEATURE-STATUS.md](FEATURE-STATUS.md) include historical verification logs. Their older counts describe earlier versions, not the current release status.
