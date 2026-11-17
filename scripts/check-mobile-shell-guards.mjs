// Targeted fault proof for the screenshot regressions. Do not run the source
// mutations alongside HMR or other tests. Originals are restored byte-for-byte.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = resolve('.cache/mobile-shell/mutations');
mkdirSync(output, { recursive: true });
const mode = process.argv[2] || 'all';
assert.ok(['all', 'browser', 'source'].includes(mode));
const rows = [];
function execute(name, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: 'true', NO_COLOR: '1', ...extraEnv } });
  writeFileSync(`${output}/${name}.log`, `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.error) throw result.error;
  return result.status;
}

if (mode !== 'source') {
  assert.ok(process.env.CHROMIUM_PATH, 'Browser fault proof requires CHROMIUM_PATH');
  const run = (name, mutation = '', selected = '', viewport = '360') => {
    const folder = `${output}/${name}`;
    rmSync(`${folder}/results.json`, { force: true });
    const code = execute(name, ['node_modules/tsx/dist/cli.mjs', 'scripts/check-mobile-shell.ts'], {
      // Source Vite makes this independent of any stale production dist/.
      BASE_URL: '', MOBILE_EVIDENCE: folder, MOBILE_MUTATION: mutation, MOBILE_CASE: selected, MOBILE_VIEWPORT: viewport,
    });
    const report = JSON.parse(readFileSync(`${folder}/results.json`, 'utf8'));
    assert.ok(report.results.length, `${name}: no real browser probes ran`);
    return { code, report };
  };
  const control = run('browser-control');
  assert.equal(control.code, 0, 'Unmodified browser control failed');
  assert.ok(control.report.results.every(row => row.passed));
  const landscape = run('landscape-control', '', 'navigated-and-open-clock', '797');
  assert.equal(landscape.code, 0, 'Landscape control failed');
  assert.ok(control.report.results.some(row => row.name === 'first-study-day-toolbar' && row.passed), 'First study-day control did not pass');
  console.log(`Browser controls: ${control.report.results.length + landscape.report.results.length} passed`);
  for (const [id, selected, message, width] of [
    ['no-card-inset', 'progress-insets-and-text', 'no breathing room'],
    ['no-card-gap', 'progress-insets-and-text', 'cards touch'],
    ['oversized-ring', 'actual-touch-start', 'covered by svg'],
    ['unsafe-header', 'running-clock', 'outside safe viewport'],
    ['nonsticky-clock', 'scrolled-clock-and-controls', 'outside safe viewport'],
    ['tiny-clock', 'running-clock', 'too small'],
    ['covered-clock', 'running-clock', 'covered or cut off'],
    ['clipped-clock', 'running-clock', 'covered or cut off'],
    ['unsafe-bottom', 'safe-toolbar-and-bottom-nav', 'Gesture bar padding'],
    ['no-scroll-clearance', 'navigated-and-open-clock', 'covered by', '797'],
    ['wrong-status-background', 'running-clock', 'Status-bar background'],
    ['colliding-toolbar', 'first-study-day-toolbar', 'Toolbar buttons overlap'],
  ]) {
    const { code, report } = run(id, id, selected, width || '360');
    const failed = report.results.filter(row => !row.passed && row.name.includes(selected));
    const killed = code !== 0 && failed.some(row => row.detail.includes(message));
    rows.push({ id, kind: 'browser', killed, failures: failed.map(row => row.detail) });
    console.log(`${killed ? 'KILLED' : 'SURVIVED/ERROR'} ${id}`);
  }
}

if (mode !== 'browser') {
  const file = 'src/mobileShell.test.tsx';
  const ticking = 'keeps a named ticking timer reachable';
  const clearance = 'updates focus/scroll clearance';
  const native = 'installs the splash theme';
  const cases = [
    ['card-layout-hook', 'src/views/Today.tsx', 'className="card home-progress-card"', 'className="card"', 'gives the home progress panel'],
    ['phantom-timer-banner', 'src/App.tsx', '{(timer.running || timer.accumulatedMs > 0) && (', '{true && (', 'does not reserve a live timer banner'],
    ['frozen-digits', 'src/App.tsx', '<strong>{formatClock(timer.elapsedSec)}</strong>', '<strong>{formatClock(0)}</strong>', ticking],
    ['cannot-open-timer', 'src/App.tsx', "onClick={() => navigate('timer')} aria-label={t('পড়ার টাইমার খুলো'", "onClick={() => {}} aria-label={t('পড়ার টাইমার খুলো'", ticking],
    ['cannot-pause-timer', 'src/App.tsx', 'onClick={timer.running ? timer.pause : timer.start}', 'onClick={timer.start}', ticking],
    ['lost-saved-note', 'src/App.tsx', 'setStorageOk(saveData(data))', 'setStorageOk(saveData({ ...data, notes: {} }))', ticking],
    ['wrong-scroll-clearance', 'src/App.tsx', 'chromeRef.current?.getBoundingClientRect().height ?? 0', '0', clearance],
    ['ignored-banner-resize', 'src/App.tsx', 'new ResizeObserver(update)', 'new ResizeObserver(() => {})', clearance],
    ['unscaled-svg', 'src/components.tsx', ' viewBox={`0 0 ${size} ${size}`}', '', 'scales the decorative ring'],
    ['missing-splash-install', 'android/app/src/main/java/com/prostuti/hsc27/MainActivity.java', 'SplashScreen.installSplashScreen(this);', '/* fault: no splash theme installation */', native],
    ['late-splash-install', 'android/app/src/main/java/com/prostuti/hsc27/MainActivity.java', 'SplashScreen.installSplashScreen(this);', '/* fault: install after edge-to-edge */', native, true],
    ['persistent-splash-background', 'android/app/src/main/res/values/styles.xml', '<item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>', '<item name="android:background">@drawable/splash</item>', 'does not use the full splash picture'],
  ];
  const originals = new Map(cases.map(([, path]) => [path, readFileSync(path, 'utf8')]));
  const run = (id, title) => {
    const reportFile = `${output}/${id}.json`;
    rmSync(reportFile, { force: true });
    const args = ['node_modules/vitest/vitest.mjs', 'run', file, '--reporter=json', `--outputFile=${reportFile}`, '--silent'];
    if (title) args.push('-t', title);
    const code = execute(id, args);
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    const assertions = report.testResults.flatMap(suite => suite.assertionResults || []);
    return { code, report, assertions };
  };
  try {
    const control = run('source-control');
    assert.equal(control.code, 0, 'Unmodified source control failed');
    assert.equal(control.assertions.filter(a => a.status === 'passed').length, 7);
    console.log('Source controls: 7 passed');
    for (const [id, path, from, to, title, late] of cases) {
      assert.ok(control.assertions.some(a => a.status === 'passed' && a.fullName.includes(title)), `${id}: named control did not pass`);
      const original = originals.get(path);
      assert.equal(original.split(from).length, 2, `${id}: ambiguous mutation anchor`);
      let changed = original.replace(from, to);
      if (late) changed = changed.replace('EdgeToEdge.enable(this);', 'EdgeToEdge.enable(this);\n        SplashScreen.installSplashScreen(this);');
      let result;
      try { writeFileSync(path, changed); result = run(id, title); }
      finally { writeFileSync(path, original); }
      const failed = result.assertions.filter(a => a.status === 'failed' && a.fullName.includes(title));
      const killed = result.code !== 0 && failed.length > 0 && !result.report.numRuntimeErrorTestSuites;
      rows.push({ id, kind: 'source', killed, failures: failed.map(a => a.fullName) });
      console.log(`${killed ? 'KILLED' : 'SURVIVED/ERROR'} ${id}`);
    }
  } finally {
    for (const [path, original] of originals) writeFileSync(path, original);
    const digest = text => createHash('sha256').update(text).digest('hex');
    assert.ok([...originals].every(([path, text]) => digest(readFileSync(path)) === digest(text)), 'Source restoration failed');
  }
}
writeFileSync(`${output}/${mode}-report.json`, JSON.stringify({ rows, restored: true }, null, 2));
assert.ok(rows.length > 0 && rows.every(row => row.killed), 'A mobile-shell fault survived or had invalid evidence');
console.log(`Mobile shell fault proof: ${rows.length}/${rows.length} caught; source originals restored. Targeted, not exhaustive.`);
