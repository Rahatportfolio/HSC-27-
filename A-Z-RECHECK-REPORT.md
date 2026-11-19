# প্রস্তুতি HSC27 — PR #19-এর প্রকাশিত checkpoint

**Session date: ১৬ নভেম্বর ২০২৬। চাওয়া routine start: ২০ নভেম্বর ২০২৬—অপরিবর্তিত।**

**এই report-এর ১,১৯৫-test/build/browser সংখ্যা PR #19-এর পুরোনো snapshot-এর। নতুন branch-এর মেরামত ও নিজস্ব ফল [FULL-RECHECK-REPORT.md](FULL-RECHECK-REPORT.md)-এ; আগের APK/PWA-তে নতুন পরিবর্তন আছে বলে দাবি নয়।**

এটি আগের ১,১৫০-test / ২.১৫ MB bundle / outstanding axe-review checkpoint-এর বদলি নতুন ফল। পাওয়া সমস্যাগুলো source-এ মেরামত হয়েছে; test বাদ দিয়ে বা unknown duration/completion অনুমান করে পাস দেখানো হয়নি। কোনো পরীক্ষাই সব ফোন, সব ভিডিও বা সব পরিস্থিতিতে “bug-free” নিশ্চয়তা নয়।

## কী শেষ করা হয়েছে

- **S-first/availability-first routine:** A থেকে editable গুরুত্বপূর্ণ shortlist; setup-এর আগে routine নয়; একাধিক windows, net hours, weekdays ও fixed obligations। একই দুই বই/অধ্যায়ের অংশ প্রথম study day, পরের অংশ পরের study day বা বাস্তব capacity অনুযায়ী আরও দিন। দীর্ঘ class কেটে দুই দিনে মিথ্যা শেষ নয়।
- **আসল workload:** video duration ÷ speed; reading/notes/MCQ/CQ/revision আলাদা volume/count/rate/difficulty/prior-review হিসাব। Unknown সময় unknown-ই থাকে। ছয় required group ছাড়া Fully Completed নয়; coverage/readiness আলাদা। অসমাপ্ত range পরের capacity নেয় ও future work সরায়—পূর্ণ দিনের ওপর বাড়তি কাজ নয়।
- **ডেটা সুরক্ষা ও Brain:** legacy opt-in migration, dates/history/notes/media references, scoped undo, retained later phases ও safe Settings reflow। ছোট Brain opt-in/local/bounded/explainable; chat/private notes upload, silent reschedule বা timer-certified completion নয়।
- **Startup repair:** Home eager, **২৩ optional route lazy**। Heavy question text/generators, exam generation এবং PDF startup import থেকে সরানো; exact **১,১৭৬-ID metadata index** generation/check, lightweight saved-exam accuracy। বড় module eager করে পুরোনো test চালু রাখার পথ নেওয়া হয়নি।
- **Offline/recovery:** সব built lazy asset precached। প্রথম successful install-এর পরে ২৪ route offline প্রথমবার খোলে। Missing chunk পুরো app blank বা profile reset করে না; Home/Settings/reopen ও synchronous JSON recovery backup আছে। JSON-এ original media/scan bytes নেই—UI-তেই সতর্কতা আছে।
- **UI/accessibility repairs:** missing video metadata-তে bare `0` নয়; class labels wrap করে, Library header/actions আলাদা থাকে। C badge, MCQ option letters, future-phase numbers, hero progress/short labels ও dark CQ letters-এর contrast মেরামত। Fixed 24px CQ rubric box-এর overlap সরানো; বড় লেখায় target/date ও subject badge আর কেটে যায় না। 393px-তে exam result-এর দীর্ঘ বাংলা chapter name কাটার প্রকৃত runner failure-ও মেরামত: title এখন wrap করে; deterministic chapter-result/hover journey ও real chapter action আছে। পুরোনো clipped CSS পুনরায় বসালে exact geometry assertion ব্যর্থ হয়—test দুর্বল করে pass নয়।
- **Android বাস্তব touch gate:** canonical saved legacy/S fixtures, availability-first fresh launch, fonts/compositor/window focus, 100%/130% WebView text zoom, clock readability ও actual pointer injection। ordinary DOMRect mapping আগে; Android CSS-zoom fallback কেবল target-এর তিন exposed point মিলে গেলে। Disabled/covered/offscreen target বা unfocused window-তে tap নয়; screenshot/measurement থাকে। Retained paused timer বাস্তব reset/confirmation UI দিয়েই reset হয়। Disposable emulator awake/unlocked precondition production onboarding বা saved data বদলায় না।
- **টেকসই gate:** mandatory postbuild size/eager-import/precache checks; cache-এর source copies আর Vitest-এর duplicate suite নয়। Lazy-route-aware unit/browser tests actual view-এর জন্য অপেক্ষা করে; timer assertions-এর real elapsed behavior অপরিবর্তিত। Main-only Pages deploy-এর পরে uploaded build-এর **প্রত্যেক file-এর actual public bytes/hash** মেলার নতুন GET-only gate; পুরোনো live URL বা deployment success দিয়ে নতুন source দাবি নয়।

## PR #19 checkpoint-এর যাচাই

| পরীক্ষা | ফল ও অর্থ |
|---|---|
| সম্পূর্ণ isolated source + `npm ci` | **PASS**; ২৯০ package, clean top-level dependency tree; Android/workflow source-ও copy-তে আছে |
| Clean-source TypeScript | **PASS** |
| Clean-source পূর্ণ unit/UI suite | **১,১৯৫ PASS / ১১৯ ফাইল / ০ failure**; ৩৮২.৪৯ সেকেন্ড; duplicate cache suite নয় |
| Production build + mandatory postbuild gate | **PASS**; clean-source build ১২.১৬ সেকেন্ড; root ও clean build-এর সব ৮৬ file-এর bytes/hash একই |
| Node safety/size/release/deployment/diagnostic guards | **১৬৬ PASS / ০ failure**; এর মধ্যে size/precache ৬, current-download boundary ৩১, deployed-web positive/negative controls ৯ |
| Production + full npm audit | **দুটিতেই ০ known entry**; feed-ভিত্তিক dependency ফল, security certificate নয় |
| Lazy module/offline/recovery | **২৯ PASS**; startup module requests, ২৪ offline route, retained history, missing-chunk UI ও JSON backup |
| Personal routine browser | **২৪ PASS**; new setup, obligations/net cap, actual long duration, pair/six groups, phase/undo/retained appointment, offline ও saved-state matrix |
| Brain browser | **২৫ PASS**; opt-in/draft/confirm/offline/memory/pause/forget/explicit timer ও synthetic states |
| Drawer + first-use offline PDF | **১০ PASS**; ৯ keyboard/stack/resize/navigation section + actual offline দুই-page PDF |
| Mobile shell | **৪৭ PASS**; touch, occlusion, inset, clocks, retained data ও legacy/S first-day toolbar |
| Study/media browser | **PASS**; real synthetic WebM save/play/resume, notes, exact full backup/restore, shared collector, mobile tabs ও built-PWA offline reload |
| পূর্ণ automated accessibility matrix | **৪৩০ state PASS / ০ violation**; ২৪ route, ৮ width/theme/language/profile scenarios, dialogs, quizzes, exams/history ও ১২টি deterministic long-chapter result/hover state |
| Raw axe incomplete review | **৬,২৫২ retained / ৬,২৫২ supported supplemental review verified / ০ failed / ০ unresolved** |
| Supplemental reviewer controls | **২০ PASS**; faint/nested/native-placeholder faults ধরা; covered/clipped/opacity/unsupported images unresolved থাকে; names, scrolling ও cleanup যাচাই |

প্রথম isolated test attempt-এ copy থেকে Android/workflow files বাদ পড়ায় source-policy tests ব্যর্থ হয়েছিল; সেটিকে pass বলা হয়নি। পূর্ণ source copy দিয়ে নতুন clean install/build/full suite-ই উপরের ফল। Ignored copy-র tests root Vitest-এ duplicate হচ্ছিল—explicit `src/**/*.test.{ts,tsx}` discovery দিয়ে সেটিও মেরামত হয়েছে।

Responsive matrix-এর ৩ profile × ৫ scenario × ২৪ route + dialogs/timer = **৩৮৩ checks**। Production acceptance-এ isolated onboarding/legacy/S profiles, বড় saved font, Bengali/English ও light/dark states থাকে। Extra deterministic long-title result states পুরোনো random-paper coverage সরায়নি। Native/download/public deployment-এর source-specific record নিচে আলাদা; এই counts-কে সব বাস্তব ফোনে exhaustive proof বলা হচ্ছে না।

### Accessibility-এর সঠিক সীমা

Raw axe JSON বাদ দেওয়া, rule disable বা selector exemption করা হয়নি। প্রতিটি matching text run-এর foreground/background, clipping, exposed-point hit testing ও explicit name evidence সংরক্ষিত। Supported opaque sRGB linear gradient-এর **সম্পূর্ণ colour range-এর conservative contrast bound** ব্যবহার হয়—gradient-এর একটি সুবিধামতো point বেছে pass নয়। Native field-এ actual value/placeholder style দেখা হয়; ফাঁকা field-এ কোনো glyph আঁকা না হলে সেটি আলাদাভাবে নথিভুক্ত হয়। Unsupported/obscured cases fail-closed; reviewer-এর deliberate controls তা যাচাই করে।

এটি **automated supplemental evidence**, physical screen-reader journey বা সম্পূর্ণ WCAG certificate নয়। সব raw incomplete-কে confirmed bug বলা যেমন ভুল, measurement ছাড়াই pass বলাও ভুল।

## Performance ফল

| মাপ | বর্তমান |
|---|---:|
| Entry JavaScript | **৪৮৯,০০৫ B**; gzip প্রায় **১৪৪.৪৪ kB** |
| সম্পূর্ণ unique eager JS closure | **১,০৪৯,৭৯৭ B**—শুধু entry নয় |
| JS chunks | **৪৬**; প্রতিটি ৫০০,০০০ B-এর নিচে |
| Optional question bank | প্রায় **৩৯৬.৩৫ kB**, startup নয় |
| Optional PDF renderer | প্রায় **৩৮৬.৩৩ kB**, startup নয়; প্রথম offline ব্যবহার পরীক্ষিত |
| Mandatory ceiling | Entry/per-chunk **৫০০,০০০ B**, unique eager JS **১,১০০,০০০ B** |

প্রায় **২.১৫ MB → ৪৮৯ kB entry**; পুরো startup JS-ও প্রায় অর্ধেক হয়েছে। “অ্যাপ মোটে ৪৮৯ kB” বা low-end Android startup/memory/battery certified—কোনোটিই দাবি নয়। Bad manifest/precache, oversized chunk, eager question/PDF import বা missing lazy route হলে build gate ব্যর্থ হয়।

## আটটি ভিডিও-reference: date/provenance মেরামত

**আগের date claim প্রত্যাহার/সংশোধন:** এই report-এর আগের সংস্করণ `2026-11-16`-কে নিশ্চিত নতুন metadata-check date বলেছিল। Retained record-এ original `2026-11-18`, claimed recheck `2026-11-16` ও fetch trace `2026-11-19` মেলে না; প্রকৃত observation date প্রতিষ্ঠিত নয়। নতুন source সব raw label আলাদা রেখে `metadataRecheckedOn` ও প্রতিটি reference-এর `checkedOn: null` এবং unverified flag ব্যবহার করে। ছাত্র reference গ্রহণ করলে কেবল আলাদা `acceptedAt` যোগ হয়—player observation বা পুরোনো completion/history redating নয়। এই follow-up-এ নতুন YouTube fetch/full-content verification হয়নি। [মেরামত ও regression proof](FULL-RECHECK-REPORT.md)। নিচের দৈর্ঘ্য ও suitability সংরক্ষিত সীমিত reference, বর্তমান player reading নয়।

| Exact video | Shown duration | সীমিত সিদ্ধান্ত |
|---|---:|---|
| [9oxhLHSATYM](https://www.youtube.com/watch?v=9oxhLHSATYM) | 7:25:34 | Dynamics lecture-এর opt-in full-video duration candidate |
| [wtrodXS2cwU](https://www.youtube.com/watch?v=wtrodXS2cwU) | 3:38:53 | Dynamics MCQ candidate |
| [fV8WGJJwbNk](https://www.youtube.com/watch?v=fV8WGJJwbNk) | 4:02:06 | Dynamics CQ candidate |
| [YlIJOJCB0-E](https://www.youtube.com/watch?v=YlIJOJCB0-E) | 8:01:55 | Periodic properties/bonding lecture candidate |
| [8_o3fuF_UFI](https://www.youtube.com/watch?v=8_o3fuF_UFI) | 08:39 | Question-bank promotion/sample; full chapter MCQ নয় |
| [uBprd6BVHLs](https://www.youtube.com/watch?v=uBprd6BVHLs) | 2:24:16 | pH/buffers; bonding MCQ হিসেবে verified নয় |
| [ALtCbY2H5ds](https://www.youtube.com/watch?v=ALtCbY2H5ds) | 1:55:02 | Description/intro-তে chapters 1/4/5; bonding CQ এই part নয় |
| [FWFFNj8N0_Y](https://www.youtube.com/watch?v=FWFFNj8N0_Y) | 58:31 | Part 2; complete CQ-solving class হিসেবে verified নয় |

চারটি unsuitable suggestion নতুন S defaults থেকে বাদ/warned; original library URL/history অক্ষত। চারটি candidate-ও ছাত্রের explicit opt-in ছাড়া actual/player duration নয়। Full playback/teacher quality/entire syllabus coverage বা অন্য সব catalogue link verified—এমন দাবি নেই। Unknown duration-এর metadata/manual fallback বাস্তবেই থাকে; ভুল সময় বানিয়ে “complete” নয়।

## Android, direct APK ও public PWA-এর স্থায়ী delivery record

**Source SHA, successful final build/API 34/API 35/web run, direct `.apk` URL/hash/signature এবং main Pages deployment-এর একত্র স্থায়ী record: [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19)।** Installer-এর নিজস্ব prerelease-এ immutable inspection JSON ও SHA256SUMS থাকে; artifact ZIP-কে সরাসরি installable APK বলা হয় না। এই document-এর code fingerprint/local browser counts ও সেই source-specific delivery record পরস্পর আলাদা প্রমাণ।

Runner-এ [a891e170f322-এর পরীক্ষা](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44549124514) **build + API 34 + API 35 পাস** করেছে: availability-first launch, no persistent native toolbar, legacy/S clock/text-zoom/real touch, offline Activity recreation, unchanged notes/completion/routine ও Brain opt-in boundary। ওই run-এর overall result কিন্তু **failure**—web-এ একটি লম্বা chapter name clipped ছিল। Original raw artifact GET-only inspection-এ exact selector/geometry দিয়ে কারণ বের হয়েছে; সেটি source-এ মেরামত ও old-CSS negative control দিয়ে ধরা হয়েছে। এই পুরোনো native snapshot-কে final source-এর সম্পূর্ণ delivery gate হিসেবে পুনঃলেবেল করা হয়নি।

**Current tested development APK download** job নিজের exact source/run/attempt-এর build, দুই API ও পূর্ণ built-web success ছাড়া চলে না। Immutable artifact ZIP size/hash ও extracted APK size/hash আলাদা যাচাই; `aapt`/`apksigner` দিয়ে package/version/debug flag/signature এবং packaged entry/CSS bytes পরীক্ষা হয়। Uploaded asset-এর নাম/size/digest/direct URL মেলার পরে কেবল নতুন **non-Latest development prerelease**। Production v2.44 draft, পুরোনো assets ও Latest pointer replace নয়; পুরোনো `14e6640` publisher দিয়ে এই rework delivery নয়। [নীতিমালা](DIRECT-APK.md)।

Pages environment-এর existing **main-only** protection অপরিবর্তিত। Merge-এর normal [Pages workflow](https://github.com/Rahatportfolio/HSC-27-/actions/workflows/static.yml) build/test করে deploy করে; এরপর every uploaded public file-এর bytes/hash exact build-এর সঙ্গে মেলায়, stale CDN/ভুল source/হারানো lazy chunk-এ fail করে। Actual successful deployment ও verified public URL [PR #19-এর delivery record](https://github.com/Rahatportfolio/HSC-27-/pull/19)-এ; local preview একা publication proof নয়।

**Original signing key নিশ্চিত নয়।** Debug APK-এর verified signature-ও approved compatible production update নয়। Package `com.prostuti.hsc27`, version `2.44.0`/code `24` ও signing configuration অপরিবর্তিত। শুধু conflicting app-হীন separate test device/profile-এ development APK ব্যবহার করবে। **পুরোনো app uninstall/Clear data করবে না; মূল device ও verified current full-media backup/আলাদা PDF রাখবে।** JSON/legacy backups-এ original scan bytes নেই; PWA/APK storage আলাদা। Physical/OEM background restrictions, camera/keyboard ও screen-reader certification বা official exam/video-content verification কোনো automated gate দিতে পারে না।

## প্রমাণ ও পুনরুৎপাদন

```sh
npm ci
npm run typecheck
npm test
node --test scripts/*node-test.mjs
npm run build
CHROMIUM_PATH=/path/to/chromium npm run test:built-web
npm audit --omit=dev
npm audit
```

`test:built-web` production preview-এর ready হওয়ার জন্য অপেক্ষা করে, নিজের isolated browser profiles ব্যবহার করে, subset/fault filters reject করে এবং child failure propagate করে। Native jobs/explicit development-download acknowledgement production signing gate বদলায় না।

Ignored `.cache/finish-all/clean-release/`, `clean-release-{install,tree,typecheck,build,tests}.log`, `clean-release-tests.json` ও `clean-release-inputs.json`-এ সম্পূর্ণ final-source install/build/full-suite evidence আছে। `built-web-complete/`-এ একসঙ্গে সম্পন্ন **৯টি production browser suite** ও সব raw accessibility findings/reviews; `exam-label-{fixed,old-css-control}*`-এ 393px positive/negative geometry control। Exact source-এর CI artifacts/PR/release evidence আলাদাভাবে সংরক্ষিত। Cache স্থায়ী থাকার নিশ্চয়তা নেই; এই summary, regression tests ও source-pinned PR/release record durable evidence।

এই repair round-এর আগের bounded production reruns-ও সম্পন্ন: **২২৪ native-field browser probes**; 320px touch-এ **20 November shortcut + linked-date cascade** Dhaka/New York-এ; synthetic scan edits/two-page PDF; complete → reload → undo; early timer finish-এ measured 2 minutes কিন্তু task auto-complete নয়; **v2 full backup-এর exact image bytes fresh profile-এ restore**; এবং simulated storage failure-তে old profile/clocks অক্ষত রেখে successful retry। এগুলো `input-delivery*`, `dates-delivery.log`, `backup-delivery.log`-এ আছে। শেষ label-only CSS repair-এর পরে সব পুরোনো fault campaign/physical-phone test আবার চালানো হয়েছে—এমন দাবি নয়।

Clean full-suite snapshot: **৩৫৭ non-document inputs**, sorted path + NUL + per-file SHA-256 + newline-এর SHA-256:

```text
4a724d2afae92d716ec468bd556c19eef1b26a91fb3fc9a9a5b933e1c3ccd819
```

এটি code/build-input fingerprint, self-referential Git commit নয়; শুধু Markdown/cache বাদ। Source-specific final commit/run/APK/PWA evidence [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19)-এ। কোনো actual student database, notes বা phone মুছে/পরিবর্তন করে পরীক্ষা হয়নি।
