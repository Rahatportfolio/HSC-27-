# Current branch — Android mobile shell screenshot repair (unreleased)

**Scope:** [PR #16](https://github.com/Rahatportfolio/HSC-27-/pull/16), branch `arena/34a32742-hsc-27`. This section supersedes earlier UI-visibility claims for the working branch, not historical release evidence below. **The published v2.43.0 APK/PWA has not been replaced and does not contain this repair.** Version metadata remains 2.43.0/code 23 until a separately verified release is prepared. Branch APK artifacts are test builds, not a safe in-place upgrade recommendation.

## Reproduction: what the old checks missed

The supplied screenshots show clipped Bengali dashboard text/counts, a permanent white strip with distorted branding and an obscured running timer. The previous responsive runner used desktop pointer contexts at phone widths; `.isVisible()` established a box existed, not that digits were unobscured. Storage/playback emulator checks did not inspect native window chrome.

- **Native red proof:** [run 44167554212](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44167554212), source `c37d8ff`, failed the added shell tests with `frameworkActionBar=true, visibleNativeToolbar=true` and **0px progress padding / approximately 0px card gap**. This was an actual framework ActionBar, not an invented diagnosis or a DOM logo. `BridgeActivity` does not use the application's `activity_main.xml`; that unused layout was not patched.
- `EdgeToEdge.enable` touched window decor while the launch theme was still active. `BridgeActivity` applied its NoActionBar theme too late for that decor. The launch theme also assigned the full splash image to **every native View's `android:background`**, producing the stretched artwork in the retained bar.
- **Touch-browser red proof at 360px:** seven probes failed: unpadded card text, unsafe toolbar/gesture padding, blocked Start, 13px running/scrolled/navigated clocks and paused stopwatch readability. The 270px decorative SVG extended outside its 230px mobile container and intercepted the Start button; ordinary DOM clicks in jsdom had missed this.
- A first-study-day check (20 November, 320px, conditional PWA install control present) also reproduced a **12px menu/progress-pill overlap** and a search control squeezed to 16px. On the narrowest phones the redundant progress pill now yields to menu/search; full daily progress remains on the dashboard. The named regression failed before the fix and with a reintroduced pill.
- A later real-tap check exposed a short-landscape issue: scrolling to the viewport centre could place the main timer control under fixed chrome. The final layout measures the real reading area rather than assuming a fixed 132px header.
- The first red shell test also left the timer's notification permission dialog on top of a subsequent storage Activity recreation. The isolated emulator shell test now grants that precondition and pauses its own timer in cleanup. No production permission prompt or student profile is bypassed/reset.

## Corrections

| Area | Implemented correction |
|---|---|
| Android launch | Install `SplashScreen` **before** edge-to-edge/super; explicitly disable framework/AppCompat bars in the launch theme; use a splash icon/background, not a full-picture View background. Base theme is NoActionBar as well |
| Home progress/snapshot | Dedicated padding and 18px card separation, flexible header/description, shrinkable progress columns and unbroken counts; test-prep heading/actions wrap within their own padded card |
| Timer art and taps | An explicit SVG viewBox plus container-sized, non-interactive decorative SVG; Start/Pause remain actual touch targets |
| Pinned clock | 18px unbroken elapsed/remaining digits, tabular numeric styling, separate mobile clock columns and usable wrapped action buttons; named status region and semantic Open timer button |
| System insets | Only the sticky stack owns the status-bar inset. The inset background follows the selected app theme so native status icons keep contrast; the recording panel begins below it. Capacitor's gesture inset is not replaced by a later env-only rule |
| Scroll/focus | `ResizeObserver` measures top/bottom chrome into scroll-padding variables, updates when the timer/font/orientation changes and disconnects on unmount. Short landscape controls can scroll into the real unobscured reading area |
| Data safety | No schedule, timer arithmetic, backup format, migration, storage key or saved profile default changes. The tests preserve real-dated notes, settings, completion records and measured sessions |

## Measured gates

| Check | Observed result |
|---|---|
| Local TypeScript and relevant regressions | `npx tsc --noEmit`; timer/mobile/release-policy tests passed |
| Full local application suite | **770/770 tests in 87 files**; includes seven new shell regressions |
| Production build | Passed; existing large-bundle warning remains |
| Production mobile geometry/touch | **41 probes** across 320×760, 360×797, 393×852, 412×915 and 797×393 touch/coarse-pointer contexts; large saved text, Bengali/English, light/dark, simulated 36px status/24px gesture insets, hour-bearing clocks, real Start/Pause/Resume, scroll/navigation, paused stopwatch, no page errors and retained data |
| Existing responsive coverage | All **23 views**, 320–768px, large text, English/dark, dialogs and running timer passed; these are complementary smoke tests, not substitutes for the new occlusion tests |
| First fixed native source | [run 44170486656](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44170486656), `b6ff929618daa53e7448347b81768caa9e1940ad`: APK build **5m11s**, API 34 **4m4s**, API 35 **4m8s**, all successful |
| Native shell assertions | Cold launch and Activity recreation have no visible native toolbar; both clock boxes/text ranges stay within safe viewport bounds and pass multi-point hit testing. Actual injected screen-coordinate taps start the 180-minute preset, pause/resume while scrolled, navigate and reopen the timer; 100% and 130% Android WebView text zoom plus large app text are covered. Existing offline file/playback/restart/reset tests remain enabled |
| Targeted source proof | **7 unmodified controls / 12 intentional source faults caught**, originals restored byte-for-byte. Includes padded-card hook, unwanted idle banner, frozen digits, broken open/pause, lost saved note, wrong/ignored resize clearance, missing SVG viewBox, missing/late splash installation and persistent splash background |
| Targeted browser proof | **10 unmodified control probes / 12 injected layout faults caught by the intended assertion**: missing padding/gap, overlapping ring, unsafe top/bottom, nonsticky clocks, tiny digits, covering layer, clipped digits, lost landscape scroll clearance wrong status-background contrast and first-study-day toolbar collision |

A subsequent evidence-retention run [44173985744](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44173985744) passed API 35 and exposed its actual 320×592 WebView measurements: **18px digits at 100% zoom, 23.4px at 130% zoom, 16px card insets, approximately 18px card gap, no native ActionBar, no clipped/occluded clock points**. Its API 34 job failed at a null JavaScript measurement callback and teardown also reported `device offline`; that job is **not** counted as a pass or silently dismissed as an app-independent flake. The harness now waits for WebView visual-state presentation and target readiness, and reports JS/null measurement errors explicitly instead of a ClassCastException. The final PR checks rerun the full native gate. Screenshot annotations are numbered sub-4096-character chunks because the check API truncated the earlier single-message previews; full images remain in artifacts.

The root-cause native red run and fixed native run are independent of the jsdom/static-source assertions. Browser faults additionally exercise padding/gap, overlapping SVG, safe top/bottom, sticky positioning, font size, clipping/occlusion, landscape scroll clearance and status-background contrast. Their reproducible report is `.cache/mobile-shell/mutations/browser-report.json`; exact final run/guard results are also recorded in PR #16.

## Reproduce and inspect

```bash
npx tsc --noEmit
npx vitest run src/mobileShell.test.tsx src/ui.timer.test.tsx src/releasePolicy.test.ts
npm test
npm run build
CHROMIUM_PATH=/path/to/chrome npm run test:mobile-shell
# Optional built preview instead of the runner's temporary source server:
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:mobile-shell
# Never alongside HMR or another source test: includes 12 temporary source edits.
CHROMIUM_PATH=/path/to/chrome node scripts/check-mobile-shell-guards.mjs
```

The Android workflow now runs the shell regression plus existing storage tests on **API 34 and API 35** and collects emulator screenshots/measurements as `android-device-results-api-*` artifacts. The evidence-retention harness copies its own test images out of scoped external files before Gradle teardown can remove the installed test app; check annotations expose compact measurement/image previews. It does not copy or upload a student's device data. Local Java/SDK/adb were unavailable, so native verification is on GitHub CI, not a claimed local/physical-device run.

Browser logs/reports/images and mutation controls live under ignored `.cache/mobile-shell/`; scripts regenerate them. Source `.ts/.tsx`, Java/XML and workflow changes are durable; generated browser binaries/runtime libraries, APKs and synthetic images are not Git deliverables. The production workspace preview binds `0.0.0.0:3000` and accepts Arena-shaped hosts.

**Limits:** no physical/OEM-phone, battery/background-alarm or all-accessibility-setting certification; the native tests exercise isolated x86 emulators. Targeted faults are not exhaustive mutation coverage or zero-bug proof. Earlier green tests did not cover the user's native overlay and should not be cited as proof it never existed. Default start remains **20 November 2026**; personal targets are not official examination dates. The published APK signing mismatch and legacy scan-byte warning below still apply: **do not uninstall/clear an existing app merely to try this UI repair**.

---

## Historical published v2.43.0 audit (not the current branch's UI bundle)

# Backup/scanner/timer release audit — v2.43.0

**Scope:** `arena/d8039a21-hsc-27`, based on release/main `12cae9421fcb6e1f3719c16545c09d14b322bbfa`. Source/lockfile/Android metadata are **2.43.0 / code 23**. Publication and exact CI/deployment evidence are tracked on the [v2.43.0 release page](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.43.0). A source version or an uploaded draft asset is not a publication claim. The workspace preview serves the release candidate's production build.

This section supersedes the release-baseline counts below for the current working tree. The date derivation, personal-target policy and official-date uncertainty are unchanged.

## Publication completed — v2.43.0

Publication was completed from continuation branch `arena/34a32742-hsc-27` after Arena blocked remote access on the merged source branch. The release/tag remains **`64ac7c99fcf635a7703bf6fb23fbc6020be318e5`**, tree **`8067d012a29f71ebc54e882374f1aed35ad4de35`**, from [PR #15](https://github.com/Rahatportfolio/HSC-27-/pull/15). No application code, tag or existing APK was replaced during this continuation; only inspection tooling and documentation changed.

- **Public release:** [v2.43.0](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.43.0), ID `449052328`, non-draft/non-prerelease; publication and latest status independently confirmed through the unauthenticated public API.
- **APK:** [prostuti-hsc27-v2.43.0.apk](https://github.com/Rahatportfolio/HSC-27-/releases/download/v2.43.0/prostuti-hsc27-v2.43.0.apk), asset `760227469`, **15,229,928 bytes**, `com.prostuti.hsc27`, **versionName 2.43.0 / versionCode 23**.
- **APK SHA-256:** `38992c88d72797dac9c57d8100555f52d8b8e239e28696f7b6f516e94fb7653d`.
- [Tagged Android run 44151291901](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44151291901): APK **5m11s**, API 35 storage/playback/restart/reset emulator checks **4m35s**, both successful. Release-keystore steps were skipped; this is a **debug-signed APK**, not a production-keystore APK/AAB.
- [Pages run 44151187101](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44151187101): same release SHA, build **2m31s**, deploy **11s**, successful deployment **7862887230** for **https://rahatportfolio.github.io/HSC-27-/**. Deployment success is observed; direct public-site inspection was restricted by the sandbox's outbound-host allowlist.
- [Uploaded-APK inspection run 44159411468](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44159411468): **28s, success**, using tooling commit `31ae1f267e9104a94b4168d9e082a44722937ce9`. The runner downloaded the exact release asset and checked its bytes against GitHub's size/digest, ZIP integrity, embedded Android version/package, cryptographic signature and previous-release certificate. It did not rebuild or replace either APK. Local direct downloads failed at the restricted asset CDN; verification happened on the GitHub runner, not locally.
- APK's `assets/index-BIn-0ZZw.js` SHA-256 **`8eebadfbe76a83fa8a87987eb948d85389cd575724dd161d13e6009509aae545`** matches the locally tested production bundle **byte-for-byte**.

**Measured upgrade incompatibility:** v2.43.0 certificate SHA-256 is `30c33e6e24b125db7291e3fb6f3ea746054532b2c016bb3f24d79023cac5ab72`; published v2.42.0 is `fa69e88eb5d49174e02ae91b5b711b192a1e0698c108b8a1015b8eda6c77e8f7`. They differ. Normal Android in-place update from that APK is **not supported**. Do not uninstall/clear the original app to resolve the conflict without independently opening and verifying progress exports **and every scanned PDF/image**. Legacy JSON/full archives omitted those image bytes. PWA and APK data do not automatically sync.

Continuation gates: clean typecheck, **763/763 Vitest tests / 86 files** and a **6.13s** build reran successfully; large-chunk warning remains. The separate artifact checker has **24 passing Node tests** and **19 targeted auditor mutations caught**, with original source unchanged. This is additional tooling evidence, not a fresh combined application/date/release mutation run. New Android SDK signer-format handling first failed four added tests, then passed. Failed inspection attempts exposed draft visibility and the SDK's new `V2 Signer:` format; no release was published until inspection succeeded.

Inspection is opt-in via the existing Android workflow's `audit_release`, `audit_sha`, `audit_previous` dispatch inputs; build/device jobs are skipped in that mode. It makes GET requests only. GitHub's read-only token omitted draft releases in an observed failed run, so the isolated inspection job needs `contents: write` for draft visibility; it still never publishes, replaces assets or builds an APK. Results/failures are exposed through check annotations and an uploaded JSON report. Reproduction: `node --test scripts/verify-release-asset.node-test.mjs`. The source date/history contracts and physical-phone limitations below remain unchanged.

## Important backup safety finding

**Released legacy full-media backups saved scanned-note metadata but omitted the handwritten image bytes. JSON backups are also metadata-only.** A title and `pageKeys` are not the images themselves. If the old device has been erased and no separate PDF/image export exists, these backups cannot reconstruct the missing pages. Do not uninstall or clear the original device on the assumption that a legacy full backup preserved them.

The v2.43.0 binary backup now uses **manifest v2 when scanned pages are present**, checksums the actual image strings, validates every referenced page and stages restored images under fresh keys. Archives without scans remain manifest v1; the `PROSTUTI-MEDIA-1` framing is unchanged. Old clients that only support manifest v1 cannot import the new scan-bearing format. Legacy v1 imports remain supported with a visible warning, including notes whose old page-key lists are empty. This is a forward fix, not recovery of bytes absent from an older file.

Settings now states the JSON/legacy limitations in both languages. A new full backup or separately exported scanned PDF is needed for those images; ordinary JSON is still useful for progress, text notes and settings.

## Defects reproduced and fixed

| Area | Measured correction |
|---|---|
| Local snapshot writes | Timestamp failure no longer replaces the profile. Payload failure restores the preceding marker, or removes a newly created one. Unsafe non-scan cache references are rejected during import |
| JSON restore | The replacement must save successfully before state or either clock is changed. Quota rejection keeps the old profile/clocks. Success replaces a dirty Settings draft and start anchor |
| Full restore | Clears the unrelated study/exam clocks, selects the restored start and synchronises Settings. New progress during staging cancels the transaction; failure rolls staged files back. Once metadata is durably committed, a later UI error must **not** erase its image/file bytes |
| Scanned library | Uses the actual AppData metadata, not a stale separate localStorage list; ISO creation timestamps display the Bangladesh date. Newly saved/restored entries appear and profile replacements remove stale entries |
| Scan persistence | An unavailable/later failed image write fails visibly and cleans earlier staged pages. Saving metadata is durable before success/clearing the editor; rejection preserves editable pages. Deleting requires confirmation and saves metadata before removing image bytes |
| Image helpers | Contrast uses the slider's linear multiplier; expanded, centred rotation avoids source-sized clipping. Perspective reads source pixels once instead of sampling the blank destination per pixel. Uploaded-file object URLs are released on success and failure, including canvas exceptions |
| Scanner editing | Total edits start from original pixels, with per-page settings and latest-request-wins handling. Zero-valued sliders work. Crop/corner controls are usable; out-of-bounds or crossing geometry and pending edits block save. Reset preserves the source. Uploading from the library opens the editor; removing a page leaves its neighbour reachable |
| Scanner export/limits | All pages must load before PDF export, which uses the existing browser/native-compatible exporter and awaits its result. Invalid/missing images or a rejected destination do not report a complete PDF. Title 300 / pages 50 / notes 200 limits match backup validation. Controls have labels and fit narrow screens |
| Measured time vs completion | An early finish records actual minutes, not full task completion. Full-duration completion still works between display ticks. Changing subject/chapter/duration detaches the original task; unchanged subject/chapter preserves it. A legacy stopwatch association cannot mark a preset complete. The tooltip now explains this distinction |

Failing-before-fix logs include `focused-initial`, `focused-after-restore`, `scanner-red`, `scanner-ui-edit-red`, `scanner-pdf-red`, `perspective-stopwatch-red`, `commit-navigation-red` and `safety-copy-red` under `.cache/post-release/`. Independent fault injection also demonstrated every selected new guard's named regression failing; passing tests alone were not treated as sufficient proof.

## Final measured gates for this working tree

| Gate | Observed result |
|---|---|
| TypeScript | `npx tsc --noEmit` passed |
| Full unit/jsdom UI suite | **763/763 tests, 86 files**, **189.88s**, zero reported unhandled errors; includes three additional release-policy tests after the 760-test application audit |
| New targeted fault injection | **100 unmodified controls; 76/76 mutations caught** by the intended named test assertions; source bytes restored exactly |
| Date/history targeted fault injection | **117 unmodified controls; 55/55 mutations caught** in this audit; original bytes restored. This includes the prior capacity, malformed-reference, history and undo guards |
| Release-policy fault injection | **3 unmodified controls; 6/6 mutations caught**: Android/web/lockfile versions, Android code, draft upload and emulator dependency; originals restored |
| Production build | Passed, **6.99s**; the existing large-chunk performance warning remains |
| New production browser runner | Real two-page images: edit/navigation/save/reload → two-page PDF → full backup → restore in an isolated fresh profile with **byte-identical images under fresh keys** → another two-page PDF. Also dirty draft/old-clock replacement, retained journal/session history, completion → reload → undo → reload, early two-minute finish without task completion, and simulated JSON quota failure followed by successful retry |
| Populated scanner | Production controls checked at **320/360/390/768px**, large text; no detected horizontal overflow/out-of-viewport controls or page errors |
| Date browser runner | Final production Settings save/cancel/reload, linked/fixed targets, history, partial evidence, Markdown/ICS downloads and recovery/dedup checks passed in **Asia/Dhaka and America/New_York** |
| Responsive runner | **23 source-Vite views**, 320–768px, large text, English/dark, selected dialogs and running timer; content/page-error/width/sibling-overlap checks passed |
| Study browser runner | Actual WebM save/playback/resume, notes, full media restore, collector and mobile tabs passed; its separate **production PWA offline reload/playback** check also passed |
| Live preview | Production Vite preview bound to **0.0.0.0:3000**, accepting the Arena-shaped Host with HTTP 200 |

The control sets overlap the full suite and each other; their totals are not additional independent features. **76/76 and 55/55 are targeted fault injection, not exhaustive mutation coverage or proof of zero bugs.** A deliberate un-awaited failed PDF-export mutation also produces a rejected promise; it only counts because the intended metadata assertion independently fails. Unmodified controls and the final full suite report no unhandled errors.

### Previous CI UI-timeout investigation

The original YouTube integration test passed locally in **3582.71ms**, already near its unchanged 5-second timeout. It unnecessarily mounted another route and scanned the complete class archive for repeated role queries. It now mounts Library directly and scopes toolbar/dialog queries, retaining rendered-result, URL and channel-persistence checks. Final local observations were **2149.00ms** in mutation controls and **2032.58ms** in the full suite. No timeout was raised and no assertion was removed. These measurements reduce unnecessary test work; they do **not** guarantee all future CI runs will be flake-free. Remote results for this release are recorded on its release page rather than inferred from these local timings.

### Reproduction and evidence

Run `npm run test:post-release-guards` and `npm run test:date-guards` **without another test run or HMR dev server**; each captures the current source before mutating and restores it in `finally`. Never restore a stale cached original over later work.

After `npm run build` and `npm run preview`, use an installed Chromium:

```bash
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:post-release-browser
CHROMIUM_PATH=/path/to/chrome BASE_URL=http://127.0.0.1:3000 npm run test:date-browser
CHROMIUM_PATH=/path/to/chrome npm run test:responsive
CHROMIUM_PATH=/path/to/chrome npm run test:study-browser
```

New reproducible sources: `backupRestore.ui.test.tsx`, `postRelease.storage.test.ts`, `postRelease.timer.test.tsx`, `scanner.persistence.test.ts`, `scanner.processing.test.ts`, `scanner.ui.test.tsx`, expanded media/concurrent-restore tests, `scripts/check-post-release-guards.mjs`, and `scripts/check-post-release.ts`.

The v2.43.0 candidate was rechecked after the version bump: clean typecheck, the full 763-test suite, build, both production browser runners, responsive and study/offline checks. Its latest logs are under `.cache/release-v2.43.0/` (`tests.log/json`, `build.log`, `policy-red.log`, `policy-green.log`, `policy-mutations.log`, and the four browser logs). Filtered release-policy proof is in `.cache/post-release/mutations/filtered-release-/report.md`. The initial application recheck evidence is under ignored `.cache/post-release/`: `typecheck-final.log`, `mutation-run-final.log`, `mutations/report.md`, `full-tests-final.log/json`, `build-final.log`, `post-release-browser-final.log`, `browser/report.json`, `date-browser-final.log`, `responsive-final.log`, `study-browser-final.log`. Date mutations additionally use `.cache/date-mutations/report.md`. Generated PDFs, synthetic images, Chromium/runtime libraries and logs are not Git deliverables; the scripts regenerate them.

## Publication safety

The APK upload step runs before its dependent API 35 emulator job. It now explicitly sets `draft: true`, so successful upload cannot make an unchecked release public. Manual publication must follow successful Android and Pages verification of the intended source commit. `releasePolicy.test.ts` checks version alignment, a code greater than the prior published 22, draft upload and the device-job dependency. Six deliberate configuration mutations failed those named tests; this is configuration-policy proof, not a substitute for running CI.

## Remaining limits

- No physical-phone check was performed; Java/adb were unavailable locally. Current APK/emulator verification uses CI, with its exact run recorded on the current release page. The previous release's CI is not evidence for this version. Camera permissions, actual mobile storage pressure, battery/background alarms and vendor-specific behavior remain physical-device checks.
- A simulated browser quota error proves that failure path, not every hardware/storage failure mode. A web export/PDF download is not evidence that a user has copied it somewhere safe. Test a backup before uninstalling or clearing storage.
- Perspective correction is approximate bilinear mapping, not document OCR or calibrated camera rectification. Large photos/media can still consume considerable memory/storage. The large production bundle is an unresolved performance warning.
- Default start stays **20 November 2026**; existing profiles are not silently reset. **1 February / 6 June remain personal targets, not verified official examination dates.** No new official-date claim, syllabus certification, preparation or GPA guarantee is made.

---

# Published v2.42.0 date/time audit — historical release baseline

**Local verification recorded: 16 November 2026.** Publication is tracked on the [v2.42.0 release page](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.42.0); this audit is not physical-device certification.
Base: `0fa77ce` (v2.41.0) · branch: `arena/9745ddec-hsc-27` · Android metadata: `2.42.0` / `versionCode 22`.

This section supersedes the older reports folded below. Their counts, dates and statements such as “all complete”, “no browser available” or “zero risk” are historical, not claims about the current tree.

## Confirmed scope and derived defaults

The requested default start is **20 November 2026**. The selected policy moves **personal planning targets** with the start; it does not move a real board or college examination.

| Setting | New-profile default |
|---|---|
| Start / first session | 20 Nov 2026 / 06:30 Asia/Dhaka |
| Initial daily target | 8 net hours; breaks additional |
| Boost | 7 Dec 2026 / 16 net hours; editable, not a health recommendation |
| Personal test-preparation target | 1 Feb 2027 — unverified as a college examination date |
| Personal board-preparation target | 6 Jun 2027 — unverified as an official HSC examination date |
| Date policy | Move personal targets with the start; fixed external deadlines are also supported |

The regenerated default contains **198 planning dates / 827 tasks**: learning 20 Nov–31 Jan (73 days), revision 1 Feb–6 May (95), final practice 7 May–5 Jun (30). Default initial chapter allocation ends on **29 January**. These are allocations, not proof that a student has completed or mastered the syllabus. Reduced hours, added lectures and fixed deadlines can produce explicit capacity warnings.

A start change **20 → 26 November** moves the boost to **13 December**, the test target to **7 February**, and the board-preparation target to **12 June**. With fixed policy the test/board dates stay unchanged. A global first-session change to **05:30** changes ordinary slots and their ICS instants; explicit day/task clocks retain priority.

## Changes reviewed

| Area | Implementation / safety contract |
|---|---|
| Date derivation | `planner.ts`: validated dates, leap/month/year boundaries, contiguous phases, daily-minute conservation and final-night reserves before test/board targets |
| Atomic transaction | `reschedule.ts`: preview/save/cancel; unsafe locked plans, date/ID collisions and custom work outside the horizon are rejected without partially changing the profile |
| History | Actual completion timestamps, notes, marks, measured sessions, recall dates and real appointments remain actual evidence. Pending dated custom references remap once, including partial ranges; no duplicate completion aliases |
| Completion | Full contiguous canonical source allocation plus required accompanying practice is needed. Duplicate or gapped fragments do not count as a completed chapter; split promotion and undo remain reload-safe |
| Shared projection | `studyPlan.ts` powers Settings and the running app with the same customised/lecture/adaptive plan. The Weakness explanation reports that actual adaptation rather than applying a second one |
| Capacity and deadlines | `planHealth.ts`, `smartSchedule.ts`, `adaptive.ts`: incomplete learning/practice/revision/mocks, overlapping pending work and deferred work remain visible. Full 180-minute mocks stay atomic; displaced work rolls back if it has no safe destination |
| Dashboard | Before the start, the overview identifies a future routine instead of claiming an assigned target for today. The first-day preview button navigates to that date; the normal target appears on the start date |
| Exports / reminders | Dynamic Markdown targets/boost, updated ICS sequence and Dhaka instants. Native scheduling inputs use actual minute offsets; stale study alarms are cancelled without cancelling the timer alarm (mocked Capacitor evidence) |
| Mobile usability | Official-source links wrap without overlap at 320px. HSC countdown text was 1.611:1 against its background; a light foreground fixes the measured contrast and is regression-tested |

## Follow-up recheck: additional defects reproduced and fixed

The previous 684-test gate did not cover every consequential edge case. The user's request to check again led to new failing-then-passing regressions rather than merely repeating that result:

- **Promoted split completion was counted twice in lecture-plan capacity.** The original task and its completed fragments both appeared: a 240-minute fixture became 300 minutes, pushing unfinished work to another day. Canonical completion now represents those fragments once; the same fixture remains **240 minutes**, with its 180-minute pending task on the original day.
- Overlapping historical fragments now consume only their unique source minutes. Old ranges from a later-shortened source are bounded by its current duration. All original evidence keys/timestamps remain unchanged.
- **A malformed percent-encoded legacy completion key could crash the projection or block full-media restore.** A shared `taskReferences.ts` parser rejects malformed/empty/nonfinite/reversed ranges for computation, but preserves the stored evidence. Completion, remapping, scheduling and staged media restore use the same validation. Undo can still remove invalid legacy ticks.
- A video tick cannot certify content beyond the actual class duration. Invalid generated references cannot create fresh completion evidence.
- Boost labels no longer assume a calendar-month boundary or label high hours “full preparation”; breaks, meals and adequate sleep are explicitly noted in Settings.

New evidence: `scheduleRecheck.test.ts` (9 tests), one additional media-backup test, one Settings UI test, and production-browser recovery/dedup assertions in both device timezones. `.cache/recheck-red.log` records **7 failing regressions before the fix**; `.cache/recheck-boost-copy-red.log` records the original misleading boost UI. Deliberate fault injection independently rebreaks the added guards and restores the source afterward.

## Final measured gates

All results below were rerun after the follow-up application-source changes. Documentation-only edits followed them.

| Gate | Observed result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `CI=true npm test` | **695/695 tests; 79 files**; 181.87s |
| `npm run test:date-guards` | **109 unmodified control tests passed; 55/55 targeted mutations killed** by failing assertions, not runtime/import failures. Original source bytes restored |
| `npm run plan` | **198 dates / 827 tasks** exported to `HSC-27-STUDY-PLAN.md` |
| `npm run build` | Passed; 6.76s. Nonfatal large-chunk warning remains |
| `npm run test:date-browser` | Actual production Settings edits, confirmation/cancel, reload, partial evidence, retained history, future-start notice, Markdown/ICS downloads, mobile timeline and fixed-deadline warnings passed in **Asia/Dhaka and America/New_York** device timezones. Also verified malformed legacy references do not blank the app/erase history and promoted split work appears once after reload |
| `npm run test:responsive` | **23 views**, 320/360/390/768px, large text, English/dark mode, selected dialogs and running timer; nonempty real view, page-error, width and sibling-overlap guards passed |
| `npm run test:study-browser` | Real WebM playback/save/resume, notes, full media backup/restore, shared collector, mobile tabs and **production PWA offline reload** passed |
| Production preview host | Port 3000 bound to `0.0.0.0`; ordinary request and Arena-shaped preview Host returned HTTP 200 |

The full suite includes the focused controls; the counts are not additive. The mutation runner proves these selected regressions can be detected; **55/55 is not exhaustive mutation coverage or a zero-bug guarantee**.

Focused evidence covers six month/year/leap starts; 25 daily-hour/start-clock combinations; invalid/reversed/oversized plans; fixed versus linked targets; locked dates and collisions; 10,000 completion entries; partial completion → shift → undo → reverse shift → reload; required chapter practice; omitted completed work and actual recall anchors; atomic mocks; lossless adaptive replacement; preview/saved-warning equality; export and native minute/briefing inputs.

Reproducible runners: `scripts/check-date-guards.mjs`, `scripts/check-date-cascade.ts`, `scripts/check-responsive.mjs`, `scripts/check-study-system.ts`. Logs, screenshots and reports are generated under ignored `.cache/`, not committed as bulky artifacts. Latest follow-up logs: `recheck-full-suite.log/json`, `recheck-date-guards.log`, `date-mutations/report.md`, `recheck-date-browser.log`, `recheck-responsive.log`, `recheck-study-browser.log`, `recheck-build.log`, `recheck-green-probes.log`. Earlier `date-*-final` files belong to the preceding pass and are not the latest evidence.

## Official-date verification limit

An official **HSC 2027 routine and this student's college-test date could not be verified**. Attempts used [NCTB notices](https://nctb.gov.bd/pages/notices/), [Sylhet HSC Corner](https://sylhetboard.gov.bd/corner/hsc), [Sylhet college notices](https://sylhetboard.gov.bd/order/college) and [Dhaka Board HSC notices](https://dhakaeducationboard.gov.bd/index.php/site/product/hsccorner). NCTB notice content retrieval was incomplete; Dhaka returned a challenge; the fetched Sylhet pages did not establish the two dates. This is not evidence that no notice exists. Unofficial blogs, similarly named sites, SSC notices and 2026 examination dates were not treated as 2027 authority.

**1 February / 6 June are personal defaults only.** An earlier unsupported January 28 assertion was retracted. Confirm a real date with the issuing board/college, enter it in Settings, select fixed policy, and review capacity warnings.

## Android release verification

[CI run 44091010547](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44091010547), application commit `ac45922d770175aa7cb18a95fcb19d66ff1fc245`, passed both jobs:

- **Build installable APK:** dependency install, typecheck, full unit/UI suite, Android assets, production web build, responsive/offline browser checks, Capacitor sync and debug APK assembly/upload.
- **Android WebView device checks:** instrumented app on an API 35 emulator, with network disabled, verified native local-file storage, real playback, Activity recreation/persistence, failed-download handling and explicit reset.

The default downloadable APK is debug-signed. A different signing certificate can prevent updating an earlier install in place; retain JSON/full-media backups before any uninstall. The artifact archive could not be downloaded into this sandbox because its redirected storage host was inaccessible; the CI result and release asset metadata are the available remote evidence.

## Remaining limits and release status

- **No physical Android phone was used.** Native reminder unit tests mock Capacitor; permissions, exact alarms, battery policies and background delivery still need real-device checks. The emulator checks above do not certify alarms.
- Production PWA offline reload was tested in Chromium, not on every phone/browser. There is no push server that can keep a closed PWA alive.
- Existing profiles retain their saved settings instead of silently being reset to November 20. Back up, apply the desired start in Settings, and review the preview. Re-export/re-import ICS; an old external calendar import cannot update itself.
- A large production bundle remains a performance warning. Passing tests cannot prove the absence of all defects or guarantee preparation, sleep adequacy, an examination date or GPA.
- Content was not expanded in this date update: **1,176 authored starter MCQs**, separately **10 recovered board questions / 24 coverage rows / 3 rejected sources / 6 of 114 chapters**. A coverage row is not an answerable question; authored MCQs are not all verified board questions.
- Release operations are tracked by [PR #14](https://github.com/Rahatportfolio/HSC-27-/pull/14), the [v2.42.0 release](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.42.0), and the [Pages deployment workflow](https://github.com/Rahatportfolio/HSC-27-/actions/workflows/static.yml). Only an uploaded APK asset establishes a download; the version in source alone does not establish publication. APK and PWA deployment status are separate.

---

<details>
<summary>Archived audits — v2.16 through v2.41 (historical claims and counts, not current status)</summary>

# সম্পূর্ণ অডিট — HSC‑27 Study Planner → Smart Learning OS

**তারিখ:** ২০২৬‑১১‑১৬ · **বেস কমিট:** `ecf7f5f` (v2.16.0) · **পদ্ধতি:** প্রতিটি দাবি কোড, টেস্ট ও স্ক্রিন পড়ে যাচাই — অনুমান নয়।
**বেসলাইন:** `npx vitest run` → ৩৯ ফাইল / ২৬৩ টেস্ট পাস · `tsc -b` ও `vite build` পরিষ্কার।

---

## ০. এক নজরে সিদ্ধান্ত

তুমি যে সিস্টেমটা চেয়েছ, তার **প্রায় ৬০% আগেই তৈরি** — কিন্তু সেগুলো আলাদা আলাদা পেজে ছড়ানো, আর তিনটি জিনিস সত্যিই **নেই**:

1. **সময় ধরে পরীক্ষা + স্বয়ংক্রিয় মার্কিং + ফলাফল বিশ্লেষণ** — আগে শুধু “নম্বর লিখে রাখা” ছিল।
2. **ভুল প্রশ্ন পরের পরীক্ষায় ফিরে আসা** (spaced re‑injection)।
3. **দৈনিক/সাপ্তাহিক/মাসিক পরীক্ষার কাঠামো** (cadence)।

এই তিনটার ভিত্তি একই: একটা প্রকৃত **পরীক্ষা কাঠামো**। তাই সেটাই প্রথমে বানানো হয়েছে (নিচে §৬)।

---

## ১. তোমার ৮টি মডিউল — সত্যি অবস্থা

| # | প্রস্তাবিত মডিউল | অবস্থা | প্রমাণ / কী আছে | কী বাকি |
|---|---|---|---|---|
| 01 | **Dashboard** (আজকের পড়া, অগ্রগতি, লক্ষ্য) | ✅ আছে | `views/Today.tsx` (৭৫০ লাইন), `dailyGoals.ts`, `testPrepStats()` | — |
| 02 | **My Syllabus** (প্রতি অধ্যায়ের অগ্রগতি) | 🟡 প্রায় | `views/Syllabus.tsx`, `learning.ts` (`chapterStage`, 9‑ধাপ `PREPARATION`, `learningDashboard`) | শুধু **হিটম্যাপ গ্রিড** ভিউ নেই — ডেটা সব তৈরি |
| 03 | **Smart Classes** (YouTube) | ✅ আছে | `views/Videos.tsx`, `classLinks.ts` (২৮০K), `advanced.ts#collectLinks`, অফলাইন ডাউনলোড | — |
| 04 | **AI Question Bank** | 🟡 আংশিক | `quiz-bank.ts` (১০৪K, ৪৭১+ প্রশ্ন, ১১৪/১১৪ অধ্যায়), নিজের প্রশ্ন যোগ, `analytics.allQuestions` | ব্যাখ্যা বাংলা‑only; “নিজে প্রশ্ন বানানো” এখনো রুল‑বেজড নয় |
| 05 | **Examination** (chapter/weekly/full mock) | 🟡 → ✅ **আজ নতুন** | `views/Exams.tsx` = ম্যানুয়াল নম্বর + ঘড়ি; **নতুন `views/ExamSim.tsx`** = সত্যিকারের টাইমড পেপার | weekly/monthly **cadence** এখনো সাজেশন‑লেভেলে |
| 06 | **Revision Center** | ✅ আছে | `revision.ts` (১/৩/৭/১৪/৩০ দিন, recall‑অনুযায়ী পরের তারিখ), `views/Revision.tsx`, `mistakeRevision.ts` (ভুল → ১ দিনের কার্ড) | ভুল প্রশ্ন **পরীক্ষায়** ফেরানো ছিল না — এখন হয়েছে |
| 07 | **Analytics** | ✅ আছে | `analytics.ts` (`weakChapters`, `subjectAccuracy`, `weeklyReview`, streak, badges), `prediction.ts` | Golden A+ প্রেডিকশন **UI**‑তে আলাদা কার্ড নেই |
| 08 | **Settings & Backup** | ✅ আছে | `backup.ts`, `storage-manager.ts`, `mediaBackup.ts`, JSON/CSV, Android SQLite মিরর | ক্লাউড ব্যাকআপ platform‑সীমা (local‑first) |

---

## ২. তোমার “Advanced” ৮টি ফিচার

| ফিচার | অবস্থা | নোট |
|---|---|---|
| Syllabus Heatmap | 🟡 ডেটা ✅, UI ❌ | `learningDashboard()` ইতিমধ্যে priority (A/B/C) ও subject ধরে % দেয় |
| Focus Timer | ✅ | Pomodoro/stopwatch + Android foreground service + PiP |
| Golden A+ Predictor | 🟡 লজিক ✅ | `prediction.ts`: `estimatedFinishDate`, `scheduleStatus`, `expectedPercentBy` |
| Mock Test History | ✅ | `data.tests` + আজ থেকে `data.examSessions` (প্রশ্ন‑লেভেল ইতিহাস) |
| Backlog Manager | 🟡 | `testPrepStats().warning` + `rescheduleUnfinished` আছে; আলাদা “বকেয়া পড়া” স্ক্রিন নেই |
| Study Streak | ✅ | `currentStreak` / `longestStreak` |
| Backup System | ✅ | JSON/CSV + মিডিয়া ব্যাকআপ |
| Test Countdown | ✅ | `Exams.tsx` কাউন্টডাউন + হেডার পিল + ১৩ মডেল টেস্ট |

---

## ৩. তোমার Top‑3 অগ্রাধিকার — সৎ মূল্যায়ন

**① Automatic Question Generation** → 🟡 **আংশিক, এবং এখানেই সবচেয়ে বড় সীমা।**
- যা আছে: ৪৭১+ হাতে‑লেখা, সিলেবাস‑ম্যাপ করা প্রশ্ন (প্রতি অধ্যায়ে অন্তত ১টি), ব্যাখ্যা, নিজের প্রশ্ন যোগ করার ফর্ম।
- যা **নেই**: বই পড়ে নতুন প্রশ্ন “বানানো”। এই অ্যাপ local‑first — কোনো LLM/সার্ভার নেই। রুল‑বেজড জেনারেটর দিয়ে **সংজ্ঞা → জ্ঞানমূলক**, **কারণ → অনুধাবন** ধাঁচের প্রশ্ন তৈরি করা যায়, কিন্তু সেগুলো “যাচাই করা” হবে না — আর তুমি নিজেই বলেছ প্রশ্ন বই/বোর্ডের সঙ্গে যাচাই হতে হবে।
- **সিদ্ধান্ত:** ভুয়া “AI প্রশ্ন” না বানিয়ে ব্যাংক বড় করা + নিজের প্রশ্ন/নোট যোগ + ভুল থেকে প্রশ্ন তৈরি — এটাই নিরাপদ পথ। এটাই সত্যিকারের GPA‑লাভ।

**② Personal Exam System** → ✅ **আজকের কাজে প্রথম ধাপ শেষ।**
- এখন: অধ্যায়/বিষয়/পূর্ণ মক/ভুলের পরীক্ষা, সময় ধরে, প্রশ্ন প্যালেট, অটো‑জমা, অটো‑মার্কিং, অধ্যায়ভিত্তিক ফল, ভুলের ব্যাখ্যা, ভুল প্রশ্নের “আবার” পরীক্ষা।
- বাকি (ধাপ ④): দৈনিক ছোট পরীক্ষা / সাপ্তাহিক / মাসিক — ক্যালেন্ডারে বাধ্যতামূলক স্লট হিসেবে।

**③ Adaptive Study Planner (৮ ঘণ্টা সীমা)** → 🟡 **লজিকের অর্ধেক আছে।**
- আছে: `effectiveDailyHours` override chain, `dailyTargetMinutes`, `buildPlan(settings)` পুনর্নির্মাণ, `rescheduleUnfinished` (বকেয়া টাস্ক পরের দিনে টেনে নেওয়া)।
- নেই: দুর্বলতা → **স্বয়ংক্রিয়** পুনর্বিন্যাস, এবং ৮ ঘণ্টার **hard cap** যাচাই।
- এটা ধাপ ⑤ — পরীক্ষার ডেটা জমা না হলে অ্যাডাপ্ট করার ভিত্তিই নেই। তাই আগে পরীক্ষা, পরে অ্যাডাপ্টেশন। ✅ সঠিক ক্রম।

---

## ৪. যা সত্যিই নতুন (এবং কেন এই ক্রম)

| ক্রম | কাজ | কেন এখন |
|---|---|---|
| ① | **Exam Simulator** (সময় + অটো‑মার্কিং + বিশ্লেষণ) | সব কিছুর ডেটা‑উৎস; আজ সম্পন্ন |
| ② | **ভুল প্রশ্নের spaced re‑injection** | ইঞ্জিনে ইতিমধ্যে ১/৩ ভাগ ভুল‑প্রশ্ন বসানো আছে; এখন ক্যালেন্ডার‑সচেতন করা |
| ③ | **Weakness detector সারফেসিং** | `weakChapters()` + `examChapterAccuracy()` এক জায়গায় |
| ④ | **দৈনিক/সাপ্তাহিক/মাসিক টেস্ট cadence** | পরীক্ষা সিস্টেমকে অভ্যাসে পরিণত করা |
| ⑤ | **Adaptive replanning (৮ ঘণ্টা cap)** | ①–④ এর ডেটা দিয়ে |
| ⑥ | **Syllabus heatmap UI** | ডেটা প্রস্তুত, শুধু ভিজ্যুয়াল |
| ⑦ | **Backlog Manager UI** | `rescheduleUnfinished` কে দৃশ্যমান করা |

প্রতিটি ধাপ আলাদা কমিট, আলাদা টেস্ট — আগের কাজ ভাঙার ঝুঁকি শূন্য রাখতে।

---

## ৫. ঝুঁকি ও সীমা (যা কখনোই “ফিচার” হয়ে উঠবে না)

- **ক্লাউড সিঙ্ক / অ্যাকাউন্ট / পুশ নোটিফিকেশন** — অ্যাপটা ইচ্ছাকৃতভাবে local‑first; সার্ভার নেই। ব্যাকআপ = JSON/CSV ফাইল + Android SQLite মিরর।
- **iOS/ডেস্কটপ প্যাকেজ** — Mac/Apple অ্যাকাউন্ট দরকার।
- **সত্যিকারের LLM প্রশ্ন‑জেনারেশন** — API key/সার্ভার ছাড়া সম্ভব নয়; ভুয়া প্রশ্ন GPA‑র জন্য ক্ষতিকর।
- **MCQ ব্যাংক “নমুনা”** — ৪৭১টি প্রশ্ন ১১৪ অধ্যায়ে ভাগ করলে প্রতি অধ্যায়ে গড়ে ৪টি; বড় পরীক্ষার জন্য আরও দরকার (সাহিত্য/ইংরেজিতে কম)।

---

## ৬. আজ যা যোগ হলো — v2.17.0 · Exam Simulator

**নতুন ফাইল**
- `src/examSim.ts` — পেপার বানানো (`buildExamQuestions`), নম্বর দেওয়া (`gradeExam`), সংরক্ষণ (`saveExamSession`), ইতিহাস (`examHistoryStats`), দুর্বলতা (`examChapterAccuracy`)।
- `src/views/ExamSim.tsx` — নতুন “পরীক্ষা সিমুলেটর” স্ক্রিন।
- `src/examSim.test.ts` — ২২টি ইউনিট টেস্ট; `src/features.test.tsx`‑এ ৩টি স্ক্রিন‑টেস্ট।

**আচরণ**
- ৪ ধরনের পেপার: অধ্যায় · বিষয় · পূর্ণ মক · ভুলের পরীক্ষা। সংখ্যা ১০–৫০, **প্রতি প্রশ্নে ১ মিনিট**।
- পেপারে **এক‑তৃতীয়াংশ আগের ভুল প্রশ্ন** জোর করে ঢোকানো হয় (ভুল ফিরে আসে)।
- উত্তর দেওয়ামাত্র অটো‑সেভ, প্রশ্ন‑প্যালেট, আগে/পরে, উত্তর মুছো।
- **সময় শেষ হলে নিজে থেকেই জমা**; অসম্পূর্ণ জমা দিলে সতর্কবার্তা।
- ফল: % · আনুমানিক গ্রেড · অধ্যায়ভিত্তিক বার · প্রতিটি ভুলের সঠিক উত্তর ও ব্যাখ্যা · “ভুল প্রশ্নগুলো আবার”।
- প্রতিটি উত্তর পুরোনো লুপেই যায়: `attempts` → `mistakes` (auto‑mcq) → ২ বার ভুলে `chapterMeta.weak` → **কালকের রিভিশন কার্ড** → `tests` (GPA ট্র্যাকারেও দেখা যায়)।
- নতুন persisted কালেকশন `examSessions` — `freshData()`, `LIMITS.examSessions = 500`, এবং `parseBackup` স্যানিটাইজারে যাচাই সহ (পুরনো ব্যাকআপ অপরিবর্তিত কাজ করে)।

**যাচাই:** `tsc -b` পরিষ্কার · `vite build` সফল · **৪০ ফাইল / ২৮৫ টেস্ট পাস** (২৬৩ → ২৮৫) · `#examsim` রুট লাইভ প্রিভিউতে লোড হয়।

---

## ৬ক. ধাপ ② — ভুল প্রশ্নের spaced re-injection (v2.18) ✅

- নতুন `src/retryLoop.ts`: ভুল/উত্তরহীন প্রশ্ন ল্যাডারে জমা, due তারিখ, রিস্টার্ট/প্রমোশন, ঝালাই, ৩০ দিন পর পরিষ্কার।
- সিমুলেটর: নতুন মোড **আজকের পুনরায়**, সেটআপ রেলে রিট্রাই কার্ড (আজ/সামনে/ঝালাই + অধ্যায়ভিত্তিক), ফল স্ক্রিনে “আগামীকাল থেকে Nটি প্রশ্ন ঢুকবে”, রিভিশন সেন্টারে একই কার্ড।
- নতুন পেপারে কোটা ভরাটে **due প্রশ্ন আগেই**।
- `retries` কালেকশন: `LIMITS.retries = 2000` + পূর্ণ স্যানিটাইজার; পুরনো ব্যাকআপ অটুট।
- **টেস্ট ৩১১/৩১১ (৪১ ফাইল)** — ২১টি নতুন ইউনিট + ২টি স্ক্রিন টেস্ট।
- পথে ধরা পড়া বাগ: পেপারের নিজের ভুল উত্তরকে “রিট্রাই” হিসেবে ধরে ল্যাডার রিসেট হয়ে যাচ্ছিল — সেটেল করার ক্রম বদলে ঠিক করা হয়েছে, আর এখন টেস্টে আটকা।

## ৬খ. ধাপ ③ — ব্যাখ্যাযোগ্য দুর্বলতা ডিটেক্টর (v2.19) ✅

- `src/weakness.ts`: পাঁচটি বাস্তব সংকেত (MCQ <৭০% ন্যূনতম ৩ চেষ্টা, CQ <৬৫%, due রিট্রাই, পরীক্ষায় <৬০%, A-প্রায়োরিটি অছোঁয়া) → ০–১০ স্কোর ও প্রতিটি সারিতে কারণ।
- `views/Weakness.tsx`: স্ট্যাট রো, “আজ ঠিক এই তিনটি”, সব সারি (ফিল্টার: সব/গুরুতর/ভুল প্রশ্ন), সপ্তাহের প্রতিকার, বিষয়ভিত্তিক ঝুঁকি; হোমে সতর্কবার্তা।
- **টেস্ট ৩৩৪/৩৩৪** — ১৪ ইউনিট + ১ স্ক্রিন।

## ৬গ. ধাপ ④ — পরীক্ষার রুটিন (v2.20) ✅

- `src/cadence.ts`: দৈনিক ১০ MCQ, শুক্রবার ২৫, মাসিক ৫০ — due/দেরি/শেষ ফল; পেপারের ধরন থেকেই স্লট নির্ধারণ, তাই মাইগ্রেশন লাগে না।
- `Exams.tsx` স্ট্রিপ + `ExamSim.tsx` রুটিন কার্ড; `buildExamRoutineLine` সকালের নোটিফিকেশনে যোগ হয়।
- **টেস্ট ৩৪৮/৩৪৮** — ১৯ ক্যাডেন্স + ৩ স্ক্রিন।

## ৬ঘ. ধাপ ⑤ — অ্যাডাপ্টিভ প্ল্যানার, ৮ ঘণ্টার কঠিন সীমা (v2.21) ✅

- `src/adaptive.ts`: `adaptiveCap = min(480, লক্ষ্য + বাফার ০/৩০/৬০)`; দুর্বল স্কোর ≥৫ হলে পরের ৩ দিন পুনর্বিন্যাস।
- **পদ্ধতি:** আগে খালি জায়গা → না থাকলে সবচেয়ে নিচু অগ্রাধিকারের (C→B) ব্লক সরিয়ে সেখানে দুর্বল অধ্যায়ের ব্লক; সরানো কাজ পরের দিনে `~moved` হয়ে বসে, জায়গা না পেলে `dropped` রিপোর্ট। A/পরীক্ষা/ভিডিও/সম্পন্ন/অন্যের অ্যাডাপ্টিভ ব্লক কখনোই সরে না। ফলে দিনের মোট মিনিট অপরিবর্তিত থাকে।
- **ডিজাইনে ধরা পড়া বাগ:** প্রথমে “দুর্বল ব্লক যোগ” ও পরে “ফাঁকা জায়গা ভরাট” দুটোই ব্যর্থ—`buildPlan` প্রতিদিনই পুরো লক্ষ্য খরচ করে আর দিন ০-এর সব ব্লক A। দ্বিতীয় বাগ: `unfitted` কেবল swap হলেই জমা হচ্ছিল, তাই “জায়গা নেই” কখনো দেখাত না; আর যে অধ্যায় ইতিমধ্যে সেই দিনে আছে তার জন্য আবার ব্লক তৈরি হচ্ছিল—দুটোই ঠিক করা হয়েছে (`dayCovers`)।
- **UI:** সেটিংসে টগল ও বাফার; দুর্বলতা স্ক্রিনে কার্ড (সীমা/পরিকল্পিত/পূর্ণ দিন/পরীক্ষা বাকি + বদলের তালিকা, আগে→পরে মিনিট)।
- **টেস্ট ৩৬৮/৩৬৮ (৪৫ ফাইল)** — ১৬ ইউনিট + ৪ স্ক্রিন; `npm run build` পরিষ্কার।

## ৬ঙ. ধাপ ⑥ — স্বয়ংক্রিয় প্রশ্ন তৈরি, নিয়মভিত্তিক (v2.22) ✅

- **নির্বাচিত পথ:** (ক) নিয়মভিত্তিক টেমপ্লেট — কোনো সার্ভার, API বা মডেল নয়, তাই local-first নীতি অটুট।
- **`src/questionGen.ts`:** শুধু একটি **তথ্যপুল** (৮০ অধ্যায়, ৯৬টি পাঠ্যবই-যাচাইকৃত তথ্য) থেকে MCQ তৈরি; প্রতিটি সঠিক অপশন অ্যাপের বিদ্যমান ব্যাংকে হুবহু আছে, ভুল অপশনগুলোও অন্য আসল তথ্যের মান, ব্যাখ্যায় উৎস লেখা।
- **`verifyGenerated`** একটি কঠিন গেট: ৪টি আলাদা অপশন, রেঞ্জে উত্তর, উৎস-সহ ব্যাখ্যা, ও ব্যাংকে উত্তরটির উপস্থিতি। গেট প্রথম রানেই ২৩টি ভুল তথ্য ধরেছিল; সেগুলো বাদ না দিয়ে পুলের মান ব্যাংকের হুবহু মানে সংশোধন করা হয়েছে।
- **সংহতকরণ:** সিমুলেটরের `examPool`/`buildExamQuestions`-এ `generate` অপশন (আগে থেকেই ডিফল্ট বন্ধ, টেস্ট নির্ভরযোগ্য থাকে), এবং অনুশীলন স্ক্রিনে কার্ড—যাচাই করা কুইজ যোগ করে দেয়; উত্তর দিলে সাধারণ প্রশ্নের মতোই মিস্ট্রি বুক/দুর্বল-অধ্যায়/রিট্রাই ল্যাডারে যায়।
- **সীমা স্পষ্ট:** তথ্য না থাকলে কিছুই তৈরি হয় না (`generativeGap`), AI-ভিত্তিক লেখা প্রশ্ন নেই, বোর্ড-প্রশ্নের দাবি নেই। ইংরেজি/বাংলা রচনামূলক অংশ এখনো জেনারেটরের বাইরে।
- **টেস্ট ৩৮৫/৩৮৫ (৪৭ ফাইল)** — ১৪ ইউনিট + ৩ স্ক্রিন; `npm run build` পরিষ্কার।

## ৬চ. ধাপ ⑦ — সিলেবাস হিটম্যাপ + প্রশ্ন-কভারেজ পূর্ণ (v2.23) ✅

- **`src/heatmap.ts`:** `chapterHeat` প্রতিটি অধ্যায়ের জন্য প্রস্তুতি স্কোর বানায়—পরিকল্পিত সেশনের অগ্রগতি, `chapterStage`, `readiness.coverage`, MCQ/CQ চেষ্টা। একই সাথে `syllabusHeat` বিষয়ভিত্তিক সারি, পাঁচ-ব্যান্ডেরগণনা, `focus` (A আগে) ও `slipped` (কাজ শুরু, পরীক্ষা নেই) দেয়।
- **সততার দুই নিয়ম:** দুর্বলতার স্কোর ≥৭ হলে ৩৫%-এ ক্যাপ, ৫–৬ হলে ৬০%-এ; আর `attempts === 0 && cq === 0` হলে কোনো অধ্যায় ৬৫%-এর বেশি দেখায় না—অর্থাৎ "সব টিক পড়েছে" আর "পরীক্ষার জন্য তৈরি" এক নয়।
- **ডেভেলপে ধরা বাগ:** প্রথমে `meta.revisionStage`/`confidence` ব্যবহার করতে গিয়ে দেখা যায় `ChapterMeta`-তে ওই ফিল্ডই নেই; বাস্তব ফিল্ড হলো `stage` + `advanced.readiness` — তাই কোড বদলে অ্যাপের বিদ্যমান সত্য ব্যবহার করা হয়েছে। দ্বিতীয়ত `slipped` প্রথমে ১০০টি অধ্যায় দেখাত, কারণ `done` ফিল্ডটাই ছিল না—`done` যোগ করে ঠিক হয়েছে।
- **প্রশ্ন-কভারেজ:** শেষ ৩৪ অধ্যায়ের তথ্য যোগ; `GENERATIVE_CHAPTER_COUNT` এখন ১১৪, যাচাই ১৩০/১৩০ পাস।
- **টেস্ট ৪০৬/৪০৬ (৪৯ ফাইল)** — ১৩ ইউনিট + ৫ স্ক্রিন (হিটম্যাপ), ১৬ ইউনিট (জেনারেটর)।

## ৬ছ. ধাপ ⑧ — গভীরতা: সূত্র-গণনার প্রশ্ন ইঞ্জিন (v2.24) ✅

- **কেন:** কাভারেজ ১১৪/১১৪ হলেও ১১৪টির ৮৬টিতে একটিই তথ্য ছিল; সিমুলেটরের পাতলা-পুল সমস্যা তাই কভারেজ দিয়ে সমাধান হয় না।
- **কী:** `src/numericGen.ts` — ৪৯টি স্কিমা (`prompt`/`solve`/`slips`), সিড-ভিত্তিক সংখ্যা নির্বাচন, এবং **গণনা করে** উত্তর। ভুল অপশন = সাধারণ গাণিতিক ভুল (½ বাদ, উল্টো ভাগ, n+১)।
- **যাচাই পদ্ধতি:** `verifyNumeric` প্রশ্নের আইডি থেকে সিড ও স্কিমা বের করে আবার হিসাব করে, তারপর অপশনের সঙ্গে তুলনা করে। ফলে হাতে লেখা উত্তর-ভুল অসম্ভব।
- **ডেভে ধরা সমস্যা:** প্রথমে `pick()` হেল্পার ভুল ছিল (সব ভ্যারিয়েন্ট একই সংখ্যা), prompts-এ লাতিন অঙ্ক, এবং ঋণাত্মক অপশন (v = u − at)। তিনটিই ঠিক করা হয়েছে; `v = u + at`-এর স্কিমা T বের করার দিকে ঘোরানো হয়েছে যাতে সব অপশন একই মাপের হয়।
- **ফল:** ৪৯ স্কিমা → ১৫৯টি প্রশ্ন, ৩০ অধ্যায়, ০ ত্রুটি; এক-অধ্যায়ের মক এখন ৮–১৬টি প্রশ্ন পায়।
- **টেস্ট ৪১৭/৪১৭ (৫০ ফাইল)**।

## ৬জ. ধাপ ⑨ — ব্যাকলগ ম্যানেজার, ৮ ঘণ্টার সীমা মেনে (v2.25) ✅

- **কেন:** পুরোনো `addBacklogToToday()` তিনটে ভুল করত—দিন পূর্ণ হলেও কাজ চাপাত, একই অধ্যায়ের টুকরো আলাদা করে বসাত, আর কিছুই ছেড়ে দেওয়ার পথ ছিল না (ব্যাকলগ চিরকাল বাড়ত)।
- **কী:** `src/backlog.ts` — `backlogItems` (সম্পন্ন/বাদ-দেওয়া/আজ ও ভবিষ্যৎ বাদ), `mergeFragments` (একই অধ্যায় এক ব্লক), `planBacklog` (`room = adaptiveCap − before`, লক করা দিনে room=0), `applyBacklogPlan` (শুধু বসানো কাজের জন্য carryover), `dropBacklog` (`removedTasks`)।
- **প্রথম পরীক্ষায় প্রমাণিত সত্য:** fresh প্রোফাইলে প্রতিদিন **৪৮০/৪৮০ মিনিট, ১০০% A-প্রায়োরিটি**; `displaceableTask` সাত দিনেই `null`। অর্থাৎ বসানোর জায়গা নেই—এবং **সেটাই সঠিক উত্তর**। তাই সীমা ভাঙা বা ভুয়া বসানো বাদ দিয়ে দুটো সৎ ফল যোগ করা হলো: `merged` (একই অধ্যায় আগেই প্ল্যানে) আর `unplaced` (ছেড়ে দেওয়ার সুযোগ)।
- **ডেভে ধরা বাগ:** (১) `unplaced`-এর টাইপ `BacklogItem` ছিল, তাই জোড়া ব্লকের সব source id হারিয়ে drop করতেও ১২টাই ফিরে আসত—`MergedBacklogItem` + `itemTaskIds()` দিয়ে ঠিক; ফল ১২ → ২ আইটেম, ২৮৮০ → ৪৮০ মিনিট। (২) `plannedMinutes` ভুল ফাইল থেকে import—`adaptive.ts`-এ আছে, `planner.ts`-এ নয়।
- **UI:** `views/Backlog.tsx` (`#backlog`) — চার সংখ্যা, হরাইজন ৩/৭/১৪/৩০, দিনভিত্তিক বার, বিষয়ভিত্তিক বিন্যাস, বারবার-ফেরা অধ্যায় → হিটম্যাপ, এবং পুরো তালিকা ভাগে ভাগে। ক্যালেন্ডারের “৫টি আজকের তালিকায়” বাটন এখন এখানেই নিয়ে যায়।
- **পরীক্ষা:** ১৯টি ইউনিট (সীমা কখনো ছাড়ায় না, লক করা দিনে বসে না, ৪×১০ = ৪০ মিনিটে জোড়া লাগে, অ্যাপ্লাই = ঠিক ততগুলোই carryover, drop দুবার করলে ডুপ্লিকেট হয় না) + ৪টি UI টেস্ট (real backlog দেখায়, নতুন প্রোফাইলে “ব্যাকলগ নেই”, কোনো দিন সীমার বেশি নয়, পূর্ণ দিনে “ছেড়ে দাও” আছে ও বসানোর বাটন নিষ্ক্রিয়)।
- **টেস্ট ৪৪০/৪৪০ (৫২ ফাইল)**।

## ৬ঝ. ধাপ ⑩ — ফোকাস বিশ্লেষণ, টাইমারের গুণ (v2.26) ✅

- **কেন:** টাইমার ছিল, কিন্তু “ভালো সময়” বনাম “শুধু সময়” আলাদা করার কোনো উপায় ছিল না। অ্যাডভান্সড তালিকার বাকি আইটেম (ফোকাস টাইমার) আগেই ছিল—তাই নতুন কিছু বানানো নয়, যা ছিল তার **গুণ** যোগ করা হলো।
- **কী:** `src/focus.ts` — `sittingsOf` (৩০ মিনিট ফাঁক = নতুন সিটিং; দিন বদলালে কখনো জোড়ে না), `dhakaHour`/`partOfDay` (৫টা থেকে পড়ার দিন), `continuousMinutesToday`, `focusReport` (KPI, ২৪ ঘণ্টার হিস্টোগ্রাম, বিষয়ভিত্তিক ভাগ, ইনসাইট, caveats), `focusActions`।
- **নীতিগত সিদ্ধান্ত:** “ফোকাস স্কোর” বানানো হয়নি। সেশন কত মিনিট ছিল তা জানা যায়, মন কতটা ছিল তা নয়—ভুয়া স্কোরের বদলে যা মাপা যায় তাই দেখানো হয়েছে, আর caveats-এ স্পষ্ট লেখা “মনোযোগের গুণ নয়”।
- **ডেভে ধরা সমস্যা:** (১) টেস্ট ফিক্সচারে ধরে নিয়েছিলাম সময়গুলো জোড়া লাগবে—আসলে ফাঁক ছিল, ইঞ্জিন ঠিকই আলাদা করেছিল; ফিক্সচার ঠিক হলো (২৫+৫=৩০, ৫০ নয়)। (২) “এখন” সেশন শেষের ২ ঘণ্টা পরে ধরে নেওয়ায় বিরতি-সংকেত সত্যিই শূন্য ছিল—সময় বাস্তবসম্মত করা হলো। (৩) ঘণ্টা-অক্ষরে বাংলা সংখ্যা হার্ডকোড করায় i18n গার্ড (প্রতিটি ছোট লেবেল অনূদিত কি না) প্রায় ধরেই ফেলেছিল—এখন `bn()` থেকে আসে।
- **UI:** টাইমার স্ক্রিনে ২৮ দিনের রিপোর্ট + “এখন কী করবে” কার্ড; একটানা ৫০ মিনিটে `break-chip`।
- **পরীক্ষা:** ২০টি ইউনিট + ৫টি UI (সেশনহীন প্রোফাইলে অঙ্ক বানায় না, সেরা ঘণ্টা কেবল ডেটা থাকলে, লম্বা সিটিংয়ে বিরতির সতর্কতা, অ্যাকশন ≤৩)।
- **টেস্ট ৪৬৫/৪৬৫ (৫৪ ফাইল)**।

## ৬ঞ. ধাপ ⑪ — পরীক্ষার পোস্টমর্টেম: “নম্বর কোথায় গেল” (v2.27) ✅

- **কেন:** পরীক্ষা সিমুলেটরের নম্বর, গ্রেড ও অধ্যায়-ব্রেকডাউন ছিল, কিন্তু **কারণ** ছিল না। শিক্ষার্থীর আসল প্রশ্ন “আমি জানি না, নাকি সময় পাইনি?”—উত্তরটা এখন গোনা হয়।
- **কী:** `src/examAnalysis.ts` — `examPostmortem` (উত্তরহীন/ভুল/প্রশ্নপ্রতি সময়/লেজ ফাঁকা/দ্রুত শেষ/জানার ঘাটতি), `tailBlanks`, `longestWrongRun`, `repeatedWrongOption`, `questionIndex`, `median`।
- **নমুনা-গেট (গুরুত্বপূর্ণ):** কোনো দাবি সংখ্যা ছাড়া করা হয় না—জানার ঘাটতি ≥৩ ভুল ও ≥২৫%; লেজ ফাঁকা ≥৩ প্রশ্ন; প্রবণতা ≥৩ পরীক্ষা; অধ্যায় দুর্বল কেবল ≥৪ প্রশ্নে। নাহলে পেজ বলে “এখনো অপর্যাপ্ত”।
- **ডেভে ধরা বাগ:** (১) `wrongRate` ভগ্নাংশ (০.৪) পাঠিয়ে ২৫%-এর সঙ্গে তুলনা করা হচ্ছিল—জানার ঘাটতি কখনোই ফায়ার করত না; শতাংশে বদলে ঠিক হলো। (২) বাংলা বাক্যে লাতিন `1` ঢুকে গিয়েছিল → `bengaliNumber()`। (৩) পরীক্ষার আগে ১০ প্রশ্ন দেখিয়ে পাতলা পুলে ৪টি দেওয়া হতো → `paperCapacity()` এখন আগেই সত্যি সংখ্যা বলে।
- **UI:** ফলাফলে “নম্বর কোথায় গেল” কার্ড; সেটআপে গত পরীক্ষার প্রবণতা কার্ড (খালি অবস্থায় কিছুই দেখায় না)।
- **ডেভ-টেস্ট সমস্যা:** জেনারেট করা প্রশ্নের আইডি ব্যাংকে না থাকায় হিসাব থেকে বাদ যায়—পেজ সেটাও গুনে বলে দেয়।
- **পরীক্ষা:** ১৬টি ইউনিট + ৪টি UI + examSim-এ ৩টি capacity টেস্ট।
- **টেস্ট ৪৮৮/৪৮৮ (৫৬ ফাইল)**।

## ৬ট. ধাপ ⑫ — অ্যাপ অডিট (v2.28): দাবি নয়, হিসাব ✅

- **কেন:** প্রতিটি স্ক্রিন সংখ্যা দেখায়; কোনো পেজ বলে না সংখ্যাগুলো কোথা থেকে এল, আর কোথায় অ্যাপ এখনো দুর্বল।
- **কী:** `src/selfAudit.ts` — `selfAudit()` ৯টি চেক (অধ্যায়, ব্যাংক, দুই জেনারেটরের আউটপুট ও যাচাই, ডুপ্লিকেট, কাগজ-ক্ষমতা, ৮-ঘণ্টার সীমা, টাইমার, স্টোরেজ সীমা), `auditHeadline()` সবচেয়ে দুর্বল চেক দেখায়, `bnNum()`।
- **মাপা সত্য (এই মুহূর্তে):** ব্যাংক ৪৭১ · তথ্যভিত্তিক ১৩০ · সূত্র ৪৯ স্কিমা/১৫৯ প্রশ্ন · যাচাই-ত্রুটি ০ · ডুপ্লিকেট ০ · **১০-প্রশ্ন কাগজ: ২০/১১৪ অধ্যায়**।
- **নীতি:** হেডলাইন কখনো “সব ঠিক” বলে না যদি কোনো চেক ওয়ার্নিং হয়; প্রতিটি ওয়ার্নিংয়ের পাশে সংখ্যা থাকে। সীমাগুলো (সার্ভার নেই, ওয়েবে পুশ নেই, আনুমানিক গ্রেড) আলাদা তালিকায়।
- **টেস্টে প্রমাণ:** একটি টেস্ট কৃত্রিম ব্যর্থ চেক বসিয়ে দেখে হেডলাইন “ব্যর্থ” বলে; অন্যটি দেখে একটি ওয়ার্নিংই সবুজ হেডলাইন বানাতে পারে না।
- **টেস্ট ৫০৩/৫০৩ (৫৮ ফাইল)**।

## ৬ঠ. ধাপ ⑬ — প্রশ্নের গভীরতা (v2.29): ৩৬ → ০ পাতলা অধ্যায়

- **কেন:** অডিট পেজই দেখিয়ে দিয়েছিল—১১৪টির মধ্যে ৩৬টি অধ্যায়ে ৫টিরও কম প্রশ্ন; ১০ প্রশ্নের কাগজ বানাতে পারত কেবল ২০টি।
- **কী:** `src/quiz-depth.ts` — ২৫০টি নতুন MCQ, সবই পাঠ্যবইয়ের তথ্য/সূত্র থেকে; প্রতিটিতে ৪টি আলাদা অপশন ও ব্যাখ্যা। আইডি আলাদা `deep-` রেঞ্জে, তাই পুরোনো `seed-` আইডি (যেগুলো attempts/retry ল্যাডারে সংরক্ষিত) কখনো বদলায় না।
- **সৎ সংশোধন:** প্রথম ব্যাচে ৪৩টি প্রশ্ন পুরোনো ব্যাংকের সঙ্গে প্রায়-হুবহু ছিল। প্যাডিং রাখার বদলে **বাদ** দিয়ে আলাদা তথ্য দিয়ে ভরা হলো; এখন ডুপ্লিকেট **০**, যা একটি টেস্ট স্থায়ীভাবে যাচাই করে।
- **আসল বাগ:** `Practice.tsx`-এর “শুধু আমার প্রশ্ন” ফিল্টার `id.startsWith('seed-')` দেখত। নতুন রেঞ্জ যোগ করলে ব্যাংকের প্রশ্ন ছাত্রের নিজের প্রশ্ন হিসেবে দেখাত। এখন `QuizQuestion.bank` ফ্ল্যাগ—একটি টেস্টও যোগ করা হয়েছে।
- **ফল (অডিট পেজ নিজেই মাপে):** ব্যাংক ৪৭১ → **৭২১**; ≥৫ প্রশ্ন: **৭৮ → ১১৪/১১৪**; ১০-প্রশ্ন কাগজ: **২০ → ৪২**; সব ৯টি চেক **ok**, হেডলাইন প্রথমবার সবুজ—এবং সেটা যোগ্যতা অর্জন করেই।
- **টেস্ট ৫১২/৫১২ (৫৯ ফাইল)**: নতুন ৯টি ডুপ্লিকেট-গার্ড + ৩টি পুরোনো টেস্ট আপডেট (পুরোনো সংখ্যা নয়, নিয়ম যাচাই করে)।

## ৬৮. ধাপ ⑭ — সব অধ্যায়ে ১০+ প্রশ্ন (v2.30): ৭২ → ০

- **কেন:** ⑬-এর পরেও ৭২টি অধ্যায়ে ১০টির কম প্রশ্ন ছিল; “১০ প্রশ্নের কাগজ” বাছলে পুল ছোট হলে কাগজটাই ছোট হয়ে যেত।
- **মাপা আগে:** প্রতি অধ্যায়ে **হাতে লেখা প্রশ্নের** প্রকৃত ঘাটতি মাপা হলো (examPool নয়, কারণ জেনারেটর কৃত্রিমভাবে পুল বড় দেখায়)—মোট ঘাটতি **১৮৯টি**।
- **কী:** `src/quiz-depth-2.ts` → `DEPTH_QUESTIONS_3`, **৪৫৫টি** নতুন MCQ; ব্যাংক **৭২১ → ১১৭৬**; আইডি `more-` রেঞ্জে (append-only)।
- **নকল-শিকার:** ৯টি নকল স্টেম ধরা পড়ে (৭ নতুন + ২ পুরোনো ক্রস-অধ্যায়) — সবই আলাদা তথ্য দিয়ে প্রতিস্থাপিত; ডুপ্লিকেট এখন **০**।
- **দূষণ-স্ক্যান:** ২টি ভুল (আরবি/ফারসি অক্ষর, `t্বরণ`) ধরা পড়ে সারানো; allowlist স্ক্যান পরিষ্কার।
- **নিয়ম-টেস্ট:** ৩টি পুরোনো টেস্ট “পাতলা অধ্যায় আছে” ধরে নিয়েছিল—নিয়মে বদলানো হলো (ক্ষমতা ≤ পুল, তালিকা থাকলে তবেই দেখাও)।
- **ফল (অডিট নিজেই):** ১০-প্রশ্ন কাগজ **৪২ → ১১৪/১১৪**, পাতলা তালিকা **খালি**, প্রতি অধ্যায়ে **১০–১৫** (গড় ১০.৩), ৯টি চেকই **ok**।
- **টেস্ট ৫১৬/৫১৬ (৫৯ ফাইল)**।

## ৬৯. ধাপ ⑮ — Golden A+ পথ-হিসাব (v2.31): অনুমান বাদ, নিয়মে হিসাব

- **সমস্যা:** GPA ক্যালকুলেটর ছিল, কিন্তু “লক্ষ্য পূরণে আর কত” গোনা হতো না। সহজ পথ ছিল ভবিষ্যৎ নম্বর অনুমান করা—সেটাই প্রতারণা হতো।
- **সমাধান:** `src/golden.ts` — বোর্ডের নিয়মে বিশুদ্ধ গাণিতিক হিসাব: ৩০ পয়েন্টের ঘাটতি, বোনাসে নষ্টযোগ্য পয়েন্ট (আবশ্যিক পয়েন্ট + বোনাস − ৩০), প্রতি বিষয়ের A+ পর্যন্ত দূরত্ব, এবং অসম্পূর্ণ প্রোফাইলে সৎ “বাকি”।
- **নিয়ম যাচাই:** সব সংখ্যা `gpa.ts`-এর `calculateGpa` থেকেই মেলানো হয়; ২১টি ইউনিট টেস্টের মধ্যে কয়েকটি আসল বোর্ড কেস ধরে (এক বিষয় A-তেও GPA ৫.০০ থাকে বোনাসে; তিন পয়েন্টের বেশি নষ্ট হলে ৫.০০ ভাঙে)।
- **অডিটে দশম চেক:** নমুনা প্রোফাইলে হিসাব আবার কষে দেখা হয়—নিয়ম ড্রিফট করলে চেক ব্যর্থ হবে।
- **ডেভে ধরা:** লাতিন `২০` (বাংলা বাক্যে), অননূদিত `/৩০`, আর প্রথম খসড়ার ভবিষ্যদ্বাণীমূলক মডেল—তিনটিই সারানো।
- **টেস্ট ৫৪৫/৫৪৫ (৬৩ ফাইল)**।

## ৭. পরের ধাপে সিদ্ধান্ত দরকার

**⑦ AI-সহায়ক প্রশ্ন (ঐচ্ছিক)** — এখন সবকিছু অফলাইন; প্রশ্ন তৈরি হয় তথ্যপুল থেকে, তাই "আমার জন্য নতুন প্রশ্ন" সীমিত। পরবর্তী বড় ধাপ হতে পারে **AI-সহায়ক জেনারেশন** (ব্যাকএন্ড/API লাগবে) — কিন্তু তখন যাচাই-গেটই থেকে যাবে সুরক্ষা: মডেল যা-ই দিক, সঠিক উত্তর ব্যাংকে মিললে তবেই প্রশ্ন পেপারে ঢুকবে। সিদ্ধান্ত প্রয়োজন: সার্ভার-নির্ভরতা নেব কি না, নাকি ⑦ হিসেবে **সিলেবাস হিটম্যাপ**-এর মতো সম্পূর্ণ অফলাইন ফিচার আগে নেই।

## ৬. v2.32 — UI/UX অডিট ফলাফল (কী ভাঙা ছিল, কী সারানো হলো)

সব ফলাফল **টেস্টে পরিণত** হয়েছে, তাই আবার ভাঙলে CI ধরে ফেলবে।

| খুঁজে পাওয়া সমস্যা | প্রমাণ | সমাধান |
|---|---|---|
| ৩টি পেজে `className="page"` — CSS-এ `.page` নেই | `ui.a11y.test.tsx` (`.view` মাউন্ট না হওয়ায় ফেল) | `.view` ক্লাস, ২৩/২৩ ভিউ |
| নোট স্ক্যানারে ২টি নামহীন ফাইল-ইনপুট | same test (`input.sr-only` × ২) | `aria-label` + `tabIndex={-1}` |
| টাইমার সত্যিই টিক করে কি না — প্রমাণ ছিল না | `ui.timer.test.tsx` (নতুন) | সংখ্যা, পজ, রিজিউম, ডেডলাইন, অটো-সেভ ৩/৩ পাস |
| পরীক্ষার ঘড়ি নিজে জমা দেয় কি না — প্রমাণ ছিল না | `ui.examClock.test.tsx` (নতুন) | সেকেন্ড-ধরে পতন + অটো-সাবমিট ২/২ পাস |
| ইংরেজি মোডে ১,৪১৮টি বাংলা ইন্টারফেস-টেক্সট | `ui.english.test.tsx` (নতুন) | ০ — ২০+ ফাইলে `t()` |
| ৮৯টি টোস্ট বার্তা বাংলায় (`notify`, `.view`-এর বাইরে) | উৎস-স্ক্যান টেস্ট | ০ — সব `t()` |
| `PRIORITY_LABEL`/`PHASE_LABEL` মডিউল-লেভেলে `t()` — ভাষা বদলাত না | কোড পড়ে ধরা | ফাংশনে রূপান্তর |
| কনট্রাস্ট ২.৪২:১ – ৪.২৮:১ (AA ফেল) | `ui.contrast.test.ts` (নতুন) | ৫.৫:১ / ৭.০:১ |
| টাচ-টার্গেট ২২–২৩px | CSS মাপ | ন্যূনতম ৩২px |
| `această` (রোমানিয়ান) শব্দ কোডে | ইংরেজি-মোড টেস্ট | সরানো |

**মোট:** ৭০ ফাইল / **৬৫০ টেস্ট** পাস · `tsc` পরিষ্কার · build সফল।

## ৬৭. ধাপ ⑯ — জেনারেটরের গভীরতা (v2.33): ১৩০ → ৮৫৬ তথ্য

| আগে | পরে |
|---|---|
| তথ্যপুল ১৩০টি | **৮৫৬টি** (৭২৬টি ব্যাংক থেকেই উদ্ধার) |
| ৯৮/১১৪ অধ্যায়ে মাত্র ১টি প্রশ্ন | **১১৪/১১৪ অধ্যায়ে ১০ প্রশ্নের পূর্ণ পেপার** |
| সর্বোচ্চ ২টি প্রশ্ন/অধ্যায় | সর্বোচ্চ **১৩টি** |
| `verifyGenerated` ত্রুটি ০ | ত্রুটি **০** (আগের গেট অপরিবর্তিত) |

**পদ্ধতি:** একটি তথ্য কেবল তখনই গৃহীত হয় যখন (ক) অধ্যায় মেলে, (খ) ব্যাংকের সারিতে ব্যাখ্যা আছে, (গ) হাতে লেখা কোনো তথ্যের উত্তর এর সঙ্গে মেলে না, (ঘ) অধ্যায়ের নিজের distractor তালিকায় উত্তরটি নেই। প্রশ্ন/উত্তর/ব্যাখ্যা — সবই আগে থেকেই শিপ করা, নতুন কিছু লেখা হয়নি।

**খোলাখুলি সীমা:** ৩টি অধ্যায় এখনো ৩-এর কম তথ্যের; ব্যাংকের ৩৯৯টি প্রশ্নে ব্যাখ্যা নেই; ব্যাংক বাংলা-কেন্দ্রিক, তাই ইংরেজি মোডেও ব্যাংকের প্রশ্ন বাংলায় আসে।

## ৬৮. প্রশ্নের উৎস ও ইংরেজি-মোডের স্ক্রিপ্ট বাগ (v2.34)

| যা যাচাই করা হলো | কীভাবে | ফল |
|---|---|---|
| ব্যাংকে বোর্ড/সালের তথ্য আছে কি | `grep "source:"` + মানচিত্র | **নেই** — ১১৭৬টি প্রশ্নে শূন্য বোর্ড-মেটাডেটা; হেডারেই লেখা “বোর্ড প্রশ্নপত্র নয়” |
| প্রতি অধ্যায়ে বোর্ড ভিডিও | `CLASS_CATALOG` গুনে | **১৭/১১৪** অধ্যায়ে আছে, **৯৭টিতে নেই** → কোনো অধ্যায়ভিত্তিক “বোর্ড প্রশ্ন” দাবি করা যায় না |
| সার্চ-লিংক ক্লাস হিসেবে গোনা হয় কি | `sources.ts` | **না** — ৭৫৬ যাচাই + ৬৩৬ সার্চ আলাদা |
| ইংরেজি মোডে অপশনের ভাষা | `buildQuestion` পড়া + ১১৪ অধ্যায় চালানো | **বাগ ছিল:** সঠিক উত্তর বাংলায়, ভুল অপশন ইংরেজিতে → স্ক্রিপ্টেই উত্তর ধরা পড়ত |
| ইংরেজি মোডে বাংলা লিক | ২৪২টি প্রশ্ন | **০** |
| `verifyGenerated` দুর্বল হয়েছে কি | হাতে বদলানো উত্তর ও id দিয়ে আক্রমণ | **না** — দুটোই `fact-not-in-bank`; বৈধ প্রশ্ন পাস |
| বাংলা মোড অপরিবর্তিত | ৮৫৬টি প্রশ্ন | **০ ত্রুটি** |

**নীতি:** অ্যাপ কোনো বোর্ড নাম বা সাল বানায় না। যেখানে বোর্ড প্রশ্নের প্রমাণ নেই, সেখানে লেখা থাকে “বোর্ড নয়” — এবং অধ্যায়-মোডাল ও অডিট পেজ দুই জায়গাতেই সংখ্যা-সহ লেখা থাকে।

**নতুন ফাইল:** `src/sources.ts` (উৎস রিপোর্ট), `src/sources.test.ts` (৭ টেস্ট), `src/chapterSource.ui.test.tsx` (৩ টেস্ট)।

## ৬৯. MCQ/CQ ক্লাসের ট্রান্সক্রিপ্ট থেকে বোর্ড প্রশ্ন (v2.35)

| যা যাচাই করা হলো | কীভাবে | ফল |
|---|---|---|
| ট্রান্সক্রিপ্ট আদৌ পাওয়া যায় কি | `fetch_page` × ৭ ভিডিও | **হ্যাঁ** — YouTube পেজ থেকে ক্যাপশন আসে |
| বাংলা ট্রান্সক্রিপ্ট ব্যবহারযোগ্য কি | LOBDHI `nSY4vz2QY4Q` | **হ্যাঁ** — ক্লাসেই “ঢাকা বোর্ড ২০২৪”, “দিনাজপুর ২০২৪” বলে |
| CQ সমাধানের ট্রান্সক্রিপ্ট | Physics Bichitra `6U3AwKCR3as` | **হ্যাঁ** — উদ্দীপক + (গ)(ঘ) পুরোটা পড়া যায় |
| সব চ্যানেল কাজ করে কি | উদ্ভাস `ep3FdeUNdiI` | **না** — ক্যাপশন ইংরেজি টুকরো |
| | Apurbo `y5fZs_pghyE` | **না** — ক্যাপশন দেবনাগরী |
| কত অধ্যায়ে বোর্ড প্রশ্ন হলো | `boardQuestions.test.ts` | **৯/১১৪** — বাকি ১০৫টিতে নেই, অ্যাপ সেটাই বলে |
| বোর্ড/সাল বানানো হয়েছে কি | টেস্টে `VALID_BOARDS` + ১৯৮৪–২০২৬ | **না** — প্রতিটির `evidence` ফিল্ড আছে |

**নীতি:** প্রতিটি প্রশ্নের সঙ্গে video id, চ্যানেল, শিরোনাম ও টাইমস্ট্যাম্প থাকে—এক ক্লিকে যাচাই করা যায়। যে ক্লাসে বোর্ডের নাম বলা হয়নি, সেখান থেকে কোনো প্রশ্ন নেওয়া হয়নি।

**নতুন ফাইল:** `src/boardQuestions.ts`, `src/boardQuestions.test.ts` (১০ টেস্ট), `src/boardQuestions.ui.test.tsx` (৩ টেস্ট)।

## ৭০. সব বিষয়ে খোঁজা: ৯ → ১৭ অধ্যায় (v2.36)

| বিষয় | খোঁজা হয়েছে | ফল |
|---|---|---|
| পদার্থ ২য় পত্র | Edu Marathon প্লেলিস্ট (৪৭ ভিডিও) | **৮টি নতুন অধ্যায়** — শিরোনামেই বোর্ড+সাল+অধ্যায় |
| রসায়ন ১ম পত্র | আগের ধাপে | ৪টি অধ্যায় |
| উচ্চতর গণিত ২য় পত্র | `iRR-9w5uoH8` ট্রান্সক্রিপ্ট | **বাদ** — ক্যাপশন আরবি হরফে |
| পদার্থ ১ম পত্র | LOBDHI + Physics Bichitra | ৫টি অধ্যায় |

**মোট:** ১০টি প্রশ্ন · ৫ বোর্ড · ৬/১১৪ অধ্যায় · ২৪টি কভারেজ-ক্লাস · ৩টি সোর্স বাতিল, কারণ-সহ সংরক্ষিত।

**নীতিতে কোনো শিথিলতা নেই:** কোনো প্রশ্নে বোর্ড/সাল অনুমান করা হয়নি; টেস্টে ৯টি বৈধ বোর্ড, ১৯৮৪–২০২৬ সাল, অধ্যায়-বিষয় মিল ও ১১-অক্ষরের video id বাধ্যতামূলক।

## ৭১. পূর্ণ পুনঃযাচাই — ৬টি আসল বাগ (v2.37)

| # | বাগ | প্রমাণ | সমাধান |
|---|---|---|---|
| ১ | ৬টি "নিউটনীয় বলবিদ্যা" প্রশ্ন `physics-1-3`-এ, অথচ ওটা **গতিবিদ্যা** | `data.ts` থেকে chapter title পড়ে | `physics-1-4`-এ সরানো |
| ২ | ময়মনসিংহ "ভৌত আলোকবিজ্ঞান" → `physics-2-6` (জ্যামিতিক) | নতুন টেস্ট প্রথম চালাতেই ধরল | `physics-2-7` |
| ৩ | "Periodicity" → `chemistry-1-1`; "গুণগত" → `chemistry-1-5` | ভিডিও শিরোনাম মিলিয়ে | `chemistry-1-3`, `chemistry-1-2` |
| ৪ | ইংরেজি মোডে Library ট্যাব বাংলায় | ইংরেজি মোডে চালিয়ে দেখা | `TABS`-এ `t()` |
| ৫ | ১১টি `EmptyState`-এ untranslated বাংলা | সোর্স স্ক্যান | সব `t()`-এ |
| ৬ | `Storage.tsx`-এ "această", লেখায় "또는" | স্ক্রিপ্ট স্ক্যান | সরানো |

**ফল:** ৩১টি প্রশ্ন (২৯ CQ + ২ MCQ) · ৯ বোর্ড · ২০২৩–২০২৫ · **১৫/১১৪ অধ্যায়** · পদার্থ ২৮ (১২ অধ্যায়), রসায়ন ৩ (৩ অধ্যায়)।

**নতুন রক্ষী:** `the chapter id matches the chapter the video names`, `never passes raw Bengali to EmptyState`, `counts the verified questions in the tab badge`, `Library tabs in English` — প্রতিটির ব্যর্থতা ইচ্ছাকৃত বাগ ঢুকিয়ে প্রমাণ করা হয়েছে।

## ৭২. "৩১টি বোর্ড প্রশ্ন" ছিল ৭টি প্রশ্ন + ২৪টি সারাংশ (v2.38)

> **কী পাওয়া গেল:** প্রতিটি এন্ট্রি ছাপিয়ে দেখা গেল ২৪টি এন্ট্রির `text` আসলে প্রশ্নই নয়—যেমন
> *"ভেক্টর অধ্যায়ের বোর্ড সৃজনশীল: লব্ধি ও উপাংশ সংক্রান্ত উদ্দীপক—(গ) ও (ঘ) ধাপে সমাধান।"*
> উদ্দীপক নেই, সংখ্যা নেই। ছাত্রের সমাধান করার মতো কিছু নেই।

| দিক | আগে (v2.36/v2.37) | এখন (v2.38) |
|---|---|---|
| বোর্ড প্রশ্নের সংখ্যা | ৩১ (দাবি) | **৭** (সত্যি, সমাধানযোগ্য) |
| কভারেজ-ক্লাস | প্রশ্নের সঙ্গে মিশে ছিল | **২৪**, আলাদা তালিকা ও আলাদা UI |
| রসায়ন | ৩টি "প্রশ্ন" | **০ প্রশ্ন**, ৩টি কভারেজ |
| অধ্যায় | ১৫/১১৪ | **৩/১১৪** |

**কেন এত বড় পার্থক্য:** আগের টেস্ট `text.length > 40` আর `includes('গ')` দেখত—সারাংশ দুটোই পাস করত।
নতুন টেস্টটা সম্পূর্ণ ভিন্ন জিনিস যাচাই করে: **text-এ "ধাপে সমাধান / সংক্রান্ত উদ্দীপক" থাকলে সেটা প্রশ্ন নয়**।
প্রথম চালাতেই ২৪টি ধরা পড়ে।

**যা বদলানো হলো:**
- `COVERED_BOARD_TOPICS` — নতুন, টাইপড কালেকশন (`topic` ফিল্ড, `text` নয়)।
- `Library.tsx` — আলাদা `.covered-board-block`, শিরোনাম "এগুলো প্রশ্ন নয়—ক্লাসের বিষয়বস্তু"।
- `sources.ts` — verdict-এ দুই সংখ্যা আলাদা করে বলা; `totals.coveredBoardTopics` যোগ।
- ৩টি নতুন টেস্ট + ২টি টেস্ট সংশোধিত, যাতে সংখ্যা ফুলে যাওয়া আর সম্ভব না হয়।

**শিক্ষা:** যাচাই করতে হবে **প্রশ্নটা সমাধান করা যায় কি না**, শুধু "একটা লাইন আছে কি না" নয়।

## ৭৩. রসায়নের তিনটি প্রশ্ন ফিরল — ট্রান্সক্রিপ্ট আবার পড়ে (v2.39)

v2.38-এ রসায়নের ৩টি এন্ট্রিকে "সারাংশ" বলে প্রশ্ন-তালিকা থেকে সরানো হয়েছিল। এবার সেই **একই তিনটি ক্লাসের ট্রান্সক্রিপ্ট লাইন-বাই-লাইন** পড়া হলো, এবং দেখা গেল প্রশ্নগুলো পুরোপুরি উদ্ধারযোগ্য ছিল — আগে শুধু সারাংশ লেখা হয়েছিল।

| অধ্যায় | উৎস | উদ্দীপক ও যা চাওয়া হয়েছে |
|---|---|---|
| `chemistry-1-2` গুণগত | `4bl5W2e3jxg` | হাইড্রোজেন বর্ণালী সিরিজ; (গ) বোর তত্ত্বে উৎপত্তি, (ঘ) বামার সিরিজ দৃশ্যমান কিনা (R = 1.097×10⁷ m⁻¹, 480–780 nm) |
| `chemistry-1-3` পর্যায়বৃত্ত | `sXPOZtZxHJw` | `(n−1)dˣ ns¹`; (গ) x-এর মান, (ঘ) M⁺ ডায়াচুম্বকীয় হলে ক্লোরাইড রঙিন? |
| `chemistry-1-4` রাসায়নিক পরিবর্তন | `5bcIy_xALfo` | A₂ + 3B₂ ⇌ 2AB₃; (গ) Kp প্রতিপাদন, (ঘ) সর্বোচ্চ উৎপাদনের তাপ/ঘনমাত্রা/চাপ |

**যা ইচ্ছাকৃতভাবে করা হয়নি:** `5bcIy_xALfo`-র টাইটেলে **২০২৩** কিন্তু শিক্ষক বলেন **"এইচএসসি ২০২৪"**। দুটোই ক্লাসের নিজের দাবি, পরস্পরবিরোধী। নীরে করে একটা বেছে নেওয়া হয়নি — **টাইটেলের ২০২৩** রাখা হয়েছে (দৃশ্যমান, যাচাইযোগ্য) এবং এই দ্বিধাটি এখানেই লিপিবদ্ধ।

**যা চেষ্টা করে ব্যর্থ হয়েছি (লুকানো হয়নি):** জীববিজ্ঞান ১ম পত্রের চ্যাপ্টার-ভিত্তিক ক্লাস (`5moBPM3myvk`) — পেজ ট্রান্সক্রিপ্টের বদলে কাঁচা JavaScript ফেরত দিল, তাই কিছু নেওয়া যায়নি। Udvash-এর গতিবিদ্যা ক্লাসে (`fV8WGJJwbNk`) আসল প্রশ্ন আছে, কিন্তু শিক্ষক শুধু **"১৯ সালের একটা প্রশ্ন"** বলেন, বোর্ডের নাম বলেন না — তাই এন্ট্রি করা হয়নি (নিয়ম: বোর্ড অনুমান নয়)।

**নতুন সংখ্যা:** ১০টি প্রশ্ন (৮ CQ + ২ MCQ) · ৫ বোর্ড · ৬/১১৪ অধ্যায় · ২৪ কভারেজ · ৬৫০ টেস্ট।

## ৭৪. শেষ পুনঃযাচাই — ব্যাংকের ভেতরে দুটি বিষফল (v2.39)

| # | বাগ | কী ক্ষতি হচ্ছিল | সমাধান |
|---|---|---|---|
| ১ | জীববিজ্ঞান MCQ-র **সঠিক উত্তর** অপশন ছিল `সেলুলোজ만` | কোরিয়ান `만` লেগে থাকায় ছাত্র ভুল বানান শিখত—আর এটাই ছিল সঠিক উত্তর | `সেলুলোজ` |
| ২ | ফ্ল্যাশকার্ড লেবেল `কার드의 ধরন` | কোরিয়ান অক্ষর, বাংলা পড়তে গিয়ে আটকে যেত | `কার্ডের ধরন` |

**নতুন স্থায়ী রক্ষী:** `quiz-bank.test.ts` এখন ব্যাংকের **১১৭৬টি প্রশ্নের প্রতিটি প্রশ্ন ও চারটি অপশন** স্ক্যান করে আরবি/দেবনাগরী/সিরিলিক/কোরিয়ান/জাপানি/চীনা অক্ষর খোঁজে। বাগটা ইচ্ছাকৃতভাবে ফিরিয়ে টেস্ট **ব্যর্থ** হওয়া যাচাই করা হয়েছে — এবং সেই চেক তখনই **দ্বিতীয় একটি ঘটনাও** ধরে ফেলেছিল।

**ব্যাংকের স্বাস্থ্য (মাপা):** ১১৭৬টি প্রশ্ন · ০ ডুপ্লিকেট id · ০ ডুপ্লিকেট টেক্সট · ০ ভুল গঠন · ০ খালি অপশন।

**একটি ভুল যা আমি নিজে করেছি এবং নিজেই ধরেছি:** প্রথমে `[...STARTER_QUESTIONS, ...BANK_QUESTIONS]` জোড়া দিয়ে "৪১২টি ডুপ্লিকেট" রিপোর্ট করেছিলাম। আসলে `STARTER_QUESTIONS`-এর ভেতরেই `BANK_QUESTIONS` আছে, তাই একই প্রশ্ন দুবার গোনা হচ্ছিল — **আসল ডুপ্লিকেট শূন্য**। স্ক্রিপ্টের ভুল, ডেটার নয়।

**মোট:** ১০টি বোর্ড প্রশ্ন (৮ CQ + ২ MCQ) · ৫ বোর্ড · ৬/১১৪ অধ্যায় · ২৪ কভারেজ-ক্লাস · ৬৫০ টেস্ট · `tsc` ও build পরিষ্কার।

## ৭৫. UI/UX + সব ফিচার যাচাই — যা ভাঙা ছিল, সব ঠিক (v2.40.0)

ব্যবহারকারীর নির্দেশ: "ui/ux plus e sob kicu tiktak kaj koreki na check kore tik koro" — শুধু রিপোর্ট নয়, ভাঙা জিনিস **ঠিক** করতে হবে।

**যা যাচাই করা হলো (প্রমাণসহ):**

- ২২টি রুটেই `.view` মাউন্ট হয়, শিরোনাম ও আসল লেখা আছে, কোনো React এরর/ওয়ার্নিং নেই — `src/ui.routes.test.tsx`।
  প্রমাণ যে এই গার্ড সত্যিই ধরতে পারে: থ্রেশহোল্ড ৪০ → ৬০০০০ করলে ২২টির মধ্যে ২১টি ব্যর্থ হয়, তারপর ফিরিয়ে আনা হয়।
- মোবাইল লেআউট: ৩৬০px-এ কোনো ইনলাইন fixed width নেই, CSS-এ `minmax(0,…)`-এ grid shrink করে, ৭৯টি media query আছে — `src/ui.layout.test.tsx`।
- ডেটা টিকে থাকে: ফ্ল্যাশকার্ড তৈরি, লাইব্রেরিতে নোট লেখা, পরীক্ষার নম্বর — সব localStorage-এ সেভ হয় — `src/ui.persistence.test.tsx` (৩টি টেস্ট)।
- মূল লুপ: "সম্পন্ন করো" চাপলে ধাপ সেভ হয়, সিলেবাসে অগ্রগতি ০ → ১/২৪ হয় — `src/ui.flow.test.tsx` (২টি টেস্ট)।
- ডিপ-লিংক: ৭টি রুট সরাসরি রিলোড করলে সঠিক ভিউ আসে; নেভিগেশন আর backtracking কাজ করে।
- অ্যাক্সেসিবিলিটি: ২২টি রুটের **প্রতিটি** বাটনের নাম আছে এবং প্রতিটি input/select/textarea-র লেবেল বা aria-label আছে — `src/ui.a11y.test.tsx`।

**যা ভাঙা ছিল এবং ঠিক করা হলো:**

1. **`FullBackup`-এর ফাইল ইনপুট লেবেলহীন** (`src/components/FullBackup.tsx`) — `hidden` ইনপুটে `aria-label` যোগ করা হলো। অ্যাক্সেসিবিলিটি টেস্ট আগে ব্যর্থ হয়েছিল, এখন ২২/২২ পাস।
2. **`EmptyState` কোনো অনুবাদ করত না** (`src/components.tsx`) — এখন `titleEn`/`descriptionEn` নেয় এবং `t()` দিয়ে রেন্ডার করে, ঠিক `PageHeading`-এর মতো।
3. **English মোডে ৫১+ বাংলা UI-বাক্য লিক** — `Analytics`, `Calendar`, `Exams`, `Library`, `Practice`, `Reminders`, `Revision`, `Settings`, `Timer` — সব `t()`-এ মুড়ে দেওয়া হলো। এগুলোর মধ্যে ছিল সম্পূর্ণ অনুচ্ছেদ (১১০+ অক্ষর), যা আগের `i18n` গার্ড **দীর্ঘ-কপি হিসেবে ছেড়ে দিত**।
4. **`Revision.tsx`-এর জন্য পুরোনো গার্ড টেস্টটাই ভুল ছিল** — "keeps the long-form study copy in Bangla" দাবি করত দীর্ঘ কপি বাংলাতেই থাকবে, যা লিক তৈরি করছিল। বদলে দেওয়া হলো: ""দীর্ঘ কপিও অনূদিত হতে হবে""।
5. **`Exams.tsx` `verdictEn` ব্যবহারই করত না** — শুধু `plan5.verdictBn` রেন্ডার করত। এখন `isEnglish()` অনুযায়ী বাছাই হয়।
6. **`gpa.ts`-এর `gpaTargetLabel()`** — ৫টি রিটার্ন স্ট্রিং সবই বাংলা-কেবল ছিল, এখন দ্বিভাষিক।
7. **`heatmap.ts`-এর প্রস্তুতি-বাক্য, `focus.ts`-এর caveat, `questionGen.ts`-এর `ENGINE_LABEL`/`GENERATED_SOURCE`, `backup.ts`-এর ব্যাকআপ-বয়স, `data.ts`-এর `SYLLABUS_NOTE`** — সব দ্বিভাষিক।
8. **`selfAudit.ts`**: `value` ফিল্ড বাংলা-কেবল ছিল (যেমন "৪৯ স্কিমা") — `valueEn` যোগ করা হলো, `Audit.tsx` সেটি ব্যবহার করে।
9. **`cadence.ts` ও `Settings.tsx`**: সপ্তাহের দিনের নাম হার্ডকোডেড বাংলা — এখন `weekdayName()` ব্যবহার করে, তাই English মোডে `Mon`, `Tue` আসে।
10. **`planner.ts`-এর ৪টি টাস্ক-ডিটেইল টেমপ্লেট** বাংলা-কেবল ছিল (`হাতে-কলমে`, `২টি CQ ও ১৫টি MCQ`) — এখন `isEnglish()` শাখা আছে।
11. **২৬টি form validation এরর** (`setError`/`setStatus`) বাংলা-কেবল ছিল — সব `t()`-এ।
12. **`Pdfs.tsx`**: `PDF_MATERIALS`-এর `en` নাম থাকা সত্ত্বেও `item.bn` সরাসরি রেন্ডার হচ্ছিল, আর `PDF_MATERIAL_LABEL()` `en` প্যারামিটার পাচ্ছিল না।
13. **একক-শব্দ লিক**: `ঘণ্টা 0 মি.`, `4 সেশন · 8ঘ`, `0 দিন`, `0 ব্লক`, `লক্ষ্যের`, `পরিকল্পিত` — সব `t()`-এ।

**আমার নিজের ভুল, যা এই রাউন্ডে ধরেছি:**

- প্রথম "dead button" sweep ভুল রিপোর্ট করেছিল — আমি `body.innerHTML`-এর দৈর্ঘ্য মাপছিলাম, যা ক্যাশের কারণে বদলায় না। সঠিক পদ্ধতিতে (hash + `.view` টেক্সট + modal উপস্থিতি) দেখা গেল **সব বাটনই কাজ করে**।
- এরপর ভেবেছিলাম `#examsim`-এ ক্র্যাশ হচ্ছে; আসলে সমস্যা ছিল আমার টেস্টের সেটআপে (`hashchange` ফায়ার করা হচ্ছিল না)। নতুন `render` দিয়ে প্রতি রুট আলাদা খুললে ২২/২২ পাস।
- `completedAt` কী খুঁজে "ধাপ সেভ হচ্ছে না" বলেছিলাম — ভুল; আসল কী `data.completed` (ম্যাপ)। সঠিক কী দিয়ে মাপলে টেস্ট পাস করে।
- কনটেন্ট-শব্দভাণ্ডার তৈরির সময় `PAPER_NAMES`/`chapter.number` বাদ পড়ায় `পদ্য ১`-কে লিক ভাবছিলাম; `chapter()`-এর তৃতীয় আর্গুমেন্ট `title` নয়, `number` — এটা দেখে ঠিক হয়।

**মোট:** ৬১২টি টেস্ট (৭৪ ফাইল) পাস · `tsc --noEmit` পরিষ্কার · `npm run build` ✓ ৪.৭ সেকেন্ড। English মোডে **০টি** বাংলা UI-লিক (কনটেন্ট বাদে, যা ইচ্ছাকৃত)।

## ৭৬. পুনঃযাচাই + অ্যাপ চালু করে দেখা (v2.40.1)

ব্যবহারকারী: "abar chek kore tik koro and akn oura app dekba" — আবার যাচাই করে ঠিক করো, আর এবার অ্যাপটা চালু করে দেখাও।

**অ্যাপ চালু করা হলো (লাইভ প্রিভিউ):**

- `npm run dev` → `0.0.0.0:3000`। পোর্ট ৩০০০–৩০০৩ আগের সেশন থেকে দখলে ছিল, তাই সেই চারটি পুরোনো Vite প্রসেস বন্ধ করে ৩০০০-এ ফিরিয়ে আনা হয় — যাতে প্রিভিউ ঠিক জায়গায় খোলে।
- `/` → **২০০** · `src/main.tsx` → **২০০** · সব মূল মডিউল (App, planner, i18n, Today, Heatmap, FullBackup, styles.css) → **২০০**।
- প্রিভিউ-হোস্ট যাচাই: `Host: 3000-<sandbox>.e2b.app` দিয়ে রিকোয়েস্ট → **২০০** (Vite-এর host-check ব্লক করছে না)।
- **সীমা খোলাখুলি:** এই স্যান্ডবক্সে ব্রাউজার বাইনারি নেই (`playwright install chromium` ডাউনলোড ব্লকড), তাই আমি নিজে স্ক্রিনশট নিতে পারিনি। ভিজ্যুয়াল প্রমাণ ব্যবহারকারীর ব্রাউজারেই আসবে; কোড-স্তরে যাচাই হলো jsdom-এ।

**নতুন স্থায়ী গার্ড — `src/ui.preview.test.tsx`:**

1. **প্রথম-বার ব্যবহারকারীর পথ:** সম্পূর্ণ খালি `localStorage` থেকে অ্যাপ বুট হয়, নিজে থেকেই প্রোফাইল লেখে, আর খালি প্রোফাইলেও স্ক্রিনে ৫০০+ অক্ষরের আসল পরিকল্পনা থাকে (ফাঁকা স্ক্রিন নয়)।
2. **সাইডবার থেকেই সব স্ক্রিন:** ২১+ nav আইটেমে সত্যিকারের ক্লিক করে প্রতিটির `.view`-এ ৪০+ অক্ষর পাওয়া যায় — অর্থাৎ ভিজিটর যেভাবে ঘোরে, সেভাবেই।

**নিরাপত্তা/সততা পুনঃযাচাই (মাপা):** ১০টি বোর্ড প্রশ্ন · ২৪ কভারেজ · ৩ বাতিল · ব্যাংক ১১৭৬ · ০ ডুপ্লিকেট id · ০ ডুপ্লিকেট টেক্সট · ০ ভুল গঠন · বোর্ড ৫টি (ঢাকা, দিনাজপুর, বরিশাল, কুমিল্লা, রাজশাহী) · সাল ২০২৩–২০২৫ · ৬/১১৪ অধ্যায়।

**মোট:** ৬১৪টি টেস্ট (৭৫ ফাইল) পাস · `tsc --noEmit` পরিষ্কার · `npm run build` ✓ · লাইভ প্রিভিউ ৩০০০ পোর্টে চলছে।

## ৭৭. CI-তে APK বিল্ড ফেল — আসল কারণ ও সমাধান (v2.40.2)

PR #11 মার্জ হলো (`58b8aed`)। মার্জের পর `Android APK` ওয়ার্কফ্লো **"Unit and UI tests" ধাপে ব্যর্থ** হলো, যেখানে Pages ডিপ্লয় পাস করল — অথচ লোকালে ৬১৪/৬১৪ পাস।

**লগ প্রথমে পাওয়া যায়নি:** `gh run view --log-failed` এবং jobs-logs API দুটোই Azure blob-এ রিডাইরেক্ট করে, যা এই স্যান্ডবক্সে ব্লকড। সমাধান — **jog annotations** (`check-runs/<id>/annotations`), সেখানেই আসল ব্যর্থতা ছিল:

> `src/restore.app.test.tsx:45` — `restore.app.test.tsx > database restoration while editing > keeps an invalid snapshot for recovery instead of replacing the mirror`
> `AssertionError: expected undefined to be 2`

**আসল বাগ (টেস্টের, অ্যাপের নয়):** `App.tsx`-এ `preserveSnapshot()` **সিঙ্ক্রোনাসে** `RECOVERY_KEY` লেখে, কিন্তু আসল প্রোফাইল `STORAGE_KEY`-তে যায় আলাদা `useEffect` → `saveData()`-এর মধ্য দিয়ে, পরে। টেস্ট `RECOVERY_KEY`-এর জন্য `waitFor` করে তারপরই **সিঙ্ক্রোনাসে** `STORAGE_KEY` পড়ছিল। লোকালে ইফেক্ট আগেই শেষ হয়ে যেত; ধীর CI রানারে এখনো হয়নি — তাই `undefined`।

**সমাধান:** `STORAGE_KEY`-র জন্যও আলাদা `waitFor`। এতে assertion দুর্বল হয়নি — version, পুনরুদ্ধার-অটুটতা ও "persist ডাকা হয়নি" তিনটিই অপরিবর্তিত।

**প্রমাণ (দাবি নয়, মাপা):**
- ঠিক করা ফাইল ৫ বার ধারাবাহিক পাস (flaky নয়)
- **Mutation check:** প্রত্যাশিত version `2` → `3` করলে টেস্ট ফেল করে (`expected 2 to be 3`), ফিরিয়ে আনলে পাস — অর্থাৎ assertion সত্যিই কিছু প্রমাণ করে
- `CI=true` দিয়ে লোকালে পূর্ণ স্যুট: ৬১৪/৬১৪ পাস

**পূর্ণ গেট:** ৬১৪ টেস্ট (৭৫ ফাইল) · `tsc --noEmit` পরিষ্কার।

## ৭৮. ইনস্টল: APK + PWA (v2.41.0)

**মার্জ:** PR #11 (`58b8aed`) → `main`। মার্জের পর APK ওয়ার্কফ্লো ফেল করল (§৭৭), ফিক্স → PR #12 (`075f596`) → মার্জ। এখন **APK ও Pages — দুটোই সফল**।

**ভার্সন মিলানো হলো (আসল বাগ):** `package.json` ছিল `2.39.0`, কিন্তু Android `build.gradle`-এ `versionName "2.16.0"` ও `versionCode 20` — অর্থাৎ **ইনস্টল করা APK ভিতরে ২৩ ভার্সন পিছিয়ে ছিল**। এখন দুটোই `2.41.0`, `versionCode 21` (কোড বাড়াতে হয়, নাহলে Android আপডেট হিসেবে ইনস্টল করে না)।

**ইনস্টলের পথ (যাচাই করা):**
- `Android APK` ওয়ার্কফ্লো `main`-এ প্রতি পুশে চলে → debug APK আর্টিফ্যাক্ট (সর্বশেষ: `075f596`, সফল)।
- `v*` ট্যাগ চাপলে ওয়ার্কফ্লো নিজেই APK **GitHub Release-এ যুক্ত করে** (`Attach APK to GitHub Release`, `softprops/action-gh-release`) — হাতে আপলোডের দরকার নেই।
- PWA: `Build & deploy Pages` `main` থেকে ডিপ্লয় করে (সফল)।

**সীমা (খোলাখুলি):** arthis sandbox-এ আর্টিফ্যাক্ট ও রিলিজ-অ্যাসেট ডাউনলোড Azure/GitHub-asset হোস্টে রিডাইরেক্ট হয়, যা অনুমোদিত নয় — তাই আমি APK-টা নামিয়ে নিজে যাচাই করতে পারিনি। তবে স্টেপ-লেভেল প্রমাণ আছে: `Build debug APK: success`, `Collect artifacts: success`।

**সর্বশেষ:** ৬১৪ টেস্ট (৭৫ ফাইল) · `tsc` পরিষ্কার · Pages সফল · APK সফল।

</details>
