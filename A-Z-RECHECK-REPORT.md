# প্রস্তুতি HSC27 — মেরামত ও পূর্ণ পুনঃযাচাই

**Session date: ১৬ নভেম্বর ২০২৬। চাওয়া routine start: ২০ নভেম্বর ২০২৬—অপরিবর্তিত।**

এটি আগের ১,১৫০-test / ২.১৫ MB bundle / outstanding axe-review checkpoint-এর বদলি নতুন ফল। পাওয়া সমস্যাগুলো source-এ মেরামত হয়েছে; test বাদ দিয়ে বা unknown duration/completion অনুমান করে পাস দেখানো হয়নি। কোনো পরীক্ষাই সব ফোন, সব ভিডিও বা সব পরিস্থিতিতে “bug-free” নিশ্চয়তা নয়।

## কী শেষ করা হয়েছে

- **S-first/availability-first routine:** A থেকে editable গুরুত্বপূর্ণ shortlist; setup-এর আগে routine নয়; একাধিক windows, net hours, weekdays ও fixed obligations। একই দুই বই/অধ্যায়ের অংশ প্রথম study day, পরের অংশ পরের study day বা বাস্তব capacity অনুযায়ী আরও দিন। দীর্ঘ class কেটে দুই দিনে মিথ্যা শেষ নয়।
- **আসল workload:** video duration ÷ speed; reading/notes/MCQ/CQ/revision আলাদা volume/count/rate/difficulty/prior-review হিসাব। Unknown সময় unknown-ই থাকে। ছয় required group ছাড়া Fully Completed নয়; coverage/readiness আলাদা। অসমাপ্ত range পরের capacity নেয় ও future work সরায়—পূর্ণ দিনের ওপর বাড়তি কাজ নয়।
- **ডেটা সুরক্ষা ও Brain:** legacy opt-in migration, dates/history/notes/media references, scoped undo, retained later phases ও safe Settings reflow। ছোট Brain opt-in/local/bounded/explainable; chat/private notes upload, silent reschedule বা timer-certified completion নয়।
- **Startup repair:** Home eager, **২৩ optional route lazy**। Heavy question text/generators, exam generation এবং PDF startup import থেকে সরানো; exact **১,১৭৬-ID metadata index** generation/check, lightweight saved-exam accuracy। বড় module eager করে পুরোনো test চালু রাখার পথ নেওয়া হয়নি।
- **Offline/recovery:** সব built lazy asset precached। প্রথম successful install-এর পরে ২৪ route offline প্রথমবার খোলে। Missing chunk পুরো app blank বা profile reset করে না; Home/Settings/reopen ও synchronous JSON recovery backup আছে। JSON-এ original media/scan bytes নেই—UI-তেই সতর্কতা আছে।
- **UI/accessibility repairs:** missing video metadata-তে bare `0` নয়; class labels wrap করে, Library header/actions আলাদা থাকে। C badge, MCQ option letters, future-phase numbers, hero progress/short labels ও dark CQ letters-এর contrast মেরামত। Fixed 24px CQ rubric box-এর overlap সরানো; বড় লেখায় target/date ও subject badge আর কেটে যায় না।
- **টেকসই gate:** mandatory postbuild size/eager-import/precache checks; cache-এর source copies আর Vitest-এর duplicate suite নয়। Lazy-route-aware unit/browser tests actual view-এর জন্য অপেক্ষা করে; timer assertions-এর real elapsed behavior অপরিবর্তিত।

## বর্তমান যাচাই

| পরীক্ষা | ফল ও অর্থ |
|---|---|
| সম্পূর্ণ isolated source + `npm ci` | **PASS**; ২৯০ package, clean top-level dependency tree; Android/workflow source-ও copy-তে আছে |
| Clean-source TypeScript | **PASS** |
| Clean-source পূর্ণ unit/UI suite | **১,১৬৪ PASS / ১১৬ ফাইল / ০ failure**; ৩৪৬.০১ সেকেন্ড; duplicate cache suite নয় |
| Production build + mandatory postbuild gate | **PASS**; clean-source build ১০.৯৬ সেকেন্ড; root ও clean build একই hashed entry |
| Node safety/size/release guards | **১৫২ PASS / ০ failure**; এর মধ্যে size/precache ৬, current-download boundary ৩১ |
| Production + full npm audit | **দুটিতেই ০ known entry**; feed-ভিত্তিক dependency ফল, security certificate নয় |
| Lazy module/offline/recovery | **২৯ PASS**; startup module requests, ২৪ offline route, retained history, missing-chunk UI ও JSON backup |
| Personal routine browser | **২৪ PASS**; new setup, obligations/net cap, actual long duration, pair/six groups, phase/undo/retained appointment, offline ও saved-state matrix |
| Brain browser | **২৫ PASS**; opt-in/draft/confirm/offline/memory/pause/forget/explicit timer ও synthetic states |
| Drawer + first-use offline PDF | **১০ PASS**; ৯ keyboard/stack/resize/navigation section + actual offline দুই-page PDF |
| Mobile shell | **৪৭ PASS**; touch, occlusion, inset, clocks, retained data ও legacy/S first-day toolbar |
| Study/media browser | **PASS**; real synthetic WebM save/play/resume, notes, exact full backup/restore, shared collector, mobile tabs ও built-PWA offline reload |
| পূর্ণ automated accessibility matrix | **৪১৮ state PASS / ০ violation**; ২৪ route, ৮ selected width/theme/language/profile scenarios, dialogs, quizzes, exams ও populated states |
| Raw axe incomplete review | **৬,১৬৮ retained / ৬,১৬৮ supported supplemental review verified / ০ failed / ০ unresolved** |
| Supplemental reviewer controls | **২০ PASS**; faint/nested/native-placeholder faults ধরা; covered/clipped/opacity/unsupported images unresolved থাকে; names, scrolling ও cleanup যাচাই |

প্রথম isolated test attempt-এ copy থেকে Android/workflow files বাদ পড়ায় source-policy tests ব্যর্থ হয়েছিল; সেটিকে pass বলা হয়নি। পূর্ণ source copy দিয়ে নতুন clean install/build/full suite-ই উপরের ফল। Ignored copy-র tests root Vitest-এ duplicate হচ্ছিল—explicit `src/**/*.test.{ts,tsx}` discovery দিয়ে সেটিও মেরামত হয়েছে।

Responsive-এর ৩ profile × ৫ scenario × ২৪ route + dialogs/timer = **৩৮৩ checks** আগের এই repair run-এ পাস। শেষ typography build-এর পরের rerun ও native/download ফল নিচের delivery checkpoint-এ যোগ হবে; পুরোনো ফলকে নতুন build-এর final proof বলা হচ্ছে না।

### Accessibility-এর সঠিক সীমা

Raw axe JSON বাদ দেওয়া, rule disable বা selector exemption করা হয়নি। প্রতিটি matching text run-এর foreground/background, clipping, exposed-point hit testing ও explicit name evidence সংরক্ষিত। Supported opaque sRGB linear gradient-এর **সম্পূর্ণ colour range-এর conservative contrast bound** ব্যবহার হয়—gradient-এর একটি সুবিধামতো point বেছে pass নয়। Native field-এ actual value/placeholder style দেখা হয়; ফাঁকা field-এ কোনো glyph আঁকা না হলে সেটি আলাদাভাবে নথিভুক্ত হয়। Unsupported/obscured cases fail-closed; reviewer-এর deliberate controls তা যাচাই করে।

এটি **automated supplemental evidence**, physical screen-reader journey বা সম্পূর্ণ WCAG certificate নয়। সব raw incomplete-কে confirmed bug বলা যেমন ভুল, measurement ছাড়াই pass বলাও ভুল।

## Performance ফল

| মাপ | বর্তমান |
|---|---:|
| Entry JavaScript | **৪৮৯,০০৫ B**; gzip প্রায় **১৪৪.৪৩ kB** |
| সম্পূর্ণ unique eager JS closure | **১,০৪৯,৭৯৭ B**—শুধু entry নয় |
| JS chunks | **৪৬**; প্রতিটি ৫০০,০০০ B-এর নিচে |
| Optional question bank | প্রায় **৩৯৬.৩৫ kB**, startup নয় |
| Optional PDF renderer | প্রায় **৩৮৬.৩৩ kB**, startup নয়; প্রথম offline ব্যবহার পরীক্ষিত |
| Mandatory ceiling | Entry/per-chunk **৫০০,০০০ B**, unique eager JS **১,১০০,০০০ B** |

প্রায় **২.১৫ MB → ৪৮৯ kB entry**; পুরো startup JS-ও প্রায় অর্ধেক হয়েছে। “অ্যাপ মোটে ৪৮৯ kB” বা low-end Android startup/memory/battery certified—কোনোটিই দাবি নয়। Bad manifest/precache, oversized chunk, eager question/PDF import বা missing lazy route হলে build gate ব্যর্থ হয়।

## আটটি ভিডিও-reference: date/provenance মেরামত

আটটি exact YouTube page নতুন করে fetch করে shown duration, public title/description ও পাওয়া introduction/transcript excerpt মিলেছে। পুরোনো record-এর inconsistent **`2026-11-18`** date আলাদা `CLASS_REFERENCE_PROVENANCE`-এ **unverified** হিসেবে রাখা হয়েছে; নতুন metadata check-এর date **`2026-11-16`**। এটি student history বা পুরোনো observation-এর নিঃশব্দ backdate নয়।

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

## Android ও direct-download checkpoint

বর্তমান source-এর Android runner verification/delivery এই working branch থেকেই হবে। স্থানীয় sandbox-এ Java/SDK/ADB নেই; allowed GitHub release download-এর redirect-ও TLS EOF দিয়েছে। সেই কারণে native verification বাদ না দিয়ে existing Android runner + API 34/35 path-এ নেওয়া হয়েছে।

নতুন **Built web acceptance** এবং **Current tested development APK download** jobs exact-source build, API 34, API 35 ও পূর্ণ production-browser acceptance ছাড়া APK প্রকাশ করে না। Immutable artifact ZIP hash এবং APK hash আলাদা; real APK signature/package/version ও uploaded bytes মিলে তবেই আলাদা **non-Latest development prerelease**। আগে প্রকাশিত release/asset বা held v2.44 draft overwrite নয়। Older `14e6640` publisher দিয়ে নতুন code delivery দেখানো হবে না। [নীতিমালা](DIRECT-APK.md)।

**Original signing key নিশ্চিত নয়।** Debug APK-এর verified signature-ও approved compatible production update নয়। Package `com.prostuti.hsc27`, version `2.44.0`/code `24` ও signing configuration অপরিবর্তিত। **পুরোনো app uninstall/Clear data করবে না; মূল device ও verified full-media backup/PDF রাখবে।** JSON/legacy backups-এ original scan bytes নেই; PWA/APK storage আলাদা। Physical/OEM background restrictions, camera/keyboard এবং screen-reader certification এখানে দাবি করা যায় না।

এই checkpoint-এ current-source native build/public download-কে pass/published বলা হচ্ছে না; run-এর সত্যিকারের conclusion, source SHA ও URL ছাড়া সে দাবি যোগ হবে না। Public production PWA/compatible-signer update-ও local web test দিয়ে প্রমাণিত নয়।

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

Ignored `.cache/finish-all/`-এ clean-final install/tree/typecheck/build/full-suite JSON/logs, `a11y-final/{report.json,raw/}`, `personal-final/`, `brain/`, `dialog/`, `mobile/`, `lazy-final/`, reviewer/Node guards ও build-budget evidence আছে। Cache স্থায়ী থাকার নিশ্চয়তা নেই; এই Markdown ও source regression/gates durable summary। আগের A–Z/date/backup fault proof ও 224 native-field/56 follow-up checkpoints historical—এই রাউন্ডে সব আবার চালানো হয়েছে বলা হচ্ছে না।

Clean full-suite snapshot: **৩৪৫ non-document inputs**, sorted path + NUL + per-file SHA-256 + newline-এর SHA-256:

```text
8712cd75161c732f88e05e9d39c063c024122c5d032c4b72e892403ff679dac9
```

এটি code/build-input fingerprint, Git commit নয়; Markdown/cache বাদ। Final native/delivery evidence আলাদা exact source/run pin করবে। কোনো actual student database, notes বা phone মুছে/পরিবর্তন করে পরীক্ষা হয়নি।
