# Phase 1 — fixes

## Scope and branch

Implemented only the approved Phase 1 work on `arena/c3197e75-hsc-27`. Arena fixes the current branch for the session, so `phase-1-fixes`, `phase-2-ux` and `phase-3-data` branches were not created. Phase 2 and Phase 3 have not been implemented; they still require their own plan and approval.

Existing workspace changes for the S shortlist and APK publishing were preserved. No reset, data deletion, new runtime dependency, credential or restricted-content download was introduced.

## Changes

- New-user/default boost is 12 hours, with Today quick-hour pills 6/8/10/12. Explicit saved user settings (including an existing 16-hour boost) remain intact.
- Test-prep task metrics now consider scheduled dates on or before the selected test target, for both A and S, with no `:part-` exemption. Deadline-day tasks count. Completion timestamps outside the observed window, in the future or after the deadline cannot inflate pace.
- Pace denominator is `min(14, elapsed calendar days since routine start, inclusive)`. First day uses 1; before the start pace is 0.
- A fourth-subject F no longer fails the overall GPA estimate; its bonus is zero. A compulsory-subject F still fails the estimate. Incomplete compulsory marks still produce no GPA when no compulsory F has already been recorded.
- Base A reduced to 38 chapters/skill units; all 114 chapters remain, with stable IDs, effort and content. Non-selected chapters stay in B/C. Saved personal priority overrides take precedence and can make an individual's effective A count differ from 38.
- S is independently defined rather than inferred from A, protecting the original 35-unit S scope when A changes.
- Test-target labels in Today and Settings use the selected date. Stale February wording is removed from active test-target UI. Preset January activation text is explicitly tentative, not a confirmed college date.
- All 144 distinct static Bengali JSX text nodes found across the views were routed through inline bilingual `t()` calls. Also translated GPA result labels and additional Settings labels, reset dialogs and notifications. Bengali remains the default; original question text, chapter titles and personal content are not rewritten.
- README now identifies current version 2.16.0, the actual workflows (`static.yml`, `android-apk.yml`), signing behavior, validation count and the editorial nature of A/S. Older version notes remain under historical releases.

## A-category selection and evidence limits

The 38-unit list is **editorial study order**, not a measured board-question frequency ranking or an NCTB-approved selection. It retains all 35 previously selected S units, plus second-paper Physics thermodynamics, electrostatics and current electricity, so that the compact A plan is not limited to first-paper Physics. Bangla/English entries are grouped lessons or skills, not individual textbook chapters.

A complete, verified multi-year board corpus and the full current QNA/teacher PDFs or YouTube transcripts were not available. No claim is made that those materials were fully read or that particular chapters will appear. NCTB academic-year documents must be checked against the candidate's exam batch; another country's HSC weightage must not be used. The college syllabus takes precedence. This list is reviewable, not guaranteed.

### Base A list

| Subject | Paper | Chapter / unit |
|---|---:|---|
| Physics | 1 | 2 · ভেক্টর |
| Physics | 1 | 4 · নিউটনিয়ান বলবিদ্যা |
| Physics | 1 | 5 · কাজ, শক্তি ও ক্ষমতা |
| Physics | 1 | 8 · পর্যাবৃত্ত গতি |
| Physics | 1 | 10 · আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব |
| Physics | 2 | 3 · চলতড়িৎ |
| Physics | 2 | 2 · স্থির তড়িৎ |
| Physics | 2 | 1 · তাপগতিবিদ্যা |
| Chemistry | 1 | 2 · গুণগত রসায়ন |
| Chemistry | 1 | 3 · মৌলের পর্যাবৃত্ত ধর্ম ও রাসায়নিক বন্ধন |
| Chemistry | 1 | 4 · রাসায়নিক পরিবর্তন |
| Chemistry | 2 | 2 · জৈব রসায়ন |
| Chemistry | 2 | 3 · পরিমাণগত রসায়ন |
| Chemistry | 2 | 4 · তড়িৎ রসায়ন |
| Biology | 1 | 1 · কোষ ও এর গঠন |
| Biology | 1 | 2 · কোষ বিভাজন |
| Biology | 1 | 9 · উদ্ভিদ শারীরতত্ত্ব |
| Biology | 2 | 4 · রক্ত ও সঞ্চালন |
| Biology | 2 | 8 · সমন্বয় ও নিয়ন্ত্রণ |
| Biology | 2 | 11 · জিনতত্ত্ব ও বিবর্তন |
| Higher Math | 1 | 1 · ম্যাট্রিক্স ও নির্ণায়ক |
| Higher Math | 1 | 3 · সরলরেখা |
| Higher Math | 1 | 9 · অন্তরীকরণ |
| Higher Math | 1 | 10 · যোগজীকরণ |
| Higher Math | 2 | 3 · জটিল সংখ্যা |
| Bangla | 1 | গদ্য ১ · গদ্য: পাঠ ১–৩ |
| Bangla | 1 | পদ্য ১ · কবিতা: পাঠ ১–৩ |
| Bangla | 1 | সহপাঠ ১ · সহপাঠ: উপন্যাস |
| Bangla | 2 | ব্যাকরণ ৩ · পদ, বাক্য, প্রয়োগ–অপপ্রয়োগ |
| Bangla | 2 | নির্মিতি ৩ · পত্র, দরখাস্ত, দিনলিপি ও প্রবন্ধ |
| English | 1 | Reading 1 · Reading: detail ও main idea |
| English | 1 | Writing 2 · Letter, email ও application |
| English | 2 | Grammar 1 · Tense, right form of verbs ও agreement |
| English | 2 | Writing 1 · Paragraph, essay ও composition |
| ICT | 1 | 3 · সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস |
| ICT | 1 | 4 · ওয়েব ডিজাইন পরিচিতি ও HTML |
| ICT | 1 | 5 · প্রোগ্রামিং ভাষা |
| ICT | 1 | 6 · ডেটাবেজ ম্যানেজমেন্ট সিস্টেম |

## Validation

- `npm test`: **276 passed, 42 files**.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**; the existing >500 kB chunk-size warning is non-fatal.
- Added regression coverage for inclusive deadlines, A and S post-deadline exclusions, first-day and 14-day pace, pre-start/future/post-deadline timestamps, optional F, saved personal hours, bilingual GPA labels and the 38-unit A invariant.
- No physical-phone testing was performed in this phase. Browser/device CI status is tracked separately; local test results do not imply a newly tested APK.

## Known limits / remaining work

- Whole-project English parity is **not claimed**. Static view text was covered, but some legacy programmatic messages, data-driven labels and learning content remain Bengali. These must not be described as a fully translated application.
- A/S is not a substitute for full syllabus coverage or validated teacher guidance. Final exam/test dates are personal targets until confirmed by the college/board.
- Phase 2 remains pending approval: Today-first layout, collapsible secondary cards, a 22:30 end-time boundary, busy-block-aware scheduling with overlap tests, and default auto carry-over.
- Phase 3 remains pending approval: persistent-storage request on first load and an explicit estimated label on the HSC date.
