/** Reversible source faults and paired Chromium controls for native-field guards.
 * Run serially: no source edits, builds or other source mutation gate alongside.
 * Startup errors are not detections; each fault must reach its intended assertion.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const output = process.env.INPUT_GUARD_OUTPUT || '.cache/input-accessibility-guards';
await mkdir(output, { recursive: true });
const ui = 'src/inputAccessibility.ui.test.tsx', contrast = 'src/ui.contrast.test.ts';
const shared = 'button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible';
const faults = [
  ['unnamed-flashcard-search', 'src/views/Flashcards.tsx', "aria-label={t('ফ্ল্যাশকার্ড খুঁজো', 'Search flashcards')} ", '', ui, 'keeps a permanent localised flashcard search name'],
  ['flashcard-search-name-stuck-in-bengali', 'src/views/Flashcards.tsx', "aria-label={t('ফ্ল্যাশকার্ড খুঁজো', 'Search flashcards')}", "aria-label={'ফ্ল্যাশকার্ড খুঁজো'}", ui, 'keeps a permanent localised flashcard search name'],
  ['invisible-json-keyboard-stop', 'src/views/Settings.tsx', 'accept=".json,application/json" hidden aria-label=', 'accept=".json,application/json" className="sr-only" aria-label=', ui, 'keeps the JSON proxy file input'],
  ['disconnected-visible-json-button', 'src/views/Settings.tsx', 'onClick={() => fileRef.current?.click()}', 'onClick={() => {}}', ui, 'keeps the JSON proxy file input'],
  ['faint-specific-day-note-placeholder', 'src/styles.css', '.note-card textarea::placeholder{color:var(--muted);opacity:1}', '.note-card textarea::placeholder{color:#9aa68c;opacity:1}', contrast, 'keeps the day-note placeholder readable'],
  ['faint-shared-keyboard-focus', 'src/styles.css', `${shared}{outline:3px solid var(--green);`, `${shared}{outline:3px solid #8eb49b;`, contrast, 'keeps the shared keyboard focus outline'],
  ['thin-shared-keyboard-focus', 'src/styles.css', `${shared}{outline:3px solid var(--green);`, `${shared}{outline:1px solid var(--green);`, contrast, 'keeps the shared keyboard focus outline'],
  ['light-native-controls-follow-dark-system', 'src/styles.css', ':root{color-scheme:light;', ':root{color-scheme:dark;', contrast, 'keeps native form controls on the selected theme'],
  ['dark-native-controls-follow-light-system', 'src/styles.css', '[data-theme="dark"]{color-scheme:dark;', '[data-theme="dark"]{color-scheme:light;', contrast, 'keeps native form controls on the selected theme'],
];
const files = [...new Set(faults.map(fault => fault[1]))];
const originals = new Map(await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')])));
const digest = source => createHash('sha256').update(source).digest('hex');
const sourceResults = [], browserResults = [];
const runUnit = async (id, tests, grep) => {
  const reportPath = `${output}/${id}.json`; await rm(reportPath, { force: true });
  const args = ['node_modules/vitest/vitest.mjs', 'run', ...tests, '--maxWorkers=1', '--reporter=json', `--outputFile=${reportPath}`]; if (grep) args.push('-t', grep);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } });
  await writeFile(`${output}/${id}.log`, `${result.stdout || ''}\n${result.stderr || ''}`); assert(!result.error, `${id}: test runner failed: ${result.error}`);
  return { code: result.status, report: JSON.parse(await readFile(reportPath, 'utf8')) };
};
try {
  const before = await runUnit('control-before', [ui, contrast]); assert.equal(before.code, 0, 'Clean native-field control failed');
  assert(before.report.numPassedTests >= 30 && before.report.numPassedTests === before.report.numTotalTests, 'Incomplete native-field control');
  console.log(`PASS before: ${before.report.numPassedTests} tests`);
  for (const [id, file, from, to, test, grep] of faults) {
    const source = originals.get(file); assert.equal(source.split(from).length - 1, 1, `${id}: source anchor changed`);
    try {
      await writeFile(file, source.replace(from, to));
      const result = await runUnit(id, [test], grep);
      const failed = result.report.testResults.flatMap(suite => suite.assertionResults || []).filter(test => test.status === 'failed' && test.fullName.includes(grep));
      assert.notEqual(result.code, 0, `${id}: source fault survived`); assert(failed.length > 0, `${id}: intended assertions did not fail`);
      sourceResults.push({ id, caught: true, assertions: failed.map(test => test.fullName) }); console.log(`CAUGHT source/${id}`);
    } finally { await writeFile(file, source); }
  }
  const after = await runUnit('control-after', [ui, contrast]); assert.equal(after.code, 0, 'Restored native-field control failed');
  assert.equal(after.report.numPassedTests, before.report.numPassedTests); console.log(`PASS after: ${after.report.numPassedTests} tests`);
} finally {
  for (const [file, source] of originals) await writeFile(file, source);
  const restored = [];
  for (const [file, source] of originals) { const sha256 = digest(await readFile(file, 'utf8')); assert.equal(sha256, digest(source), `${file}: source not restored`); restored.push({ file, sha256 }); }
  await writeFile(`${output}/source-report.json`, JSON.stringify({ faults: sourceResults, caught: sourceResults.length, expected: faults.length, restored }, null, 2));
}
if (process.env.CHROMIUM_PATH) {
  const cases = [
    ['faint-note-placeholder', 'today', 'note', 'Day-note placeholder contrast below 4.5:1'],
    ['faint-native-value', 'today', 'fields', 'Native-field value contrast below 4.5:1'],
    ['faint-native-placeholder', 'today', 'fields', 'Native-field placeholder contrast below 4.5:1'],
    ['invisible-native-focus', 'today', 'fields', 'Native-field keyboard focus is not visible'],
    ['invisible-search-focus', 'pdfs', 'fields', 'Native-field keyboard focus is not visible'],
    ['invisible-date-focus', 'today', 'date', 'Study-date keyboard focus is invisible'],
    ['faint-button-focus', 'today', 'date', 'Shared button focus is not distinguishable'],
    ['unnamed-flashcard-search', 'flashcards', 'flashcards', 'Flashcard search lacks its permanent localised name'],
    ['wrong-flashcard-search-language', 'flashcards', 'flashcards', 'Flashcard search lacks its permanent localised name'],
    ['invisible-json-stop', 'settings', 'backup', 'JSON proxy creates an invisible keyboard stop'],
    ['broken-json-button', 'settings', 'backup', 'Visible JSON button did not open the native file chooser'],
    ['lost-saved-note', 'today', 'note', 'Typed day note was not saved'],
    ['study-date-changes-plan-start', 'today', 'date', 'Viewing another study date changed the plan start'],
    ['squeezed-backup-actions', 'settings', 'backup-actions', 'Backup action group is squeezed into the icon column'],
    ['wrong-native-colour-scheme', 'today', 'fields', 'Native control colour scheme does not match the selected app theme', '320-dark-bn'],
  ];
  const runBrowser = async (id, route, check, fault, scenario) => {
    const folder = `${output}/browser/${id}`; await rm(`${folder}/report.json`, { force: true });
    const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/check-input-accessibility.ts'], { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, INPUT_A11Y_OUTPUT: folder, INPUT_A11Y_SCENARIOS: scenario, INPUT_A11Y_ROUTES: route, INPUT_A11Y_CHECKS: check, INPUT_A11Y_FAULT: fault } });
    await writeFile(`${output}/${id}-browser.log`, `${result.stdout || ''}\n${result.stderr || ''}`); assert(!result.error, `${id}: browser runner failed: ${result.error}`);
    return { code: result.status, report: JSON.parse(await readFile(`${folder}/report.json`, 'utf8')) };
  };
  try {
    for (const [fault, route, check, expected, scenario = '320-light-en'] of cases) {
      const control = await runBrowser(`${fault}-control`, route, check, '', scenario); assert.equal(control.code, 0, `${fault}: browser control failed`);
      assert.equal(control.report.failed, 0); assert.equal(control.report.passed, 1, `${fault}: control did not execute its selected check`);
      const changed = await runBrowser(fault, route, check, fault, scenario); assert.notEqual(changed.code, 0, `${fault}: browser fault survived`);
      assert(changed.report.rows.some(row => !row.passed && String(row.detail).includes(expected)), `${fault}: intended browser assertion not reached`);
      browserResults.push({ fault, caught: true, scenario, route, check, intendedAssertion: expected }); console.log(`CAUGHT browser/${fault}`);
    }
  } finally { await writeFile(`${output}/browser-report.json`, JSON.stringify({ faults: browserResults, caught: browserResults.length, expected: cases.length }, null, 2)); }
}
console.log(`PASS ${sourceResults.length}/${faults.length} source faults and ${browserResults.length} paired browser faults; original source bytes restored.`);
