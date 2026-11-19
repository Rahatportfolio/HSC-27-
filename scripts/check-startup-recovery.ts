/** Production entry-failure recovery: independent HTML/ES5 JS, exact raw JSON,
 * no storage writes, no cache reset. Isolated synthetic profiles only. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { AxeResults } from 'axe-core';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { STORAGE_KEY } from '../src/planner';
import { RECOVERY_KEY, SAVED_AT_KEY, parseBackup } from '../src/storage';
import { personalDataFixture } from '../src/test/personalRoutineFixture';

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const output = process.env.STARTUP_OUTPUT || '.cache/startup-recovery';
await mkdir(output, { recursive: true });
const html = await readFile('dist/index.html', 'utf8');
const entry = html.match(/<script[^>]*src="\.\/(assets\/index-[\w-]+\.js)"/)?.[1];
assert(entry, 'Build the production entry before running startup checks');
const data = personalDataFixture();
data.notes['2026-11-20'] = 'Keep exact private notes: বাংলা <script>not executable</script>';
const raw = `  ${JSON.stringify(data, null, 2)}\n`;
const recoveryRaw = '{"unrepaired":"keep even an invalid/truncated old snapshot';
const seed = { [STORAGE_KEY]: raw, [SAVED_AT_KEY]: '2026-11-20T10:20:30.000Z', [RECOVERY_KEY]: recoveryRaw, 'unrelated-origin-value': 'Never touch other data' };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const checks: { name: string; detail?: unknown }[] = [];
const require = createRequire(import.meta.url), accessibility: { url: string; violations: number; incompleteRules: number }[] = [];
let failure = '';
const snapshot = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
async function setup(context: BrowserContext) {
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort('internetdisconnected'));
  await context.addInitScript(values => { for (const [key, value] of Object.entries(values)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value); }, seed);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
  return page;
}
async function bounded(page: Page, allowScript = true) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Recovery has horizontal overflow');
  assert.equal(await page.getByRole('main').getByRole('heading', { level: 1 }).count(), 1, 'Recovery needs one visible main heading');
  // Axe itself is not an old-engine/no-JS compatibility probe. Audit the same
  // fallback/recovery markup in modern contexts; retain raw incomplete findings.
  if (!allowScript || !await page.evaluate(() => typeof Array.prototype.at === 'function' && typeof Object.hasOwn === 'function' && typeof structuredClone === 'function')) return;
  if (!await page.evaluate(() => 'axe' in window)) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => (window as unknown as { axe: { run: (document: Document, options: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations', 'incomplete'] }));
  await writeFile(`${output}/accessibility-${accessibility.length + 1}.json`, JSON.stringify(result, null, 2));
  accessibility.push({ url: page.url(), violations: result.violations.length, incompleteRules: result.incomplete.length });
  assert.equal(result.violations.length, 0, `Startup/recovery accessibility: ${result.violations.map(rule => rule.id).join(', ')}`);
}
try {
  for (const mode of ['network', 'runtime', 'missing-array-at', 'missing-has-own', 'missing-structured-clone'] as const) {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 320, height: 800 }, hasTouch: true, isMobile: true });
    try {
      const page = await setup(context);
      if (mode === 'network') await page.route(`**/${entry}`, route => route.abort('failed'));
      else if (mode === 'runtime') await page.route(`**/${entry}`, route => route.fulfill({ contentType: 'text/javascript', body: "throw new Error('Synthetic startup failure, not student data');" }));
      else await page.addInitScript(mode => {
        if (mode === 'missing-array-at') delete (Array.prototype as { at?: unknown }).at;
        if (mode === 'missing-has-own') delete (Object as { hasOwn?: unknown }).hasOwn;
        if (mode === 'missing-structured-clone') delete (window as { structuredClone?: unknown }).structuredClone;
      }, mode);
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      await page.locator('#startup-recovery').waitFor({ state: 'visible' }); await bounded(page);
      assert.deepEqual(await snapshot(page), seed, `${mode}: failing startup must not normalize or overwrite the old profile`);
      const requested: string[] = []; page.on('request', request => requested.push(request.url()));
      await page.locator('#startup-recovery a[href="./recovery.html"]').click();
      await page.locator('#recovery-profile').waitFor(); await bounded(page);
      assert(requested.every(url => !/\/assets\//.test(url)), 'Standalone recovery imported broken application modules');
      await page.locator('#recovery-profile').click();
      assert.equal(await page.locator('#recovery-json').inputValue(), raw, 'Saved JSON was reformatted, repaired or truncated');
      assert.deepEqual(parseBackup(await page.locator('#recovery-json').inputValue()).notes, data.notes);
      const downloadEvent = page.waitForEvent('download'); await page.locator('#recovery-download').click();
      const download = await downloadEvent, file = `${output}/${mode}-raw-profile.json`; await download.saveAs(file);
      assert.equal(await readFile(file, 'utf8'), raw);
      await page.locator('#recovery-old').click();
      assert.equal(await page.locator('#recovery-json').inputValue(), recoveryRaw, 'Corrupt recovery evidence was discarded or silently fixed');
      assert.deepEqual(await snapshot(page), seed, 'Recovery changed storage or backup timestamps');
      await page.screenshot({ path: `${output}/${mode}-320.png`, fullPage: true });
      checks.push({ name: `${mode}: nonblank fallback → independent recovery → exact current/old raw snapshots and download → zero storage writes` });
    } finally { await context.close(); }
  }
  {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 393, height: 852 } });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => Object.defineProperty(Storage.prototype, 'getItem', { configurable: true, value() { throw new Error('Storage access denied'); } }));
      await page.goto(`${base}/recovery.html`, { waitUntil: 'networkidle' });
      await page.locator('#recovery-profile').click();
      assert.match(await page.locator('#recovery-status').innerText(), /access.*denied|cannot read/i);
      assert.equal(await page.locator('#recovery-json').inputValue(), '');
      assert(await page.locator('#recovery-download').isDisabled());
      checks.push({ name: 'storage access denial is visible, not treated as an empty/lost profile or a successful backup' });
    } finally { await context.close(); }
  }
  {
    const context = await browser.newContext({ serviceWorkers: 'block', javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
    try {
      const page = await context.newPage(); await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.locator('#startup-recovery').waitFor({ state: 'visible' }); await bounded(page, false);
      await page.locator('#startup-recovery a[href="./recovery.html"]').click();
      assert.match(await page.locator('noscript').innerText(), /JavaScript/);
      assert.match(await page.locator('main').innerText(), /Do not uninstall or clear app data/);
      checks.push({ name: 'JavaScript disabled: readable static help and recovery link, no blank page or data-reset advice' });
    } finally { await context.close(); }
  }
  {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 393, height: 852 } });
    try {
      const page = await setup(context), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/#today`, { waitUntil: 'networkidle' }); await page.locator('.personal-home').waitFor();
      assert(!await page.locator('#startup-recovery').isVisible(), 'Successful startup must hide fallback without duplicate main landmarks');
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      const before = await snapshot(page);
      // Network-first recovery navigation must NOT overwrite the cached app index.
      await page.goto(`${base}/recovery.html`, { waitUntil: 'networkidle' });
      await page.locator('#recovery-profile').click();
      assert.equal(await page.locator('#recovery-json').inputValue(), before[STORAGE_KEY]);
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#recovery-profile').click();
      assert.equal(await page.locator('#recovery-json').inputValue(), before[STORAGE_KEY]);
      await page.locator('#recovery-reopen').click(); await page.locator('.personal-home').waitFor();
      assert.deepEqual((await snapshot(page))[STORAGE_KEY], before[STORAGE_KEY], 'Recovery/app navigation changed routine or notes');
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.personal-home').waitFor();
      assert(!await page.locator('#startup-recovery').isVisible()); assert.deepEqual(errors, []);
      checks.push({ name: 'healthy app → online recovery → offline recovery reload → offline app reopen/reload; neither navigation poisons the other cached document' });
    } finally { await context.close(); }
  }
} catch (error) { failure = String(error); throw error; }
finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ base, productionBuild: true, complete: !failure, checks, accessibility, failure, scope: 'controlled startup failure, raw localStorage recovery, unsupported API guard, offline document isolation; automated axe on modern-JS fallback/recovery markup, raw incompletes retained; not SQLite/media recovery, exhaustive accessibility, old-engine or physical-device certification' }, null, 2));
}
console.log(`PASS ${checks.length} startup/raw-recovery/offline-document scenarios.`);
