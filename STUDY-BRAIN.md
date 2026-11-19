# ছোট লোকাল Study Brain

**Optional, on-device implementation.** Current-source verification and separate APK/PWA delivery evidence are recorded in [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19) and [the A–Z report](A-Z-RECHECK-REPORT.md); older releases do not contain this feature. This feature adds a small, optional, rule-based helper, not a large language model, general chatbot, official exam adviser or autonomous scheduler. No backend, API key, additional npm dependency, remote AI call or Android identity change is required.

## ব্যবহার

1. Home → **ব্রেইনের সঙ্গে কথা বলো / Talk to Study Brain**, or the **Study Brain** navigation item.
2. Choose **Enable local Study Brain**. Merely viewing the page does not enable it or create memory. Native profile restoration must finish first.
3. Say a short study request, or use the explicit check-in fields:
   - `aj 30 min ache, onek tired`
   - `আজ ৩০ মিনিট সময় আছে`
   - `physics bujhi na`
   - `chemistry mone thake na`
   - `aj porte parbo na`
   - `ki porbo` / `what should I study next`
4. **Interpret** only drafts choices. Review them and tap **Remember check-in** to retain them. An unrecognised request gets an honest fallback, not an invented answer. Ambiguous, negative, fractional or excessive offered minutes are rejected. Natural-language text cannot mark completion, log a session, delete data or change availability.
5. Read the next-step card and **Why this suggestion?**. Optional **Felt hard / okay / easy** feedback informs smaller focus suggestions; it does not certify any learning.

Today’s energy and offered time expire at the next Bangladesh calendar day. Offered time is for this focus, **not** a replacement weekly availability window. `0` means a break; blank means unspecified. The remembered small-focus preference starts at an editable 25 minutes (valid range 5–90), **not** a daily-hour target or a video length.

## Hard boundaries

- Uses the saved **S-first current-phase selection** and the **same existing chapter pair**. It never imports another A/B/C chapter, changes the pair order, shortens a source, marks work complete, or rewrites a manual schedule.
- Can choose which book to focus on **within the earliest owed date**, but retains that book’s earliest outstanding segment. A later half/day is not substituted for an earlier unfinished segment in that book.
- Reads uncovered **source ranges**, including evidence from older calendar partitions. The timer can refer to a smaller range than the whole visible task; elapsed time is still only a study log, never completion evidence. Existing timestamps remain untouched.
- Unknown durations stay unknown. Review in Settings rather than fabricating a default class time or finishing later chapters on paper.
- Before a scheduled slot, only a preview is offered. Expired/overdue segments, missing allocations, custom overlaps, outside-availability edits and consumed daily capacity get review guidance, not an extra task piled onto today.
- An explicit focus timer is offered only inside the existing allocated slot and saved availability, bounded by its remaining wall-clock time, uncovered source range, preferred focus, offered minutes, energy, measured remaining daily capacity and supported session limit. An already running/paused timer is not silently replaced. The time is checked again at click.
- Low energy, a recent explicit “hard” report or difficulty getting started limits a suggested focus to at most 15 minutes. The remaining lecture/practice is still owed. Understanding/recall tips are optional strategies **within** that focus, not extra required app work.
- Legacy profiles receive explicit review/migration guidance. Enabling this helper does **not** convert a legacy routine or bypass availability-first setup.

## What it can actually learn

All reasoning is deterministic and inspectable, with no intelligence, personality, mental-health or mastery diagnosis:

- Confirmed check-in: energy, offered minutes, obstacle and an optional chapter in the current pair.
- Confirmed day/chapter difficulty feedback. Recent “hard” reports can favour that book and reduce focus length; they cannot edit video durations or completion.
- Explicit weak flags/confidence, unresolved chapter-tagged mistakes and mapped MCQ answers. Built-in and user questions are mapped by question ID; deleted/unmapped questions are not assigned a guessed chapter. MCQ counts are shown only with at least five recent answers and are **not** exam-probability estimates.
- Median duration from **at least three saved current-phase sessions across two dates in the last 14 days**. No pace is claimed with less evidence. Only logs mapped to selected chapters in the current S/A/B/C phase count; future/stale logs are ignored. Short logged sessions do not prove attendance, video coverage, understanding or ability.

Future/stale feedback does not influence today. Changing source identity invalidates its old range coverage for recommendations without deleting that historical evidence. Legacy manual chapter-completion statuses remain historical self-assessments; they cannot bypass the current routine’s six required completion groups.

## Memory and privacy

Optional `AppData.studyBrain` version 1 contains only:

- enabled/paused flag and small-focus preference;
- at most **60 daily check-ins**;
- at most **180 day/chapter difficulty feedback entries**.

Reconfirming the same date or chapter/date replaces just that memory entry. New confirmations are retained even when an imported backup contains future dates; the oldest retained confirmations fall off the bounded list. Strict backup validation rejects malformed values, invalid dates/instants, unknown chapter IDs, duplicate keys and excessive arrays. Old backups without this field are unchanged. Unknown/transcript fields are not accepted into retained memory.

**Chat text is never retained.** The feature does not inspect day-note bodies, library-note bodies, scanned pages or video transcripts. It does not send profile data to any service. Its local operations work without a network after the app is loaded; this is not a guarantee of offline initial installation or offline YouTube playback.

The existing profile persistence, native SQLite mirror and JSON/full backups carry the bounded memory. They are **not an encrypted vault**. The memory page shows the latest seven confirmations of each kind; the full retained set is in backups.

- **Pause, keep memory:** turns off reasoning and retains confirmed memory for an explicit resume.
- **Forget brain memory:** confirmation removes only the optional brain extension and turns it off. Original notes, scans, logs, completions, S selection, durations and routine stay intact, including concurrent edits. Original study logs remain available if the student later enables the brain again.
- Older backups may still contain forgotten memory. No remote deletion or cloud sync is implied. PWA and APK storage remain separate; never uninstall/Clear data to obtain this feature.
- Failed profile persistence is surfaced by the existing storage warning; new memory writes and focus launch are disabled while storage is failing. Native restoration also gates the controls.

## Validation and scope

The current S-first scheduler has eight work stages/six required completion groups and bounded unpaid-range reflow; the Brain still only reads that effective plan and never writes routine/completion state. Its browser runner exercises an expired first-day slot for the review state rather than treating a safely reflowed, currently available segment as overdue. Integrated evidence and the wider limits are recorded in [PERSONAL-ROUTINE.md](PERSONAL-ROUTINE.md) and the README.

- Brain model/parser, UI and real-App tests: **84 cases across 3 files** (66 + 15 + 3), retained in the complete clean-source suite rather than a replacement subset. The latest [Bengali A–Z report](A-Z-RECHECK-REPORT.md) records exact full-suite results/input fingerprint and precise native/content/signing boundaries. Covers opt-in, finite multilingual parsing, backup round trips, bounded memory, thresholds, range evidence, stale/future inputs, explicit timers, concurrent scoped forgetting and unchanged original data.
- Clean-source typecheck and production build evidence is recorded separately. Entry JavaScript is **489,005 B / about 144.44 kB gzip** after route/question/PDF splitting; the full unique eager closure is **1,049,797 B**, not just the entry. Mandatory size/precache gates passed. No low-end-device/battery performance certification is claimed. Full/production npm audits reported zero known entries; **166** Node release/development/budget/deployment/diagnostic guards passed.
- `npm run test:brain-browser`: **25 passed cases**, using a built Vite preview: one interactive home/opt-in/offline-draft/confirm/reload/feedback/pause/resume/timer/forget flow plus 24 synthetic state/language/theme/layout cases at 320, 390 and 1280 px.
- The latest Brain run found **0 automatic WCAG violations** and **1 raw incomplete contrast result**. With `REVIEW_INCOMPLETE=1`, its **1 element-level supplemental review was verified**. Raw findings remain in the report; this is not an automatic pass, manual screen-reader test or exhaustive conformance. Decorative profile-icon semantics and short keyboard text contrast were fixed rather than exempted.
- Routine regression: **24 cases**; shared drawer/offline-PDF, mobile-shell, media and backup results are separately recorded. The expanded full accessibility matrix includes deterministic long-title exam-result/hover states in addition to route/dialog/quiz/history coverage. All raw incomplete instances remain in the report; **20 positive/negative controls** verify fail-closed supplemental handling. Exact matrix/review totals belong to the specific A–Z/CI run. Counts overlap and must not be added as independent coverage. This does not certify physical screen readers, external players or all native/OEM behaviour.
- Current raw results live under ignored `.cache/finish-all/`; the [A–Z report](A-Z-RECHECK-REPORT.md) is the durable summary. Browser data, elapsed logs and workloads are synthetic acceptance data, not actual student behaviour or a video-catalogue audit.

Commands:

```sh
npm run typecheck
npx vitest run src/studyBrain.test.ts src/studyBrain.ui.test.tsx src/studyBrain.app.test.tsx
npm test
npm run build
npm run preview
# In a separate shell, with a compatible Chromium runtime:
CHROMIUM_PATH=/path/to/chromium BASE_URL=http://127.0.0.1:3000 REVIEW_INCOMPLETE=1 npm run test:brain-browser
```

Local tests alone do not establish APK/public-PWA publication. The current A–Z report and direct-download evidence identify any exact-source native build and separately labelled development APK; no production signing approval is implied. Package `com.prostuti.hsc27`, version 2.44.0 / code 24 and signing constraints remain unchanged. See [PERSONAL-ROUTINE.md](PERSONAL-ROUTINE.md) for the S routine’s independent source/duration limits.
