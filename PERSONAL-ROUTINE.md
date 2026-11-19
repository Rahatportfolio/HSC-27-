# Availability-first, S-first smart study routine

## Scope and consent

- New profiles ask for start/end goals, study weekdays, multiple daily time windows, **total daily net hours**, and an explicit fixed-break/coaching/obligation choice **before** generating study tasks. There is no imposed 8/16-hour day. Overnight windows split across adjacent weekdays; 24:00 is supported explicitly.
- S is an **editable personal shortlist within the existing A category**, not a board category, verified syllabus, examination prediction, or requirement to finish every chapter/feature.
- The starting heuristic is the existing five-star A chapters: currently **39 of 114 library units**. `RECOMMENDED_S_IDS` is the source of truth. Other A/B/C units remain available in the library.
- A saved legacy profile retains its old routine until the student opens Home/Settings, reviews availability/S/workload, previews and explicitly confirms conversion. No actual student's profile was created as part of development.
- The requested default start remains **20 November 2026**. Test/HSC dates are personal targets, not verified notices. Date edits retain the preview → Save → confirmation flow and linked/fixed-date policy. Personal planning does not impose legacy boost hours or all-chapter revision/mock phases. The chapter’s own revision remains required. Finishing setup saves atomically and opens the dashboard.

## Same two books, two study days

Each pair contains chapters from different books where possible, preferring different subjects. The first parts of **both chapters’ teaching, textbook reading and notes** are targeted on the first study day. The remaining parts plus separate practice and revision follow on the next study day or later. Minute-rounded odd budgets may differ by one minute. The pair does not change merely because there is spare time that day, and ticking day one cannot pull day two into that spare time.

If the configured work does not fit, the **same pair continues on extra study days**, with an explicit overrun warning. Unknown duration, zero total work, missing/removed ranges and deadline shortfalls cannot create a fictional whole-syllabus finish date. A study day is a weekday with actual usable availability, not an unavailable day in between.

Eight scheduling stages are separate:

1. Chapter lecture
2. Independent textbook reading
3. Independent note making
4. MCQ-solving video (explicitly optional)
5. Independent MCQ practice
6. CQ-solving video (explicitly optional)
7. Independent CQ practice
8. Chapter revision

Video study time is **actual source duration ÷ chosen playback speed**, rounded up to a minute, never a uniform 80-minute session or a difficulty adjustment. Reading, notes, MCQ, CQ and revision initially stay **unknown** rather than receiving fixed 30/45/60-minute defaults. Their explicit calculator uses volume/question count × minutes per unit × an explained easy/normal/hard factor (0.8/1/1.4). Revision’s explicitly entered prior-review percentage can reduce the estimate by at most 50%. Calculator inputs and the resulting minutes are preserved/validated together; equal minutes from a different workload do not inherit unrelated completion evidence. Direct minute entry remains available as a labelled student planning estimate.

Only extra MCQ/CQ **videos** can be explicitly omitted with zero minutes. The main video, reading, notes, MCQ practice, CQ practice and revision need positive budgets. Unknown/zero mandatory work cannot be silently skipped or certified as complete. Skipping an extra video is not skipping independent practice.

The scheduler takes the lower of daily net cap and actual usable windows, subtracting fixed obligations. Session breaks also fit inside windows, including across adjacent windows. A short net budget is shared between both books where possible instead of spending it all on the first book.

## Actual duration and provenance

Media durations initially remain **unknown** until the student reads the exact single video's IFrame metadata, explicitly accepts an available dated page reference, or enters the actual shown duration. These sources are labelled separately. Selecting/editing a source clears stale duration provenance. Failed/offline/blocked/live/mismatched metadata never becomes an assumed 80-minute class.

A session opens the selected single video at the relevant source offset. Playlist totals are not chapter durations, and an aggregate playlist offset cannot select the appropriate constituent lesson; the UI discloses this limitation. Students must choose relevant lessons or enter their actual relevant total explicitly.

### Bounded public-page metadata recheck — 16 November 2026

All eight exact public pages below were fetched again. Their shown lengths agree with the retained values. The old record’s inconsistent `2026-11-18` date is preserved separately as `CLASS_REFERENCE_PROVENANCE.previousSnapshotRecordedOn`, with `previousSnapshotDateVerified: false`; it is not represented as verified history. The fresh `checkedOn: 2026-11-16` belongs to this separate metadata check, not a rewrite of student completion/history dates. [Current report and limits](A-Z-RECHECK-REPORT.md).

These are **eight exact public pages**, not a catalogue-wide verification or a claim that the browser player was exercised against live YouTube here. Titles/descriptions establish only the limited suitability noted below; no publisher's “100% complete/common” marketing is adopted as a guarantee. Data lives in `src/classDurationReferences.ts`.

| Page | Shown length | Use in the new S editor |
|---|---:|---|
| [Dynamics One Shot · Mashrur Bhai](https://www.youtube.com/watch?v=9oxhLHSATYM) | 7:25:34 | Opt-in full-video duration reference for physics 1st, chapter 3 lecture |
| [গতিবিদ্যা MCQ · Udvash-Unmesh](https://www.youtube.com/watch?v=wtrodXS2cwU) | 3:38:53 | Opt-in full-video duration reference for that chapter's MCQ class |
| [গতিবিদ্যা CQ · Udvash-Unmesh](https://www.youtube.com/watch?v=fV8WGJJwbNk) | 4:02:06 | Opt-in full-video duration reference for that chapter's CQ class |
| [রাসায়নিক বন্ধন · AloronXYZ](https://www.youtube.com/watch?v=YlIJOJCB0-E) | 8:01:55 | Opt-in full-video duration reference for chemistry 1st, chapter 3 lecture |
| [Udvash chemistry MCQ question bank](https://www.youtube.com/watch?v=8_o3fuF_UFI) | 08:39 | Promotion/sample, **not a full chapter MCQ class**; excluded from new S defaults and warned when explicitly selected |
| [Udvash chemistry free class](https://www.youtube.com/watch?v=uBprd6BVHLs) | 2:24:16 | Discusses pH/buffers; not verified as chemical-bonding MCQ. Excluded from that new default |
| [Chemistry 1st CQ · Likhon Vaiya](https://www.youtube.com/watch?v=ALtCbY2H5ds) | 1:55:02 | Description/introduction identifies chapters 1/4/5 in this part, bonding in another part. Excluded from that new default |
| [রাসায়নিক বন্ধন · MH Care · part 2](https://www.youtube.com/watch?v=FWFFNj8N0_Y) | 58:31 | Partial lesson, not verified as a complete CQ-solving class. Excluded from that new default |

The other suggested videos/playlists have **not** had their full durations/content audited here. The chemistry pair's MCQ/CQ inputs are deliberately left unknown rather than silently substituting these misleading links, reusing a combined lecture as a second class, or claiming full coverage. Original library links/history are retained; the known issues are disclosed in the S editor.

## Truthful completion and later phases

- The six required completion groups are **Video Classes, Textbook Reading, Notes, MCQ Practice, CQ Practice and Revision**. Video Classes includes every configured non-omitted lecture/MCQ/CQ source. All six groups are needed for **Fully Completed**.
- **Syllabus Coverage** measures video + reading + notes; **Exam Readiness** measures progress across all six groups. Neither is a score/mastery guarantee. Home shows S total/completed/remaining/progress explicitly, with current-phase coverage/readiness separately.
- Timers log measured effort only, never proof that a personal video/practice segment was actually finished. That includes an old timer whose task is no longer visible.
- Source-range confirmations survive date/window/session repartitioning. Whole-stage confirmations are individual and explicit; there is no personal chapter-status/bulk-complete override. Legacy chapter statuses/checklists/watched flags are preserved as past self-assessments, **not** proof of the new six groups.
- Only after every selected S chapter’s required groups are actually confirmed does Home offer the next phase. A uses remaining A chapters excluding S; B/C follow after preceding selected phases. A new phase begins no earlier than the confirmed transition date and retains earlier phase selections/workloads/history. Reopening/re-completing a prerequisite cannot backdate a retained later phase or skip it for B/C. Its confirmed earliest start is not redated by a planning-start cascade; the later of that start, the new planning start and the explicit transition date applies. Settings rejects an end target at/before the active phase start without changing saved data. No next phase is offered beyond the end target. The library remains available throughout; later phases are not silently added.
- Undoing a prerequisite’s evidence reopens that earlier phase instead of prioritising later A/B/C work. Backup restore applies the same rule and rejects a later active phase that has discarded its S prerequisite.

## Bounded carry-forward, history and safe edits

- Unfinished source ranges stay unfinished and occupy the next **real available capacity**, displacing/reflowing later work. No legacy +45-minute bonus, stacking on a full day, duplicate carryover or auto-completion is used. The same pure effective projection powers the app, setup preview, exports and reminders; it does not fabricate study-session records or rewrite completion timestamps.
- Completion slots are retained as **prior allocation history**, not falsely described as actual study-session times. If changed availability cannot contain an old completed allocation, it is shown separately from current scheduled work; it cannot put new study outside availability. Chapter history displays only that chapter’s allocations and actual confirmation timestamps. Real measured study sessions remain separate records.
- Locked past unpaid ranges remain in place and block progression beyond that pair until completed/unlocked. A partially completed locked slot does not double-count its covered part. Current availability/deadline shortfalls remain warnings; incomplete allocation never creates a fictional syllabus finish date.
- Custom appointments and manual records are retained. Outside-window, clashing or over-capacity fixed appointments are **unallocated**, not scheduled outside the user’s windows. Calendar discloses these records with editable/actionable TaskCards and completion controls. They are included in readable exports as unallocated records, not study appointments. Completed old records are not pending-conflict warnings. Valid fixed appointments/source pins keep their explicit clock positions; both the baseline and rolling scheduler reserve the selected session break on either side before adding automatic work. Breaks consume wall-clock space, never bonus net hours.
- Explicit undo subtracts only its source range; unrelated evidence and original timestamps survive. Different URLs, source durations, playback settings or workload calculations retain old records but do not falsely inherit evidence for differently configured work.
- Legacy adaptive swaps, automatic carryover and backlog merging are bypassed for personal routines. Backlog explains earlier owed ranges and their new placements/deferred work. Separate Study/Offline, weakness, tests and GPA tools are optional and cannot complete the six required groups.
- Old notes, timestamps, URLs, scans/media references and local data remain. Old six-stage personal profiles keep their six budgets and acquire Notes/Revision as **unknown**, not guessed/completed. AppData’s validated JSON snapshot continues through localStorage/SQLite/full backup; no cloud/backend is added. Legacy recall cards are not withdrawn or re-anchored merely by selecting S.
- JSON/Full backup is the complete backup path; Markdown is only a scoped readable routine, not a replacement for media bytes/full history. PWA and APK storage remain separate.
- Native restoration must settle before new setup or a Settings routine editor is offered. Storage failures cannot partially apply a draft. Cancel/confirmation/concurrent routine/date checks prevent overwriting newer saved changes. Changing planning dates cascades linked targets, not actual completion times/dated notes. Global regeneration requires locked dates to be explicitly unlocked.

## Progress-rate integrity

The recent pace, Analytics and weekly report use full **source-range coverage** of the effective tasks, not only raw visible task ids. Stage confirmations and earlier smaller/larger partitions are recognised without writing duplicate ticks. Partial work is not a finished task; newer redundant evidence does not re-count a task already finished before the look-back window. Weekly chapter completion requires all six groups, including retained prerequisite phases. Headline/subject denominators are the current selected phase; A/B/C library totals are labelled separately. Weekly/today targets use actual windows, exclusions, off days and net caps only within the current phase’s planning horizon, not legacy 8/16-hour defaults. Window boundaries use Bangladesh calendar days. Forecasts with unknown work or insufficient pace evidence remain unavailable; allocation is not completion or a score guarantee.

## Verification and delivery boundary

A complete isolated source copy passed clean `npm ci` (290 packages, no extraneous top-level packages), TypeScript, mandatory-budget production build and **1,164 tests / 116 files**. Existing legacy tests remain enabled. The scheduler/reflow, quantity calculations, six groups, old-data migration, retained phases, partial/locked work, deadlines and range-evidence boundaries are covered, including the 52 rework regressions.

Built-browser acceptance is recorded separately from unit results: **24 routine cases**, **25 Brain cases**, **29 lazy-route/offline/recovery checks**, **10 drawer/offline-PDF sections**, **47 mobile-shell checks**, and the 24-route responsive matrix. The full **418-state** automatic WCAG scan found **0 violations**, retaining all **6,168 raw incomplete instances**; supported per-target measurements resolved them with **0 failed / 0 unresolved**. Conservative bounds cover supported opaque sRGB linear gradients; unsupported paint/occlusion/clipping is fail-closed. Native text fields use their actual value/placeholder paint, not nonexistent DOM text. **20 positive/negative controls** verify that faint/nested/covered/clipped/unsupported cases cannot pass. This is not manual screen-reader or physical-device certification.

The entry shrank from about 2.15 MB to **489,005 B / 144.43 kB gzip**. The **complete eager JavaScript closure is 1,049,797 B**, not 489 kB. Question-bank/generator and PDF engines are optional imports, while every lazy build asset is service-worker precached. First-use offline navigation covers all 24 routes; a missing optional chunk retains the original profile and offers a synchronous JSON recovery backup with an explicit warning that original media/scan bytes are omitted. Mandatory budgets are 500,000 B per entry/chunk and 1,100,000 B unique eager JS. Six guard controls verify those budgets/precache requirements.

**152 Node guard tests** and production/full npm audits passed (0 known entries). Older fault-injection/browser checkpoints remain historical evidence, not fresh reruns. [A-Z-RECHECK-REPORT.md](A-Z-RECHECK-REPORT.md) records exact current results and native/download status; ignored `.cache/finish-all/` holds raw local evidence, which may not persist between sessions.

```sh
npm ci
npm run typecheck
npm test
node --test scripts/*node-test.mjs
npm run build
CHROMIUM_PATH=/path/to/chromium npm run test:built-web
```

`test:built-web` starts and awaits its own production preview and rejects inherited subset/fault filters. It runs reviewer controls, offline/recovery, responsive, routine, Brain, dialog/PDF, mobile, real synthetic WebM storage/playback/backup and the complete accessibility matrix with isolated profiles. Browser workloads/elapsed logs are synthetic acceptance data, not student activity or live YouTube-player observations.

Package `com.prostuti.hsc27`, version 2.44.0/code 24 and signing configuration are unchanged. Current-code Android build/emulator/download checks are separate from the older pinned `14e6640` publisher. The new explicitly requested development-download path requires exact-source build + API 34 + API 35 + built-web success, inspects immutable APK bytes/signature/version and publishes only a separate non-Latest development prerelease. It cannot satisfy the unchanged production signing-continuity gate. **Never uninstall/Clear data or discard the original device to install a conflicting build.** PWA/APK private storage is separate; keep verified full-media backups and PDFs.
