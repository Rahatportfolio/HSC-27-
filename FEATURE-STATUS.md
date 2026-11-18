# প্রস্তুতি · HSC 27 — current feature status

## v2.44.0 — Android screenshot/UI repair and 20 November start

**2.44.0 / Android code 24: PWA deployed; APK held as draft.** [PR #16](https://github.com/Rahatportfolio/HSC-27-/pull/16) merged as `98b949f1936c2ab754ddf4123949156640dbb058`; [Pages run 44265638550](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265638550) successfully deployed that source to the [public PWA](https://rahatportfolio.github.io/HSC-27-/). The [exact draft-APK audit](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44266592857) matched the tested web bundle but measured **a different certificate from v2.43.0**. The user reports no confirmed original signing keystore. No v2.44.0 APK publication was performed; do not uninstall/Clear data to work around the mismatch. PWA/APK storage is separate. Exact identities and release-hardening limits: [v2.44.0 notes](RELEASE-NOTES-v2.44.0.md).

The earlier input-focus failure is resolved in measured native runs. Tagged [44265675381](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265675381) and main Android [44265638543](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265638543), **attempt 2**, both finished successfully. The tagged failed-only retry reran API 34 after Maven HTTP 429 and reused the successful APK/API 35 results; its draft asset stayed unchanged. These outcomes were verified explicitly in the continuation, not inferred from a watch-process exit.

- Reproduced in Android CI before the fix: `frameworkActionBar=true`, `visibleNativeToolbar=true`; the persistent splash-painted bar hid the clock. The same red run measured **0px card padding / 0px card gap**.
- Reproduced with coarse-pointer mobile Chromium: a **270px SVG over a 230px timer container blocked Start**, small 13px banner clocks, status-bar overlap and overridden gesture padding.
- Fixed splash-theme installation/NoActionBar configuration, dashboard insets/label columns, SVG viewport/pointer behavior, 18px banner digits and single-owner safe-area padding. Actual chrome heights now determine scroll/focus clearance, including short landscape screens.
- Requested-start follow-up: existing profiles with another saved date now get an explicit **20 November 2026** shortcut in Settings. It only edits the preview; Save/confirmation is still required, linked/fixed policy is respected, and unrelated hours/profile/history are retained. No automatic migration or reset. The two new regressions failed before the shortcut existed; 2 source faults and 2 injected browser faults were caught with restored originals.
- Published UI source passed **772 tests / 87 files**. The release-safety continuation reran **777/777 tests / 87 files (210.39s)**, TypeScript and build **6.75s**, plus actual date/scan-image/PDF/full-backup/restore/undo/quota/media/PWA-offline flows. **41 mobile touch/occlusion probes** and **23 responsive views** passed again; application bundle bytes remained identical. Native/remote policy checks remain separately identified.
- Tagged API 34/35 shell and existing storage checks passed in [run 44265675381](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265675381), attempt 2; both scrolled 130% screenshots were visually inspected. Final UI proof caught **13 source faults + 12 browser layout faults**, including border-box inset observation and independent measured scroll clearance, with passing controls and restored originals. No physical-phone certification/zero-bug claim is made; historical APKs were not replaced.
- Release-safety continuation adds mandatory signing inputs for tags, release-only tagged assets and a required pinned-certificate/non-debuggable exact-asset gate after both native jobs. **8 policy + 57 Node tests** passed; **16 workflow/artifact + 13 module faults** caught/restored. The five new workflow/artifact cases first failed on the old pipeline. These changes apply to the hardened workflow source, not retroactively to tag v2.44.0. They prevent a bad promotion; they do not recover the lost key. Reproduction and final continuation checks: [AUDIT.md](AUDIT.md).

The routine remains **20 November 2026** by default, with linked personal targets; no profile reset, history redating, scan-byte migration or official-exam-date claim is part of this UI repair.

---

## v2.43.0 — backup/scanner/timer recheck and release gates

**v2.43.0 / code 23 is published** from source/tag `64ac7c99fcf635a7703bf6fb23fbc6020be318e5` ([PR #15](https://github.com/Rahatportfolio/HSC-27-/pull/15)). The source was prepared on `arena/d8039a21-hsc-27`; publication completed on continuation branch `arena/34a32742-hsc-27` without changing application code or the APK. [Public release and exact evidence](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.43.0), [current audit](AUDIT.md). Android build/API 35 checks, same-source Pages deployment and uploaded-APK byte/version/signature inspection passed before the draft was promoted; public/latest status was independently verified.

| Rechecked area | Current measured behavior |
|---|---|
| Profile restore | Durable commit before state/clocks; failures preserve the old profile; dirty Settings/selected start synchronise; concurrent progress cancels staging; post-commit UI errors cannot erase committed images |
| Handwritten backup | New scan-bearing binary manifest v2 contains checksummed image bytes and restores under fresh keys. Legacy v1 remains readable **with a missing-image limitation warning** |
| Scanner | AppData-backed library, Bangladesh creation date, durable save/delete with cleanup, image-source-preserving rotation/contrast/crop/perspective, separate page settings, latest edit wins, zero sliders and reachable neighbour after removal |
| PDF export | All pages must load; actual two-page PDFs downloaded both before and after a fresh-profile full restore. Export uses the existing native-compatible helper; a browser download does not certify a physical Android picker |
| Timer and completion | Early finish logs actual time without completing the planned task; changed timer subject/chapter/duration detaches it; legacy stopwatch cannot complete a preset. Complete → reload → undo → reload stays undone |
| Narrow-screen controls | Populated scanner checked at 320/360/390/768px, large text; existing 23-view source responsive checks also passed |
| Final local gates | **763/763 tests, 86 files**, clean typecheck, production build; **100 controls / 76 application mutations**, **117 controls / 55 date/history mutations**, and **3 controls / 6 release-policy mutations** caught in this audit; originals restored |
| Real browser gates | Final production date flows in Dhaka/New York, actual scanned-image bytes/PDF/fresh-profile restore/dirty draft/quota retry, real media resume and production PWA offline reload passed |
| Published Android/PWA | Tagged [Android run](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44151291901), same-source [Pages deployment](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44151187101) and [asset inspection](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44159411468) passed. APK is 15,229,928 bytes; embedded web bundle matches the local tested build byte-for-byte |
| Asset-checker proof | 24 separate Node tests, 19 targeted auditor mutations caught. Continuation reran 763 Vitest tests, typecheck and build; application source unchanged |
| Upgrade compatibility | **Published v2.42.0 / v2.43.0 signing certificates differ**: normal Android in-place update is not supported. Keep the old app/device; do not uninstall until progress and all scanned PDFs/images are independently verified. PWA data is separate |

**ব্যাকআপ সতর্কতা:** JSON ও প্রকাশিত পুরোনো Full backup-এ স্ক্যানের নাম-তথ্য আছে, ছবির bytes নেই। মূল ডিভাইস মুছে গেলে এবং আলাদা PDF/ছবি না থাকলে ওই backup থেকে ছবি উদ্ধার করা যায় না। ব্যাকআপ যাচাই না করে পুরোনো অ্যাপ uninstall কোরো না। নতুন ছবিসহ full-backup format v2.43.0 থেকে সমর্থিত; ইনস্টল করা version ও backup যাচাই করো।

No physical-phone alarm/battery check was performed. Java/adb were unavailable locally; APK/emulator verification uses the Android CI workflow, with exact results on the current release page. The earlier YouTube test's timeout was not raised: direct route mounting and scoped queries retained persistence assertions and reduced the final observed local duration from 3.583s to 2.033s, not a guarantee against future CI flakes. The date default/personal-target policy and official-exam uncertainty are unchanged. Test counts/control sets overlap; mutation proof is targeted, not exhaustive or a zero-bug guarantee.

---

## Published v2.42.0 release baseline (historical counts below)

The following sections describe the published base, not the newly audited working-tree fixes or new test totals above.

**Version: 2.42.0 / Android code 22 · local verification recorded 16 November 2026.**
APK assets/publication are tracked on the [v2.42.0 release page](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.42.0). The [public PWA](https://rahatportfolio.github.io/HSC-27-/) has a separate deployment workflow. This report distinguishes measured software behavior from official dates, content coverage and device verification.

## এই আপডেট: এক জায়গায় তারিখ বদল, সংযুক্ত পরিকল্পনায় প্রয়োগ

| Item | Current behavior | Evidence / limit |
|---|---|---|
| Default start | **20 November 2026, 06:30 Bangladesh time** | New-profile default. Existing saved settings are not silently overwritten |
| Linked personal targets | Boost **7 Dec**, test-preparation **1 Feb 2027**, board-preparation **6 Jun 2027** | Automatically shift by the start-date offset when linked policy is selected; these are **not verified examination dates** |
| Fixed external dates | A confirmed college/board deadline can stay fixed | Rebuilds phases and shows capacity shortfalls rather than pretending an exam can be postponed |
| Settings transaction | Draft preview → confirmation → one validated update | Cancellation is non-destructive; reload does not shift the dates twice |
| Routine and time | Phases, ordinary study slots, custom planned dates, countdowns, exports and reminder inputs derive from settings | Explicit custom clocks and real weekly appointments retain their meaning |
| History | Notes, marks, actual completion timestamps, measured sessions and recall history keep real dates | Pending custom references and partial evidence move without duplicate aliases; undo/reverse-shift stays undone |
| Unsafe changes | Locked plans, data collisions and custom work beyond the horizon block save | Original profile is preserved; user can repair the conflicting customisation |
| Honest capacity | Missing learning/practice/revision/mocks, conflicts and deferred workload are warnings | Allocation is not completion or mastery; no “full preparation” promise |
| Lectures/adaptation | One shared final plan in Settings and the app; 180-minute mocks cannot become partial exams | Displacement rolls back if the original work cannot fit; Weakness reports actual changes |
| Before-start dashboard | Explicit future-routine notice and first-day preview | The normal smart target appears on the chosen start date, not before it |
| Small-screen UI | Source links wrap; countdown contrast corrected | Responsive/browser and deliberate-fault regressions passed; not certification of every device |

### Default phases (inclusive)

| Phase | Dates | Days |
|---|---|---:|
| Learning / test preparation | 20 Nov 2026–31 Jan 2027 | 73 |
| Revision / question practice | 1 Feb–6 May 2027 | 95 |
| Final practice / personal mocks | 7 May–5 Jun 2027 | 30 |

**198 planning dates / 827 tasks.** Default chapter allocation ends on **29 January**. Workload starts at 8 net hours/day, then the editable boost is 16 net hours/day; breaks are extra. This is not a recommendation to sacrifice sleep. Lower the target to a sustainable level and inspect the resulting warnings.

Example: **20 → 26 November** moves linked boost/test/board-preparation targets to **13 December / 7 February / 12 June**. Fixed policy preserves the two examination targets.

### Existing study features (unchanged scope)

- **23 views**, 114 chapters/units, seven subjects and 13 papers; Bengali-first, local-first React/Capacitor app.
- Task tracking, measured timer sessions, chapter notes/confidence, spaced recall, practice, timed MCQ simulation, retry ladder, weakness/heatmap/backlog, marks/GPA arithmetic and analytics.
- Permitted local media, notes/PDF libraries, full-media backup/restore and JSON/CSV/Markdown/ICS export. Online YouTube playback still needs internet and is not an offline download permission.
- Content honesty: **1,176 authored starter MCQs**, not 1,176 original board questions. The separate recovered-board collection has **10 questions**, **24 source-coverage rows**, **3 rejected sources**, five boards/2023–2025 and **6/114 chapters**. Coverage rows are not questions.
- English translates navigation and most controls; chapter names and some long-form content remain Bengali. Question generation is rule-based, not a cloud AI service.

## আবার যাচাই করে যা ঠিক করা হয়েছে

- Completed split work and its promoted canonical task no longer double-count the same minutes in the lecture plan. A reproduced **240 → 300 minute** error now stays **240**, so the remaining work is not falsely pushed to another day.
- Overlapping completion ranges count once; old evidence is clipped to a source shortened by an hours change without erasing the original timestamps/keys.
- Malformed legacy task references no longer crash plan rendering or block full-media restore. A shared parser prevents them from certifying completion while keeping the original backup evidence intact. Invalid video ranges cannot certify content beyond the actual class duration.
- Settings labels describe the configured boost date, not an assumed “next month”; high-hour options do not claim full preparation and explicitly mention breaks, meals and adequate sleep.

These defects have failing-before-fix regressions, independent mutation proof, and production-browser recovery/dedup checks. The earlier 684-test result did not cover all of these cases; the final counts below supersede it.

## শেষ কোডে মাপা যাচাই

| Check | Result |
|---|---|
| TypeScript | `npx tsc --noEmit` passed |
| Full unit/jsdom UI suite | **695/695 tests in 79 files** |
| Targeted fault injection | **109 control tests; 55/55 intentional mutations caught**, source bytes restored |
| Production build | Passed; nonfatal large-chunk warning |
| Actual date-change browser flow | **Asia/Dhaka + America/New_York**, production build: save/cancel/reload, history, partial evidence, future start, fixed-policy warnings, real Markdown/ICS downloads, malformed-reference recovery and promoted-completion dedup after reload |
| Responsive browser flow | **23 views**, 320–768px, large text, English/dark, dialogs and running timer; real content/no page errors/no detected width or sibling overlap |
| Offline study browser flow | Real playable WebM, resume, notes, full backup/restore, shared collector, mobile tabs and production PWA offline reload |
| Android build + emulator | [CI run 44091010547](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44091010547) passed APK assembly and API 35 WebView offline storage, playback, restart/persistence and reset checks |

The 109 controls are included in the full suite, not another 109 independent features. Mutation proof is targeted, not exhaustive. Details and commands: [README](README.md), [current audit](AUDIT.md), `scripts/check-date-guards.mjs`, `scripts/check-date-cascade.ts`.

## যা এখনো নিশ্চিত করা হয়নি

1. **সরকারি পরীক্ষার তারিখ:** an official HSC 2027 routine and this student's college-test notice could not be verified. [NCTB](https://nctb.gov.bd/pages/notices/), [Sylhet HSC Corner](https://sylhetboard.gov.bd/corner/hsc), [Sylhet college notices](https://sylhetboard.gov.bd/order/college) and [Dhaka Board HSC notices](https://dhakaeducationboard.gov.bd/index.php/site/product/hsccorner) were checked with retrieval limits recorded in the audit. This does not prove no notice exists. **1 February / 6 June remain personal preparation targets.**
2. **ফোনে native behavior:** the APK build and API 35 emulator storage/playback/restart/reset checks passed in CI, but no physical-device alarm/battery/background-delivery check was done. Capacitor notification regressions are mocked; emulator success is not certification of every phone. The default APK is debug-signed; a signing mismatch may require backup/restore instead of an in-place update.
3. **নিশ্চয়তা নয়:** passing tests does not mean zero bugs, a certified syllabus, guaranteed board questions or guaranteed GPA. A/B/C priorities and stars are editorial study aids.
4. **Local data:** there is no cloud account/sync or push server. Storage clearing or uninstalling can erase progress. Take a JSON/full-media backup before changing the schedule or installing an update.

### ব্যবহার / update status

Open **Settings & backup → Routine start date**, choose linked personal targets or fixed external deadlines, review the phase/capacity preview, then **Save → Update routine**. Export a new calendar file after changes; previously imported events do not update themselves.

The regenerated default is [HSC-27-STUDY-PLAN.md](HSC-27-STUDY-PLAN.md). The app can be viewed in the workspace's production live preview. For the installable APK, use the uploaded asset on the [v2.42.0 release page](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.42.0); PWA publication is tracked separately by the [Pages workflow](https://github.com/Rahatportfolio/HSC-27-/actions/workflows/static.yml).

---

<details>
<summary>Archived feature reports — older versions, counts and incomplete historical claims</summary>

The following original reports are retained as history only. This current section supersedes their old plan sizes, test totals, question counts, dates, “complete” statements and installation links.

# প্রস্তুতি · HSC 27 — ফিচার স্ট্যাটাস রিপোর্ট

**ভার্সন:** 2.41.0 · **APK:** [সর্বশেষ ইনস্টল পেজ](https://github.com/Rahatportfolio/HSC-27-/releases) · **ওয়েব (PWA):** https://rahatportfolio.github.io/HSC-27-/
**হালনাগাদ:** ২০২৬-১১-১৬ · সব তথ্য কোড ও টেস্ট দেখে যাচাই করা, অনুমান নয়।

---

## হালনাগাদ (২০২৬-১১-১৭ · v2.38) — সবচেয়ে বড় সততার সংশোধন: প্রশ্ন বনাম "ক্লাসে কী হয়েছে" আলাদা করা — পুরো যাচাই: ৯টি ভুল অধ্যায় ও ১২টি ভাষা-লিক সারানো

- **কী করা হলো:** সব ফাইল ও দাবি আবার যাচাই। ৬টি আসল বাগ পাওয়া গেল।
- **বাগ ১ — ভুল অধ্যায়ে প্রশ্ন (গুরুত্বপূর্ণ):** ৬টি "নিউটনীয় বলবিদ্যা" ভিডিও `physics-1-3`-এ রাখা ছিল, অথচ `physics-1-3` হলো **গতিবিদ্যা**; সঠিক ঘর **`physics-1-4` (নিউটনিয়ান বলবিদ্যা)**। ছাত্র ভুল অধ্যায় পড়ত।
- **বাগ ২ — আরও একটি:** ময়মনসিংহের ভিডিওর শিরোনাম **"ভৌত আলোকবিজ্ঞান"** (`physics-2-7`), কিন্তু সেটি `physics-2-6` (জ্যামিতিক আলোকবিজ্ঞান)-এ বসানো ছিল।
- **বাগ ৩ — রসায়নের ভুল:** "Periodicity of Elements" ভিডিও থেকে বসানো প্রশ্নটি `chemistry-1-1`-এ ছিল, অথচ ভিডিওটি `chemistry-1-3`-এর; আর "গুণগত রসায়ন" প্রশ্নটি `chemistry-1-5`-এ ছিল, সঠিক ঘর `chemistry-1-2`।
- **প্রতিরোধ:** নতুন টেস্ট ভিডিওর শিরোনামে থাকা অধ্যায়-নামের সঙ্গে chapterId মিলিয়ে দেখে—এই ভুল আর ফিরতে পারবে না। (প্রথম চালাতেই বাগ ২ ধরা পড়ে।)
- **বাগ ৪ — ইংরেজি মোডে Library ট্যাব বাংলায়:** "নোট / সূত্র / বোর্ড প্রশ্ন" ইংরেজি মোডেও বাংলা ছিল।
- **বাগ ৫ — ১১টি untranslated `EmptyState`:** Calendar, Library, Practice, Revision, Syllabus, modals—১১ জায়গায় সরাসরি বাংলা লেখা ছিল, তাই ইংরেজি মোডে বাংলা দেখাত। সব `t()`-এ আনা হয়েছে; নতুন টেস্ট আবিস্কার করে।
- **বাগ ৬ — স্ট্রিং-দূষণ:** `Storage.tsx`-এ রোমানিয়ান শব্দ "această" এবং আমার নিজের লেখায় কোরিয়ান "또는" ঢুকে গিয়েছিল—দুটোই সরানো।
- **বাগ ৭ — ট্যাব কাউন্ট ভুল:** "বোর্ড প্রশ্ন" ট্যাবে **০** দেখাত, যদিও ৩১টি যাচাই করা প্রশ্ন ছিল (শুধু নিজের যোগ করা গোনা হতো)।
- **যাচাই:** ৬৫০ টেস্ট, `tsc` পরিষ্কার, build সফল। প্রতিটি নতুন রক্ষী-টেস্ট ইচ্ছাকৃতভাবে বাগ ঢুকিয়ে ব্যর্থ হওয়া যাচাই করা হয়েছে।
- **শেষ চেকে আরও দুই বাগ:** (১) জীববিজ্ঞান MCQ-র **সঠিক উত্তরটাই নষ্ট** ছিল—`সেলুলোজ`-এর শেষে কোরিয়ান `만` লেগে `সেলুলোজ만`, অর্থাৎ ছাত্র ভুল বানান শিখত। (২) ফ্ল্যাশকার্ড লেবেলে `কার্ডের` লেখা হয়েছিল `কার드의`। দুটোই সারানো; এখন ব্যাংকের **১১৭৬টি প্রশ্নের প্রতিটি প্রশ্ন ও অপশন** বিদেশি অক্ষরের জন্য স্ক্যান হয়।

## হালনাগাদ (২০২৬-১১-১৭ · v2.36) — পদার্থবিজ্ঞান ২য় পত্র যোগ: ২৪ → ৩২ বোর্ড প্রশ্ন

- **প্রশ্নটা ছিল:** “যেকোনো subject-এর যেকোনো chapter-এর সব কিছু YouTube-এ পাওয়া যায়—সুন্দর করে search করে videos এনে সেগুলো use করে বানাও।”
- **যা খোঁজা হলো:** Edu Marathon-এর **Physics 2nd Paper Board CQ Solution** প্লেলিস্ট (৪৭টি ভিডিও) পুরোটা পড়া হলো; শিরোনামেই **বোর্ড + সাল + অধ্যায়** আছে (যেমন “Dhaka Board 2024- HSC || Physics 2nd Paper || Nuclear Physics CQ solution”).
- **নতুন ৮টি প্রশ্ন (পদার্থবিজ্ঞান ২য় পত্র):** স্থির তড়িৎ, চল তড়িৎ, তাপগতিবিদ্যা, জ্যামিতিক ও ভৌত আলোকবিজ্ঞান, আধুনিক পদার্থবিজ্ঞান, নিউক্লিয়ার পদার্থবিজ্ঞান, সেমিকন্ডাক্টর — **৮টি নতুন অধ্যায়**।
- **ট্রান্সক্রিপ্ট থেকে আসল সংখ্যা:** ঢাকা ২০২৪ স্থির তড়িৎ (Q = 15×10⁻⁹ C, r = 2√2 m, নিট বল 16875 N বনাম ওজন 9.8 N → ঝুলিয়ে রাখা যাবে না); বরিশাল ২০২৪ চল তড়িৎ (9 V ও 7 V, 2 Ω ও 8 Ω, (গ)-এর উত্তর 9/13 A)।
- **ফল (সর্বশেষ):** **১০টি পুরোপুরি উদ্ধার করা বোর্ড প্রশ্ন (৮ CQ + ২ MCQ), ৫টি বোর্ড, ৬/১১৪ অধ্যায়** — পদার্থবিজ্ঞান (৭) ও রসায়ন (৩)। আর **২৪টি ক্লাস** যেখানে বোর্ড ও সাল জানা গেছে কিন্তু উদ্দীপকের সংখ্যা হুবহু পড়া যায়নি; সেগুলো প্রশ্ন হিসেবে গোনা হয় না, আলাদা "কভারেজ" তালিকায় থাকে।
- **যা কাজ করেনি (সৎভাবে বলা):** উচ্চতর গণিত ২য় পত্রের বোর্ড CQ (`iRR-9w5uoH8`) — ট্রান্সক্রিপ্ট **আরবি** হরফে এসেছে, সমীকরণ ফেরত পড়া যায় না। তাই `REJECTED_SOURCES`-এ কারণ-সহ রাখা, কোনো প্রশ্ন নেওয়া হয়নি।
- **UI:** “বোর্ড প্রশ্ন” ট্যাবে এখন **কোন পত্রে প্রশ্ন আছে** সেই চিপ (পদার্থ · ৭ প্রশ্ন · ৩ অধ্যায়; রসায়ন · ৩ প্রশ্ন · ৩ অধ্যায় (২৪টি ক্লাসের কভারেজ আলাদা))। যে পত্রে নেই, তার নামও দেখানো হয় না—যাতে পূর্ণ কভারেজের ভুল ধারণা না হয়।

## হালনাগাদ (২০২৬-১১-১৭ · v2.35) — MCQ/CQ ক্লাসের ট্রান্সক্রিপ্ট থেকে সত্যিকারের বোর্ড প্রশ্ন

- **প্রশ্নটা ছিল:** “MCQ সলভিং ক্লাস আর CQ সলভিং ক্লাস আসে—ওগুলো থেকে fetched বা transcript ব্যবহার করে বানাও।”
- **যা যাচাই করা হলো:** `fetch_page` দিয়ে ৭টি ভিডিওর ক্যাপশন ট্রান্সক্রিপ্ট নামানো হলো।
  - **কাজ করেছে:** LOBDHI, Edu Marathon, Physics Bichitra — বাংলা ট্রান্সক্রিপ্ট, ক্লাসেই বোর্ড ও সাল বলা (“ঢাকা বোর্ড ২০২৪”, “দিনাজপুর ২০২৪”)।
  - **কাজ করেনি:** উদ্ভাস (`ep3FdeUNdiI`) — ক্যাপশন ইংরেজি টুকরো; Apurbo (`y5fZs_pghyE`) — ক্যাপশন **দেবনাগরী**। দুটোই `REJECTED_SOURCES`-এ কারণ-সহ রাখা, কোনো প্রশ্ন নেওয়া হয়নি।
- **নতুন ফাইল `src/boardQuestions.ts`:** ২৪টি বোর্ড প্রশ্ন (২২টি CQ + ২টি MCQ), ৯টি বোর্ড, ২০২৩–২০২৫, **৯টি অধ্যায়ে**। প্রতিটিতে আছে `board`, `year`, সোর্স `videoId` + `title` + `channel` + টাইমস্ট্যাম্প, এবং `evidence` — বোর্ড/সাল কোথা থেকে জানা গেল।
- **নিয়ম (টেস্টে বাধ্যতামূলক):** কোনো প্রশ্নে বোর্ড বা সাল বানানো যাবে না; অধ্যায় সিলেবাসে থাকতে হবে ও বিষয় মিলতে হবে; ভিডিও আইডি ১১ অক্ষরের ও URL হুবহু মিলতে হবে; টাইমস্ট্যাম্প থাকলে `mm:ss` হতে হবে।
- **UI:** লাইব্রেরি → “বোর্ড প্রশ্ন” ট্যাবে “ইউটিউব ক্লাস থেকে নেওয়া বোর্ড প্রশ্ন” ব্লক—প্রতিটি কার্ডে বোর্ড · সাল · টাইপ, প্রশ্ন, অধ্যায়, আর ক্লিকযোগ্য সোর্স লিংক।
- **অডিট পেজ:** “ভিডিও থেকে পাওয়া বোর্ড প্রশ্ন” সংখ্যা + প্রতি অধ্যায়ে নতুন গ্যাপ “বোর্ড প্রশ্ন নেই”।
- **আরেকটি বাগ সারানো:** `focus.ui.test.tsx`-এর বিরতি-সতর্কতার টেস্টটি পাস করত কেবল নির্দিষ্ট কয়েক ঘণ্টার ভেতরে; এখন সময়-নিরপেক্ষভাবে লেখা।
- **সীমা (লুকানো হয়নি):** ১১৪টির মধ্যে মাত্র **৯টি অধ্যায়ে** বোর্ড প্রশ্ন আছে; বাকি ১০৫টিতে নেই। রসায়ন শুধু ১ম পত্রের ৪টি অধ্যায়; গণিত, জীববিজ্ঞান, বাংলা, ইংরেজি, ICT-তে এখনো শূন্য।

## হালনাগাদ (২০২৬-১১-১৬ · v2.34) — প্রশ্নের উৎস: বোর্ড প্রশ্ন নয়, সেটাই এখন লেখা আছে

- **প্রশ্নটা ছিল:** “প্রশ্নগুলো অবশ্যই বোর্ড প্রশ্ন হবে—যেগুলো ইউটিউবে MCQ সলভিং ক্লাস বা কোনো QnA ব্যাংক থেকে বোঝা যায়।”
- **সত্যি অবস্থা (কোড পড়ে মাপা):** শিপ করা ব্যাংকের ১১৭৬টি প্রশ্নের কোথাও **বোর্ড বা সালের কোনো তথ্য নেই**। `quiz-data.ts`-এর নিজের হেডারেই লেখা আছে এটি “বোর্ড প্রশ্নপত্র নয়”। তাই জেনারেট করা প্রশ্নকে বোর্ড প্রশ্ন বলা হতো—এটি সরাসরি মিথ্যা হতো।
- **যা করা হয়েছে, তিনটি আলাদা জিনিস:**
  1. **নতুন `src/sources.ts`** — প্রতি অধ্যায়ের উৎস আলাদা করে গোনে: যাচাই করা ক্লাস লিংক, শিপ করা MCQ, আর জেনারেটরের তথ্যপুল। **সার্চ-লিংক কখনো ক্লাস হিসেবে গোনা হয় না** (৬৩৬টি আলাদা রাখা)।
  2. **অডিট পেজে নতুন “প্রশ্ন কোথা থেকে আসছে” প্যানেল** — বোর্ড-ভিডিও কত অধ্যায়ে আছে (১৭/১১৪), কত অধ্যায়ে নেই (৯৭), আর প্রতি অধ্যায়ের ঘাটতি (“বোর্ড প্লেলিস্ট নেই” / “প্রশ্ন কম”)।
  3. **অধ্যায়-মোডালেই ছোট নোট** — “এই অধ্যায়ের Nটি MCQ অ্যাপের নিজের পাঠ্যবই-যাচাইকৃত ব্যাংক থেকে—বোর্ডের মূল প্রশ্নপত্র থেকে নয়।” বোর্ড ভিডিও থাকলে সংখ্যা-সহ, না থাকলে সেটাও স্পষ্ট করে।
- **যে বাগ ধরা পড়ল ও সারানো হলো (গুরুত্বপূর্ণ):** ইংরেজি মোডে **সঠিক অপশনটি বাংলায়** থাকত, অথচ তিনটি ভুল অপশন ইংরেজিতে—অর্থাৎ স্ক্রিপ্ট দেখেই উত্তর বলে দেওয়া যেত। কারণ `buildQuestion` শুধু প্রশ্ন ও ভুল অপশন অনুবাদ করত, সঠিক উত্তরটা করত না। এখন প্রশ্ন ও **সব অপশন এক ভাষায়** আসে; কোনো তথ্যের ইংরেজি রূপ না থাকলে সেটি ইংরেজি মোডে বাদ পড়ে, বাংলা উত্তর দেখানো হয় না।
- **যাচাই আরও কঠোর, দুর্বল নয়:** জেনারেট করা প্রশ্নের id-তে এখন তার উৎস-উত্তর থাকে (`gen|chapter|hash|উত্তর`), আর `verifyGenerated` সেই id **আবার তথ্য থেকে বানিয়ে** মিলিয়ে দেখে। হাতে বদলানো উত্তর বা বদলানো id—দুটোই `fact-not-in-bank` হিসেবে ধরা পড়ে (টেস্টে প্রমাণিত)।
- **সংখ্যা:** ইংরেজি মোডে ২৪২টি প্রশ্ন, ০টি ত্রুটি, ০টি বাংলা লিক; বাংলা মোডে ৮৫৬টি, ০ ত্রুটি। **বোর্ড নাম/সাল কোথাও বানানো হয় না**—যেখানে প্রমাণ নেই, সেখানে লেখা আছে “বোর্ড নয়”।

## হালনাগাদ (২০২৬-১১-১৬ · v2.33) — প্রশ্ন-জেনারেটর: ১৩০ → ৮৫৬ তথ্য

- **সমস্যা (মাপা):** ১১৪টি অধ্যায়ের **৯৮টিতেই মাত্র ১টি** তথ্য ছিল, সর্বোচ্চ ২টি। ফলে "১০ প্রশ্নের অধ্যায় পরীক্ষা" দিলে **১টি প্রশ্ন**ই আসত — অথচ UI-তে ১০ দেখানো হত।
- **আসল কারণ:** ব্যাংকে (`quiz-data.ts`) আগে থেকেই প্রতি অধ্যায়ে ~১০টি **পাঠ্যবই-যাচাইকৃত উত্তর** ছিল, কিন্তু জেনারেটর সেগুলো পড়ত না—শুধু হাতে লেখা ১৩০টি তথ্য পড়ত।
- **সমাধান (`src/questionGen.ts`):** ব্যাংক থেকেই তথ্য **উদ্ধার** করা হয় (৭২৬টি), কঠিন শর্তে — অধ্যায় মিলতে হবে, ব্যাখ্যা থাকতে হবে, হাতে লেখা তথ্যের সঙ্গে উত্তর মিললে বাদ, এবং অধ্যায়ের নিজের ভুল-অপশনের তালিকায় থাকলে বাদ। **কিছু বানানো হয়নি**—প্রশ্ন, উত্তর ও ব্যাখ্যা সবই আগে থেকেই শিপ করা।
- **ফল:** তথ্যপুল **১৩০ → ৮৫৬**। এখন **১১৪/১১৪ অধ্যায়েই ১০ প্রশ্নের পূর্ণ পেপার** হয়। `verifyGenerated` আগের মতোই প্রতিটি উত্তর ব্যাংকের সঙ্গে মিলিয়ে দেখে — **০ ত্রুটি**।
- **স্বচ্ছ সীমা:** ৩টি অধ্যায় (`chemistry-1-2`, `chemistry-1-3`, `chemistry-2-2`) এখনো ৩-এর কম তথ্যের — এদের ব্যাংকেই ব্যাখ্যাসহ উত্তর কম। এটাই সত্য; জোর করে ভরা হয়নি।
- **আলাদা করে জানানো দরকার:** ব্যাংকের ১১৭৬টি প্রশ্নের **৩৯৯টিতে ব্যাখ্যা নেই** (এবং ৪০টি ছাড়া বাকি সব বাংলায়)। তাই ইংরেজি মোডে ব্যাংকের প্রশ্ন বাংলাতেই আসে — এটি পুরোনো ঘাটতি, এই ধাপে বদলায়নি।

## হালনাগাদ (২০২৬-১১-১৬ · v2.32) — UI/UX অডিট: যেগুলো ভাঙা ছিল, সেগুলো সারানো

- **৩টি পেজের লেআউট ক্লাস ভুল ছিল:** `NotesScanner`, `Flashcards`, `Storage`-এ `className="page"` লেখা ছিল, অথচ `styles.css`-এ `.page` নামে **কোনো নিয়মই নেই** (`.view` আছে)। এতে ওই পেজগুলো ভিউ-লেআউট ও অ্যানিমেশন থেকে বাদ পড়ে যেত। এখন সব **২৩টি ভিউ** একই `.view` ক্লাস ব্যবহার করে — টেস্টে প্রতিটি ভিউ মাউন্ট করে যাচাই করা হয়।
- **নোট স্ক্যানারে দুটি অদৃশ্য `input type="file"`-এর কোনো নাম ছিল না** (স্ক্রিন রিডারে "unlabeled")। `aria-label` যোগ করা হয়েছে।
- **টাইমারের সংখ্যা সত্যিই টিক করে** — নতুন `src/ui.timer.test.tsx`: ২৫:০০ → ২৪:৫৯ → ২৪:৫৫, বড় লাফে ঠিক ৬০ সেকেন্ড, পজে সময় জমা বন্ধ, রিজিউমে ঠিক জায়গা থেকে, ডেডলাইনে সেশন সেভ হয়ে টাইমার আবার সাজানো। **পরীক্ষার ঘড়িও** (`src/ui.examClock.test.tsx`) সেকেন্ড ধরে কমে এবং সময় শেষে **নিজে থেকেই** খাতা জমা দেয়।
- **ইংরেজি মোডে বাংলা চুঁইয়ে পড়ছিল** — নতুন `src/ui.english.test.tsx` ২৩টি ভিউ ইংরেজিতে খুলে DOM পড়ে দেখে। শুরুতে **১,৪১৮টি** টেক্সট লিক ধরা পড়ে (টাইমারের মোড/বাটন/নোটিফিকেশন, ক্যালেন্ডারের বার-নাম, পরীক্ষার ঘড়ি, সিলেবাসের ধাপ-নাম, রিভিশনের ট্যাব, লাইব্রেরির খালি-অবস্থা, StudySystem-এর পুরো ফর্ম)। এখন **০টি** — শুধু অধ্যায়ের নাম, শিক্ষকের নাম ও ক্লাসের ধরন বাংলাতেই থাকে, কারণ সেগুলো *কনটেন্ট*, ইন্টারফেস নয়।
- **৮৯টি টোস্ট/নোটিফিকেশন বার্তা ইংরেজি মোডেও বাংলায় দেখাত।** টোস্ট `.view`-এর বাইরে রেন্ডার হয়, তাই ভিউ-স্ক্যানে ধরা পড়েনি — উৎস ফাইল পড়ে ধরা হয়েছে। এখন সব `t()`-এর ভেতরে; নতুন টেস্ট প্রতিটি `notify('...')`-এ বাংলা পেলে আটকে দেয় (ইচ্ছাকৃত রিগ্রেশন ঢুকিয়ে যাচাই করা হয়েছে)।
- **কনট্রাস্ট ফেল করছিল** — `#99a18f` (empty-state) **২.৬৮:১**, `#a1a99f` (placeholder) **২.৪২:১**, ডার্ক-মোড placeholder **৪.২৮:১**; WCAG AA-এর ন্যূনতম ৪.৫:১-এর নিচে। এখন `#606b5b` (৫.৫:১) ও ডার্কে `#9aab97` (৭.০:১) — নতুন `src/ui.contrast.test.ts` প্রতিটা রেশিও হিসাব করে আটকে রাখে।
- **ছোট টাচ-টার্গেট** — `.task-check` ২৩px, আইকন-বাটন ২২–২৬px ছিল (WCAG ২.৫.৮ ন্যূনতম ২৪px)। এখন ন্যূনতম ৩২px, টাচ-স্ক্রিনে ৩৬px।
- **একটি রোমানিয়ান শব্দ ভুল করে কোডে ঢুকে গিয়েছিল** (`această` — "এই ডিভাইসে" বাক্যের মাঝে) — সরানো হয়েছে।

## হালনাগাদ (২০২৬-১১-১৬ · v2.24) — সূত্র-গণনার প্রশ্ন (গভীরতা, হাতে লেখা উত্তর নয়)

- **সমস্যা:** v2.23-এ কাভারেজ ১১৪/১১৪ হলেও ৮৬টি A-অধ্যায়ে ছিল মাত্র **একটি** তথ্য—তাই এক-অধ্যায়ের মক টেস্ট ১–২ প্রশ্নেই শেষ হয়ে যেত।
- **সমাধান (`src/numericGen.ts`):** ৪৯টি **সূত্র-স্কিমা**—প্রতিটি প্রশ্নের সংখ্যা সিড থেকে আসে, উত্তর **হিসাব করে বের করা হয়** (F = ma, V = IR, s = ½at², n = m/M, nCr, নির্ণায়ক, log₂, বাইনারি, লজিক গেট…), তাই যাচাই = একই সিডে পুনরায় হিসাব।
- **`verifyNumeric`** প্রতিটি প্রশ্নের সিড ধরে উত্তর নতুন করে বের করে *অপশনের সঙ্গে মিলিয়ে* দেখে—হাতে লেখা কোনো উত্তর বিশ্বাস করা হয় না। এখন **১৫৯টি প্রশ্ন, ০ ত্রুটি** (৩০টি অধ্যায়: গণিত ১৩, পদার্থ ১০, রসায়ন ৪, আইসিটি ৩)।
- **ভুল অপশনও শেখায়:** প্রতিটি ভুল অপশন একটি **সাধারণ ভুল**—½ ভুলে যাওয়া, ভাগ/গুণ উল্টে ফেলা, n এর বদলে n+১। ঋণাত্মক বা অসম্ভব অপশন বাদ দেওয়া হয়।
- **ব্যাখ্যায় ধাপ:** "F = ma। বসালে (m = ১০, a = ৫): বল = ৫০ N।" — শিক্ষার্থী নিজে মিলিয়ে নিতে পারে।
- **সংহতকরণ:** সিমুলেটরে `generate: true` হলে দুটো ইঞ্জিনই যোগ হয় (তথ্যভিত্তিক + সূত্র-গণনা), অনুশীলন কার্ডে দুটোর সংখ্যা আলাদা দেখায়; উত্তর দিলে সেটাও দুর্বলতা/রিট্রাই ল্যাডারে যায়।
- **টেস্ট:** `numericGen.test.ts` (১১) — পুনঃগণনা, অপশন-সঙ্গতি, ডুপ্লিকেট-মুক্ত, সিড-নির্ভরতা, এবং **ইচ্ছাকৃতভাবে নষ্ট করা উত্তর ধরা পড়ে** কি না।
- **টেস্ট ৪১৭/৪১৭ (৫০ ফাইল)** · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.31) — Golden A+ পথ-হিসাব: ভবিষ্যদ্বাণী নয়, বোর্ডের নিয়মে সরল হিসাব

- **কেন:** অ্যাপে GPA ক্যালকুলেটর ছিল, কিন্তু “লক্ষ্য পূরণে **আর কত** লাগবে” সেটা কোথাও গোনা হতো না—শুধু এখনকার GPA দেখাত। আর ভবিষ্যৎ নম্বর অনুমান করা হলে সেটাই মিথ্যা প্রতিশ্রুতি হতো।
- **কী** (`src/golden.ts`): `goldenPlan` বোর্ডের আসল নিয়মেই (ছয় আবশ্যিক বিষয়ের গ্রেড পয়েন্ট + ৪র্থ বিষয়ের বোনাস ২-এর বেশি হলে, সামগ্রিক সর্বোচ্চ ৫.০০, কোনো F থাকলে GPA ০) হিসাব করে—**কোনো অনুমান নেই**। দেখায়: প্রতি বিষয়ের পয়েন্ট, পরের গ্রেডে যেতে কত নম্বর, A+ পর্যন্ত কত, ৩০ পয়েন্টের ঘাটতি, এবং ৪র্থ বিষয়ের বোনাসে **আর কত পয়েন্ট নষ্ট করা যায়**।
- **অর্থবোধক সীমা লেখা:** “আরও যে পয়েন্ট নষ্ট হতে পারে” = আবশ্যিক পয়েন্ট + বোনাস − ৩০। এটাই একমাত্র জায়গা যেখানে একটি বিষয় A-তে নেমেও GPA ৫.০০ থাকতে পারে—তাই সীমাটা স্পষ্ট করে দেখানো হয়েছে, লুকানো হয়নি।
- **নম্বর না থাকলে শূন্য ধরা হয় না:** অসম্পূর্ণ প্রোফাইলে GPA-ই দেখানো হয় না; লেখা হয় “কতটি বিষয়ের নম্বর বাকি”, আর Golden A+-এ একটি বিষয়ের নম্বর না থাকলে সেটি পুরোটাই বাকি হিসেবে গোনা হয়।
- **UI:** পরীক্ষা ও GPA পেজে নতুন “পথ-হিসাব” প্যানেল—লক্ষ্য বাছার টগল (GPA 5.00 / Golden A+) সহ; প্রতিটি বিষয়ের বার-এ ৮০% রেখা আঁকা, তাই Golden A+ কত দূরে সেটা চোখেই দেখা যায়।
- **অডিটে দশম চেক:** অ্যাপ নিজেই একটি নির্দিষ্ট নমুনা প্রোফাইলে হিসাবটা আবার কষে দেখে (এক বিষয় A, ৪র্থ বিষয় A+ → বোনাসে ২ পয়েন্ট বাকি)। গ্রেড-টেবিল বা বোনাসের নিয়ম বদলালে এই চেকই প্রথমে ধরবে।
- **ডেভে ধরা তিনটি আসল ত্রুটি:** (১) প্রথম খসড়ায় প্রতি বিষয়ে “দরকারি নম্বর” দেখানো হচ্ছিল—সেটা ভবিষ্যদ্বাণী হয়ে যেত, তাই পুরো মডেল বদলে **সঠিক হিসাব** রাখা হয়েছে; (২) বাংলা বাক্যে লাতিন `২০` ঢুকে গিয়েছিল—এখন সংখ্যা UI-তেই `bn()` দিয়ে ফরম্যাট হয়, আর একটি টেস্ট বলপ্রয়োগে ধরে; (৩) `i18n` গার্ড `/৩০`-এর মতো অননূদিত লেবেল ধরেছিল।
- **টেস্ট:** `golden.test.ts` ২১টি (বোনাস-সীমা, F, ক্যাপ, A/A- এর বাস্তব কেস, what-if) + `golden.ui.test.tsx` ৫টি (অসম্পূর্ণতা, ডিজিট-নিয়ম, Golden A+ ঘাটতি)।

**সংস্করণ 2.40.0** · টেস্ট 614/614 (৭৫ ফাইল) · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.30) — সব অধ্যায়ে ১০+ প্রশ্ন: ৭২ → ০

- **কেন:** v2.29-এ অডিট দেখিয়েছিল ১১৪টির মধ্যে ৭২টি অধ্যায়ে ১০টির কম প্রশ্ন—তাই “১০ প্রশ্নের কাগজ” বাছলে সিমুলেটর সত্যি সংখ্যা বলে দিলেও কাগজটি ছোট হয়ে যেত। এই ধাপে সেই শেষ ফাঁকটুকুও বন্ধ হলো।
- **কী:** `src/quiz-depth-2.ts` — `DEPTH_QUESTIONS_3`, আরও **৪৫৫টি নতুন MCQ** (ব্যাংক ৭২১ → **১১৭৬**), প্রতি প্রশ্নে ৪টি আলাদা অপশন + ব্যাখ্যা। আইডি আলাদা `more-` রেঞ্জে, তাই পুরোনো `seed-`/`deep-` আইডি কখনো বদলায় না।
- **কাজের ধাপ:** আগে প্রতি অধ্যায়ে আসল ঘাটতি মাপা হলো (`examPool` নয়, হাতে লেখা প্রশ্ন), তারপর ঘাটতি অনুযায়ীই অধ্যায়ে-অধ্যায়ে প্রশ্ন যোগ—কোনো প্রশ্ন টানাহেঁচড়া করে ভরা হয়নি।
- **ডুপ্লিকেট শিকার:** মোট **৯টি** পুরোনো/নতুন নকল ধরা পড়ে (৭টি এই ধাপে, ২টি আগের ধাপের ক্রস-অধ্যায়), সবগুলোই **আলাদা তথ্য দিয়ে বদলানো**—বাদ দিয়ে ফাঁকা রাখা হয়নি। এখন ব্যাংকে নকল **০**।
- **নিজের লেখা পরীক্ষা:** ২টি বানান/ভাষা-দূষণ (ফারসি-আরবি অক্ষর, ভুল যুক্তাক্ষর) ধরা পড়ে সারানো হলো; বাংলা+ASCII allowlist স্ক্যান এখন পরিষ্কার।
- **ফল (অডিট পেজ নিজেই মাপে):** ব্যাংক **৭২১ → ১১৭৬**; প্রতি অধ্যায়ে **১০–১৫** (গড় ১০.৩); ১০ প্রশ্নের কাগজ বানাতে পারে **৪২ → ১১৪/১১৪**; অডিটের ৯টি চেক **ok**, “১০ প্রশ্ন হয় না” তালিকা এখন **খালি**।
- **৩টি পুরোনো টেস্ট নিয়মে বদলানো:** আগের টেস্টগুলো ধরে নিয়েছিল “পাতলা অধ্যায় থাকবেই” (`toBeGreaterThan(0)`)। সেগুলো এখন **নিয়ম** যাচাই করে—ক্ষমতা কখনো পুলের বেশি প্রতিশ্রুতি দেয় না, আর তালিকা ঠিক তখনই দেখায় যখন সত্যিই কোনো অধ্যায় ১০-এর নিচে।
- **নতুন টেস্ট:** `quiz-depth.test.ts`-এ ৪টি—কোনো অধ্যায় ১০-এর নিচে নেই, A-অধ্যায়ও নেই, `more-` আইডি অনন্য ও ব্যাংকড, এবং অডিটের কাগজ-ক্ষমতা ১১৪/১১৪।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.29) — প্রশ্নের গভীরতা: ৪৭১ → ৭২১, কোনো অধ্যায় খালি নয়

- **সমস্যা (অডিটেই ধরা):** ৩৬টি অধ্যায়ে ৫টিরও কম প্রশ্ন ছিল—পদার্থ ২য় পত্র, জীব ২য় পত্র, গণিত ২য় পত্র, ইংরেজি রাইটিং, বাংলা ব্যাকরণ—সিমুলেটরে “১০ প্রশ্ন” বেছে নিলে কাগজ ২–৪টিতেই থেমে যেত।
- **কী যোগ হলো** (`src/quiz-depth.ts`, ২৫০টি নতুন প্রশ্ন, দুই ধাপে): পদার্থ (আলো · আধুনিক পদার্থ · নিউক্লিয়ার · সেমিকন্ডাক্টর), জীব (উদ্ভিদ শারীরতত্ত্ব · প্রাণিবিজ্ঞান · পরিবেশ · অণুজীব · জীবপ্রযুক্তি · আচরণ), গণিত (ফাংশন · স্থিতিবিদ্যা · প্রাস · যোগাশ্রয়ী প্রোগ্রামিং), বাংলা (পদ্য · পারিভাষিক · সারাংশ · প্রতিবেদন · পত্র), ইংরেজি (রাইটিং · রিডিং · গ্রামার)।
- **গুণের নিয়ম:** প্রতিটি প্রশ্নে ৪টি আলাদা অপশন, ব্যাখ্যা, এবং সঠিক উত্তর পাঠ্যবইয়ের তথ্য/সূত্র থেকে—কোনো বোর্ড-প্রশ্ন নকল নয়।
- **নিজের ভুল ধরা:** প্রথম ব্যাচে **৪৩টি প্রশ্ন পুরোনো ব্যাংকের প্রায়-হুবহু নকল** হয়ে গিয়েছিল। সেগুলো বাদ দিয়ে প্রতিটি অধ্যায়ে **আলাদা তথ্য** দিয়ে আবার ভরা হলো—ফল এখন **০ ডুপ্লিকেট** (একটি টেস্ট এটা স্থায়ীভাবে পাহারা দেয়)।
- **একটি আসল বাগ সারানো:** “শুধু আমার যোগ করা প্রশ্ন” ফিল্টার `seed-` আইডি-উপসর্গ দেখত—নতুন `deep-` প্রশ্নগুলো ভুলভাবে “নিজের” হিসেবে দেখাত। এখন প্রতিটি ব্যাংক-প্রশ্নে `bank: true` ফ্ল্যাগ, ফিল্টার সেটাই পড়ে।
- **ফল:** ব্যাংক **৭২১**, প্রতি অধ্যায়ে **২–১৩** (আগে ১–১১), ৫টির কম প্রশ্ন আছে এমন অধ্যায় **৩৬ → ০**, ১০ প্রশ্নের কাগজ বানাতে পারে **২০ → ৪২** অধ্যায়। অডিট পেজের **৯টি চেকই সবুজ**।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.28) — অ্যাপ অডিট: নিজের দাবি নিজেই যাচাই

- **কেন:** অ্যাপের প্রতিটি স্ক্রিন সংখ্যা দেখায়, কিন্তু সেগুলো ঠিক কি না তা ব্যবহারকারী যাচাই করতে পারে না। এখন একটি পেজ সেই দাবিগুলো **উৎস থেকে আবার গোনে**।
- **কী** (`src/selfAudit.ts` + `views/Audit.tsx`, `#audit`): ৯টি চেক—অধ্যায় সংখ্যা (১১৪), ব্যাংক (৪৭১ প্রশ্ন, প্রতি অধ্যায় ১–১১), তথ্যভিত্তিক জেনারেটর (১৩০ প্রশ্ন / ১১৪ অধ্যায়), সূত্র-ইঞ্জিন (৪৯ স্কিমা → ১৫৯ প্রশ্ন), ডুপ্লিকেট (০), ১০-প্রশ্নের কাগজ বানাতে পারে কত অধ্যায় (২০/১১৪), প্ল্যান (১৮১ দিন), টাইমার হিসাব, স্টোরেজ সীমা।
- **সৎ ফল:** হেডলাইন কখনো গড় দেখিয়ে সুখবর দেয় না—**সবচেয়ে দুর্বল চেক** দেখায়। এখন: “সব হিসাব মিলেছে, তবে ১টি সীমা এখনো আছে”`—কারণ ৯৪টি অধ্যায়ে ১০ প্রশ্নের পুল নেই।
- **সীমাও লেখা:** সার্ভার নেই · ওয়েবে পুশ নেই · MCQ-ভিত্তিক আনুমানিক গ্রেড · জেনারেটরের বৈচিত্র্য পুলের আকারে সীমিত।
- **যাচাই নিজেই যাচাই হয়:** ১১টি ইউনিট টেস্টের একটি কৃত্রিমভাবে ব্যর্থ চেক বসিয়ে দেখে হেডলাইন সত্যিই “ব্যর্থ” বলে; আরেকটি দেখে ওয়ার্নিং সবুজ হয় না।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।
**মাইলফলক:** ব্যবহারকারীর তালিকার ①–⑧ ধাপ, টপ-৩ (প্রশ্ন তৈরি · ব্যক্তিগত পরীক্ষা · অ্যাডাপটিভ প্ল্যানার) এবং অ্যাডভান্সড তালিকার সব আইটেম এখন সম্পূর্ণ।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.27) — পরীক্ষার পরের সত্যি (“নম্বর কোথায় গেল”)

- **সমস্যা:** সিমুলেটর নম্বর দিত, অধ্যায়ভিত্তিক ফল দেখাত, ভুল প্রশ্ন ল্যাডারে পাঠাত—কিন্তু **কেন নম্বর গেল** তা কখনো বলেনি। আর কাগজে ১০ প্রশ্ন লেখা থাকলেও পাতলা অধ্যায়ে চুপচাপ ৪টি প্রশ্নের পরীক্ষা হয়ে যেত।
- **নতুন ইঞ্জিন** (`src/examAnalysis.ts`): প্রতিটি সেভ করা পরীক্ষার প্রশ্ন-আইডি ব্যাংকের সঙ্গে মিলিয়ে গোনে—উত্তরহীন, ভুল, প্রশ্নপ্রতি সময়; **লেজ ফাঁকা** (শেষ ৩+ প্রশ্ন না-দেওয়া), **খুব দ্রুত শেষ** (≤৪০ সেকেন্ড/প্রশ্ন), **জানার ঘাটতি** (≥৩ ভুল এবং ≥২৫%)—প্রতিটি দাবির পাশে নমুনা-সংখ্যা।
- **প্রবণতা সৎ:** তিনটির কম পরীক্ষায় “উন্নতি/অবনতি” বলা হয় না—পেজেই লেখা “এখনো অপর্যাপ্ত”।
- **অধ্যায়ভিত্তিক ফাঁক:** প্রতি অধ্যায়ে প্রশ্ন-সংখ্যাসহ শতাংশ; **৪টির কম প্রশ্নে কোনো অধ্যায়কে দুর্বল বলা হয় না** (`judged=false`)।
- **কাগজের আকার আগেই সত্যি:** `paperCapacity()` এখন বলে “এই বাছাইয়ে ৪টি প্রশ্ন আছে—৪টির পরীক্ষা তৈরি হবে”, শুরু করার আগে।
- **UI:** ফলাফলে “নম্বর কোথায় গেল” কার্ড + সেটআপে গত পরীক্ষার ছবি (গড়/সেরা/উত্তরহীন%/প্রবণতা)।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.26) — ফোকাস বিশ্লেষণ (টাইমারের আসল গুণ)

- **সমস্যা:** টাইমার মিনিট গুনত, কিন্তু কোনোদিন বলেনি সময়গুলো *ভালো* সময় ছিল কি না—কখন মন বসে, কতক্ষণ একটানা পারো, কত শুরু-বন্ধ করে দিনটা ছড়িয়ে যায়।
- **নতুন ইঞ্জিন** (`src/focus.ts`): সেশনগুলোকে **সিটিং**-এ জোড়ে (`SITTING_GAP_MINUTES=30`, দিন বদলালে কখনো জোড়ে না), ঢাকার সময়ে ঘণ্টাভিত্তিক হিসাব, দিন/সপ্তাহের গড়, ছোট (<১০ মি) ও লম্বা (≥২.৫ ঘ) সেশন, সেরা দিন, দীর্ঘতম একটানা সময়।
- **স্ট্রিক সৎ:** দিন গোনা হয় কেবল **≥৩০ মিনিট** হলে—পাঁচ মিনিটের "পড়া" দিয়ে ধারা বাড়ানো হয় না; আজকের দিন অসম্পূর্ণ থাকলে ধারা ভাঙে না।
- **একটানা পড়ার সতর্কতা:** শেষ সেশন থেকে পিছনে গুনে **৫০ মিনিট** একটানা হলে টাইমার স্ক্রিনে “বিরতি নাও” চিপ + পরের কাজের তালিকায় বিরতি।
- **টাইমার স্ক্রিনে নতুন কার্ড:** “এখন কী করবে” (দুর্বল অধ্যায় + ফাঁকা দিন → ২৫ মিনিটের ব্লক, এক ক্লিকে টাইমার তৈরি) এবং **২৮ দিনের ফোকাস রিপোর্ট**—৪টি KPI, ২৪ ঘণ্টার বার (সেরা ঘণ্টা গাঢ়), সকাল/দুপুর/সন্ধ্যা/রাত ভাগ, সেশন-গুণ, ইনসাইট, আর **সীমাবদ্ধতার কথা** (“এটা মনোযোগের গুণ নয়”)।
- **যা ইচ্ছে করে করা হয়নি:** কোনো “ফোকাস স্কোর” বানানো হয়নি—সেশন থেকে অনুমান করে মনোযোগ মাপা যায় না, তাই সংখ্যা যা বলে তা-ই দেখানো হয়।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.25) — ব্যাকলগ ম্যানেজার (৮ ঘণ্টার সীমা মেনে)

- **সমস্যা:** পুরোনো `addBacklogToToday()` অন্ধভাবে ৫টি কাজ আজকের তালিকায় ফেলে দিত—দিন ইতিমধ্যে ৮ ঘণ্টায় পূর্ণ হলেও, আর একই অধ্যায় দুইবার এলে দুবার।
- **নতুন ইঞ্জিন** (`src/backlog.ts`): মিস হওয়া সেশন হিসাব করে (সম্পন্ন, বাদ দেওয়া ও আজ/ভবিষ্যতের কাজ বাদ), একই অধ্যায়ের ছোট টুকরো (১০+১০+২০) **এক ব্লকে জোড়া** দেয়, তারপর প্রতিটি দিনে `room = cap − before` দেখে বসায়—`adaptiveCap`-এর **কঠিন ৮ ঘণ্টা সীমা** কোথাও ভাঙে না।
- **সৎ উত্তর, জালিয়াতি নয়:** fresh প্রোফাইলে পরিকল্পনা আগে থেকেই প্রতিদিন ৪৮০/৪৮০ মিনিট ও ১০০% A-প্রায়োরিটি, তাই বসানোর জায়গা নেই। সেক্ষেত্রে দুটো সম্মানজনক পথ দেখানো হয়: (১) **একই অধ্যায় ইতিমধ্যে প্ল্যানে** থাকলে “আচ্ছাদিত” বলা হয়—নকল ব্লক বসানো হয় না; (২) বাকিটা “জায়গা নেই” তালিকায় থেকে যায়, প্রতিটির পাশে **ছেড়ে দাও**।
- **ছেড়ে দেওয়া** (`dropBacklog`) `removedTasks`-এ লেখে, তাই কাজটা ব্যাকলগ ও পুরোনো প্ল্যান—দুই জায়গা থেকেই সরে যায় (যাচাই: ১২ → ২, ২৮৮০ → ৪৮০ মিনিট)।
- **নতুন স্ক্রিন** (`views/Backlog.tsx`, `#backlog`): মোট বাকি/সীমা/বসানো যাবে/জায়গা নেই—চারটি সংখ্যা; দিনভিত্তিক বার (আগে/সীমা/+যোগ/পুরো নোট); বিষয়ভিত্তিক বিন্যাস; বারবার ফিরে আসা অধ্যায় (≥৩ বার = গুরুতর → হিটম্যাপে লিংক); আজ/গতকাল/সপ্তাহ/পুরোনো ভাগে সম্পূর্ণ তালিকা। হরাইজন ৩/৭/১৪/৩০ দিন।
- **যোগসূত্র:** ক্যালেন্ডারের “৫টি আজকের তালিকায়” বাটনটি এখন ব্যাকলগ ম্যানেজারে নিয়ে যায়; আজকের ড্যাশবোর্ডে জমে থাকা ঘণ্টা দেখানো নতুন স্ট্যাট কার্ড।
- **পাশাপাশি ঠিক হলো:** `App.test.tsx`-এর রিভিশন টেস্টটি হার্ডকোড করা তারিখের কারণে শুধু একদিনেই পাস করত—এখন `todayKey()−1` ব্যবহার করে যেকোনো দিনে পাস করে।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।

## হালনাগাদ (২০২৬-১১-১৬ · v2.23) — সিলেবাস হিটম্যাপ + ১১৪/১১৪ অধ্যায়ে প্রশ্ন তৈরি

- **সিলেবাস হিটম্যাপ** (`src/heatmap.ts` + `views/Heatmap.tsx`): ১১৪টি অধ্যায়ের প্রতিটির জন্য একটি ঘর, পাঁচটি বর্ণে—শুরু হয়নি · পিছিয়ে · চলছে · প্রায় তৈরি · পরীক্ষার জন্য তৈরি। রঙ আসে বাস্তব তথ্য থেকে: পরিকল্পিত সেশন কত শেষ, অধ্যায়ের অবস্থা (`chapterStage`), প্রস্তুতির কভারেজ, MCQ/CQ চেষ্টা — **কোনো কাজ না থাকলে ঘর ধূসর, সবুজ নয়**।
- **দুই কঠিন নিয়ম:** দুর্বল অধ্যায় ৩৫%-এ সীমাবদ্ধ (মৃদু দুর্বলতায় ৬০%), আর **পরীক্ষা ছাড়া কোনো অধ্যায় ৬৫%-এর বেশি "তৈরি" বলে দাবি করে না** — টিক পড়া মানেই তৈরি নয়।
- **পৃষ্ঠায় যা দেখে সিদ্ধান্ত নেওয়া যায়:** বিষয়ভিত্তিক প্রস্তুতি বার, "এখনই ধরো" (A-প্রায়োরিটি আগে), "পিছলে যাচ্ছে" (পরিকল্পনায় আর নেই, তবু তৈরি নয়), ৭/১৪/৩০ দিনের দৃষ্টিসীমা, শুধু-ঠান্ডা ফিল্টার, আর প্রতিটি ঘরের নিচে কারণ। ঘরে ক্লিক করলে অধ্যায় খোলে।
- **প্রশ্ন তৈরি এখন ১১৪/১১৪ অধ্যায়ে:** শেষ ৩৪টি অধ্যায়ের (উচ্চতর গণিতের বিন্যাস–সমাবেশ, বাংলা ১ম/২য় পত্রের সব গদ্য–পদ্য–ব্যাকরণ–নির্মিতি, ইংরেজি ১ম/২য় পত্রের Reading–Writing–Grammar) তথ্য যোগ হয়েছে—**সব মান হুবহু ব্যাংক থেকেই**, তাই যাচাই গেটে ১৩০/১৩০ পাস, ০ ত্রুটি।
- **টেস্ট:** `heatmap.test.ts` (১৩) + `heatmap.ui.test.tsx` (৫); `questionGen.test.ts` এখন ১৬।
- **টেস্ট ৪০৬/৪০৬ (৪৯ ফাইল)** · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.22) — স্বয়ংক্রিয় প্রশ্ন তৈরি (নিয়মভিত্তিক, যাচাই করা)

- **নীতি প্রথমে:** প্রশ্ন বানানো মানে বানানো নয়। `src/questionGen.ts` শুধু **পাঠ্যবই-যাচাইকৃত তথ্যপুল** থেকে প্রশ্ন বানায়; পুলে না থাকা অধ্যায়ের জন্য **কিছুই তৈরি হয় না** (`generativeGap` → `no-fact`)। প্রথম ধাপে ৮০টি অধ্যায়ে ৯৬টি প্রশ্ন তৈরি হচ্ছিল; v2.23-এ বাকি ৩৪টি যোগ হয়ে **১১৪/১১৪ অধ্যায়, ১৩০টি প্রশ্ন**।
- **প্রতিটি উত্তর যাচাইযোগ্য:** সঠিক অপশন হুবহু অ্যাপের নিজের ব্যাংকে থাকা মান; ভুল অপশনগুলোও অন্য আসল তথ্যের মান (যেমন "৭.৯ km/s" → কক্ষীয় বেগের মান)। `verifyGenerated` প্রতিটি প্রশ্নে চারটি আলাদা অপশন, রেঞ্জে থাকা উত্তর, উৎস-নামসহ ব্যাখ্যা, আর ব্যাংকে-উপস্থিতি—চারটাই দাবি করে। টেস্টে **৯৬/৯৬ পাস, ০ ত্রুটি**।
- **যাচাই গেট কাজ করেছে:** প্রথম রানে ২৩টি প্রশ্ন `fact-not-in-bank` হিসেবে ব্যর্থ হয় (যেমন তাপগতিবিদ্যার প্রথম সূত্রের রূপ, কুলম্ব ধ্রুবক, সাবানন) — সেগুলো বাদ না দিয়ে **তথ্যপুলের মান ব্যাংকের হুবহু মানে বদলানো হয়েছে**, কোথাও কিছু ফাঁকা রাখা হয়নি।
- **অপশন বিন্যাস:** সঠিক উত্তর সবসময় (ক) নয়—ফিশার–ইয়েটসে অবস্থান বদলায়, কিন্তু একই সিডে ফল পুনরুত্পাদনযোগ্য।
- **কোথায় লাগে:** পরীক্ষা সিমুলেটরে পাতলা অধ্যায়ের পুল টপ-আপ হয় (`generate: true`), আর অনুশীলন স্ক্রিনে "স্বয়ংক্রিয় প্রশ্ন তৈরি" কার্ড—অধ্যায় বাছলে এক ক্লিকে যাচাই করা কুইজ শুরু। উত্তর দিলে সেটাও অন্য প্রশ্নের মতোই মিস্ট্রি বুক, দুর্বল-অধ্যায় ও রিট্রাই ল্যাডারে যায়।
- **টেস্ট:** `questionGen.test.ts` (১৪) + `questionGen.ui.test.tsx` (৩)।
- **টেস্ট ৩৮৫/৩৮৫ (৪৭ ফাইল)** · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.21) — অ্যাডাপ্টিভ প্ল্যানার (৮ ঘণ্টার কঠিন সীমা)

- **কী করে:** দুর্বলতা ডিটেক্টরের স্কোর (≥৫) ধরে পরের ৩ দিনের রুটিন নিজে থেকেই দুর্বল অধ্যায়ের দিকে ঘুরে যায় (`src/adaptive.ts`)। আগে খালি জায়গা খোঁজে; জায়গা না থাকলে **নিচু অগ্রাধিকারের (C তারপর B) ব্লক** সরায়—A-প্রায়োরিটি, পরীক্ষা, ভিডিও, সম্পন্ন কাজ বা অন্যের অ্যাডাপ্টিভ ব্লক কখনোই ছোঁয় না।
- **কোনো পড়া হারায় না:** সরানো ব্লক পরের দিনগুলোর খালি জায়গায় `~moved` আইডি নিয়ে বসে; জায়গা না পেলে `dropped` হিসেবে সৎভাবে রিপোর্ট হয় (লুকানো হয় না)।
- **দিনের মোট মিনিট অপরিবর্তিত:** পুনর্বিন্যাসে যোগ-বিয়োগ সমান, তাই রুটিন ফুলে যায় না। `adaptiveCap = min(৪৮০, লক্ষ্য + বাফার)`—৮ ঘণ্টা কখনোই ভাঙে না, এমনকি ১৮ ঘণ্টা সেটিংসেও।
- **জায়গা থাকলে যোগ করে:** ৪ ঘণ্টার হালকা দিনে দুর্বল ব্লক যোগ হয় (বাফার ০/৩০/৬০ মিনিট)।
- **UI:** সেটিংসে টগল + বাফার (০/৩০/৬০); দুর্বলতা স্ক্রিনে “অ্যাডাপ্টিভ রুটিন” কার্ড—আজকের সীমা, পরিকল্পিত মিনিট, আগামী ৭ দিনে কত দিন পূর্ণ, পরীক্ষা কত দিন বাকি, এবং কোন ব্লক কার জায়গায় বসল তার তালিকা (আগে→পরে মিনিট)। বন্ধ করলে মূল রুটিন হুবহু অটুট থাকে।
- **টেস্ট:** `adaptive.test.ts` (১৬) + `adaptive.ui.test.tsx` (৪) — ক্যাপ, ন্যায্য displacement, স্থানান্তর, Locked দিন, skor threshold, ডুপ্লিকেট প্রতিরোধ।
- **টেস্ট ৩৬৮/৩৬৮ (৪৫ ফাইল)** · typecheck + build পরিষ্কার।

---

## হালনাগাদ (২০২৬-১১-১৬ · v2.20) — পরীক্ষার রুটিন (দৈনিক · সাপ্তাহিক · মাসিক)

- **তিনটি স্লট** (`src/cadence.ts`): দৈনিক ১০ MCQ, শুক্রবারের সাপ্তাহিক ২৫ MCQ, মাসিক ৫০ MCQ পূর্ণ মক। কোনটি দরকার, কত দিন দেরি, শেষ ফল—সব এক নজরে। স্লট থেকে শুরু করা পেপার `cadence` হিসেবে সংরক্ষিত হয়, তাই স্লট নিজে থেকেই বন্ধ হয়।
- পুরোনো পেপার থেকেও ধরন অনুমান হয় (অধ্যায়→দৈনিক, বিষয়→সাপ্তাহিক, ফুল মক→মাসিক), তাই ডেটা মাইগ্রেশন লাগে না।
- সেটআপে রুটিন কার্ড + এই সপ্তাহের স্ট্রিপ + “২ দিন পরীক্ষা দাওনি” নোট; Exams স্ক্রিনে একই রুটিন স্ট্রিপ।
- ব্রাউজার/Android নোটিফিকেশনের সকালের ব্রিফিংয়ে আজকের পরীক্ষার লাইন যোগ হয় (`buildExamRoutineLine`)।
- শুক্রবার = ISO সপ্তাহের ৬ষ্ঠ দিন (index 5), সপ্তাহ সোমবার থেকে।
- **টেস্ট ৩৪৮/৩৪৮ (৪৩ ফাইল)** · typecheck + build পরিষ্কার।

## হালনাগাদ (২০২৬-১১-১৬ · v2.19) — দুর্বলতা ডিটেক্টর

- **নতুন স্ক্রিন “দুর্বলতা ডিটেক্টর”** (`src/weakness.ts`, `src/views/Weakness.tsx`, রুট `#weakness`): MCQ নির্ভুলতা, CQ নম্বর, ফেরত বাকি ভুল প্রশ্ন, সিমুলেটেড পরীক্ষার ফল ও নিজের দুর্বল চিহ্ন মিলিয়ে **কারণসহ র‍্যাংক করা তালিকা**। প্রতিটি সারিতে একটাই কাজ (পুনরায় পরীক্ষা / MCQ অনুশীলন / রিভিশন / অধ্যায়)।
- আজকের শীর্ষ ৩ ফোকাস কার্ড, “এই সপ্তাহের প্রতিকার” (দিনে ২টি), বিষয়ভিত্তিক ঝুঁকি, এবং হোম ড্যাশবোর্ডে সতর্কবার্তা + সরাসরি লিংক।
- রিভিশন কার্ড এগিয়ে আনা (`pullRevisionForward`) ও অনুশীলন-প্রতিশ্রুতি সংরক্ষণ করে — কোনো নতুন persisted কালেকশন লাগেনি।
- **টেস্ট ৩২৫/৩২৫ (৪২ ফাইল)** · typecheck + build পরিষ্কার।

## হালনাগাদ (২০২৬-১১-১৬ · v2.18) — ভুল প্রশ্নের spaced re-injection

- **ভুল প্রশ্ন এখন ল্যাডারে ফেরে** (`src/retryLoop.ts`): পরীক্ষায় ভুল/উত্তরহীন প্রশ্ন **১ → ৩ → ৭ → ১৪ → ৩০ দিন** পরে ফেরত আসে। ঠিক করলে পরের ধাপে ওঠে, ভুল করলে ল্যাডার আবার শুরু; পাঁচ ধাপ পার হলে প্রশ্নটি “ঝালাই” হয়ে তালিকা থেকে বাদ যায়।
- সিমুলেটরে নতুন মোড **“আজকের পুনরায়”** + সেটআপ রেলে রিট্রাই কার্ড (আজ দরকার / সামনে / ঝালাই), অধ্যায়ভিত্তিক জমা। রিভিশন সেন্টারেও একই কার্ড।
- নতুন পেপারে ফাঁকা কোটা ভরাটে **due প্রশ্ন আগে** নেওয়া হয়।
- নতুন persisted কালেকশন `retries` (সর্বোচ্চ ২০০০) — `freshData()`, `LIMITS`, `parseBackup` স্যানিটাইজারে যাচাই; ৩০ দিনের পুরোনো “ঝালাই” রেকর্ড স্বয়ংক্রিয়ভাবে বাদ যায়।
- **টেস্ট ৩১১/৩১১ (৪১ ফাইল)** · typecheck + build পরিষ্কার।

## হালনাগাদ (২০২৬-১১-১৬ · v2.17) — Exam Simulator

- **নতুন: পরীক্ষা সিমুলেটর** (`src/examSim.ts`, `src/views/ExamSim.tsx`, রুট `#examsim`) — অধ্যায়/বিষয়/পূর্ণ মক/ভুলের পরীক্ষা, প্রতি MCQ ১ মিনিট, উত্তর-প্যালেট, সময় শেষে **অটো-জমা**, **অটো-মার্কিং**, অধ্যায়ভিত্তিক ফল, প্রতিটি ভুলের সঠিক উত্তর+ব্যাখ্যা, “ভুল প্রশ্নগুলো আবার”।
- পেপারের **এক-তৃতীয়াংশ আগের ভুল প্রশ্ন** — ভুল ফিরে আসে। প্রতিটি উত্তর `attempts` → `mistakes` → `chapterMeta.weak` (২ বার ভুলে) → **কালকের রিভিশন কার্ড** → `tests` (GPA ট্র্যাকারেও যায়)।
- নতুন persisted কালেকশন `examSessions` (সর্বোচ্চ ৫০০) — `freshData()`, `LIMITS`, ও `parseBackup` স্যানিটাইজারে যাচাই সহ; পুরনো ব্যাকআপ অপরিবর্তিত।
- সম্পূর্ণ অডিট ও ধাপে-ধাপে পরিকল্পনা: [`AUDIT.md`](AUDIT.md)।
- **টেস্ট 285/285 (৪০ ফাইল)** · typecheck + build পরিষ্কার।

## হালনাগাদ (২০২৬-১১-১৫ · v2.16) — "যা বাকি ছিল" বন্ধ

- **সব ১১৪ অধ্যায়ে সরাসরি ক্লাস লিংক** ✅ — প্রতি অধ্যায়ে ৬–৮টি যাচাই করা ভিডিও/প্লেলিস্ট, ইংরেজি ২য় পত্রসহ; কোনো অধ্যায়ে শুধু-সার্চ ঘর নেই (৩.১ এখন সম্পূর্ণ)।
- **MCQ ব্যাংক ১১৪/১১৪ অধ্যায়** ✅ — বাকি থাকা ৯টি অধ্যায়ে (জীব ২য় পত্র ১টি, বাংলা ৪টি, ইংরেজি ৪টি) ৪৫টি নতুন প্রশ্ন; `quiz-bank.test.ts` এখন **প্রতিটি** অধ্যায়ে প্রশ্ন থাকা জোর করে যাচাই করে (৭.২ সম্পন্ন)।
- **৭.১ ইংরেজি ২য় পত্রের ক্লাস** — ইতিমধ্যে সমাধান (সব অধ্যায়ে সরাসরি ভিডিও)।
- **৪ নম্বর ও ৭.৩ (ক্লাউড/পুশ/iOS)** — নীতিগত বা প্ল্যাটফর্ম-সীমায় বাদ: অ্যাপ local-first (কোনো সার্ভার/অ্যাকাউন্ট নয়), ব্যাকআপ ফাইল + রিমাইন্ডার ও Android লোকাল নোটিফিকেশন আছে, ওয়েব PWA ডেস্কটপে ইনস্টলযোগ্য, iOS বিল্ডের জন্য Mac/Apple অ্যাকাউন্ট লাগে।
- বোর্ড-প্রশ্ন ট্যাগিং (বিষয়/অধ্যায়/ধরন/সাল/বোর্ড + ফিল্টার) ইতিমধ্যে আছে।

**সংস্করণ 2.31.0** · টেস্ট 545/545 (৬৩ ফাইল) · typecheck + build পরিষ্কার।

---

## ১. এক নজরে

| কী | সংখ্যা |
|---|---|
| অ্যাপের মূল স্ক্রিন (ভিউ) | ১৩টি + ৪টি মোডাল |
| পূর্ণ কাজ করে | ২৬টি ফিচার-এরিয়া |
| আংশিক কাজ করে | ৫টি |
| এখনো নেই | ৩টি |
| অধ্যায় / ইউনিট | ১১৪ |
| প্রশ্নব্যাংক (যাচাই করা MCQ) | ১১৭৬ · প্রতি অধ্যায়ে ১০–১৫ |
| প্ল্যান | ১৮১ দিন · ১০৭৩ টাস্ক · ১৩টা পূর্ণ পরীক্ষা |
| যাচাই করা ক্লাস লিংক | ১১১ সেল (৫২টি আলাদা লিংক) — ১১৪ অধ্যায়ের সবগুলোতে |
| বাংলা ১ম পত্রের পাঠ-ক্লাস | ২৪ / ২৪ |
| টেস্ট | ৫৪৫টি, ৬৩ ফাইল · সব পাস |

---

## ২. ✅ যেগুলো পুরোপুরি কাজ করে

| ফিচার | কী করে | কোথায় | প্রমাণ |
|---|---|---|---|
| **স্মার্ট প্ল্যান** | ১৮১ দিনের রুটিন — ৯২ দিন সিলেবাস, ৫৯ দিন রিভিশন, ৩০ দিন মডেল টেস্ট; প্রতিদিনের ঘণ্টা ৬/৮/১০ | `planner.ts` | `planner.test.ts` (১৫ টেস্ট) |
| **পরীক্ষা সিমুলেটর** | সময় ধরে MCQ পেপার → অটো-জমা, অটো-মার্কিং, অধ্যায়ভিত্তিক ফল, ভুলের ব্যাখ্যা; এক-তৃতীয়াংশ আগের ভুল প্রশ্ন ফিরে আসে | `examSim.ts`, `views/ExamSim.tsx` | `examSim.test.ts` (২২) + `features.test.tsx` (৩) |
| **ভুল প্রশ্নের রিট্রাই** | ভুল প্রশ্ন ১/৩/৭/১৪/৩০ দিনের ল্যাডারে ফেরে, ঠিক হলে ওঠে, ভুলে রিস্টার্ট; পাঁচ ধাপে ঝালাই | `retryLoop.ts` | `retryLoop.test.ts` (২১) + `features.test.tsx` (২) |
| **দুর্বলতা ডিটেক্টর** | ৫টি বাস্তব সংকেত → কারণসহ স্কোর, প্রতি সারিতে একটাই পরবর্তী কাজ, সপ্তাহের প্রতিকার, হোম সতর্কবার্তা | `weakness.ts`, `views/Weakness.tsx` | `weakness.test.ts` (১৪) + `features.test.tsx` (১) |
| **পরীক্ষার রুটিন** | দৈনিক ১০ / সাপ্তাহিক ২৫ / মাসিক ৫০ MCQ—due, দেরি, শেষ ফল, সপ্তাহের স্ট্রিপ, ব্রিফিং লাইন | `cadence.ts` | `cadence.test.ts` (১৯) + `features.test.tsx` (৩) |
| **সূত্র-গণনার প্রশ্ন** | ৪৯ স্কিমা থেকে সংখ্যা বদলে বদলে প্রশ্ন, উত্তর হিসাব করে যাচাই (১৫৯টি প্রশ্ন, ০ ত্রুটি); ভুল অপশনগুলো আসল ভুলের নমুনা, ব্যাখ্যায় ধাপ | `numericGen.ts` | `numericGen.test.ts` (১১) |
| **সিলেবাস হিটম্যাপ** | ১১৪ অধ্যায়ের রঙিন মানচিত্র—প্রস্তুতি বাস্তব তথ্য থেকে, দুর্বল ৩৫%-এ সীমাবদ্ধ, পরীক্ষা ছাড়া ৬৫%-এর বেশি নয়; "এখনই ধরো" ও "পিছলে যাচ্ছে" তালিকা | `heatmap.ts`, `views/Heatmap.tsx` | `heatmap.test.ts` (১৩) + `heatmap.ui.test.tsx` (৫) |
| **স্বয়ংক্রিয় প্রশ্ন তৈরি** | ৮০টি অধ্যায়ের যাচাই করা তথ্য থেকে নিয়মভিত্তিক MCQ—সঠিক উত্তর ব্যাংকে উপস্থিত, ব্যাখ্যায় উৎস, ভুল অপশন আসল অন্য তথ্যের মান; যাচাইয়ে ব্যর্থ কিছু প্রকাশ পায় না | `questionGen.ts`, `views/Practice.tsx` | `questionGen.test.ts` (১৪) + `questionGen.ui.test.tsx` (৩) |
| **ফোকাস বিশ্লেষণ** | সেশন থেকে সিটিং, ঘণ্টাভিত্তিক ছন্দ, ছোট/লম্বা সেশন, সৎ স্ট্রিক (≥৩০ মি), ৫০ মিনিট একটানা হলে বিরতির সতর্কতা, “এখন কী করবে” ব্লক | `focus.ts`, `views/Timer.tsx` | `focus.test.ts` (২০) + `focus.ui.test.tsx` (৫) |
| **প্রশ্নের গভীরতা** | ২৫০টি নতুন যাচাই করা MCQ—৩৬টি পাতলা অধ্যায় ভরে প্রতি অধ্যায়ে ≥৫ প্রশ্ন; ডুপ্লিকেট-গার্ড টেস্ট | `quiz-depth.ts` | `quiz-depth.test.ts` (৯) + `quiz-bank.test.ts` (৬) |
| **অ্যাপ অডিট** | নিজের সব সংখ্যা উৎস থেকে আবার গোনে; দুর্বল চেক হেডলাইনে; সীমা ও পাতলা অধ্যায়ের তালিকা সংখ্যা-সহ | `selfAudit.ts`, `views/Audit.tsx` | `selfAudit.test.ts` (১১) + `selfAudit.ui.test.tsx` (৪) |
| **পরীক্ষার পোস্টমর্টেম** | নম্বর কোথায় গেল—উত্তরহীন/ভুল/প্রশ্নপ্রতি সময়, লেজ ফাঁকা, দ্রুত শেষ, জানার ঘাটতি; অধ্যায়ভিত্তিক ফাঁক নমুনা-সহ; প্রবণতা কেবল ৩+ পরীক্ষায় | `examAnalysis.ts`, `views/ExamSim.tsx` | `examAnalysis.test.ts` (১৬) + `examAnalysis.ui.test.tsx` (৪) + `examSim.test.ts` (+৩) |
| **ব্যাকলগ ম্যানেজার** | মিস হওয়া কাজ হিসাব করে, একই অধ্যায়ের টুকরো জোড়া দেয়, ৮ ঘণ্টার সীমার মধ্যে পরের দিনে ভাগ করে—জায়গা না থাকলে সৎভাবে “জায়গা নেই / আচ্ছাদিত” দেখায় ও ছেড়ে দেওয়ার সুযোগ দেয় | `backlog.ts`, `views/Backlog.tsx` | `backlog.test.ts` (১৯) + `backlog.ui.test.tsx` (৪) |
| **অ্যাডাপ্টিভ প্ল্যানার** | দুর্বল অধ্যায়ের জন্য পরের ৩ দিনের রুটিন পুনর্বিন্যাস—আগে ফাঁকা জায়গা, পরে নিচু অগ্রাধিকারের ব্লক সরিয়ে, সরানো পড়া পরের দিনে; দিনের মোট মিনিট অপরিবর্তিত, **৮ ঘণ্টার কঠিন সীমা** | `adaptive.ts`, `views/Weakness.tsx`, `views/Settings.tsx` | `adaptive.test.ts` (১৬) + `adaptive.ui.test.tsx` (৪) |
| **আজকের পড়া** | আজকের টার্গেট (৫★ আগে), দিনের রুটিন, টিক-অফ, ক্যারিওওভার, মোটিভেশন কার্ড, দিনের নোট | `views/Today.tsx` | `App.test.tsx` (১০) |
| **ক্যালেন্ডার** | মাস গ্রিড, দিন-প্যানেল, কাস্টম সাপ্তাহিক রুটিন, গুরুত্বপূর্ণ তারিখ, ICS এক্সপোর্ট | `views/Calendar.tsx`, `exports.ts` | `exports.test.ts` (৫) |
| **সিলেবাস** | ১১৪ অধ্যায়, সার্চ, প্রায়োরিটি A/B/C, ★ কাউন্ট ফিল্টার, দুর্বল ফিল্টার, "ভিডিও আছে" ফিল্টার, সঠিক পাঠ্যক্রম-ক্রম | `views/Syllabus.tsx` | `dataset.test.ts` |
| **অধ্যায় শিট** | ★/ঘণ্টা/শেষ তারিখ, দুই শিক্ষকের ক্লাস (one-shot · MCQ · CQ), বাংলা পাঠ-গ্রিড, নোট, MCQ/CQ প্রস্তুতি, আত্মবিশ্বাস, টাইমার শুরু | `modals.tsx`, `classLinks.ts` | `components.classes.test.tsx` (৫) |
| **স্পেসড রিভিশন** | ১/৩/৭/১৫ দিনের ইন্টারভাল ইঞ্জিন, ডিউ তালিকা, রিভিশন ইতিহাস | `revision.ts` | `revision.test.ts` (৬) |
| **স্টাডি টাইমার** | পোমোডোরো + স্টপওয়াচ, ম্যানুয়াল সময় যোগ, সেশন লগ, টাইমার শেষে নোটিফিকেশন, অ্যাপ বন্ধ হলেও সময় ধরে রাখে | `hooks.ts`, `views/Timer.tsx` | `hooks.test.ts` (৪) |
| **MCQ অনুশীলন** | ৪২৭ প্রশ্নের ব্যাংক (৬৮ অধ্যায়) + নিজের প্রশ্ন যোগ, ভুলের খাতা, নির্ভুলতার হিসাব, দুইবার একই ভুলে অধ্যায় দুর্বল হয় | `quiz-data.ts`, `views/Practice.tsx` | `study.test.ts` |
| **পরীক্ষা ও GPA** | ১৩টা মডেল টেস্ট, চ্যাপ্টার/বিষয়/মডেল টেস্ট রেকর্ড, ৪র্থ বিষয়ের বোনাসসহ GPA (৫.০০ ক্যাপ), গোল্ডেন A+ ট্র্যাকার | `gpa.ts`, `views/Exams.tsx` | `gpa.test.ts` (৬) |
| **বিশ্লেষণ** | শেষ ৩০ দিনের বিষয়ভিত্তিক সময়, সাপ্তাহিক রিভিউ, দুর্বল অধ্যায়, স্ট্রিক ক্যালেন্ডার, MCQ নির্ভুলতা, ব্যাজ | `analytics.ts`, `views/Analytics.tsx` | `analytics.test.ts` (৬) |
| **লাইব্রেরি** | নিজের নোট, সূত্র ও সংজ্ঞা, বোর্ড প্রশ্ন — সবই সার্চযোগ্য (⌘/Ctrl+K) | `views/Library.tsx`, `modals.tsx` | — |
| **রিমাইন্ডার** | ব্রাউজার নোটিফিকেশন, রিভিশন ডিউ রিমাইন্ডার, Android-এ লোকাল নোটিফিকেশন চ্যানেল | `hooks.ts`, `native.ts` | `native.test.ts` (২) |
| **সেটিংস ও ব্যাকআপ** | নাম, দৈনিক ঘণ্টা, শুরুর তারিখ, থিম (লাইট/ডার্ক/সিস্টেম), ভাষা, পোমোডোরো, JSON ব্যাকআপ/রিস্টোর, CSV এক্সপোর্ট, রিসেট | `views/Settings.tsx`, `storage.ts` | `storage.test.ts` (৫) |
| **অফলাইন / PWA** | সার্ভিস ওয়ার্কার, ম্যানিফেস্ট, আইকন — ইন্টারনেট ছাড়াই চলে | `main.tsx`, `public/sw.js` | — |
| **দুই ভাষা ও থিম** | বাংলা ↔ English — প্রতিটি বোতাম, লেবেল, ট্যাব, টুলটিপ, খালি-অবস্থা, তারিখ ও সংখ্যা বদলায়; দীর্ঘ পড়ার ব্যাখ্যা বাংলাই থাকে | `i18n.ts` | `i18n.test.ts` (৭) |
| **গ্লোবাল সার্চ** | ⌘/Ctrl+K — অধ্যায়, টাস্ক, লাইব্রেরি নোট একসাথে | `modals.tsx` | `App.test.tsx` |
| **Android অ্যাপ** | Capacitor বিল্ড, লোকাল নোটিফিকেশন, স্ট্যাটাস বার; GitHub Actions থেকে APK | `android/`, `.github/workflows` | CI সবুজ |

---

## ৩. 🟡 আংশিক কাজ করে (সীমা স্পষ্ট)

### ৩.১ বিষয়ভিত্তিক ক্লাস কভারেজ

| বিষয় | অধ্যায় | সরাসরি ক্লাস সেল | অবস্থা |
|---|---|---|---|
| বাংলা | ১৭ | ২৪ | ✅ সবচেয়ে সমৃদ্ধ (২৪টি পাঠ + সাজেশন + লালসালু প্লেলিস্ট) |
| জীববিজ্ঞান | ২৪ | ১৬ | 🟡 ১২টা ভিডিও + ২টা সংকলন প্লেলিস্ট |
| পদার্থবিজ্ঞান | ২১ | ১৩ | 🟡 মাশরুর ভাই ৮ + অপুর্ব ৫ |
| ICT | ৬ | ১১ | 🟢 সব অধ্যায়ে alguna ক্লাস |
| রসায়ন | ১০ | ৮ | 🟡 অলরনের ৮টা one-shot |
| উচ্চতর গণিত | ২০ | ২০ | 🟢 প্রতিটি ইউনিটে **রাকিব স্যারের যাচাই করা ফুল-কোর্স প্লেলিস্ট**; ম্যাট্রিক্স/ভেক্টর/কনিকের আলাদা one-shot-ও আছে |
| ইংরেজি | ১৬ | ১৬ | 🟡 ১ম পত্রের ৮ অধ্যায়ে one-shot + passage প্লেলিস্ট; ২য় পত্র (গ্রামার/রাইটিং) এখনো সার্চ |

> ইংরেজি ১ম পত্রের ৮টি অধ্যায়ে Abhi Datta Tushar-এর one-shot আর Pathfinder-এর passage প্লেলিস্ট বসানো; বাকি ৮টি (২য় পত্র — গ্রামার/রাইটিং) এখনো চ্যানেল-সার্চ।

> বাকি সব ঘরে শিক্ষকের **নিজের চ্যানেল-সার্চ** লিংক আছে — তাই লিংক কখনো ভাঙে না, কিন্তু এক ক্লিকে ক্লাস পাওয়া যায় না।

> ক্লাস-লিংকের পূর্ণ তালিকাঃ `CLASS-LINKS.md` (স্ক্রিপ্ট `scripts/class-links-md.ts` থেকে অটো তৈরি)।

### ৩.১.১ নোটিফিকেশন ঠিক করা হয়েছে (2.12.0)

আগে কেন কাজ করছিল না, তার চারটা বাস্তব কারণ ধরা পড়েছে:

1. **চ্যানেল তৈরি হতো না** — `study-reminders` চ্যানেল শুধু "ডিভাইস নোটিফিকেশন" সুইচ চাপলে তৈরি হতো। Android 8+ -এ চ্যানেল না থাকলে নোটিফিকেশন নিঃশব্দে বাদ পড়ে। এখন অ্যাপ চালু হওয়ার সময়ই দুটো চ্যানেল তৈরি হয় (স্টাডি রিমাইন্ডার + আলাদা টাইমার অ্যালার্ম চ্যানেল)।
2. **ভুল আইকন** — `ic_stat_icon_config_sample` নামের কোনো রিসোর্স ছিল না; এখন আসল `ic_stat_icon`, আর `capacitor.config.json`-এর সঙ্গে মিল আছে।
3. **WebView-এর অনুমতি** — Capacitor WebView-তে `Notification.permission` সবসময় `denied` থাকে, তাই ইন-অ্যাপ রিমাইন্ডার লুপ আর "টেস্ট" বোতাম কখনো চলত না। এখন `canNotify()` নেটিভ হলে প্লাগইন ব্যবহার করে।
4. **টাইমার শেষের অ্যালার্ম** — আগে JS-এর টিক শেষ হওয়ার অপেক্ষা করত। এখন সেশন শুরুর সময়ই OS-এ সঠিক সময়ের অ্যালার্ম বুক হয় (`TIMER_ALARM_ID`), তাই অ্যাপ ব্যাকগ্রাউন্ডে বা বন্ধ থাকলেও বাজবে; বিরতি/রিসেটে বাতিল হয়।

সঙ্গে যোগ হয়েছে: `USE_EXACT_ALARM` অনুমতি, রিমাইন্ডার পেজে আসল স্ট্যাটাস ("অনুমতি আছে / ফোনের সেটিংসে বন্ধ"), টেস্ট নোটিফিকেশন বোতাম, আর "সঠিক অ্যালার্ম চালু করো" বোতাম (Android 12+-এ system screen খোলে)।

### ৩.১.২ Android 14 / 15 / 16 — নতুন স্ক্রিনের জন্য UI (2.13.0)

Android 15 থেকে অ্যাপকে **জোর করে edge-to-edge** করা হয় (Android 16-এ opting out নেই), তাই স্ট্যাটাস বার আর জেসচার বারের নিচে লেখা ঢুকে যাওয়ার ঝুঁকি ছিল। যা করা হলো:

- **Insets:** `viewport-fit=cover` + Capacitor-এর `SystemBars` (`insetsHandling: 'css'`) → আসল inset `--safe-area-inset-*` হিসেবে CSS-এ আসে। টপবার, সাইডবার, মেইন কনটেন্ট, বটম নেভিগেশন, টোস্ট আর সব মডাল এখন সেই অনুযায়ী padding নেয়।
- **Android 14-তেও একই রকম:** `MainActivity`-তে `EdgeToEdge.enable(this)` — ১৪, ১৫, ১৬ সবখানে একই লেআউট।
- **স্ট্যাটাস বার আইকন:** থিম বদলালে `SystemBars.setStyle()` দিয়ে আইকনের রং বদলায় (হালকা থিমে কালো, ডার্কে সাদা); `windowLightStatusBar`, transparent status/nav bar, cutout `shortEdges`, nav-bar contrast বন্ধ।
- **বটম শিট:** ফোনে মডাল এখন নিচ থেকে ওঠে (গোড়ায় safe-area), `92dvh` সীমা, বটম বারে Material-স্টাইল active pill আর হালকা shadow।
- **ব্যাক জেসচার / predictive back:** শিট খোলা থাকলে history-তে একটি এন্ট্রি যায়, তাই Android-এর ব্যাক জেসচার বা সোয়াইপ আগে **শিট বন্ধ করে**, স্ক্রিন ছাড়ে না (`App.test.tsx`-এ টেস্ট আছে)।
- **আঙুলের জন্য:** coarse pointer-এ ৪৬–৫২px টাচ টার্গেট, চাপলে scale ফিডব্যাক, tap-highlight বন্ধ, `touch-action: manipulation` (ডাবল-ট্যাপ জুম বন্ধ), `overscroll-behavior` (pull-to-refresh বন্ধ)।
- **কিবোর্ড:** `interactive-widget=resizes-content` + `adjustResize` — লেখার সময় ইনপুট বোতামের নিচে লুকায় না।
- **থিমড আইকন (Material You):** adaptive icon-এ `monochrome` লেয়ার।
- **অ্যাক্সেসিবিলিটি:** সিস্টেমের "Remove animations" মানে `prefers-reduced-motion`, লেখা ২০০% বড় হলেও ভাঙে না (`dvh`, min-height, text-size-adjust)।

### ৩.১.৩ পুরো অ্যাপের ফিচার অডিট (2.13.1)

প্রতিটা ফিচার আরেকবার আসল স্ক্রিন দিয়ে চালিয়ে দেখা হয়েছে—**`src/features.test.tsx`** (১০টা এন্ড-টু-এন্ড টেস্ট) এখন নিয়মিত টেস্ট-স্যুটের অংশ, তাই ভবিষ্যতে কিছু ভাঙলে সঙ্গে সঙ্গে ধরা পড়বে। যা যাচাই হয়:

| অডিট | যা প্রমাণ হয় |
|---|---|
| নোট লেখা | ফর্ম → কার্ডে দেখা যায় → `localStorage`-এ `libraryNotes[0]` |
| YouTube লিংক | লিংক + চ্যানেল নাম সেভ হয়, `videos[0].url` ঠিক থাকে |
| নিজের সূত্র / বোর্ড প্রশ্ন | দুটোই সেভ হয়, বোর্ড তালিকায় দেখা যায় |
| CQ অংশভিত্তিক নম্বর | ক ১ + খ ২ + গ ৩ + ঘ ১ = **৭/১০**, "অংশভিত্তিক রেকর্ড" প্যানেল ভরে যায় |
| নোটিফিকেশন কার্ড (নেটিভ) | `Capacitor.isNativePlatform() === true` হলে ডিভাইস-কার্ড, সিঙ্ক ও টেস্ট বোতাম দেখা যায় |
| লেখার আকার / ডার্ক থিম | `html[data-font=lg]`, `html[data-theme=dark]` সঙ্গে সঙ্গে বসে |
| JSON ব্যাকআপ | ফাইল তৈরি (`createObjectURL`) ও ডাউনলোড ক্লিক দুটোই হয় |
| সাপ্তাহিক রিপোর্ট | `শেয়ার / কপি`, `প্রিন্ট / PDF` কাজ করে (`window.print` + `html.print-report`) |
| গ্লোবাল সার্চ (Ctrl+K) | অধ্যায় সার্চ → অধ্যায় শিট খোলে |

অডিটে একটা আসল বাগ ধরা পড়েছিল: কিছু WebView `history.pushState()` ডাকার সময়ই `popstate` পাঠায়, ফলে শিট খোলা মাত্রই বন্ধ হয়ে যেত। এখন শিট যে history entry নিজে push করেছে সেটার সঙ্গে মিলিয়ে দেখা হয়—শুধু **আসল ব্যাক** (gesture/বোতাম) শিট বন্ধ করে। বাকি সব ফিচার আগের মতোই কাজ করছে (মোট ১৩০টা টেস্ট, ১৮টা ফাইল)।

### ৩.২ অন্য আংশিক জিনিস

| ফিচার | যা কাজ করে | সীমা |
|---|---|---|
| **English মোড** | ৪৭০+ ইন্টারফেস স্ট্রিং দুই ভাষায়; `i18n.test.ts` নিশ্চিত করে কোনো বোতাম/লেবেল/টুলটিপ অনূদিত বাকি নেই | লম্বা ব্যাখ্যা-প্যারা (রুব্রিক টিপস, রিভিশন নির্দেশনা) ইচ্ছাকৃতভাবে বাংলাই থাকে |
| **বাংলা পাঠ-ক্লাস** | ২৪/২৪ পাঠে ক্লাস, শিক্ষকের নামসহ | শেষ পাঠটাও পাওয়া গেছে (বাংলাবাজ) |
| **নোটিফিকেশন** | Android-এ চ্যানেল দুটো (`study-reminders`, `study-timer-alarm`) অ্যাপ চালু হলেই তৈরি হয়; রিমাইন্ডার, রিভিশন ও সেশন-অ্যালার্ম কাজ করে | ওয়েবে ট্যাব খোলা থাকতে হয়; ফোনে ব্যাটারি-অপটিমাইজেশন বন্ধ রাখলে সময়মতো আসে |
| **APK** | ইনস্টল হয়, চলে | `assembleDebug` = **ডিবাগ-সাইনড**; প্লে স্টোরে দেওয়া যাবে না |
| **ব্যাকআপ** | JSON ডাউনলোড/আপলোড, ৮ MB সীমা, ভাঙা ফাইল রিকভারি | অটো-ব্যাকআপ বা ক্লাউড নেই — ফোন বদলালে নিজে ফাইল রাখতে হবে |
| **GPA** | ছয় বিষয় + ৪র্থ বিষয়ের বোনাস নিয়ম ঠিক | ব্যবহারিক না থাকা/বোর্ড-ভেদে সূক্ষ্ম নিয়ম হাতে ঠিক করতে হয় |
| **MCQ ব্যাংক** | ৪২৭টা প্রশ্ন, ৬৮ অধ্যায়, প্রতিটি বিষয়ে অন্তত ২০টা | আসল বোর্ড-প্রশ্নের করপাস নয় — নমুনা ব্যাংক; পরীক্ষার্থীকে নিজের প্রশ্নও যোগ করতে হবে |

---

## ৪. 🔴 যা এখনো নেই

1. **ক্লাউড সিঙ্ক / অ্যাকাউন্ট** — সব ডেটা ফোনেই; ব্যাকআপ ফাইল ছাড়া ডিভাইস বদলানো যাবে না।
2. **পুশ নোটিফিকেশন** — অ্যাপ/ট্যাব বন্ধ থাকলে ওয়েবে রিমাইন্ডার আসবে না (সার্ভার দরকার)।
3. **iOS / ডেস্কটপ প্যাকেজ** — ওয়েব PWA + Android APK আছে, iOS বিল্ড নেই।

---

## ৫. 🔧 উন্নতির সুযোগ (প্রভাব অনুযায়ী সাজানো)

| # | কাজ | কেন দরকার | সময় | প্রভাব |
|---|---|---|---|---|
| ১ | ~~**গণিত + ইংরেজির সরাসরি ক্লাস ভরা** (৩৬ অধ্যায়)~~ ✅ 2.10.0 | এই দুই বিষয়ে শুধু সার্চ লিংক; ফাহাদের ক্যালকুলাস/সরলরেখা, রাকিবের English/Grammar প্লেলিস্ট খুঁজে যাচাই করে বসানো যায় | মাঝারি | ⭐⭐⭐ |
| ২ | ~~**MCQ ব্যাংক ৬০ → ~৬০০**~~ ✅ 2.9.0 (৪২৭) | অনুশীলন এখন পাতলা; প্রতি অধ্যায় ৫টা করে যোগ হলে অ্যাপ সত্যিকারের কুইজ অ্যাপ হয়ে যায় | বড় | ⭐⭐⭐ |
| ৩ | ~~**CQ রুব্রিক ও মডেল উত্তরের কাঠামো**~~ ✅ 2.9.0 | ক-এর ১, খ-এর ২, গ-এর ৩, ঘ-এর ৪ — নিজে নম্বর দেওয়ার বদলে গাইড মিলবে | মাঝারি | ⭐⭐⭐ |
| ৪ | ~~**রিলিজ-সাইনড APK + versionCode অটো**~~ ✅ 2.8.0 (আপলোড করা keystore থাকলে) | প্লে স্টোর/সহজ আপডেট; এখন ডিবাগkey | ছোট | ⭐⭐ |
| ৫ | ~~**i18n ১০০%** (সেটিংস/লাইব্রেরি/অনুশীলন/পরীক্ষা/ক্যালেন্ডার)~~ ✅ 2.10.0 | ইংরেজি মোড এখন অর্ধেক; ~২৫০ স্ট্রিং | মাঝারি | ⭐⭐ |
| ৬ | ~~**"ক্লাস দেখেছি" ট্র্যাকিং**~~ ✅ 2.7.0 | কোন অধ্যায়ের ক্লাস দেখা হয়নি তা অ্যানালিটিক্সে দেখাবে | ছোট | ⭐⭐ |
| ৭ | ~~**অ্যাডাপটিভ রিভিশন** (ভুলের হার দেখে ইন্টারভাল)~~ ✅ 2.8.0 | এখন সবাই একই ১/৩/৭/১৫ দিন পায়; দুর্বল অধ্যায় আরও ঘন ঘন আসা উচিত | মাঝারি | ⭐⭐⭐ |
| ৮ | ~~**সাপ্তাহিক রিপোর্ট PDF/শেয়ার**~~ ✅ 2.8.0 | অভিভাবক/নিজের রিভিউ; এখন শুধু CSV/Markdown | ছোট | ⭐⭐ |
| ৯ | ~~**টাইমার ফোরগ্রাউন্ড সার্ভিস (Android)**~~ ✅ 2.11.0 | অ্যাপ ব্যাকগ্রাউন্ডে গেলেও টাইমার নির্ভুল থাকবে | মাঝারি | ⭐⭐ |
| ১০ | ~~**ব্যাকআপ রিমাইন্ডার + ফাইল শেয়ার**~~ ✅ 2.7.0 | "৭ দিন ব্যাকআপ নাওনি" অ্যালার্ট; Capacitor Share দিয়ে Drive/WhatsApp-এ পাঠানো | ছোট | ⭐⭐ |
| ১১ | ~~**ফন্ট সাইজ সেটিং**~~ ✅ 2.7.0 | ছোট/বড় স্ক্রিনে পাঠযোগ্যতা | ছোট | ⭐ |
| ১২ | ~~**শেষ পাঠের ভিডিও + ACS হ্যান্ডেল**~~ ✅ 2.10.0 | ২৪/২৪ পাঠ, ACS-কে বাংলার ২য় শিক্ষক | ছোট | ⭐ |

---

## ৬. টেস্ট কভারেজ (৪১৭টি, ৫০ ফাইল, সব পাস)

| ফাইল | টেস্ট | কী ঢাকে |
|---|---|---|
| `planner.test.ts` | ১৫ | প্ল্যান, টাস্ক, ধারাবাহিকতা, স্ট্যাটস |
| `quiz-bank.test.ts` | ৬ | ৪২৭ প্রশ্ন, অধ্যায়-মিল, অপশন, ব্যাখ্যা |
| `backup.test.ts` | ৭ | ব্যাকআপ ভ্যালিডেশন, রিকভারি |
| `App.test.tsx` | ১০ | নেভিগেশন, মোডাল, সেভ, ওয়েব/নেটিভ আচরণ |
| `i18n.test.ts` | ৭ | ভাষা টগল, সংখ্যা, তারিখ, **প্রতিটি লেবেল/টুলটিপ অনূদিত কি না** |
| `gpa.test.ts` | ৬ | গ্রেড পয়েন্ট, ৪র্থ বিষয়, A+ |
| `analytics.test.ts` | ৬ | সময়, স্ট্রিক, সাপ্তাহিক হিসাব |
| `revision.test.ts` | ১০ | ইন্টারভাল, ডিউ, সম্পন্ন, রিকল রেটিং |
| `exports.test.ts` | ৫ | ICS ফরম্যাট, Markdown, CSV |
| `storage.test.ts` | ৫ | সেভ, রিস্টোর, ব্যাকআপ ভ্যালিডেশন |
| `study.test.ts` | ৫ | নোট, দুর্বল, ক্যারিওওভার |
| `components.classes.test.tsx` | ৬ | ক্লাস ব্লক, পাঠ-তালিকা, দুই শিক্ষক |
| `motivation.test.ts` | ৫ | দৈনিক মোটিভেশন |
| `hooks.test.ts` | ৪ | টাইমার স্টেট, পার্সিং |
| `dataset.test.ts` | ২ | ১১৪ অধ্যায়ের ক্রম, লিংক, শিক্ষক |
| `native.test.ts` | ৮ | নোটিফিকেশন, চ্যানেল, সেশন অ্যালার্ম, ফোরগ্রাউন্ড সার্ভিস |

**নিজে যাচাই করার কমান্ড:**

```bash
npm run typecheck   # টাইপ ঠিক কি না
npm test            # ৪১৭ টেস্ট
npm run build       # প্রোডাকশন বিল্ড
npm run dev         # ব্রাউজারে চালু (0.0.0.0:3000)
```

---

## ৭. আমার সুপারিশ — পরের তিন ধাপ

1. **ইংরেজি ২য় পত্রের (গ্রামার/রাইটিং) যাচাই করা ক্লাস** — ৮টি অধ্যায়ে এখনো সার্চ-লিংক; এতে কভারেজ ১১১ → ১১৯ সেল হবে।
2. **জেনারেটরের গভীরতা** — কভারেজ এখন ১১৪/১১৪ অধ্যায়, কিন্তু বেশিরভাগ অধ্যায়ে একটি করে তথ্য (কোনো অধ্যায়ে ৩–৫টি)—একই অধ্যায়ের আরও তথ্য যোগ করলে এক-অধ্যায়ের মক টেস্ট আরও বৈচিত্র্যময় হবে।
3. **পুশ নোটিফিকেশন / ক্লাউড ব্যাকআপ** — এখন শুধু লোকাল; ফোন বদলালে ফাইল হাতে নিতে হয়।

---

*এই রিপোর্টের সব সংখ্যা কোড থেকে মাপা। ক্লাস-লিংকের বিস্তারিত `CLASS-LINKS.md`-এ, প্ল্যানের বিস্তারিত `HSC-27-STUDY-PLAN.md`-এ।*

</details>
