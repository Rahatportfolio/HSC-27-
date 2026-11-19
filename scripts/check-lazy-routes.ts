/** Production-only loading/offline/recovery proof. No user profile is touched. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { STORAGE_KEY } from '../src/planner';
import { personalDataFixture } from '../src/test/personalRoutineFixture';
import { parseBackup } from '../src/storage';
const base = process.env.BASE_URL || 'http://127.0.0.1:3000', output = process.env.LAZY_OUTPUT || '.cache/lazy-routes';
await mkdir(output, { recursive: true });
const routes = ['today', 'brain', 'calendar', 'syllabus', 'videos', 'studySystem', 'scanner', 'pdfs', 'testprep', 'practice', 'flashcards', 'revision', 'examsim', 'weakness', 'heatmap', 'backlog', 'exams', 'timer', 'analytics', 'library', 'reminders', 'audit', 'storage', 'settings'];
const titles: Record<string, string> = { today: 'Home dashboard', brain: 'Study Brain', calendar: 'My study plan', syllabus: 'Syllabus', videos: 'Video classes', studySystem: 'Study & offline', scanner: 'Note scanner', pdfs: 'PDF library', testprep: 'Test preparation', practice: 'Practice', flashcards: 'Flashcards', revision: 'Smart revision', examsim: 'Exam simulator', weakness: 'Weakness detector', heatmap: 'Syllabus heatmap', backlog: 'Backlog manager', exams: 'Exams & GPA', timer: 'Study timer', analytics: 'Progress & analytics', library: 'Library', reminders: 'Reminders', audit: 'App audit', storage: 'Storage', settings: 'Settings & backup' };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const checks: { name: string; detail?: unknown }[] = [], errors: string[] = [];
let failure = '';
const data = personalDataFixture(); data.notes['2026-11-15'] = 'Keep this exact private history through route loading and failure';
const fields = ['personalRoutine', 'notes', 'completed', 'studySessions', 'questions', 'scannedNotes', 'studyBrain'] as const;
async function setup(context: BrowserContext, blocked = false) {
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort('internetdisconnected'));
  await context.addInitScript(({ key, data }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => { if (!blocked || !/fetch.*dynamically imported module|loading chunk|importing a module/i.test(error.message)) errors.push(error.message); });
  await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
  return page;
}
async function stable(page: Page) {
  await page.locator('main > .view').waitFor(); await page.locator('main .route-loading').waitFor({ state: 'detached' });
  assert.equal(await page.locator('main > .view').count(), 1); assert.equal(await page.locator('main h1').count(), 1); assert.equal(await page.locator('main .route-error').count(), 0);
}
async function retained(page: Page) {
  const current = parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
  for (const field of fields) assert.deepEqual(current[field], data[field], `Loading changed ${field}`);
  return current;
}
try {
  // Disable SW only in this independent proof so its intentional background
  // precache cannot be mistaken for eager imports by the page itself.
  const critical = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const page = await setup(critical), scripts: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
  await page.goto(`${base}/#today`, { waitUntil: 'networkidle' }); await stable(page); await retained(page);
  assert(!scripts.some(url => /(?:quiz-data|numericGen|questionGen|jspdf|html2canvas|Practice-|ExamSim-|StudyBrain-|NotesScanner-)/.test(url)), 'Optional engines or routes were eagerly imported at home');
  checks.push({ name: 'home keeps heavy optional routes and engines out of initial module requests', detail: [...scripts] });
  await page.getByRole('button', { name: 'Talk to Study Brain', exact: true }).click(); await page.locator('.brain-view').waitFor(); await stable(page);
  assert(scripts.some(url => /StudyBrain-/.test(url)), 'An explicit Brain navigation did not load its optional route');
  assert(!scripts.some(url => /(?:quiz-data|numericGen|jspdf|html2canvas)/.test(url)), 'Brain unnecessarily loaded full question/PDF engines');
  await retained(page); checks.push({ name: 'explicit Brain navigation loads only its needed optional code without changing memory or routine' }); await critical.close();

  const offline = await browser.newContext({ acceptDownloads: true, viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  const cached = await setup(offline); await cached.goto(`${base}/#today`, { waitUntil: 'networkidle' }); await stable(cached);
  await cached.evaluate(async () => { await navigator.serviceWorker.ready; });
  await cached.waitForFunction(() => !!navigator.serviceWorker.controller);
  const precache = await cached.evaluate(async () => {
    const keys = (await caches.keys()).filter(key => key.startsWith('prostuti-hsc27-')); const urls: string[] = [];
    for (const key of keys) for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url).pathname);
    return urls;
  });
  assert(precache.some(url => /quiz-data-.*\.js$/.test(url))); assert(precache.some(url => /jspdf.*\.js$/.test(url))); assert(precache.some(url => /StudyBrain-.*\.js$/.test(url)));
  checks.push({ name: 'first install precaches unvisited route, question and PDF assets', detail: { cachedFiles: precache.length } });
  await offline.setOffline(true);
  for (const route of routes) {
    await cached.evaluate(route => { window.location.hash = `#${route}`; }, route);
    await cached.waitForFunction(title => document.querySelector('.breadcrumb strong')?.textContent?.trim() === title, titles[route]);
    await stable(cached); await retained(cached);
    checks.push({ name: `first-use offline #${route}`, detail: { heading: await cached.locator('main h1').innerText() } });
  }
  await cached.reload({ waitUntil: 'domcontentloaded' }); await stable(cached); await retained(cached);
  checks.push({ name: 'offline cold reload retains routine/history and loads the last optional route' }); await offline.close();

  const broken = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 393, height: 852 } });
  const failedPage = await setup(broken, true);
  await failedPage.route('**/assets/StudyBrain-*.js', route => route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* Deliberately unavailable optional asset */' }));
  await failedPage.goto(`${base}/#today`, { waitUntil: 'networkidle' }); await stable(failedPage);
  await failedPage.getByRole('button', { name: 'Talk to Study Brain', exact: true }).click();
  const alert = failedPage.locator('main .route-error'); await alert.waitFor(); assert.equal(await alert.locator('h1').innerText(), 'This page could not load'); await retained(failedPage);
  const downloaded = failedPage.waitForEvent('download'); await alert.getByRole('button', { name: 'Keep a JSON backup', exact: true }).click();
  const download = await downloaded; await download.saveAs(`${output}/recovery-backup.json`);
  const restored = parseBackup(await readFile(`${output}/recovery-backup.json`, 'utf8'));
  for (const field of fields) assert.deepEqual(restored[field], data[field], `Recovery backup changed ${field}`);
  assert((await alert.innerText()).includes('not original scan/video bytes'));
  await alert.getByRole('button', { name: 'Back to home', exact: true }).click(); await stable(failedPage); await retained(failedPage);
  checks.push({ name: 'missing optional asset shows recovery UI; independent JSON backup and home both work without erasing data' });
  await broken.close(); assert.deepEqual(errors, []);
} catch (error) { failure = String(error); throw error; }
finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ base, checks, errors, complete: !failure, failure, scope: 'Chromium production-module loading, first-install offline routes and controlled chunk-failure recovery; not physical Android or external-player certification' }, null, 2)); }
console.log(`PASS ${checks.length} lazy-route/offline/recovery checks.`);
