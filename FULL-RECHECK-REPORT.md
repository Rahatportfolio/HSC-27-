# প্রস্তুতি HSC27 — পূর্ণ follow-up check ও মেরামত

এই report **`arena/25b5228c-hsc-27`**, base **`ed598111e95decb903c3490166d4900525b2ceda`**-এর follow-up-এর। [PR #19-এর ১,১৯৫-test checkpoint](A-Z-RECHECK-REPORT.md) বা তার APK/PWA-কে এই মেরামতের নতুন প্রমাণ বলা হচ্ছে না। চাওয়া routine start **২০ নভেম্বর ২০২৬** অপরিবর্তিত।

## যে সমস্যাগুলো সত্যিই পাওয়া ও মেরামত হয়েছে

| সমস্যা | মেরামত ও regression proof |
|---|---|
| পুরোনো source-এর completion দিয়ে নতুন দীর্ঘ class-এর দুই half একই দিনে আসতে পারত | Pair-day evidence এখন **বর্তমান source IDs**-এর কাজ থেকে আসে। URL/duration/calculation বদলালে predecessor-এর timestamp history-তেই থাকে; নতুন দুই half-এর প্রথম দিন হিসেবে গণনা হয় না। 240→360-minute replacement reproduction আগে ব্যর্থ; নতুন regression-এ প্রত্যেক replacement class অন্তত দুই study date পায়, প্রথম দিনে সর্বোচ্চ প্রথম half। |
| শুধু S availability, flashcard, scan, bookmark, pending revision বা schedule edit থাকলে backup reminder নাও আসত | `hasStudyData` এখন এসব single-feature profile-ও চেনে। Actual S dashboard-এ বাদ-পড়া `BackupNudge` পুনরায় বসানো হয়েছে; **এই actual view-এর regression মেরামতের আগে ব্যর্থ হয়েছে**। |
| `localStorage` object পাওয়া গেলেও `getItem` SecurityError দিলে dashboard crash | Backup/snooze record reads fail safely; app reminder দেখাতে পারে। Throwing Storage regression পাস, data mutation নয়। এটি সব restricted-storage device-এর certification নয়। |
| UTC timestamp-এর প্রথম দশ অক্ষর দিয়ে Bangladesh backup age ভুল; invalid snooze/future backup reminder লুকাতে পারত | Dhaka calendar date দিয়ে age; invalid dates/snoozes উপেক্ষা; unexplained future backup-কে “আজ” বলা হয় না। বাংলা/English label regression আছে। |
| Reminder-এ JSON-কে recovery-এর একমাত্র উপায় বলা, কিন্তু JSON-এ scan/media bytes নেই | Progress/text JSON বনাম **নতুন full-media backup ও আলাদা PDF**-এর সীমা স্পষ্ট; media profile-এ Full backup navigation। শুধু Settings খোলাকে backup taken হিসেবে record করে না। |
| Stalled YouTube API script retry-এ আটকে থাকত; cancellation বিশ সেকেন্ড অপেক্ষা করাতে পারত | Timeout/error-এ stale script ও callback cleanup; নতুন retry; caller-specific immediate abort; shared request-এর অন্য caller চলতে পারে। অন্য integration-এর throwing callback valid request ভাঙে না। **Simulated API lifecycle tests**, live YouTube certification নয়। |
| আটটি saved reference-এ contradictory date-কে certified fresh observation বলা হচ্ছিল | Raw original `2026-11-18`, claimed recheck `2026-11-16`, retained trace `2026-11-19` আলাদা রাখা; actual observation date **unverified**। `checkedOn`/`metadataRecheckedOn: null`; editor/export-এ সত্য label। নতুন reference opt-in-এর **`acceptedAt` observation নয়**। Strict acceptance ISO/calendar/source/URL validation; legacy observation, source identity ও completion/history অক্ষত। |
| Manual duration/source/optional-video edit-এর পরে stale reference provenance থেকে যেতে পারত | তিনটি UI mode-এর save/parse regression নতুন acceptance/observation clear হওয়া যাচাই করে। Player observation এখনও নিজস্ব URL/observation evidence ছাড়া বৈধ নয়। |
| Current APK publisher আগের delivery branch-এ pinned ছিল | Workflow ও publisher **এই branch-এ একসঙ্গে re-pin**, wildcard নয়। নতুন positive/negative guards পুরোনো branch-এর internally consistent successful run-ও reject করে। Exact source/run/attempt, immutable artifact hash, build/API 34/API 35/full built-web success, development acknowledgement, non-Latest ও signing boundaries অক্ষত। |

প্রথম নতুন regression batch: **১৯টির মধ্যে ১৮টি fail / ১টি pass** মেরামতের আগে। আলাদা actual-S reminder regression-ও আগে fail করেছে। এগুলোকে baseline success বা পূর্ণ পুরোনো-source suite বলা হচ্ছে না।

### যে মূল নিয়মগুলো বজায় আছে

- Editable A-only S shortlist; A/B/C মুছে ফেলা নয়। একই দুই বই/অধ্যায়ের প্রথম অংশ প্রথম study day, অবশিষ্ট পরের study day বা capacity অনুযায়ী আরও পরে।
- Availability-first setup: dates, multiple windows, weekdays, daily net cap, fixed obligations ও breaks। Finish → dashboard; future Settings reflow capacity ছাড়ায় না।
- শুধু video duration ÷ selected speed; reading/notes/MCQ/CQ/revision আলাদা quantity/rate/difficulty/prior-review budget। Unknown duration অনুমান করে ৮০ মিনিট নয়।
- Unfinished work future capacity নেয়, পূর্ণ দিনের ওপর বাড়তি ঘণ্টা নয়। ছয় required group ছাড়া Fully Completed নয়; coverage/readiness আলাদা।
- Notes, URLs, completion timestamps/history, localStorage/SQLite compatibility ও offline behaviour রক্ষা। Brain opt-in, local, bounded, explainable এবং read-only recommendation; silent reschedule/completion নয়। Backend/cloud database/paid API যোগ হয়নি।

## এই source-এর সম্পন্ন স্থানীয় যাচাই

| পরীক্ষা | মাপা ফল |
|---|---|
| Locked dependency install/tree | **২৯০ package**; `npm ci` ও final `npm ls --all` পাস; lockfile বদলায়নি |
| TypeScript | **PASS** |
| সম্পূর্ণ unit/UI suite | **১,২৪৪ / ১,২৪৪ PASS**, **১২২ file**, **০ fail / ০ skip / ০ todo**; clean full run প্রায় **২২৯.২২ s** |
| Node safety/build/release/deployment guards | **১৬৯ / ১৬৯ PASS**, ০ skip/fail; current-download boundary এখন ৩৪ case |
| Production build + mandatory postbuild gates | **PASS**; entry **491,550 B**, unique eager JS **1,052,342 B**, **৪৬ chunk**, সব lazy asset precached |
| Production-only ও full npm audit | **দুটিতেই ০ known vulnerability**; feed-based snapshot, security certificate নয়; dependency patch/suppression দাবি নয় |
| Frozen source integrity | **৩৬০ input অপরিবর্তিত** final checks চলাকালে |
| Browser-tested বনাম final rebuilt public assets | **৮৬/৮৬ file-এর bytes/hash একই**, মোট **4,145,060 B** |
| Deterministic schedule/reflow matrix | **২০ seed PASS**; windows/obligations/speed/partial work, cap, source-range conservation, non-overlap, unchanged history, parse round-trip ও determinism |

### একটি failure লুকানো হয়নি

Browser campaign-এর সঙ্গে একসঙ্গে চলা প্রথম full run-এ **১,২৪৩/১,২৪৪ pass**; App-এর multi-page sweep `STACK_TRACE_ERROR`/প্রায় ৫.১ s-এ ব্যর্থ হয়েছিল। আলাদা exact test পাস করলেও সেটিকে full-suite pass বলা হয়নি। Browser শেষ হওয়ার পরে **পুরো suite পুনরায়** চলে উপরের ১,২৪৪/১,২৪৪ ফল দিয়েছে; একই route sweep সেই full run-এ **প্রায় ৩.১৫ s**-এ পাস। Timeout বাড়ানো, assertion বাদ দেওয়া, test skip বা onboarding bypass হয়নি। Concurrent load কারণ হতে পারে, কিন্তু প্রমাণিত root cause বলে দাবি নয়।

## Production Chromium/browser ফল

Unfiltered `npm run test:built-web`-এর **৯/৯ suite exit 0**; dev HMR নয়।

| Suite/journey | ফল |
|---|---|
| Reviewer positive/negative controls | **২০ PASS**; unsupported/covered/clipped findings fail-closed, rule/selector exemption নয় |
| Lazy routes/offline/chunk failure recovery | **২৯ PASS**, ২৪ route, retained data ও non-destructive JSON recovery |
| Responsive matrix | **৩৮৩ PASS**; onboarding/legacy/S, ৫ layout/theme/language scenario, ২৪ route + dialogs/timers; ০ page error |
| Personal routine | **২৪ PASS**; setup/windows/net cap/obligations, long actual durations, pair/six groups, retained appointment, next phase/calculator/archive/undo/reload/offline; actual S reminder assertions যুক্ত |
| Local Brain | **২৫ PASS**; explicit opt-in/confirm/pause/forget/offline/timer boundary |
| Drawer/keyboard/first-use offline PDF | **১০ PASS** |
| Mobile shell | **৪৭ PASS**; actual touch, exposed targets, insets/clocks, retained profiles |
| Study/media | **PASS**; real synthetic media save/play/resume, notes, full backup/restore ও production-PWA offline reload |
| Expanded automated accessibility | **৪৩০ state**, ২৪ route/৮ scenario/১৭ dialog types ও populated quiz/exam/long-title states; **০ violation / ০ page error** |
| Raw axe incomplete supplemental reviews | **৬,২৪৮ retained / ৬,২৪৮ verified**, **০ failed / ০ unresolved**; raw findings বাদ নয় |

আলাদা production-browser campaigns-ও সম্পূর্ণ:

- **Dhaka ও New York দুই timezone**: 320px real-touch 20 November shortcut, linked dates, cancel/atomic save, partial progress/history, reload, Markdown/ICS ও capacity warning পাস।
- **Scanner/PDF/undo/timer/full-media backup**: actual synthetic image upload/edit/crop/perspective/navigation/removal/save/reload, দুই-page PDF, complete→reload→undo, early finish-এ measured দুই মিনিট কিন্তু task auto-complete নয়; v2 full backup থেকে fresh profile-এ **exact image bytes restore**, পুনরায় PDF export; simulated storage failure-এ পুরোনো profile/clocks অক্ষত এবং retry পাস।
- **২২৪ native-field browser probes**, ৮ scenario/২৩ route, app/OS colour-scheme contrast, visible keyboard/file-chooser path, notes typing/reload, date/search controls, contained backup action labels পাস। এখানে “native-field” মানে Chromium-এর HTML input; Android native instrumentation নয়।
- **৩টি 320px/large-text reminder journey**: actual S, scanner-only ও flashcard-only; real touch-এ Full backup পৌঁছায়, শুধু navigation backup time লেখে না। Reminder-only scanner fixture metadata synthetic—এটি image-byte proof নয়; আগের আলাদা full-media journey-ই সেই প্রমাণ।

এগুলো overlapping campaigns; সংখ্যা যোগ করে unique coverage বাড়ানো হয়নি। Automated measurements/axe review **পূর্ণ WCAG, manual screen-reader বা সব physical phone-এর certificate নয়**।

## Source/asset identity ও পুনরুৎপাদন

Final non-document input fingerprint:

```text
c155498b2fe12466d61936aa3b8f6d285bddb278f0eee93a67aec4b8407122bd
```

Algorithm: `git ls-files --cached --others --exclude-standard`-এর unique existing paths; Markdown ও `verification/` evidence বাদ। প্রতিটি path-এর SHA-256 দিয়ে sorted path→hash map, UTF-8 JSON, `sort_keys=True`, `separators=(',', ':')`, কোনো whitespace/newline নয়; সেই bytes-এর SHA-256। এটি self-referential Git commit নয়। Source/config/native/assets/tests/lockfile অন্তর্ভুক্ত; ignored cache/dependencies/build output নয়।

Browser run প্রথমে একই runtime-এর fingerprint `1908f674ca6ae1644f56d4d951e990193ecb93900b5c1ed3660df0392a232c76` থেকে build পেয়েছে। পরে **শুধু চারটি non-document file** বদলেছে: reference-এর chronology **comment**, current-download publisher-এর branch pin, তার guard tests ও workflow pin। Final full tests/typecheck/build/১৬৯ guards নতুন fingerprint-এ চলে; **সব ৮৬ rebuilt asset-এর exact bytes browser-tested build-এর সঙ্গে পুনরায় মিলেছে**। Browser চালানোর পরে অযাচাইকৃত runtime edit হয়নি।

Sorted relative public path→SHA-256 map-এর একই canonical JSON algorithm-এ final web-tree hash:

```text
957b381eadb4d422c169022b4e9e631f0d33c9663e2c516a7cce95adec6dbea3
```

```sh
npm ci
npm ls --all
npm run typecheck
npm test
node --test scripts/*node-test.mjs
npm run build
CHROMIUM_PATH=/path/to/chromium npm run test:built-web
# আলাদা built preview চালু রেখে:
BASE_URL=http://127.0.0.1:3000 CHROMIUM_PATH=/path/to/chromium npm run test:date-browser
BASE_URL=http://127.0.0.1:3000 CHROMIUM_PATH=/path/to/chromium npm run test:post-release-browser
BASE_URL=http://127.0.0.1:3000 CHROMIUM_PATH=/path/to/chromium npm run test:input-accessibility
npm audit --omit=dev
npm audit
```

Local raw evidence: ignored `.cache/recheck/accepted/`-এ frozen per-file map, dependency/typecheck/build/full-suite/১৬৯ guards/two audits ও integrity result; `.cache/recheck/final/`-এ complete nine-suite reports/raw axe measurements, date/backup/native-field/reminder reports ও screenshots। Negative-before reports `.cache/recheck/before-fixes-tests.json` ও `s-dashboard-before.json`। Cache স্থায়ী delivery নয়; এই report, committed regression tests এবং exact-source CI/release/PR records আলাদা durable record।

## নতুন APK/PWA delivery-এর সীমানা

এই document local verification record; local preview বা পুরোনো [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19) দিয়ে নতুন publication প্রমাণ হয় না। **[এই follow-up branch-এর PR](https://github.com/Rahatportfolio/HSC-27-/pulls?q=is%3Apr+head%3Aarena%2F25b5228c-hsc-27)-এর Delivery section**-এ final full source SHA, Android API 34/API 35/full-web run, direct `.apk` URL, APK hash/certificate এবং merge/main Pages-এর every-file byte-verification result একত্রে রাখা হয়। CI failures থাকলে local result দিয়ে gate bypass নয়। [Exact-source download policy](DIRECT-APK.md)।

Original production signing key নিশ্চিত নয়। Development APK **approved compatible production update নয়**; package/version/signing identity বদলায়নি। কেবল conflicting installation-হীন separate test device/profile ব্যবহার করবে। **পুরোনো app uninstall/Clear data করবে না; original device, যাচাইকৃত নতুন full-media backup ও আলাদা PDF রাখবে।** PWA/APK private storage আলাদা; JSON/legacy backups original media/scan bytes রাখে না। Latest v2.43, held v2.44 draft বা পুরোনো assets replace করার অনুমতি এই delivery নয়।

এই follow-up-এ নতুন live YouTube fetch/player/full-content audit হয়নি। Official board dates/content, physical OEM camera/keyboard/background alarms ও manual screen-reader acceptance-কে automated browser/emulator evidence দিয়ে “সব verified” বলা হচ্ছে না। পেয়েছি এমন feasible code faults মেরামত হয়েছে; “চিরতরে bug-free” নিশ্চয়তা নয়।
