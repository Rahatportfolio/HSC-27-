# HSC 2027 audit and verification

## Scope and limits

This is an incremental audit of the existing local-first project, not a rewrite or a claim that every possible defect has been found. The review covered the project layout and scripts, planner and analytics, revision and exam records, reminders, validated local storage and the SQLite mirror, backup and media storage, scanner history, Capacitor/Android configuration, and existing test coverage. Regression cases below were run against the pre-fix behavior and failed before the fixes. Existing tests cover additional navigation, responsive layout, accessibility, offline, persistence, backup, routine and HSC workflows; their presence is not a substitute for manual testing every screen or a physical-device certification.

No user data, existing features, technology stack, paid service, mandatory backend or dependency were removed or introduced. The editable science-chapter default remains 1,200 minutes (20 hours).

## Confirmed issues and fixes

### 1. P1 — history compaction conflated unrelated revision sources
- **Location:** `src/revision.ts`, `compactRevisionHistory`; cleanup confirmation in `src/views/Revision.tsx`.
- **Reproduce:** Finish a chapter milestone and later complete a mistake-triggered or personal-routine revision for the same chapter and interval; compact older history at the revision limit.
- **Root cause:** Compaction keyed completed records only by chapter and interval, treating different sources as duplicates. It could discard the chapter milestone, and an automatic mistake record is not a replacement for that milestone in the scheduler.
- **Fix:** Retain the latest completed record per chapter, interval and source; leave pending cards untouched. Clarify the confirmation message. Compare completion instants rather than ISO text when choosing the latest.
- **Regression:** `src/revision.test.ts`, `keeps completed chapter milestones distinct from mistake and personal history during compaction`.

### 2. P1 — concurrent Android reminder sync could restore disabled reminders
- **Location:** `src/native.ts`, `syncNativeReminders`; called both by `src/App.tsx` and `src/views/Reminders.tsx`.
- **Reproduce:** Start a reminder sync with a delayed native pending-notifications read, then turn reminders off and run another sync before the first finishes. Previously the off sync could finish first and the older sync could schedule reminders afterward.
- **Root cause:** The app effect queued its own calls, but other callers bypassed that queue; native cancellation and scheduling could interleave.
- **Fix:** Serialize all native reminder sync calls at the shared entry point, and let subsequent calls proceed even if one rejects. The separately controlled timer alarm remains excluded from reminder cancellation.
- **Regression:** `src/reminders.native.test.ts`, delayed-sync and failure-recovery tests.

### 3. P2 — repeated bulk completion could overwrite revision history
- **Location:** `src/revision.ts`, `completeRevision`.
- **Reproduce:** Complete/rate a card after a bulk confirmation has captured it, then execute the stale bulk action.
- **Root cause:** Bulk completion rewrote `completedAt` even for an already completed card.
- **Fix:** Only complete pending cards; preserve the original completion timestamp and rating.
- **Regression:** `src/revision.test.ts`, `does not rewrite the original completion date when a stale bulk confirmation runs`.

### 4. P2 — weekly report used UTC calendar days for completion instants
- **Location:** `src/backup.ts`, `weekReport`.
- **Reproduce:** Complete a task or revision at 20:00 UTC the day before the report starts (02:00 Bangladesh time on its first day), or late UTC on the report's final day (already tomorrow in Bangladesh).
- **Root cause:** Truncating ISO timestamps to their first ten characters treated UTC dates as Bangladesh dates.
- **Fix:** Convert valid instants to the app's Dhaka calendar date before including task, chapter-progress and revision activity in the report.
- **Regression:** `src/backup.test.ts`, `uses Dhaka dates for task and revision completions in the weekly report`.

### 5. P2 — recall summary included wrong days and future ratings
- **Location:** `src/revision.ts`, `recallSummary`.
- **Reproduce:** View the 45-day summary with ratings near Bangladesh midnight or with a future completion timestamp, e.g. from a restored profile or clock change.
- **Root cause:** It compared the UTC date substring against an unbounded lower limit, included a 46th calendar day and never checked the upper limit.
- **Fix:** Use the current Dhaka day and preceding 44 calendar days, exclude future and invalid timestamps.
- **Regression:** `src/revision.test.ts`, `counts the last 45 Dhaka calendar days and excludes future ratings`.

### 6. P2 — this-week figures included future records
- **Location:** `src/analytics.ts`, `weeklyReview`; `src/views/Analytics.tsx`, `src/views/Today.tsx`, `src/views/Timer.tsx`.
- **Reproduce:** Restore records dated later in the current week, or record a test with a future date, then view the current weekly review.
- **Root cause:** The review labeled “so far” counted through Sunday instead of today; the measured-time cards used the same future-inclusive range.
- **Fix:** Bound actual activity to today; continue to show the full week's planned-task denominator.
- **Regression:** `src/analytics.test.ts`, `excludes future records from the current weekly review so far`.

### 7. P3 — revision history displayed the wrong calendar date around midnight
- **Location:** `src/views/Revision.tsx`.
- **Reproduce:** Complete a revision at 20:00 UTC (02:00 the next day in Bangladesh), then view its history.
- **Root cause:** The display truncated the UTC timestamp instead of converting it to Dhaka time.
- **Fix:** Format the Bangladesh calendar date of the completion instant.
- **Regression:** `src/revision.date.ui.test.tsx`.

### 8. P2 — empty reminder sync falsely claimed sessions were already scheduled
- **Location:** `src/views/Reminders.tsx`, `NativeReminderCard`.
- **Reproduce:** On Android, sync with notification permission granted but no eligible upcoming reminders.
- **Root cause:** The zero-result success message asserted all sessions were already set even though the sync reported zero and cancels old reminders before scheduling.
- **Fix:** Report that no reminders are scheduled for the next 14 days, with an informational notification; localize the result.
- **Regression:** `src/reminders.empty.ui.test.tsx`.

## Data integrity and remaining risks

- These fixes preserve existing data and do not automatically compact, reset or restore anything. History deleted before this fix cannot be reconstructed by it. Keep a verified backup before any user-initiated cleanup or restore.
- The architecture continues to use validated local data with an Android SQLite mirror and local media stores. Tests simulate failure and recovery; they do not guarantee hardware or OS behavior on every device or every update path.
- `npm audit` reports two high-severity development dependency advisories through `@huggingface/transformers` and its nested `sharp`. The suggested fix is a major Transformers upgrade; no untested AI runtime upgrade was made. The production-only dependency audit is reported separately below. This is an unresolved dependency risk, not a verified exploit in the shipped app.
- AI model caching/offline behavior depends on the downloaded model remaining on device. Bengali model quality and physical-device operation are not certified by this audit.
- The project has no `lint` script or configured linter command; `npm run lint` reports a missing script. Do not interpret that as a passing lint check.

## Verification

- Focused revision, report, analytics and history UI regression tests: 33 passed.
- Focused native reminders, notification/date-cascade and native adapter tests: 19 passed.
- Full suite, production build, Node guard tests, production dependency audit and Android/browser CI: see final run results in the pull request and response; no result is implied while a job is pending.
- The local environment has no Java/Android SDK configured; the Android APK and emulator checks require the existing GitHub Actions workflows. Browser/device CI does not certify a physical phone.
