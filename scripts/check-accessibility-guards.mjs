/** Browser fault proofs use an already-built preview: no HMR/source mutation.
 * Each fault has its own passing control and must fail its intended axe rule,
 * not startup, selectors, navigation, fixture parsing or runtime exceptions. */
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

assert(process.env.CHROMIUM_PATH, 'Set CHROMIUM_PATH for the accessibility fault proof');
const output = process.env.A11Y_GUARD_OUTPUT || '.cache/accessibility-faults';
await mkdir(output, { recursive: true });
const cases = [
  ['unnamed-progress', '320-light-en', 'calendar', '', 'aria-progressbar-name'],
  ['wrong-class-name', '320-light-en', 'syllabus', '', 'label-content-name-mismatch'],
  ['wrong-language-name', '393-dark-bn', 'today', '', 'label-content-name-mismatch'],
  ['unfocusable-timeline', '320-light-en', 'calendar', '', 'scrollable-region-focusable'],
  ['invalid-filter-tablist', '320-light-en', 'today', 'search-modal', 'aria-required-children'],
  ['faint-secondary', '320-light-en', 'calendar', '', 'color-contrast'],
  ['faint-dark-subject', '393-dark-bn', 'testprep', '', 'color-contrast'],
  ['light-action-with-white-text', '320-light-en', 'practice', '', 'color-contrast'],
  ['foreground-as-background', '320-light-en', 'practice', '', 'color-contrast'],
  ['faded-calendar-dates', '320-light-en', 'calendar', '', 'color-contrast'],
  ['undecorated-source-link', '393-light-bn', 'studySystem', 'duration-player-modal', 'link-in-text-block'],
  ['pale-dark-exam-mistakes', '1280-dark-en', 'examsim', '', 'color-contrast', true],
];
const results = [];
async function run(id, scenario, route, dialog, fault, examOnly = false) {
  const folder = `${output}/${id}`;
  await rm(`${folder}/report.json`, { force: true });
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/check-accessibility.ts'], { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, A11Y_ROUTES: route, A11Y_SCENARIOS: scenario, A11Y_DIALOGS: dialog || 'none', A11Y_FAULT: fault, A11Y_EXTRA_STATES: examOnly ? '1' : '0', A11Y_EXAM_STATES_ONLY: examOnly ? '1' : '0', A11Y_SCREENSHOTS: '0', A11Y_OUTPUT: folder } });
  await writeFile(`${output}/${id}.log`, `${result.stdout || ''}\n${result.stderr || ''}`);
  assert(!result.error, `${id}: runner error: ${result.error}`);
  const report = JSON.parse(await readFile(`${folder}/report.json`, 'utf8'));
  assert.equal(report.rows.length, examOnly ? 7 : dialog ? 2 : 1, `${id}: not every selected view was scanned`);
  assert(report.rows.every(row => !row.pageErrors.length), `${id}: page errors do not prove a guard`);
  return { code: result.status, report };
}
try {
  for (const [fault, scenario, route, dialog, rule, examOnly = false] of cases) {
    const control = await run(`${fault}-control`, scenario, route, dialog, '', examOnly);
    assert.equal(control.code, 0, `${fault}: clean control did not pass`);
    assert(control.report.rows.every(row => !row.violations.length));
    const changed = await run(fault, scenario, route, dialog, fault, examOnly);
    assert.notEqual(changed.code, 0, `${fault}: fault survived`);
    const violations = changed.report.rows.filter(row => !examOnly || row.name.endsWith('/submitted-exam')).flatMap(row => row.violations).filter(v => v.id === rule);
    assert(violations.length, `${fault}: failed for a different rule/state/startup, expected ${rule}`);
    results.push({ fault, scenario, route, dialog: dialog || null, examStatesOnly: examOnly, rule, caught: true, failingNodes: violations.reduce((n, v) => n + v.nodes.length, 0) });
    console.log(`CAUGHT ${fault}: ${rule}`);
  }
} finally { await writeFile(`${output}/report.json`, JSON.stringify({ results, caught: results.length, expected: cases.length }, null, 2)); }
console.log(`PASS ${results.length}/${cases.length} browser faults caught with a passing control for each.`);
