/** Built-app keyboard, nested-sheet, responsive-drawer and first-use offline PDF
 * regressions. Disposable synthetic profiles only; not native-device acceptance.
 * Run after build, against a production preview (CHROMIUM_PATH, BASE_URL).
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { STORAGE_KEY } from '../src/planner';
import { PERSONAL_IDS, personalDataFixture } from '../src/test/personalRoutineFixture';

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const output = process.env.DIALOG_BROWSER_OUTPUT || '.cache/dialog-offline/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const checks: string[] = [], errors: string[] = [];
let failure = '';
const pass = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
async function inScope(page: Page, selector: string, label: string) {
  assert.equal(await page.evaluate(selector => {
    const active = document.activeElement as HTMLElement | null, root = document.querySelector(selector);
    if (!active || !root?.contains(active)) return false;
    const style = getComputedStyle(active), rect = active.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && !active.closest('[inert],[hidden]');
  }, selector), true, label);
}
async function keyboard() {
  for (const width of [320, 390, 800]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Dhaka', reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    try {
      const data = personalDataFixture(); data.settings.theme = width === 390 ? 'dark' : 'light';
      await page.clock.setFixedTime(new Date('2026-11-20T12:05:00Z'));
      await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data });
      await page.goto(`${base}/#today`, { waitUntil: 'networkidle' }); await page.locator('.personal-home').waitFor();
      const initial = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
      const nav = page.locator('#app-navigation');
      assert.equal(await nav.getAttribute('inert'), ''); assert.equal(await nav.getAttribute('aria-hidden'), 'true');
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.sidebar')), false, `${width}: closed sidebar is not a Tab stop`);
      }
      const opener = page.getByRole('button', { name: 'More pages', exact: true }); await opener.focus(); await opener.click();
      await page.getByRole('dialog', { name: 'All pages', exact: true }).waitFor();
      assert.equal(await page.locator('.main-shell').getAttribute('inert'), '');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      for (let index = 0; index < 42; index++) { await page.keyboard.press('Tab'); await inScope(page, '#app-navigation', `${width}: Tab remains on a visible drawer control`); }
      for (let index = 0; index < 42; index++) { await page.keyboard.press('Shift+Tab'); await inScope(page, '#app-navigation', `${width}: reverse Tab remains in drawer`); }
      // Even a script-dispatched background click cannot navigate/mutate while a
      // modal owns focus. Native inert alone does not cover that fallback case.
      await page.locator('.topbar-avatar').evaluate((element: HTMLElement) => element.click());
      assert.equal(new URL(page.url()).hash, '#today');
      await page.locator('.topbar-avatar').evaluate((element: HTMLElement) => element.focus()); await inScope(page, '#app-navigation', `${width}: background focus blocked`);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await nav.getAttribute('inert'), ''); assert.equal(await nav.getAttribute('aria-modal'), null);
      assert.equal(await opener.evaluate(element => element === document.activeElement), true); assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      pass(`${width}px: hidden drawer excluded; visible-control Tab/Shift+Tab, background pointer/focus, Escape, opener and scroll restoration`);

      await opener.click(); await page.locator('.sidebar-close').focus();
      await page.keyboard.press('Control+k'); await page.locator('.modal').waitFor();
      assert.equal(await page.locator('[role="dialog"]').count(), 2); assert.equal(await nav.getAttribute('aria-modal'), 'false'); assert.equal(await nav.evaluate(element => !!element.closest('[inert]')), true);
      await inScope(page, '.modal', `${width}: nested search has sole focus ownership`);
      for (let index = 0; index < 8; index++) { await page.keyboard.press('Tab'); await inScope(page, '.modal', `${width}: Tab cannot reach lower drawer`); }
      await page.keyboard.press('Escape'); await page.locator('.modal').waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('dialog', { name: 'All pages', exact: true }).count(), 1); assert.equal(await nav.getAttribute('aria-modal'), 'true');
      assert.equal(await page.locator('.sidebar-close').evaluate(element => element === document.activeElement), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
      pass(`${width}px: actual search-over-menu stack closes only the upper sheet, restores lower focus and keeps scroll locked until both close`);

      await opener.click(); await page.mouse.click(width - 8, 450); assert.equal(await page.getByRole('dialog').count(), 0);
      await opener.click(); await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForFunction(() => !document.querySelector('#app-navigation')?.hasAttribute('role'));
      assert.equal(await nav.getAttribute('inert'), null); assert.equal(await nav.getAttribute('aria-hidden'), null); assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      await page.locator('.sidebar .nav-item').first().focus(); await inScope(page, '.sidebar', `${width}: desktop sidebar becomes usable after resize`);
      await page.setViewportSize({ width, height: 900 }); await page.waitForFunction(() => document.querySelector('#app-navigation')?.hasAttribute('inert'));
      // Navigating with the drawer closes it normally, not just through Escape.
      await opener.click(); await page.locator('.sidebar').getByRole('button', { name: 'Progress & analytics', exact: true }).click();
      await page.locator('.analytics-view').waitFor(); assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.getByText('Current S phase', { exact: true }).count(), 1);
      const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
      assert.deepEqual(after.completed, initial.completed); assert.deepEqual(after.notes, initial.notes); assert.deepEqual(after.personalRoutine, initial.personalRoutine);
      await page.screenshot({ path: `${output}/analytics-${width}.png`, fullPage: true });
      pass(`${width}px: backdrop, desktop resize/return and menu navigation release isolation without changing personal progress/history`);
    } finally { await context.close(); }
  }
}
async function offlinePdf() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage(), requested: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requested.push(request.url()));
  try {
    const data = personalDataFixture(); data.notes[data.settings.startDate] = 'Synthetic private note — retain during offline export';
    await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data });
    await page.goto(`${base}/#scanner`, { waitUntil: 'networkidle' }); await page.locator('.scanner-view').waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(requested.some(url => /\/jspdf\.[^/]+\.js/.test(url)), false, 'PDF module must not load at startup or on scanner navigation');
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys(), entries: string[] = [];
      for (const key of keys.filter(key => key.startsWith('prostuti-hsc27-'))) entries.push(...(await (await caches.open(key)).keys()).map(request => request.url));
      return entries;
    });
    assert.ok(cached.some(url => /\/jspdf\.[^/]+\.js/.test(url)), 'Unused lazy PDF module must already be precached for first-use offline export');
    const source = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 100;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 180, 100); ctx.fillStyle = '#183b2a'; ctx.font = '18px sans-serif'; ctx.fillText('Offline notes', 12, 35); ctx.fillText('F = ma', 12, 65);
      return canvas.toDataURL('image/png');
    });
    const file = { name: 'offline-note.png', mimeType: 'image/png', buffer: Buffer.from(source.split(',')[1], 'base64') };
    await context.setOffline(true); await page.reload({ waitUntil: 'networkidle' }); await page.locator('.scanner-view').waitFor();
    await page.getByLabel('Choose note images from files', { exact: true }).setInputFiles([file, { ...file, name: 'second.png' }]);
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.scanner-preview-img')?.complete && !document.querySelector('.scanner-tools [role="status"]'));
    await page.getByLabel('Title', { exact: true }).fill('First-use offline notes');
    await page.getByRole('button', { name: 'Save as note', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).scannedNotes.length === 1, STORAGE_KEY);
    await page.getByRole('button', { name: 'Saved notes', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
    const path = `${output}/first-use-offline.pdf`; await download.saveAs(path);
    const bytes = await readFile(path); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.match(bytes.toString('latin1'), /\/Count\s+2\b/);
    assert.ok(requested.some(url => /\/jspdf\.[^/]+\.js/.test(url)), 'PDF module should be requested only during actual export');
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    assert.deepEqual(after.personalRoutine.chapterIds, PERSONAL_IDS); assert.deepEqual(after.notes, data.notes); assert.deepEqual(after.completed, data.completed);
    pass('Lazy PDF code is absent from startup requests, present in the service-worker precache, and exports a real two-page PDF on first use after an offline reload');
  } finally { await context.close(); }
}
try { await keyboard(); await offlinePdf(); assert.deepEqual(errors, []); }
catch (error) { failure = (error as Error).stack || String(error); console.error(failure); process.exitCode = 1; }
finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ base, complete: !failure, checks, pageErrors: errors, failure, scope: 'Built Chromium; 320/390/800px drawer, keyboard, real nested search, background isolation, desktop resize and first-use offline PDF only. Not physical Android or screen-reader acceptance.' }, null, 2)); }
