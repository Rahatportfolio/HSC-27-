# প্রস্তুতি — HSC 27 Study Planner

## S-first smart study routine

**Latest follow-up:** the current branch fixes replaced-source pair timing, missing backup reminders, restricted-storage crashes, Dhaka backup dates, retry/cancellation of YouTube metadata loading, and reference-date provenance. See [the new full-recheck report](FULL-RECHECK-REPORT.md). PR #19 below is the **previously published** APK/PWA checkpoint, not proof that these follow-up changes are already on an installed phone or the public site.

**Availability-first routine, optional local Brain and guarded APK/PWA delivery.** Exact successful checks, immutable development-download links and the main-only Pages deployment are recorded in [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19) and [the A–Z report](A-Z-RECHECK-REPORT.md); an old APK is not evidence of this source. New students are asked when they can study before any routine is generated. The goal is an editable shortlist of important **S chapters selected from A**, not compulsory completion of all 114 units or every app feature. The starting heuristic is the existing **39 five-star A units**, not an official category or question prediction.

- Setup asks for start/end goals, multiple daily windows, weekdays, **daily net study hours** and fixed breaks/obligations; saving opens the dashboard. No tasks leave the resulting available time.
- Keep the same two-book chapter pair for at least two study days: first portions of video/reading/notes on day one, the rest plus practice/revision on day two or later. Insufficient time extends that pair rather than shortening classes or piling on new chapters.
- Unfinished source ranges stay incomplete and **replace future work within real capacity**. Later work moves back; no extra hours are added on top of a full day. Locks, removed work, deadlines and retained appointments are disclosed.
- Eight distinct work stages include lecture, reading, **notes**, MCQ/CQ videos, independent MCQ/CQ practice and **revision**. Volume/count/rate/difficulty and explicit prior revision drive editable independent-work estimates; their defaults stay unknown. Only video time is divided by the chosen playback speed. All sources retain their provenance. A session limit is not a video's full duration; unknown time never becomes a guessed 80 minutes. Four opt-in saved video-duration references and four unsuitable-link warnings come from a bounded eight-page record, **not** a catalogue-wide verification. Its contradictory observation dates are explicitly unverified, never substituted for player readings.
- A chapter is **Fully Completed** only after six required groups: Video, Reading, Notes, MCQ Practice, CQ Practice and Revision. **Syllabus Coverage** and **Exam Readiness** are separate, not score guarantees. S total/completed/remaining/progress stays visible; A/B/C planning is offered only after preceding required work is complete. Undoing S evidence reopens S and retains the later phase.
- Saved legacy profiles convert only after explicit review/confirmation. Notes, original completion timestamps, manual work and media/history remain. Timers do not certify S source completion; retained range evidence survives repartitioning.
- **Follow-up repairs:** weekly Analytics counts first full source-range completion rather than raw/duplicate ticks, uses actual availability/off days for targets, and labels the current phase separately from whole-library totals. Reopened phases retain their confirmed earliest start; unsafe deadline edits are rejected atomically. Automatic work also leaves the selected break on both sides of retained appointments/pins. Shared dialogs and the mobile drawer now isolate background interaction, trap visible-control focus, close only the top sheet and restore focus/scroll; profile, rating and shortcut text semantics/contrast were corrected.
- **Verification:** the [latest full-recheck report](FULL-RECHECK-REPORT.md) records **1,244/1,244 unit/UI tests in 122 files**, **169/169 Node guards**, TypeScript/build, all nine production-browser suites, both zero-known dependency audits, and source/asset fingerprints. The [A–Z report](A-Z-RECHECK-REPORT.md) is the previous PR #19 checkpoint. Lazy-route-aware tests await the actual view rather than a loading heading; discovery is restricted to `src/` so ignored reproducibility copies cannot inflate counts.
- **Performance, offline and accessibility hardening:** Home is eager and 23 optional routes are lazy; question generation/question text and PDF rendering are not startup imports. At the PR #19 checkpoint, entry JavaScript was **489,005 B** (previously about 2.15 MB); the complete unique eager JavaScript closure was **1,049,797 B**, not just the entry. Mandatory postbuild budgets and precache checks passed. **29** built-browser checks verify first-install offline navigation across 24 routes, data retention, missing-chunk recovery and a non-destructive JSON backup. The expanded accessibility matrix retains every raw incomplete result and fails on unsupported, clipped or covered text. **20 positive/negative reviewer controls** prevent vacuous approval; a deterministic long-chapter result/hover journey catches the narrow-screen Bengali-label regression that random papers missed. Exact matrix/review counts belong to each run, not a universal WCAG or physical screen-reader certificate. **166 Node safety/budget/deployment/diagnostic guards** passed; both dependency audits reported 0 known entries.

**[Previous published A–Z checkpoint](A-Z-RECHECK-REPORT.md) · [Latest follow-up results](FULL-RECHECK-REPORT.md).** The eight saved video-reference records contain conflicting dates: original `2026-11-18`, claimed recheck `2026-11-16`, and retained fetch trace `2026-11-19`. Their actual observation date is **not established**. All three raw labels remain in `CLASS_REFERENCE_PROVENANCE`; `metadataRecheckedOn` and each `checkedOn` are now `null`, with explicit unverified status. New opt-ins save a separate student `acceptedAt`, not a fabricated observation. Old stored references/completion timestamps are retained unchanged. No fresh YouTube fetch or player/full-content certification is claimed for this follow-up.

### Small on-device Study Brain

Home and the new **Study Brain** page offer an opt-in, rule-based helper—**not a general AI chatbot**. It drafts simple Bengali/Banglish/English check-ins, remembers only confirmed energy/time/difficulty choices, and explains a manageable next segment from the same selected pair in the S-first current phase. Recent saved study logs can inform smaller focus lengths only when there is enough evidence. No API key/server, private-note scanning, silent rescheduling, fabricated video duration or timer-certified completion. Pause or forget just the brain memory without clearing study data. See [usage, privacy, memory limits and validation](STUDY-BRAIN.md); `npm run test:brain-browser` checks a built preview.

See [personal routine rules, audited source links and limits](PERSONAL-ROUTINE.md). Run `npm run test:personal-browser` with `CHROMIUM_PATH` and a built preview. Package/version/signing identity is unchanged; keep the original app/data, and do not uninstall/Clear data.

The delivery and verification notes below describe **earlier snapshots**. In particular, their legacy 8/16-hour default generator and static plan are **not the new student's availability-based S routine**.

> **Historical PR/build delivery checkpoint:** [PR #18](https://github.com/Rahatportfolio/HSC-27-/pull/18) was merged into `14e6640e9ae4046372fb0f97ebe89b489de93934`; its [Android build/API 34/API 35 workflow](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44377968065) and [Pages workflow](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44377968044) succeeded at that earlier checkpoint. They **do not contain the current S/Brain/rework** and were not reinspected remotely in this follow-up. The older A–Z counts and “local/unpublished” statements below describe their own pre-delivery snapshots, not the current correction's publication status. A development/debug artifact is **not an approved compatible production update**. Current delivery uses its own exact-source non-Latest development prerelease, never this historical run or a replacement of its assets. No signing-key recovery or alternate app identity is claimed. Keep the original app/data; do not uninstall/Clear data.

A Bengali-first, offline study companion for HSC 2027 science preparation (Sylhet board), with Higher Mathematics as the fourth subject. React, TypeScript, Vite and Capacitor; no account, backend, cloud database or paid API.

**Historical A–Z/native-field checkpoint — before PR #18 delivery.** Those reproduced repairs fixed faint day-note hints, invisible/weak native-search-date-button keyboard focus, placeholder-only flashcard names, an invisible JSON-file Tab stop, squeezed mobile backup actions and app/OS native-picker theme mismatches. The prior exam/history/date/restore/MCQ/GPA repairs remain. Result at that checkpoint: TypeScript, **910/910 tests / 97 files**, production build, **224 native-field probes / 688 repeated field states** across 23 initial routes and 8 scenarios; **410 expanded accessibility/state scans**, **56 follow-up** and **46 mobile probes**. **9/9 new source faults** (30 controls before/after) and **15/15 browser pairs**, plus rerun **43/43 source faults** (117 controls before/after) and **16/16 browser pairs**, reached intended assertions with restored originals. Date, image/PDF/backup/quota/undo/media/offline and responsive gates passed; **287 non-document hashes** and exact served assets verified. These overlapping controls are **not** exhaustive accessibility/content/zero-bug certification: **26,913 repeated incomplete axe checks** still need manual review. At that checkpoint the repairs were only in Live Preview; see the PR #18 note above for the later build/deployment boundary. [Historical measured scope and limits](AUDIT.md#latest-a-z-recheck).

**Pre-PR #18 publication baseline — 2.44.0 / Android code 24.** The verified public PWA snapshot before that delivery was **`a2076d3`** ([Pages 44277894932](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44277894932), following [PR #17](https://github.com/Rahatportfolio/HSC-27-/pull/17)); this historical baseline is not a current remote inspection or publication of the S/Brain correction. The v2.44.0 APK remains **draft** at source/tag `98b949f1936c2ab754ddf4123949156640dbb058`: its measured wrong signing certificate and debuggable flag block a compatible production update. The user has no confirmed original key. Keep the original app/device; **do not uninstall/Clear data** to bypass the conflict. PWA/APK private storage is separate; JSON/legacy full backups omit scan bytes. Historical v2.43.0/v2.42.0 assets were not replaced. [Release boundaries](RELEASE-NOTES-v2.44.0.md).

**Dependency-check limit:** fresh production-only and full npm audits now return **0 known entries**. The previous development advisory is marked withdrawn by the upstream feed; no dependency patch, suppression or forced downgrade was applied. The API’s future-dated withdrawal metadata and unchanged lockfile are disclosed in the audit, not treated as a security certification. Physical-device/background alarms, manual screen-reader review, complete board-policy/content verification and official 2027 examination dates remain unverified.

## v2.44.0 Android mobile UI repair — PR #16

The source fixes the supplied Android screenshots and preserves **20 November 2026** as the default start, with a safe Settings shortcut for an existing profile. The historical v2.43.0 APK does not contain the repair. [PR #16](https://github.com/Rahatportfolio/HSC-27-/pull/16) and the release/deployment checks record the exact source tested and published; no existing phone's private saved date can be changed remotely by editing this repository.

- Install the Android splash/post-launch theme before edge-to-edge inflates window decor; remove the persistent framework ActionBar and stretched splash background covering the timer.
- Give home progress/test-prep cards real padding and separation; allow labels/counts to fit without touching rounded borders.
- Show larger, unbroken elapsed/remaining digits with one owner of status-bar insets, preserved gesture-bar padding, and actual measured scroll/focus clearance.
- Scale the decorative timer SVG with its resized mobile container so it cannot block Start/Pause taps. The active banner is a named status region with a proper Open timer button; idle sessions do not reserve it.
- No schedule defaults, completion/history, notes, scanned files or stored profile migrations change. Existing profiles must not be reset to install a UI repair.

Measured checks and native-device results are recorded in the new top section of [AUDIT.md](AUDIT.md). Browser checks use touch/coarse-pointer contexts and inspect text ranges, clipping ancestors and hit testing, not only `.isVisible()`.

## v2.43.0 changes and release gates

These fixes follow the v2.42.0 base. **v2.43.0 / versionCode 23 is published**, with APK/API 35 and Pages success for source `64ac7c99fcf635a7703bf6fb23fbc6020be318e5`. [Release notes and exact evidence](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.43.0). Tagged uploads stay **draft** until checks are explicitly verified; asset appearance alone is not publication. The uploaded APK's size/hash, embedded version and signature were inspected on an Android CI runner before promotion. That historical evidence applies only to its published bundle. That section's PWA baseline was `a2076d3`, before the separate PR #18 delivery noted above. Neither historical workflow publishes the current S/Brain correction. The signing-incompatible APK remains held.

- Restore must save durably before replacing a profile or clearing clocks; dirty Settings and concurrent progress are protected.
- Scanned-note persistence, image edits, per-page navigation, limits and complete PDF export are corrected. New scan-bearing full backups include checksummed image bytes and restore them under fresh keys.
- An early timer finish records actual time without marking unfinished planned work complete. Subject/chapter/duration changes detach the old task.
- Local release verification: **763 tests / 86 files**, typecheck/build, **76 application + 55 date/history + 6 release-policy fault injections**, and actual production image/PDF/restore/date/undo browser flows. Release-policy checks cover aligned versions, an incremented Android code and draft-only upload. Details and measured limits: [AUDIT.md](AUDIT.md).

**Important:** JSON and released legacy full backups contain scan metadata, **not handwritten image bytes**. They cannot recover missing images from an erased device. Keep the original device and/or separately exported scanned PDFs. The new scan-bearing format is supported from v2.43.0; verify the installed version and test a backup before relying on it. It cannot recover bytes absent from an older archive.

## Published v2.42.0 date changes

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

**Legacy generator defaults** (saved legacy profiles and the static reference export only). New profiles instead complete availability/S setup; no first-session time, daily 8/16-hour target or compulsory three-phase plan is imposed:

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

If an existing profile still has a different start, Settings now offers **“Use 20 November 2026”** (বাংলা: **“২০ নভেম্বর, ২০২৬ থেকে শুরু”**). This is a draft-only shortcut through the same date-cascade transaction, not a profile reset. Review the resulting linked/fixed target dates, then Save and confirm; cancelling leaves the saved date unchanged. It does not remotely change an already installed app's local data.

For example, **20 → 26 November** moves the boost to **13 December**, the personal test target to **7 February**, and the personal board target to **12 June**. With the fixed policy the two exam targets do not move. A routine change cannot postpone a real exam.

**Explicit day/task start times keep priority** over the default session time. Weekly classes remain tied to their weekday/clock time; real appointments and actual study history are not redated. Existing saved profiles are **not silently reset to the new defaults**: choose the new start in Settings and inspect all target dates before applying it. Invalid legacy profiles remain available for repair rather than being replaced with empty data.

Export a fresh `.ics` after a schedule change. Previously imported calendar events cannot update themselves; a separate calendar that can be replaced is the safest option.

The **legacy static reference**, not a new student's S routine, is checked in as **[HSC-27-STUDY-PLAN.md](HSC-27-STUDY-PLAN.md)**. The app exports a scope-aware personalised Markdown copy; S exports distinguish actual source duration, allocation and completion.

## Study features and limits

- **24 views:** home, Study Brain, calendar, syllabus, video links, study/offline workspace, scanner, PDFs, test prep, flashcards, revision, timer, practice, exam simulator, weakness, heatmap, backlog, audit, exams/GPA, analytics, library, reminders, storage and settings.
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
npm run test:post-release-guards  # backup/scanner/timer fault injection; same isolation requirement
npm run test:az-guards            # integrity/accessibility/exam fault injection; run serially
npm run test:followup-guards      # follow-up source faults; same isolation requirement
npm run test:input-guards         # native-field source faults; same isolation requirement
npm run build                    # production PWA in dist/
npm run preview                  # serve dist/ on 0.0.0.0:3000
npm run plan                     # regenerate the LEGACY default reference, not a saved S profile
```

Real-browser regressions require an installed Chromium/Chrome (not downloaded by these scripts):

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:responsive
CHROMIUM_PATH=/path/to/chrome npm run test:mobile-shell
CHROMIUM_PATH=/path/to/chrome npm run test:study-browser
# Targeted UI fault proof (not alongside HMR or other source tests):
CHROMIUM_PATH=/path/to/chrome node scripts/check-mobile-shell-guards.mjs
# Against the running production preview:
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:date-browser
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:post-release-browser
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:input-accessibility
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:accessibility
# Retains raw incompletes and adds targeted element-level evidence:
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 REVIEW_INCOMPLETE=1 npm run test:personal-browser
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 REVIEW_INCOMPLETE=1 npm run test:brain-browser
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:dialog-offline-browser
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:accessibility-guards
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:followup-browser
# Serial source + paired browser fault proof, with the built preview still running:
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:followup-guards
```

The production accessibility runner validates all 23 actual route titles, **eight declared** viewport/theme/language/profile scenarios, 17 dialog types where applicable and populated quiz/exam/result/history states. It uses axe WCAG 2.1 A/AA rules without excluding failing elements, plus real dialog keyboard/focus events. Reported incomplete checks require manual review; this is not screen-reader/WCAG certification. Its paired fault runner includes a deterministic wrong-answer row. The separate follow-up runner exercises eight large-text scenarios spanning 320/393/797/1280px, both themes/languages, names/short-text contrast, dialog loops/focus return, missing-history retry consent, touch and keyboard form submission. MCQ contrast uses actual composited transparent-input/row colours in empty, typed and reselected states, including hints and short letters. Reduced viewport height simulates keyboard space, **not a physical/OEM keyboard**. Follow-up browser faults require passing per-fault controls and intended assertions; source mutations restore original bytes. Optional scenario/review-only filters are recorded in reports and do not count as complete matrices.

Responsive checks now cover **all 24 routes**, including Brain, using isolated saved onboarding/legacy/S profiles at 320/360/390/768px, actual saved large text, Bengali/English and light/dark scenarios. `BASE_URL` targets a production preview; otherwise a temporary Vite server is used. The full matrix has **383 checks**, retaining sibling-collision assertions and adding route identity, a single page-level heading, retained history, selected dialogs/task expansions and running timers. Optional `RESPONSIVE_PROFILES`, `RESPONSIVE_SCENARIOS` and `RESPONSIVE_ROUTES` filters are explicit in `.cache/responsive/report.json`; filtered runs are not full coverage. The separate mobile-shell runner covers 320/360/393/412px phones plus 797×393 landscape with real touch, large saved text, simulated 36px status/24px gesture insets, long hour-bearing clocks, scrolling/navigation, paused stopwatch and retained data. Separate first-study-day probes include the daily progress pill and PWA install control at 320px in both saved legacy and saved S profiles, so before-start/onboarding fixtures cannot hide toolbar collisions. Android instrumentation separately detects framework/native toolbars, recreates the Activity, waits for compositor readiness, measures visible clock glyphs at 100%/130% WebView text zoom and sends real screen-coordinate taps. Study-browser checks use a real generated WebM and production-PWA offline reload. Date-browser checks exercise actual production Settings save/cancel/reload and Markdown/ICS downloads in Dhaka and New York device timezones. Post-release browser checks use real synthetic image pages, per-page edits, two-page PDFs, exact scan-byte restoration into a fresh isolated profile, complete/undo/reload, early measured timer finish, dirty Settings and a simulated JSON quota failure/retry. They never modify an existing student's profile.

The mutation runner changes one guard at a time, requires an unmodified passing control and assertion failures, then restores source bytes. Logs, backups, screenshots and generated reports stay under ignored `.cache/`. Targeted fault injection is not exhaustive coverage or proof of zero bugs. Native notification tests mock Capacitor; a physical Android device remains a separate verification step.

## Android and public PWA

- **APK status:** the production v2.44.0 remains held as draft. Current S/Brain downloads are separately labelled **development-only**, not production updates; see [the immutable-download rules and evidence](DIRECT-APK.md) and [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19). The [historical v2.43.0 release](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.43.0) has separate signing/backup limits. Keep the original app/device; never uninstall/Clear data to install a conflicting build.
- **Public PWA:** https://rahatportfolio.github.io/HSC-27-/ — deployment status is tracked by the [Pages workflow](https://github.com/Rahatportfolio/HSC-27-/actions/workflows/static.yml). An APK release and a Pages deployment are separate operations.
- `.github/workflows/android-apk.yml` builds on `main`, `arena/**` and `v*` tags. Contributor builds may be explicitly labelled debug artifacts. Tags require all signing inputs, select release output without a debug fallback, stay **draft**, and require pinned-certificate/non-debuggable exact-asset checks after both API 34/35 native jobs. The historical v2.44.0 tag is not retroactively hardened. Never retag or bypass signer continuity to publish a repair.
- `.github/workflows/static.yml` tests/builds and deploys `dist/` to GitHub Pages from `main` (or workflow dispatch). Pages must use **GitHub Actions** as its build source.
- Current Android source metadata: **versionName 2.44.0 / versionCode 24**. The working Android workflow now contains API 34/35 WebView shell/touch/text-zoom and storage/playback/restart/reset gates (the published v2.43.0 gate was API 35). Exact run results belong to the current release page, not to an earlier version's CI run. Emulator success is not physical-phone alarm certification.

Local Android builds need JDK 21 and Android SDK 36:

```bash
npm run android:apk
# android/app/build/outputs/apk/debug/app-debug.apk
```

**Known signing incompatibility:** the published v2.42.0 and v2.43.0 debug APKs have **different verified certificates**, so normal Android in-place update is not supported. **Do not uninstall/clear the old app to resolve the conflict** until progress exports and every scanned PDF/image are independently opened and verified elsewhere. JSON and legacy full backups omitted scan bytes; they alone do not make uninstall safe. Keep the original app/device. PWA data is separate and does not automatically sync with the APK.

The existing Android workflow also supports **GET-only uploaded-APK inspection** without rebuilding or publishing: set dispatch inputs `audit_release` (tag), `audit_sha` (exact source SHA), and optionally `audit_previous` (previous published tag). The inspected source/asset stays unchanged; package/version, ZIP/signature, size/hash and signing compatibility are checked on the runner. Inspect mode skips build/device jobs. GitHub hides drafts from read-only tokens, so that isolated job needs content-write permission for visibility, not for a write operation. Run `node --test scripts/check-android-release.node-test.mjs scripts/verify-release-asset.node-test.mjs` for the separate signing/artifact Node controls. [Measured inspection and signing evidence](AUDIT.md#publication-completed--v2430).

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
