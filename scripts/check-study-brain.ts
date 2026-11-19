/** Bounded production-browser acceptance of the optional, entirely local Study Brain.
 * Synthetic profiles only. This does not audit video content or native devices.
 * Run `npm run build && npm run preview`, then test:brain-browser.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import type { AxeResults } from 'axe-core';
import { reviewIncomplete } from './review-a11y-incomplete';
import type { A11yReview } from './review-a11y-incomplete';
import { STORAGE_KEY } from '../src/planner';
import type { AppData } from '../src/planner';
import { parseBackup } from '../src/storage';
import { newStudyBrain, saveBrainCheckIn } from '../src/studyBrain';
import { defaultChapterWorkload } from '../src/personalRoutine';
import { PERSONAL_IDS, personalDataFixture } from '../src/test/personalRoutineFixture';
import { freshData } from '../src/planner';
import { TIMER_KEY } from '../src/hooks';

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const output = process.env.BRAIN_BROWSER_OUTPUT || '.cache/study-brain/browser', require = createRequire(import.meta.url);
const now = new Date('2026-11-20T12:05:00Z');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results: object[] = [], violations: object[] = [], incomplete: object[] = [], supplementalReviews: A11yReview[] = [];
let failure = '';
const read = async (page: Page) => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
const withoutBrain = (data: AppData) => { const { studyBrain: _memory, ...rest } = data; return rest; };
async function check(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('main h1').count(), 1, `${name}: one heading`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
  if (!await page.evaluate(() => 'axe' in window)) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const a11y = await page.evaluate(async () => (window as unknown as { axe: { run: (root: Document, options: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, iframes: false, resultTypes: ['violations', 'incomplete'] }));
  violations.push(...a11y.violations.map(item => ({ name, ...item })));
  incomplete.push(...a11y.incomplete.map(item => ({ name, ...item })));
  if (process.env.REVIEW_INCOMPLETE === '1') {
    const review = await reviewIncomplete(page, name, a11y.incomplete); supplementalReviews.push(...review);
    assert.equal(review.filter(row => row.status !== 'verified').length, 0, `${name}: supplemental text/label measurement failed or unresolved; inspect report`);
  }
  assert.equal(a11y.violations.length, 0, `${name}: ${a11y.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' '))}`).join('; ')}`);
}
async function seed(page: Page, data: AppData) { await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(data) }); }
async function open(page: Page, route = 'brain') {
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  await page.locator('main > .view').waitFor();
  assert.equal(await page.locator('main > .route-error').count(), 0, `Route #${route} failed to load`);
}
async function flow() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/New_York', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = [], externalRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) externalRequests.push(`${request.method()} ${request.url()}`); });
  try {
    const data = personalDataFixture(); data.notes['2026-11-20'] = 'Synthetic private note retained';
    await page.clock.setFixedTime(now); await seed(page, data); await open(page, 'today');
    await page.getByRole('button', { name: 'Talk to Study Brain', exact: true }).click();
    await page.locator('.brain-welcome').waitFor(); assert.equal((await read(page)).studyBrain, undefined);
    await check(page, 'optional opt-in');
    await page.getByRole('button', { name: 'Enable local Study Brain', exact: true }).click();
    const original = withoutBrain(await read(page));
    await context.setOffline(true);
    await page.getByLabel('Say it briefly (Bengali / Banglish / English)', { exact: true }).fill('aj 30 min ache, onek tired');
    await page.getByRole('button', { name: 'Interpret', exact: true }).click();
    assert.equal(await page.getByLabel('Energy today', { exact: true }).inputValue(), 'low');
    assert.equal(await page.getByLabel('Time for this focus (minutes)', { exact: true }).inputValue(), '30');
    assert.equal((await read(page)).studyBrain!.checkIns.length, 0, 'interpretation must not save');
    await page.getByRole('button', { name: 'Remember check-in', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).studyBrain.checkIns.length === 1, STORAGE_KEY);
    assert.deepEqual(withoutBrain(await read(page)), original, 'offline check-in cannot alter plan/progress');
    assert.equal(await page.getByLabel('Say it briefly (Bengali / Banglish / English)', { exact: true }).inputValue(), '');
    assert.ok(!await page.evaluate(key => localStorage.getItem(key)!.includes('onek tired'), STORAGE_KEY), 'do not retain chat text');
    const next = page.getByRole('region', { name: 'Brain next step', exact: true });
    await next.getByRole('button', { name: 'Felt hard', exact: true }).click();
    assert.equal((await read(page)).studyBrain!.feedback[0].difficulty, 'hard');
    assert.equal(await next.getByRole('button', { name: 'Start 15-minute focus', exact: true }).count(), 1);
    await context.setOffline(false); await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByLabel('Time for this focus (minutes)', { exact: true }).inputValue(), '30');
    await check(page, 'confirmed check-in reload');
    await page.getByRole('button', { name: 'Pause, keep memory', exact: true }).click();
    assert.equal((await read(page)).studyBrain!.enabled, false); assert.equal((await read(page)).studyBrain!.checkIns.length, 1);
    await page.getByRole('button', { name: 'Resume Study Brain', exact: true }).click();
    await next.getByRole('button', { name: 'Start 15-minute focus', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).running, TIMER_KEY);
    const timer = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), TIMER_KEY);
    assert.equal(timer.durationMin, 15); assert.match(timer.taskId, /^smart-part\|personal%3A.*\|0\|15$/);
    assert.deepEqual((await read(page)).completed, data.completed);
    await page.clock.setFixedTime(new Date('2026-11-20T12:21:00Z'));
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).studySessions.length === 1, STORAGE_KEY);
    const afterTimer = await read(page); assert.equal(afterTimer.studySessions[0].minutes, 15); assert.deepEqual(afterTimer.completed, data.completed, 'elapsed brain timer never proves a source range');
    const { studySessions: _sessions, focus: _focus, ...afterWithoutTimer } = withoutBrain(afterTimer);
    const { studySessions: _oldSessions, focus: _oldFocus, ...originalWithoutTimer } = original;
    assert.deepEqual(afterWithoutTimer, originalWithoutTimer);
    await page.getByRole('button', { name: 'Forget brain memory', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Forget brain memory only', exact: true }).click();
    await page.waitForFunction(key => !JSON.parse(localStorage.getItem(key)!).studyBrain, STORAGE_KEY);
    const forgotten = await read(page); assert.deepEqual(withoutBrain(forgotten), withoutBrain(afterTimer));
    await check(page, 'forget brain only');
    assert.deepEqual(externalRequests, [], 'no external request in local-brain flow'); assert.deepEqual(errors, []);
    results.push({ scenario: '390 English: home entry → opt-in → offline Banglish draft/confirm → feedback → reload → pause/resume → timer logs not completion → scoped forget', status: 'passed' });
  } finally { await context.close(); }
}
async function matrix() {
  for (const viewport of [
    { width: 320, language: 'bn' as const, theme: 'light' as const, fontScale: 'lg' as const },
    { width: 390, language: 'en' as const, theme: 'dark' as const, fontScale: 'lg' as const },
    { width: 1280, language: 'en' as const, theme: 'light' as const, fontScale: 'md' as const },
  ]) for (const state of ['off', 'ready', 'rest', 'duration', 'review', 'paused', 'legacy', 'setup']) {
    let data = state === 'legacy' || state === 'setup' ? freshData() : personalDataFixture();
    if (state !== 'off') data.studyBrain = newStudyBrain();
    if (state === 'paused') data.studyBrain!.enabled = false;
    if (state === 'rest') data = saveBrainCheckIn(data, { energy: 'low', availableMinutes: 0, obstacle: 'starting' }, '2026-11-20', now.toISOString());
    if (state === 'duration') data.personalRoutine!.workloads[PERSONAL_IDS[0]] = defaultChapterWorkload(PERSONAL_IDS[0]);
    if (state === 'setup') data.routineSetupRequired = true;
    data.settings = { ...data.settings, language: viewport.language, theme: viewport.theme, fontScale: viewport.fontScale };
    const context = await browser.newContext({ viewport: { width: viewport.width, height: 900 }, isMobile: viewport.width < 700, hasTouch: viewport.width < 700, timezoneId: 'America/New_York', reducedMotion: 'reduce' });
    const page = await context.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const name = `${viewport.width}-${viewport.language}-${viewport.theme}-${state}`;
    try {
      await page.clock.setFixedTime(state === 'review' ? new Date('2026-11-20T17:05:00Z') : now);
      await seed(page, data); await open(page); const before = await read(page);
      await check(page, name);
      if (['off', 'paused'].includes(state)) assert.equal(await page.locator('.brain-check-in').count(), 0);
      else {
        const heading = await page.locator('.brain-recommendation h2').innerText();
        const expected = state === 'ready' ? /এখন ছোট|manageable next step/ : state === 'rest' ? /আজ বিরতি|break today/ : state === 'duration' ? /আসল সময়|real work durations/ : state === 'review' ? /আগের অংশ|earlier segment/ : state === 'legacy' ? /পুরোনো রুটিন|existing routine/ : /পড়ার সময়|when you can study/;
        assert.match(heading, expected);
        if (state !== 'ready') assert.equal(await page.locator('.brain-recommendation .button.primary').count(), 0, `${name}: no invalid timer`);
      }
      assert.deepEqual(await read(page), before, `${name}: viewing never writes memory, task ranges or completion timestamps`);
      if (['ready', 'off'].includes(state)) await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
      assert.deepEqual(errors, []); results.push({ scenario: name, status: 'passed' });
    } finally { await context.close(); }
  }
}
try { await flow(); await matrix(); }
catch (error) { failure = (error as Error).stack || String(error); console.error(failure); process.exitCode = 1; }
finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ base, complete: !failure, scope: 'one local interactive flow and 24 synthetic profile/language/theme/layout states; not exhaustive accessibility, catalogue, native-device or installation acceptance', results, violations, incomplete, supplementalReviews, failure }, null, 2)); }
console.log(`Study Brain browser: ${results.length} passed cases, ${violations.length} automatic accessibility violations, ${incomplete.length} incomplete/manual-review results. ${failure ? 'FAILED' : 'PASSED'}`);
