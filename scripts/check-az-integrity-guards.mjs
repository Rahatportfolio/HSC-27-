/** Prove the A–Z regression tests reject real source faults, then restore bytes.
 * Serial by design: do not edit application source or run another mutation gate
 * while this runs. Logs/results are ignored, not committed test fixtures. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const output = process.env.AZ_GUARD_OUTPUT || '.cache/az-integrity-mutations';
await mkdir(output, { recursive: true });
const core = 'src/azIntegrity.test.ts', ui = 'src/azIntegrity.ui.test.tsx', aria = 'src/azAccessibility.ui.test.tsx';
const examCore = 'src/azExamIntegrity.test.ts', examUi = 'src/azExamIntegrity.ui.test.tsx', restore = 'src/backupRestore.ui.test.tsx', contrast = 'src/ui.contrast.test.ts';
const generated = 'src/azGeneratedPersistence.test.ts';
const analysis = 'src/azExamAnalysis.test.ts', analysisUi = 'src/azExamAnalysis.ui.test.tsx';
const controls = [core, ui, aria, examCore, examUi, restore, contrast, generated, analysis, analysisUi];
const faults = [
  ['reject-calendar-review-dates', 'src/storage.ts', '!validReviewDate(item.lastReviewed)', '!validAt(item.lastReviewed)', core, 'round-trips the entire profile'],
  ['lose-legacy-review-day', 'src/flashcards.ts', "card.lastReviewed === today || !!card.lastReviewed && card.lastReviewed.includes('T') && Number.isFinite(Date.parse(card.lastReviewed)) && todayKey(new Date(card.lastReviewed)) === today", 'card.lastReviewed === today', core, 'preserves legacy review timestamps'],
  ['accept-unrestorable-new-card', 'src/flashcards.ts', ' || flashcardContentError(input)', '', core, 'rejects flashcard content'],
  ['accept-unrestorable-edited-card', 'src/flashcards.ts', '  if (flashcardContentError(next)) return data;', '', core, 'does not edit a valid flashcard'],
  ['optional-f-fails-gpa', 'src/gpa.ts', 'const failed = mainRows.some(row => row.point === 0);', 'const failed = rows.some(row => row.point === 0);', core, 'does not turn an optional F'],
  ['incomplete-gpa-becomes-zero', 'src/gpa.ts', 'return { rows, gpa, complete,', 'return { rows, gpa: failed ? 0 : gpa, complete,', core, 'keeps the GPA unknown'],
  ['round-up-gpa-boundary', 'src/gpa.ts', 'obtained / full * 100;', 'Math.round(obtained / full * 10000) / 100;', core, 'never promotes a mark'],
  ['compulsory-f-is-ignored', 'src/gpa.ts', 'complete ? (failed ? 0 : Math.min', 'complete ? (false ? 0 : Math.min', core, 'agrees with an independent'],
  ['optional-f-blocks-golden-plan', 'src/golden.ts', 'const failed = compulsory.some(row => row.point === 0);', 'const failed = rows.some(row => row.point === 0);', core, 'does not turn an optional F'],
  ['round-up-golden-boundary', 'src/golden.ts', 'const percentage = obtained / full * 100;', 'const percentage = Math.round(obtained / full * 10000) / 100;', core, 'never promotes a mark'],
  ['generate-into-full-library', 'src/views/Practice.tsx', 'if (!room) { notify(', 'if (false) { notify(', ui, 'already full'],
  ['quiz-starts-discarded-ids', 'src/views/Practice.tsx', 'generated.filter(question => !known.has(question.id)).slice(0, room)', 'generated.filter(question => !known.has(question.id))', ui, 'partial-capacity quiz'],
  ['silently-close-full-card-form', 'src/views/Flashcards.tsx', 'if (data.flashcards.length >= LIMITS.flashcards) return t(', 'if (false) return t(', ui, 'keeps the flashcard editor'],
  ['oversized-question-write', 'src/views/Practice.tsx', 'if (question.trim().length > 2000 || options.some(option => option.trim().length > 500) || explanation.trim().length > 2000)', 'if (false)', ui, 'rejects an oversized'],
  ['unbounded-card-front', 'src/views/Flashcards.tsx', 'maxLength={FLASHCARD_TEXT_LIMITS.front}', '', ui, 'bounds flashcard form'],
  ['unbounded-card-back', 'src/views/Flashcards.tsx', 'maxLength={FLASHCARD_TEXT_LIMITS.back}', '', ui, 'bounds flashcard form'],
  ['unnamed-progressbar', 'src/components.tsx', "aria-label={label || t('অগ্রগতি', 'Progress')}", '', aria, 'names and clamps'],
  ['unclamped-progressbar', 'src/components.tsx', 'const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;', 'const safe = value;', aria, 'names and clamps'],
  ['exclude-visible-class-kind', 'src/components.tsx', 'aria-label={`${visibleLabel} — ${classLabel(kind)}', 'aria-label={`${label} — ${classLabel(kind)}', aria, 'entire visible class-link text'],
  ['concatenated-class-text', 'src/components.tsx', '<span className="class-kind-tag">{classLabel(kind, true)}</span>}{\' \'}', '<span className="class-kind-tag">{classLabel(kind, true)}</span>}', aria, 'entire visible class-link text'],
  ['omit-heatmap-number', 'src/views/Heatmap.tsx', 'aria-label={`${cell.chapter.number} ${cell.chapter.title} —', 'aria-label={`${cell.chapter.title} —', aria, 'names heatmap cells'],
  ['language-label-mismatch', 'src/App.tsx', "aria-label={`${data.settings.language === 'en' ? 'বাং' : 'EN'} — ${t('ভাষা পরিবর্তন করো', 'Switch language')}`}", "aria-label={t('ভাষা পরিবর্তন করো', 'Switch language')}", aria, 'uses pressed filter buttons'],
  ['keyboard-inaccessible-timeline', 'src/views/Calendar.tsx', "aria-label={t('পরিকল্পনার মাইলফলক', 'Plan milestones')} tabIndex={0}", "aria-label={t('পরিকল্পনার মাইলফলক', 'Plan milestones')}", aria, 'uses pressed filter buttons'],
  ['filters-falsely-claim-tabs', 'src/modals.tsx', 'className="search-subject-pills" role="group"', 'className="search-subject-pills" role="tablist"', aria, 'uses pressed filter buttons'],
  ['filter-selection-not-announced', 'src/modals.tsx', "aria-pressed={subjectFilter === 'all'}", '', aria, 'uses pressed filter buttons'],
  ["manual-full-question-library", "src/views/Practice.tsx", "if (data.questions.length >= LIMITS.questions) { setError(", "if (false) { setError(", ui, "valid manually typed question"],
  ["wrong-lesson-name", "src/components.tsx", "aria-label={`${lesson.title}${lesson.channel ? ' ' + lesson.channel : ''}", "aria-label={`Unrelated lesson${lesson.channel ? ' ' + lesson.channel : ''}", aria, "keeps visible lesson titles"],
  ["concatenated-lesson-teacher", "src/components.tsx", "{lesson.channel && <> <span className=\"lesson-channel\">", "{lesson.channel && <><span className=\"lesson-channel\">", aria, "keeps visible lesson titles"],
  ["wrong-desktop-brand-name", "src/App.tsx", "aria-label={`${t('প্রস্তুতি', 'Preparation')}. HSC 27 · SCIENCE`}", "aria-label={t('প্রস্তুতি হোম', 'Prostuti home')}", aria, "keeps desktop header text"],
  ["excluded-keyboard-hint", "src/App.tsx", "aria-label={`${t('অধ্যায়, ক্লাস বা রুটিন খুঁজো…', 'Search chapters, classes or routine…')} K`}", "aria-label={t('অধ্যায়, ক্লাস বা রুটিন খুঁজো…', 'Search chapters, classes or routine…')}", aria, "keeps desktop header text"],
  ["wrong-more-menu-name", "src/App.tsx", "t('আরও — সব মেনু দেখো', 'More pages')", "t('সব মেনু দেখো', 'More pages')", aria, "keeps desktop header text"],
  ["calendar-visible-label-omitted", "src/views/Calendar.tsx", "${bn(Number(date.slice(8)))}${d && matches ? ` ${d.isCatchup ? t('ব্যাকলগ দিন', 'Backlog day') : phaseName(d.phase)}` : ''} — ", "", aria, "keeps desktop header text"],
  ["unnamed-cq-filter", "src/views/Practice.tsx", "<select aria-label={t('বিষয় ফিল্টার', 'Subject filter')} value={subject}", "<select value={subject}", aria, "names the subject selector in the cq tab"],
  ["unnamed-formula-filter", "src/views/Library.tsx", "aria-label={t(\"সূত্র খুঁজো\", \"Search formulas\")} /></label><select aria-label={t('বিষয় ফিল্টার', 'Subject filter')}", "aria-label={t(\"সূত্র খুঁজো\", \"Search formulas\")} /></label><select", aria, "names the subject selector in the formulas tab"],
  ["unnamed-board-filter", "src/views/Library.tsx", "aria-label={t(\"বোর্ড প্রশ্ন খুঁজো\", \"Search board questions\")} /></label><select aria-label={t('বিষয় ফিল্টার', 'Subject filter')}", "aria-label={t(\"বোর্ড প্রশ্ন খুঁজো\", \"Search board questions\")} /></label><select", aria, "names the subject selector in the boards tab"],
  ["unbounded-simulator-generation", "src/examSim.ts", "}).slice(0, room) : [];", "}) : [];", examCore, "offers generated questions only"],
  ["lose-generated-retry-definitions", "src/examSim.ts", "let afterAnswers = fresh.length ? { ...data, questions: [...data.questions, ...fresh] } : data;", "let afterAnswers = data;", examCore, "retains generated questions"],
  ["unstable-paper-identity", "src/examSim.ts", "id: input.id || newId(),", "id: newId(),", examCore, "does not record the same stable paper"],
  ["duplicate-paper-submission", "src/examSim.ts", "(input.id && data.examSessions.some(session => session.id === input.id))", "false", examCore, "does not record the same stable paper"],
  ["overwrite-running-paper", "src/examSim.ts", "if (data.activeExam) return data;", "", examCore, "will not overwrite an ongoing paper"],
  ["lose-live-question-definitions", "src/examSim.ts", "return { ...data, questions: [...data.questions, ...added], activeExam:", "return { ...data, questions: data.questions, activeExam:", examCore, "retains every live-paper definition"],
  ["discard-live-paper-on-load", "src/storage.ts", "if (raw.activeExam !== undefined) {", "if (false) {", examCore, "retains every live-paper definition"],
  ["accept-invalid-live-paper", "src/storage.ts", "throw new Error('চলমান পরীক্ষার উত্তরপত্র সঠিক নয়।');", "{}", examCore, "rejects a malformed active paper"],
  ["do-not-save-selected-answer", "src/views/ExamSim.tsx", "answers: update(current.activeExam.answers)", "answers: current.activeExam.answers", examUi, "restores the same questions"],
  ["reset-saved-question-index", "src/views/ExamSim.tsx", "index: typeof value === 'function' ? value(current.activeExam.index) : value", "index: 0", examUi, "restores the same questions"],
  ["restart-remaining-time", "src/views/ExamSim.tsx", "const deadline = draft?.deadline || 0;", "const deadline = draft ? draft.deadline + 30_000 : 0;", examUi, "restores the same questions"],
  ["accept-after-deadline", "src/views/ExamSim.tsx", "!current.activeExam || Date.now() >= current.activeExam.deadline", "!current.activeExam", examUi, "does not accept an answer after"],
  ["count-away-time-as-exam-time", "src/views/ExamSim.tsx", "Math.round((Math.min(Date.now(), deadline) - startedAt) / 1000)", "Math.round((Date.now() - startedAt) / 1000)", examUi, "auto-submits an expired restored paper"],
  ["leave-finished-draft-active", "src/views/ExamSim.tsx", "delete next.activeExam; return next;", "return next;", examUi, "auto-submits an expired restored paper"],
  ["allow-deleting-live-questions", "src/views/Practice.tsx", " || !!data.activeExam?.questionIds.includes(question.id)", "", examUi, "protects its retained questions"],
  ["resume-json-backup-paper", "src/views/Settings.tsx", "delete parsed.activeExam;", "", restore, "persists a successful JSON restore"],
  ["resume-full-backup-paper", "src/components/FullBackup.tsx", "delete restoredData.activeExam;", "", restore, "clears the previous exam clock after a successful full-media"],
  ["faint-heading-declaration", "src/styles.css", "\n.page-heading p{color:var(--muted)}\n.empty-state p{", "\n.page-heading p{color:#cdddcf}\n.empty-state p{", contrast, "page heading descriptions are readable"],
  ["faint-dark-semantic-token", "src/styles.css", "--muted:#9eb3a5;", "--muted:#243b2c;", contrast, "dark-theme secondary tokens clear"],
  ['oversized-generated-id', 'src/questionGen.ts', 'return legacy.length <= 180 ? legacy :', 'return true ? legacy :', generated, 'round-trips every generated and numeric definition'],
  ['lose-compact-bank-lookup', 'src/questionGen.ts', "if (parts[3].startsWith('~')) {", 'if (false) {', generated, 'keeps legacy encoded ids traceable'],
  ['lose-legacy-bank-lookup', 'src/questionGen.ts', ' || legacyGeneratedIdFor(fact, hashPart) === question.id', '', generated, 'keeps legacy encoded ids traceable'],
  ['unanswered-misses-mistake-book', 'src/examSim.ts', '      afterAnswers = recordMcqAnswer(afterAnswers, question, null, input.date);', '', generated, 'puts an unanswered generated question'],
  ['fabricate-unanswered-option', 'src/examSim.ts', 'recordMcqAnswer(afterAnswers, question, null, input.date)', 'recordMcqAnswer(afterAnswers, question, (question.answer + 1) % 4, input.date)', generated, 'puts an unanswered generated question'],
  ['wrong-tendon-bank-key', 'src/quiz-bank.ts', "['সন্ধি', 'টেন্ডন', 'লিগামেন্ট', 'কার্টিলেজ'], 1,", "['সন্ধি', 'টেন্ডন', 'লিগামেন্ট', 'কার্টিলেজ'], 0,", generated, 'distinguishes muscle-to-bone'],
  ['wrong-tendon-generator-fact', 'src/questionGen.ts', "value: 'টেন্ডন', valueEn: 'a tendon',", "value: 'সন্ধি', valueEn: 'a joint',", generated, 'distinguishes muscle-to-bone'],
  ['unannounced-current-question', 'src/views/ExamSim.tsx', " aria-current={questionIndex === index ? 'step' : undefined}", '', examUi, 'announces the current question'],
  ['unannounced-answered-question', 'src/views/ExamSim.tsx', " — ${Object.hasOwn(answers, question.id) ? t('উত্তর দেওয়া', 'Answered') : t('উত্তরহীন', 'Unanswered')}", '', examUi, 'announces the current question'],
  ['faint-correct-feedback', 'src/styles.css', '.quiz-feedback.ok{background:#f2f8ea;border:1px solid #dcebd0;color:var(--green)}', '.quiz-feedback.ok{background:#f2f8ea;border:1px solid #dcebd0;color:#5d7b4d}', contrast, 'keeps answered quiz feedback'],
  ['faint-completed-quiz', 'src/styles.css', 'margin-top:12px;font-size:10px;color:var(--muted)}\n.quiz-result strong', 'margin-top:12px;font-size:10px;color:#7d916e}\n.quiz-result strong', contrast, 'keeps answered quiz feedback'],
  ['undefined-current-question-colour', 'src/styles.css', '.exam-palette-cell.current { outline: 2px solid var(--ink);', '.exam-palette-cell.current { outline: 2px solid var(--missing-text);', contrast, 'never leaves text, focus rings'],
  ['borrow-old-paper-time', 'src/examAnalysis.ts', 'paper.id ? sessions.filter(item => item.id === paper.id) : sessions.filter', 'false ? sessions.filter(item => item.id === paper.id) : sessions.filter', analysis, 'does not borrow the first attempt'],
  ['guess-ambiguous-legacy-time', 'src/examAnalysis.ts', 'candidates.length === 1 ? candidates[0] : undefined', 'candidates[0]', analysis, 'does not guess which duplicate session'],
  ['inflate-time-with-missing-definition', 'src/examAnalysis.ts', 'timedQuestions += paper.questionIds.length;', 'timedQuestions += mapped.length;', analysis, 'uses the full paper size'],
  ['invalid-selection-counts-as-answer', 'src/examAnalysis.ts', ' && chosen >= 0 && chosen <= 3;', ';', analysis, 'treats an out-of-range selection'],
  ['fraction-labelled-as-percent', 'src/examAnalysis.ts', '${input.papers}টি পরীক্ষায় ${input.blank}টি প্রশ্ন (${Math.round(input.blankRate * 100)}%)', '${input.papers}টি পরীক্ষায় ${input.blank}টি প্রশ্ন (${input.blankRate}%)', analysis, 'prints a 50-percent blank rate'],
  ['empty-result-session-analysis', 'src/views/ExamSim.tsx', 'examPostmortem([session], undefined, questionIndex(result.questions))', 'examPostmortem([], [session], questionIndex(result.questions))', analysisUi, 'counts retained generated definitions'],
  ['omit-generated-result-definitions', 'src/views/ExamSim.tsx', 'examPostmortem([session], undefined, questionIndex(result.questions))', 'examPostmortem([session])', analysisUi, 'counts retained generated definitions'],
  ['omit-generated-history-definitions', 'src/views/ExamSim.tsx', 'examPostmortem(data.examSessions, undefined, questionIndex(allQuestions(data)))', 'examPostmortem(data.examSessions)', analysisUi, 'makes the scrollable mistakes region'],
  ['unfocusable-exam-mistakes', 'src/views/ExamSim.tsx', "aria-label={t('পরীক্ষার ভুল ও উত্তরহীন প্রশ্ন', 'Exam mistakes and unanswered questions')} tabIndex={0}", "aria-label={t('পরীক্ষার ভুল ও উত্তরহীন প্রশ্ন', 'Exam mistakes and unanswered questions')}", analysisUi, 'makes the scrollable mistakes region'],
  ['pale-dark-result-guidance', 'src/styles.css', 'background: var(--surface-soft); color: var(--ink); border: 1px solid var(--border); font-size: .8rem;', 'background: #f6faf4; color: var(--ink); border: 1px solid var(--border); font-size: .8rem;', contrast, 'keeps result guidance readable'],
  ['lose-result-session-identity', 'src/views/ExamSim.tsx', 'sessionId: draft.id, grade, title', "sessionId: 'missing-submission', grade, title", analysisUi, 'counts retained generated definitions'],
  ['pale-dark-mistakes-surface', 'src/styles.css', 'background: var(--rose-soft); color: var(--ink);', 'background: #fdf6f5; color: var(--ink);', contrast, 'keeps every wrong-answer detail'],
  ['dark-wrong-answer-foreground', 'src/styles.css', '.exam-wrong-row p em { color: var(--rose);', '.exam-wrong-row p em { color: #a3281d;', contrast, 'keeps every wrong-answer detail'],
  ['pale-light-wrong-answer-foreground', 'src/styles.css', '.exam-wrong-row p em { color: var(--rose);', '.exam-wrong-row p em { color: #e8837b;', contrast, 'keeps every wrong-answer detail'],
  ['dark-correct-answer-foreground', 'src/styles.css', '.exam-wrong-row p.correct { color: var(--green);', '.exam-wrong-row p.correct { color: #2f6b46;', contrast, 'keeps every wrong-answer detail'],
  ['dark-hovered-text-action', 'src/styles.css', '.text-button:hover{color:var(--green-dark);', '.text-button:hover{color:#163e2e;', contrast, 'keeps every wrong-answer detail'],
  ['unreadable-unanswered-surface', 'src/styles.css', '.exam-wrong-row.unanswered { border-color: var(--border); background: var(--surface-soft, #f7f7f5); }', '.exam-wrong-row.unanswered { border-color: var(--border); background: var(--ink); }', contrast, 'keeps unanswered-question copy'],
  ['ignore-reduced-motion-navigation', 'src/App.tsx', "behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'", "behavior: 'smooth'", aria, 'respects reduced-motion navigation'],
  ['discard-normal-motion-preference', 'src/App.tsx', "behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'", "behavior: 'auto'", aria, 'respects reduced-motion navigation'],
  ['diagnose-time-from-blanks', 'src/examAnalysis.ts', 'Some questions are unanswered — try the easier ones first, then return to skipped questions.', 'You run out of time — clear the easy questions first and move on when stuck.', analysis, 'does not diagnose running out of time'],
  ['misdescribe-short-time-boundary', 'src/examAnalysis.ts', 'averaged ${RUSHED_SECONDS}s or less per paper question', 'averaged under ${RUSHED_SECONDS}s per question — faster than careful reading allows', analysis, 'describes short recorded time'],
  ['diagnose-knowledge-from-wrong-answers', 'src/examAnalysis.ts', "titleEn: 'Review wrong answers'", "titleEn: 'A knowledge gap'", analysis, 'does not identify the cause'],
  ['invent-missing-definition-origin', 'src/examAnalysis.ts', 'প্রশ্নের সংরক্ষিত সংজ্ঞা পাওয়া যায়নি', 'প্রশ্ন তৈরি হওয়া (gen/num) ছিল', analysis, 'reports a missing custom definition'],
  ['overstate-high-score-readiness', 'src/examAnalysis.ts', "titleEn: 'High score in this sample'", "titleEn: 'Solid base'", analysis, 'limits high-score and lowest-accuracy advice'],
  ['promise-one-paper-diagnosis', 'src/examAnalysis.ts', 'time, not diagnose their cause.', 'time and diagnose their cause.', analysis, 'does not promise to diagnose'],
];
const files = [...new Set(faults.map(f => f[1]))];
const original = new Map(await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')])));
const digest = text => createHash('sha256').update(text).digest('hex');
const run = async (id, tests, grep) => {
  await rm(`${output}/${id}.json`, { force: true });
  const args = ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--reporter=json', `--outputFile=${output}/${id}.json`];
  if (grep) args.push('-t', grep);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 90000, env: { ...process.env, FORCE_COLOR: '0' } });
  await writeFile(`${output}/${id}.log`, `${result.stdout || ''}\n${result.stderr || ''}`);
  assert(!result.error, `${id}: runner failed: ${result.error}`);
  const report = JSON.parse(await readFile(`${output}/${id}.json`, 'utf8'));
  return { code: result.status, report };
};
const results = [];
try {
  const baseline = await run('control-before', controls);
  assert.equal(baseline.code, 0, 'Baseline must be green, otherwise faults prove nothing');
  assert(baseline.report.numPassedTests >= 95, 'Expected all A–Z tests to run');
  console.log(`PASS before-control: ${baseline.report.numPassedTests} tests`);
  for (const [id, file, from, to, test, grep] of faults) {
    const source = original.get(file);
    assert.equal(source.split(from).length - 1, 1, `${id}: source anchor changed`);
    try {
      await writeFile(file, source.replace(from, to));
      const { code, report } = await run(id, [test], grep);
      const failures = report.testResults.flatMap(s => s.assertionResults || []).filter(a => a.status === 'failed' && a.fullName.includes(grep));
      assert.notEqual(code, 0, `${id}: fault escaped`);
      assert(failures.length > 0, `${id}: runner/import failure is not a caught assertion`);
      results.push({ id, caught: true, failedAssertions: failures.map(f => f.fullName) });
      console.log(`CAUGHT ${id} (${failures.length} assertion(s))`);
    } finally { await writeFile(file, source); }
  }
  const after = await run('control-after', controls);
  assert.equal(after.code, 0, 'After-control must be green');
  console.log(`PASS after-control: ${after.report.numPassedTests} tests`);
} finally {
  for (const [file, content] of original) await writeFile(file, content);
  const restored = [];
  for (const [file, content] of original) { assert.equal(digest(await readFile(file, 'utf8')), digest(content), `${file}: source not restored`); restored.push({ file, sha256: digest(content) }); }
  await writeFile(`${output}/report.json`, JSON.stringify({ faults: results, caught: results.length, expected: faults.length, restored }, null, 2));
}
console.log(`PASS ${results.length}/${faults.length} intentional source faults caught; original bytes restored.`);
