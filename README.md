# প্রস্তুতি — HSC 27 Study Planner

A Bengali-first, offline study companion for an HSC 2027 science student (Sylhet board), with Higher Mathematics as the fourth subject. Built with React, TypeScript, Vite and Capacitor; no account, backend, cloud database or paid API is required.

**Version 2.0** adds the full study loop: measured study sessions, spaced revision, MCQ/CQ practice, exams, GPA, analytics, and local libraries. The Android APK is built automatically by GitHub Actions.

## What is inside

### Priority 1 — core study system

| Feature | What it does |
|---|---|
| Dashboard | Today’s target, daily/weekly progress, measured study hours, syllabus completion, pending work and carryover |
| Subjects | Physics, Chemistry, Biology, Higher Math (1st/2nd papers), ICT, Bangla, English — 13 papers |
| Chapters | Checklist, A/B/C priority, completion, CQ/MCQ prep status, chapter note, confidence/weak tracking |
| Routine | Deterministic 8-hour daily plan, weekly view, subject-wise allocation, editable start time/target hours, missed-session carryover |
| Timer | Stopwatch, countdown and Pomodoro; subject/chapter tagging; automatic session logging; short/long breaks |
| Revision | 1/3/7/14/30-day spaced cards, due/overdue lists, snooze, completion history |
| Offline data | Autosave, validated JSON backup/import, CSV exports, restart-safe storage, SQLite mirror in the APK |

### Priority 2 — practice and evaluation

- **MCQ practice** — starter question bank plus your own questions, chapter filter, instant checking, right/wrong history, accuracy and a wrong-answer collection.
- **CQ practice** — your own CQ library, marks, notes, history and a mistake notebook.
- **Exams** — chapter/subject/model tests with a timer, marks entry, grade calculation and result history.
- **Analytics** — 7/30/90-day study graphs, subject-wise time, weak chapters, target vs actual hours, accuracy by subject, 8-week streak calendar and badges.
- **Weekly review** — completed chapters, hours studied, weaknesses and a suggested next seven days.
- **GPA** — HSC grading rules, fourth-subject bonus, Golden A+ check and target marks per subject.

### Priority 3 — personal libraries

- YouTube links (subject/chapter, watched, favourite) — playback needs internet.
- Personal notes (chapter-wise, search, bookmark, Markdown export).
- Formula library for Physics, Chemistry, Math, Biology/ICT plus custom formulas.
- Board-question library by year/subject/chapter with important-question bookmarks.
- Mistake management for wrong MCQs, CQ mistakes and difficult topics.

### Priority 4 — comfort features

Study calendar, HSC countdown, day journal, streak calendar, achievement badges, light/dark/system theme, global search (`Ctrl/⌘ + K`), settings, JSON/CSV import-export and app information.

**Not implemented yet:** a complete Bangla/English interface toggle, an arbitrary drag-and-drop timetable editor, and bundled copyrighted board papers. The interface is Bangla-first by design; the other two are honest scope limits, not hidden placeholders.

## Run locally

Requires Node.js 22+.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The dev server binds to `0.0.0.0` and accepts the Arena preview host.

```bash
npm test          # 48 tests: plan, dates, backup v1/v2, timer parsing, revision, GPA, analytics, exports, full UI smoke
npm run typecheck
npm run build     # production PWA build in dist/
npm run preview   # serve the production build on port 3000
npm run plan      # regenerate HSC-27-STUDY-PLAN.md with default settings
npm run icons     # regenerate PNG PWA icons from public/icon.svg
```

The checked-in `package-lock.json` is the source of truth. If an older npm has a peer-resolution problem, use `npm ci --legacy-peer-deps`.

## Android APK

The APK is an installable debug-signed build. It runs the same offline app inside a Capacitor WebView and adds native local notifications plus a SQLite copy of the data.

1. Push to `main` or open **Actions → Android APK → Run workflow**.
2. Wait for the green build.
3. Download **prostuti-hsc27-apk** from the run’s *Artifacts* section.
4. Open the `.apk` on the phone and allow “Install unknown apps” for the browser/file manager you used.

Pushing a tag such as `v2.0.0` also attaches the APK to a GitHub Release.

To build locally you need JDK 21 and Android SDK 36:

```bash
npm ci
npm run android:apk     # generates icons, builds web assets, syncs Capacitor, runs Gradle
```

The generated APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Why a debug APK?

A debug APK is self-signed and installable without Play Store or signing secrets. For a Play Store release, create a signing keystore and add a release build type; the CI workflow deliberately does not require signing secrets so that anyone can build the app.

## Reminders on Android

- **Native local notifications (APK):** Reminders → *ডিভাইস নোটিফিকেশন* → allow permission, then *এখনই সিঙ্ক করো*. The next 14 days of sessions and revision cards are scheduled on the device. The app re-syncs in the background while it is open or after a change. Android may delay exact alarms if battery optimisation is aggressive; disable optimisation for the app if a reminder arrives late. All of this is local — there is no push server.
- **Browser notifications (PWA):** work on HTTPS/localhost only while the app or tab is open. Closing the tab stops them; this is a browser limitation, not a server.
- **Calendar alarms:** export an `.ics` file (today, next 7 days or the whole plan) and import it into Google/Apple/Outlook Calendar. Each event contains a `VALARM`. Re-import after a schedule change; old imported events are not updated automatically.

## Data, backup and privacy

- The browser/PWA stores the validated snapshot in `localStorage` under `hsc27-prostuti-v1`.
- The Android app mirrors the same snapshot into a one-row SQLite table (`app_state`) inside the app sandbox. If SQLite is unavailable, the app keeps working on `localStorage` alone.
- Timer state and notification deduplication use separate local keys.
- **Settings → ব্যাকআপ রাখো** downloads a JSON file. Importing it validates every field before replacing data. CSV exports cover study sessions, tests and MCQ answers.
- Clearing app/browser storage deletes local progress. Reset asks for confirmation, clears the SQLite row and reloads.
- There is no login, analytics, cloud sync or cross-device account. The service worker caches only public app assets, never personal data.

If a saved snapshot fails validation, the raw payload is kept under a recovery key when possible and offered as a **রিকভারি ফাইল** in Settings.

## Study plan

Default start: **14 November 2026**. Change it in Settings without deleting chapter progress.

| Phase | Dates | Days | What happens |
|---|---|---:|---|
| Syllabus | 14 Nov 2026 – 13 Feb 2027 | 92 | Every listed chapter/unit, foundations first; weekly catch-up |
| Revision | 14 Feb – 13 Apr 2027 | 59 | Two revision rounds, language/ICT practice |
| Model tests | 14 Apr – 13 May 2027 | 30 | 13 full-paper personal model tests, correction days, final review |

That is **181 dates**. The daily target is **8 net study hours**; breaks are additional. Start time, target (6/8/10 hours), name, board and personal exam date are editable.

The default plan is also checked in as **[HSC-27-STUDY-PLAN.md](HSC-27-STUDY-PLAN.md)**. The app can export an updated Markdown copy with your progress and scores.

## Syllabus and exam-date caution

This is a **textbook-based planning aid**, not an officially approved syllabus, a prediction of questions, or a guarantee of GPA 5/Golden A+.

- `A` means “study earlier” and `B` means “study next”; neither is an official board category. No listed chapter is dropped.
- Science chapter names follow common NCTB organisation. Bangla and English use skill-based units so a newer Class XI edition is not silently imposed on an HSC 2027 candidate. Match lesson numbers to your own books.
- Biology 2nd Paper chapter 12 is edition-sensitive and flagged in the app.
- Verify the current notice and textbooks at [NCTB](https://nctb.gov.bd/pages/notices/), the [NCTB textbook page](https://nctb.gov.bd/pages/static-pages/6ae03d7be0cf994829342115), and [Sylhet Board](https://sylhetboard.gov.bd/). The chapter list has not been certified against a final board notice.
- The final month’s tests are **personal model tests**, not board exams. Confirm the real board routine separately.
- The starter MCQ/CQ/formula content is hand-written sample material, labelled as such in the app. No copyrighted board question papers are bundled.

## GitHub Pages (PWA)

`.github/workflows/deploy-pages.yml` tests and builds the app on every push and deploys `dist/` when Pages is enabled.

1. Repository **Settings → Pages → Build and deployment → GitHub Actions**.
2. Run **Build and deploy Prostuti** (or push to the configured branch).
3. Open the URL shown by the deploy job.

Vite uses a relative base (`./`), so project pages such as `https://<user>.github.io/<repo>/` work without changing the hash router.

## Source layout

```text
src/data.ts              subjects, chapters, papers, sources
src/types.ts             v2 record types
src/planner.ts           date helpers, settings and deterministic 3-phase plan
src/storage.ts           validation, v1→v2 migration, backup import, local save
src/study.ts             study sessions, carryover and backlog helpers
src/revision.ts          1/3/7/14/30-day revision engine
src/gpa.ts               HSC GPA and Golden A+ rules
src/analytics.ts         streaks, accuracy, weak chapters, weekly review
src/db.ts                native SQLite mirror with graceful fallback
src/native.ts            Android local-notification scheduling
src/hooks.ts             timer, theme, reminders
src/context.ts           shared planner context
src/modals.tsx           chapter, mistake, exam and global-search dialogs
src/exports.ts           ICS, Markdown and CSV exports
src/views/               Today, Calendar, Syllabus, Revision, Timer, Practice,
                         Exams, Analytics, Library, Reminders, Settings
android/                 Capacitor Android project (Gradle)
capacitor.config.ts      app id, name and native plugin options
.github/workflows/       Pages deploy and Android APK build
public/sw.js             offline shell (precache list injected at build)
scripts/export-plan.ts   checked-in Markdown plan generator
scripts/android-assets.mjs launcher icons and splash screens
```
