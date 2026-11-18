/** Serial, reversible source faults for the follow-up repairs, followed by
 * optional production-browser faults. Never run another source mutation gate or
 * edit app source concurrently. Import/startup errors do not count as catches. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const output = process.env.FOLLOWUP_GUARD_OUTPUT || '.cache/followup-guards';
await mkdir(output, { recursive: true });
const cadence = 'src/cadence.test.ts', ui = 'src/azFollowup.ui.test.tsx', aria = 'src/azAccessibility.ui.test.tsx', contrast = 'src/ui.contrast.test.ts';
const golden = 'src/golden.test.ts';
const controls = [cadence, ui, aria, contrast, golden];
const faults = [
  ['monday-index-as-js-weekday', 'src/cadence.ts', 'new Date(`${date}T00:00:00Z`).getUTCDay() === WEEKLY_TEST_WEEKDAY', 'index === WEEKLY_TEST_WEEKDAY', cadence, 'marks only the actual Friday'],
  ['overdue-slot-hides-friday', 'src/cadence.ts', 'weekday: weekdays[index],\n      cadence,', 'weekday: weekdays[index],\n      cadence: date === today ? (nextCadenceSlot(data, today)?.cadence ?? cadence) : cadence,', cadence, 'starts on Monday and marks the Friday'],
  ['localised-text-as-weekday-key', 'src/views/ExamSim.tsx', "<strong>{day.weekday}</strong><small>{day.cadence === 'weekly'", "<strong>{day.weekday}</strong><small>{day.weekday === 'শুক্র'", ui, 'labels the actual Friday'],
  ['misdescribe-rolling-due-slots', 'src/views/ExamSim.tsx', 'Due slots use elapsed days', 'Due slots use fixed Fridays', ui, 'labels the actual Friday'],
  ['lose-explicit-saved-cadence', 'src/examSim.ts', '    ...(input.cadence ? { cadence: input.cadence } : {}),\n  };\n  const weakest', '  };\n  const weakest', cadence, 'saves which routine slot'],
  ['invent-a-free-paper-cadence', 'src/examSim.ts', '    ...(input.cadence ? { cadence: input.cadence } : {}),\n  };\n  const weakest', "    cadence: input.cadence || 'daily',\n  };\n  const weakest", cadence, 'leaves the cadence off'],
  ['silently-shorten-saved-retry', 'src/views/ExamSim.tsx', 'if (questions.length < session.questionIds.length)', 'if (false)', ui, 'asks before a shortened retry'],
  ['start-shortened-retry-before-consent', 'src/views/ExamSim.tsx', 'const missing = session.questionIds.length - questions.length;', "start(questions, 'mistakes');\n      const missing = session.questionIds.length - questions.length;", ui, 'asks before a shortened retry'],
  ['cancel-changes-setup-mode', 'src/views/ExamSim.tsx', 'const missing = session.questionIds.length - questions.length;', "setMode('mistakes');\n      const missing = session.questionIds.length - questions.length;", ui, 'asks before a shortened retry'],
  ['reverse-retained-retry-order', 'src/views/ExamSim.tsx', "action: () => start(questions, 'mistakes'),", "action: () => start([...questions].reverse(), 'mistakes'),", ui, 'starts only the disclosed retained subset'],
  ['unexplained-entirely-missing-retry', 'src/views/ExamSim.tsx', "if (!questions.length) {\n      notify(t(`সেভ করা", "if (false) {\n      notify(t(`সেভ করা", ui, 'explains an entirely unavailable retry'],
  ['new-retry-erases-saved-score', 'src/views/ExamSim.tsx', 'setData(next); setMode(nextMode); setTick(now);', 'setData({ ...next, examSessions: [] }); setMode(nextMode); setTick(now);', ui, 'retries a fully retained saved paper'],
  ['hide-missing-history-definitions', 'src/views/ExamSim.tsx', 'missingDefinitions > 0 && <p', 'false && <p', ui, 'visibly discloses missing history definitions'],
  ['missing-definitions-look-like-zero-blanks', 'src/views/ExamSim.tsx', "{post.questions ? `${bn(post.blankRate)}%` : '—'}", '{`${bn(post.blankRate)}%`}', ui, 'visibly discloses missing history definitions'],
  ['give-advice-with-no-retained-sample', 'src/views/ExamSim.tsx', '{post.questions > 0 && <>', '{true && <>', ui, 'visibly discloses missing history definitions'],
  ['delete-without-history-warning', 'src/views/Practice.tsx', 'const warning = savedPapers ? t(', 'const warning = false ? t(', ui, 'warns that confirmed question deletion'],
  ['question-delete-erases-exam-history', 'src/views/Practice.tsx', 'questions: d.questions.filter(item => item.id !== question.id)', 'questions: d.questions.filter(item => item.id !== question.id), examSessions: []', ui, 'warns that confirmed question deletion'],
  ['question-deleted-before-confirmation', 'src/views/Practice.tsx', "    confirm({ title: t('প্রশ্নটি মুছবে?', 'Delete this question?'), message:", "    setData(d => ({ ...d, questions: d.questions.filter(item => item.id !== question.id) }));\n    confirm({ title: t('প্রশ্নটি মুছবে?', 'Delete this question?'), message:", ui, 'warns that confirmed question deletion'],
  ['completion-group-role-missing', 'src/views/Syllabus.tsx', 'className="segmented" role="group" aria-label={t(\'সম্পন্ন অবস্থা\'', 'className="segmented" aria-label={t(\'সম্পন্ন অবস্থা\'', aria, 'gives completion filters a named group'],
  ['rating-image-role-missing', 'src/modals.tsx', 'className={`star-badge s${sch.star}`} role="img"', 'className={`star-badge s${sch.star}`}', aria, 'gives completion filters a named group'],
  ['rating-name-stuck-in-bengali', 'src/modals.tsx', '`Importance: ${sch.star} of 5 stars`', '`গুরুত্ব: ${bn(sch.star)}/৫ স্টার`', aria, 'gives completion filters a named group'],
  ['profile-initial-no-longer-decorative', 'src/App.tsx', 'aria-label={t(\'প্রোফাইল ও সেটিংস\', \'Profile & settings\')}><span aria-hidden="true">', 'aria-label={t(\'প্রোফাইল ও সেটিংস\', \'Profile & settings\')}><span>', aria, 'hides the decorative profile initial'],
  ['mcq-option-without-accessible-name', 'src/views/Practice.tsx', 'aria-label={optionLabel} placeholder={optionLabel}', 'placeholder={optionLabel}', aria, 'gives every MCQ option'],
  ['mcq-placeholder-stuck-in-bengali', 'src/views/Practice.tsx', 'placeholder={optionLabel}', "placeholder={'অপশন ক'}", aria, 'gives every MCQ option'],
  ['mcq-answer-name-stuck-in-bengali', 'src/views/Practice.tsx', 'aria-label={t(`সঠিক উত্তর ${letter}`, `Correct answer ${letter}`)}', 'aria-label={`সঠিক উত্তর ${letter}`}', aria, 'gives every MCQ option'],
  ['mcq-loses-touched-answer', 'src/views/Practice.tsx', 'options: options.map(option => option.trim()), answer, explanation:', 'options: options.map(option => option.trim()), answer: 0, explanation:', aria, 'gives every MCQ option'],
  ['mcq-reverses-typed-options', 'src/views/Practice.tsx', 'options: options.map(option => option.trim()), answer, explanation:', 'options: options.map(option => option.trim()).reverse(), answer, explanation:', aria, 'gives every MCQ option'],
  ['faint-profile-initial', 'src/styles.css', '.avatar,.topbar-avatar{display:flex;align-items:center;justify-content:center;background:#ece9df;color:var(--ink-2);', '.avatar,.topbar-avatar{display:flex;align-items:center;justify-content:center;background:#ece9df;color:#8a8067;', contrast, 'keeps a single profile initial'],
  ['faint-dark-syllabus-totals', 'src/styles.css', ".syllabus-summary strong{font-family:'DM Sans',sans-serif;font-size:13px;color:var(--green);", ".syllabus-summary strong{font-family:'DM Sans',sans-serif;font-size:13px;color:#5b744f;", contrast, 'keeps single-digit syllabus summary'],
  ['faint-wide-shell-labels', 'src/styles.css', '.breadcrumb,.global-search,.nav-section-label,.sidebar-profile div>span,.brand small{color:var(--muted)}', '.breadcrumb,.global-search,.nav-section-label,.sidebar-profile div>span,.brand small{color:#7d8974}', contrast, 'keeps light shell secondary labels'],
  ['faint-sidebar-encouragement', 'src/styles.css', '.dream-card p{font-size:11px;color:var(--muted);', '.dream-card p{font-size:11px;color:#95a185;', contrast, 'keeps the desktop sidebar encouragement'],
  ['faint-sidebar-tagline', 'src/styles.css', '.dream-card>span{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--green);', '.dream-card>span{display:flex;align-items:center;gap:6px;font-size:10px;color:#71885c;', contrast, 'keeps the desktop sidebar encouragement'],
  ['faint-golden-next-grade', 'src/styles.css', '.golden-next{font-size:8.5px;color:var(--muted);', '.golden-next{font-size:8.5px;color:#8c9a81;', contrast, 'keeps wide Golden next-grade'],
  ['faint-mistake-book-tip', 'src/styles.css', '.mistake-tip p{font-size:10px;color:var(--muted);', '.mistake-tip p{font-size:10px;color:#93a385;', contrast, 'keeps the mistake-book tip'],
  ['faint-inactive-library-counts', 'src/styles.css', '.tab-count{font-size:8px;background:#f0f4ea;border-radius:3px;padding:1px 4px;color:var(--muted)}', '.tab-count{font-size:8px;background:#f0f4ea;border-radius:3px;padding:1px 4px;color:#98a88c}', contrast, 'keeps inactive library tab counts'],
  ['raw-next-grade-gap-display', 'src/views/Exams.tsx', 'bn(markGapLabel(row.toNextGrade ?? 0))', 'bn(row.toNextGrade ?? 0)', ui, 'formats the gap for'],
  ['raw-golden-goal-gap-display', 'src/views/Exams.tsx', 'bn(markGapLabel(need))', 'bn(need)', ui, 'formats the gap for'],
  ['raw-total-golden-gap-display', 'src/views/Exams.tsx', 'bn(markGapLabel(plan5.marksToGolden))', 'bn(plan5.marksToGolden)', ui, 'formats the gap for'],
  ['raw-english-golden-verdict-gap', 'src/golden.ts', '${markGapLabel(marksToGolden)} marks short', '${marksToGolden} marks short', golden, 'does not promote a near-boundary raw mark'],
  ['unformatted-binary-gap', 'src/golden.ts', 'const rounded = Number(value.toFixed(2));', 'const rounded = value;', golden, 'formats'],
  ['tiny-positive-gap-looks-zero', 'src/golden.ts', "if (value > 0 && rounded === 0) return '<0.01';", "if (false) return '<0.01';", golden, 'formats'],
  ['invalid-gap-looks-like-marks', 'src/golden.ts', "  if (!Number.isFinite(value) || value < 0) return '—';", '', golden, 'never presents invalid gap'],
  ['display-rounding-promotes-raw-grade', 'src/golden.ts', 'const percentage = obtained / full * 100;', 'const percentage = Math.round(obtained / full * 10000) / 100;', ui, 'formats the gap for'],
];
const files = [...new Set(faults.map(fault => fault[1]))];
const originals = new Map(await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')])));
const digest = value => createHash('sha256').update(value).digest('hex');
const results = [], browserResults = [];
const run = async (id, tests, grep) => {
  const path = `${output}/${id}.json`; await rm(path, { force: true });
  const args = ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--maxWorkers=1', '--reporter=json', `--outputFile=${path}`]; if (grep) args.push('-t', grep);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } });
  await writeFile(`${output}/${id}.log`, `${result.stdout || ''}\n${result.stderr || ''}`); assert(!result.error, `${id}: runner error ${result.error}`);
  return { code: result.status, report: JSON.parse(await readFile(path, 'utf8')) };
};
try {
  const control = await run('control-before', controls); assert.equal(control.code, 0, 'Clean control failed'); assert(control.report.numPassedTests >= 111 && control.report.numPassedTests === control.report.numTotalTests, 'Incomplete follow-up control'); console.log(`PASS before: ${control.report.numPassedTests} tests`);
  for (const [id, file, from, to, test, grep] of faults) {
    const source = originals.get(file); assert.equal(source.split(from).length - 1, 1, `${id}: source anchor changed`);
    try {
      await writeFile(file, source.replace(from, to)); const { code, report } = await run(id, [test], grep);
      const failures = report.testResults.flatMap(suite => suite.assertionResults || []).filter(test => test.status === 'failed' && test.fullName.includes(grep));
      assert.notEqual(code, 0, `${id}: source fault survived`); assert(failures.length, `${id}: no intended assertion failed`);
      results.push({ id, caught: true, failedAssertions: failures.map(test => test.fullName) }); console.log(`CAUGHT ${id}`);
    } finally { await writeFile(file, source); }
  }
  const after = await run('control-after', controls); assert.equal(after.code, 0, 'Restored control failed'); assert.equal(after.report.numPassedTests, control.report.numPassedTests); console.log(`PASS after: ${after.report.numPassedTests} tests`);
} finally {
  for (const [file, source] of originals) await writeFile(file, source);
  const restored = []; for (const [file, source] of originals) { const hash = digest(await readFile(file, 'utf8')); assert.equal(hash, digest(source), `${file}: not restored`); restored.push({ file, sha256: hash }); }
  await writeFile(`${output}/source-report.json`, JSON.stringify({ faults: results, caught: results.length, expected: faults.length, restored }, null, 2));
}
if (process.env.CHROMIUM_PATH) {
  const cases = [
    ['faint-profile-initial', '320-light-en', true, 'Profile initial contrast below 4.5:1'],
    ['faint-dark-summary', '1280-dark-bn', true, 'Summary number contrast below 4.5:1'],
    ['unnamed-completion-group', '320-light-en', true, 'Unresolved semantic review'],
    ['unnamed-rating', '320-light-en', true, 'Unresolved semantic review'],
    ['decorative-initial-in-name', '320-light-en', true, 'Profile initial must be explicitly decorative'],
    ['covered-form-save', '320-light-en', false, 'Reduced-height Save is covered'],
    ['untrapped-dialog', '320-light-en', true, 'Reverse Tab did not wrap'],
    ['oversized-dialog', '320-light-en', true, 'Dialog exceeds the viewport'],
    ['pale-selected-option', '320-dark-bn', false, 'MCQ option value contrast below 4.5:1'],
    ['pale-unselected-option', '320-dark-bn', false, 'MCQ option value contrast below 4.5:1'],
    ['faint-option-placeholder', '320-light-en', false, 'MCQ option placeholder contrast below 4.5:1'],
    ['faint-option-letter', '320-light-en', false, 'MCQ option letter contrast below 4.5:1'],
    ['unnamed-option-input', '320-light-en', false, 'MCQ option lacks its localised accessible name'],
    ['wrong-option-radio-language', '320-light-en', false, 'MCQ answer radio lacks its localised accessible name'],
    ['invisible-option-focus', '320-light-en', false, 'MCQ option focus indicator is not visible'],
    ['undersized-option-radio', '320-light-en', false, 'MCQ radio touch target below 24px'],
  ];
  const browserRun = async (id, scenario, reviewOnly, fault) => {
    const folder = `${output}/browser/${id}`; await rm(`${folder}/report.json`, { force: true });
    const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/check-followup-browser.ts'], { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, FOLLOWUP_SCENARIOS: scenario, FOLLOWUP_REVIEW_ONLY: reviewOnly ? '1' : '0', FOLLOWUP_BROWSER_FAULT: fault, FOLLOWUP_BROWSER_OUTPUT: folder } });
    await writeFile(`${output}/${id}-browser.log`, `${result.stdout || ''}\n${result.stderr || ''}`); assert(!result.error, `${id}: browser runner error ${result.error}`);
    return { code: result.status, report: JSON.parse(await readFile(`${folder}/report.json`, 'utf8')) };
  };
  try {
    for (const [fault, scenario, reviewOnly, expected] of cases) {
      const control = await browserRun(`${fault}-control`, scenario, reviewOnly, ''); assert.equal(control.code, 0, `${fault}: browser control failed`); assert.equal(control.report.failed, 0); assert.equal(control.report.passed, reviewOnly ? 3 : 7);
      const changed = await browserRun(fault, scenario, reviewOnly, fault); assert.notEqual(changed.code, 0, `${fault}: browser fault survived`);
      assert(changed.report.rows.some(row => !row.passed && String(row.detail).includes(expected)), `${fault}: expected assertion not reached`);
      browserResults.push({ fault, scenario, caught: true, intendedAssertion: expected }); console.log(`CAUGHT browser/${fault}`);
    }
  } finally { await writeFile(`${output}/browser-report.json`, JSON.stringify({ faults: browserResults, caught: browserResults.length, expected: cases.length }, null, 2)); }
}
console.log(`PASS ${results.length}/${faults.length} source faults, ${browserResults.length} browser faults; source bytes restored.`);
