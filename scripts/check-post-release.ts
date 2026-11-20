/** Production-browser regressions for handwritten images, restores and measured time.
 * Run build + production preview first; set CHROMIUM_PATH and optionally BASE_URL.
 * Only isolated, disposable browser profiles and synthetic note images are used.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { freshData, STORAGE_KEY } from '../src/planner';
import type { AppData } from '../src/planner';
import { inspectMediaBackup } from '../src/mediaBackup';

if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH');
const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/?$/, '/');
const output = process.env.POST_RELEASE_OUTPUT || '.cache/post-release/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const checks: string[] = [], errors: string[] = [];
const seed = freshData();
seed.settings.startDate = '2026-11-20'; seed.settings.boostStartDate = '2026-12-07';
seed.settings = { ...seed.settings, language: 'en', name: 'Browser audit profile', boostEnabled: false, adaptiveEnabled: false };
seed.notes['2026-11-19'] = 'A real dated journal must not move';
const state = async (page: Page): Promise<AppData> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const record = (label: string) => { checks.push(label); console.log(`PASS ${label}`); };
async function pageFor(name = seed.settings.name) {
  const context = await browser.newContext({ timezoneId: 'Asia/Dhaka', viewport: { width: 390, height: 844 }, acceptDownloads: true, reducedMotion: 'reduce' });
  await context.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: STORAGE_KEY, data: { ...seed, settings: { ...seed.settings, name } } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
  return page;
}
async function slider(page: Page, name: string, value: number) {
  // Range inputs do not support Playwright fill(). Dispatch the same native
  // input event while bypassing React's programmatic-value tracker.
  await page.getByLabel(name, { exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function imageSize(page: Page, width: number, height: number) {
  await page.waitForFunction(({ width, height }) => {
    const img = document.querySelector<HTMLImageElement>('.scanner-preview-img');
    return img?.complete && img.naturalWidth === width && img.naturalHeight === height && !document.querySelector('.scanner-tools [role="status"]');
  }, { width, height });
}
async function fits(page: Page, label: string) {
  await page.evaluate(async () => { await document.fonts.ready; document.documentElement.dataset.font = 'lg'; });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal overflow`);
  const outside = await page.locator('.scanner-tools button, .scanner-tools input, .scanner-tools select').evaluateAll(elements => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
  }).map(element => element.outerHTML.slice(0, 120)));
  assert.deepEqual(outside, [], `${label}: scanner control outside viewport`);
  assert.deepEqual(errors, [], `${label}: page errors`);
}
async function imageBytes(page: Page, keys: string[]): Promise<string[]> {
  return page.evaluate(async keys => {
    const request = indexedDB.open('prostuti-hsc27', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await Promise.all(keys.map(key => new Promise<string>((resolve, reject) => {
        const get = db.transaction('cache', 'readonly').objectStore('cache').get(key);
        get.onsuccess = () => resolve(get.result?.value); get.onerror = () => reject(get.error);
      })));
    } finally { db.close(); }
  }, keys);
}
async function exportPdf(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const download = await pending;
  const path = `${output}/${name}.pdf`; await download.saveAs(path);
  const bytes = await readFile(path);
  assert.ok(bytes.subarray(0, 5).toString() === '%PDF-');
  assert.match(bytes.toString('latin1'), /\/Count\s+2\b/, 'PDF does not contain two pages');
  assert.ok(bytes.length > 1000);
}

let source: Page | undefined, target: Page | undefined;
try {
  source = await pageFor();
  await source.goto(`${base}#scanner`, { waitUntil: 'networkidle' });
  const dataUrl = await source.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 160, 80);
    ctx.fillStyle = '#174d78'; ctx.fillRect(0, 0, 8, 80);
    ctx.fillStyle = '#c23f38'; ctx.fillRect(152, 0, 8, 80);
    ctx.fillStyle = '#111'; ctx.font = '15px sans-serif'; ctx.fillText('HSC audit fixture', 15, 30); ctx.fillText('F = ma', 15, 55);
    return canvas.toDataURL('image/png');
  });
  const file = { name: 'note.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
  await source.getByLabel('Choose note images from files').setInputFiles([file, { ...file, name: 'page-two.png' }]);
  await imageSize(source, 160, 80);
  await source.getByRole('button', { name: 'Rotate', exact: true }).click(); await imageSize(source, 80, 160);
  await slider(source, 'Brightness', 0);
  assert.equal(await source.getByLabel('Brightness', { exact: true }).inputValue(), '0');
  await slider(source, 'Contrast', 0);
  assert.equal(await source.getByLabel('Contrast', { exact: true }).inputValue(), '0');
  await source.getByRole('button', { name: 'Reset edits', exact: true }).click(); await imageSize(source, 160, 80);
  await source.getByRole('button', { name: 'Rotate', exact: true }).click(); await imageSize(source, 80, 160);
  await slider(source, 'Brightness', 125); await imageSize(source, 80, 160);
  // A repeated total edit must not rotate the already-rotated pixels a second time.
  await source.getByRole('button', { name: 'Crop', exact: true }).click();
  await source.getByLabel('Crop width', { exact: true }).fill('40');
  await source.getByLabel('Crop height', { exact: true }).fill('100'); await imageSize(source, 40, 100);
  await source.getByRole('button', { name: 'Perspective', exact: true }).click();
  await source.getByLabel('Top-left x', { exact: true }).fill('2'); await imageSize(source, 40, 100);
  for (const width of [320, 360, 390, 768]) { await source.setViewportSize({ width, height: 844 }); await fits(source, `populated scanner ${width}px`); }
  await source.setViewportSize({ width: 390, height: 844 });
  await source.getByRole('heading', { name: 'Scan notes', exact: true }).click();
  await source.evaluate(() => window.scrollTo(0, 0));
  await source.screenshot({ path: `${output}/scanner-controls-mobile.png`, fullPage: true });
  await source.getByLabel('Crop width', { exact: true }).fill('999');
  await source.getByRole('alert').waitFor();
  await source.getByLabel('Title', { exact: true }).fill('Browser physics notes');
  assert.equal(await source.getByRole('button', { name: 'Save as note', exact: true }).isDisabled(), true);
  await source.getByRole('button', { name: 'Reset edits', exact: true }).click(); await imageSize(source, 160, 80);
  await source.getByRole('button', { name: 'Rotate', exact: true }).click(); await imageSize(source, 80, 160);
  await slider(source, 'Brightness', 125); await imageSize(source, 80, 160);
  await source.getByRole('button', { name: 'Previous page', exact: true }).click(); await imageSize(source, 160, 80);
  assert.equal(await source.getByLabel('Brightness', { exact: true }).inputValue(), '100');
  await source.getByRole('button', { name: 'Next page', exact: true }).click();
  assert.equal(await source.getByLabel('Brightness', { exact: true }).inputValue(), '125');
  await source.getByRole('button', { name: 'Remove current page', exact: true }).click(); await imageSize(source, 160, 80);
  await source.getByRole('button', { name: 'Saved notes', exact: true }).click();
  await source.getByLabel('Choose note images from files').setInputFiles(file); await imageSize(source, 160, 80);
  await source.getByRole('button', { name: 'Save as note', exact: true }).click();
  await source.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).scannedNotes.length === 1, STORAGE_KEY);
  let saved = await state(source);
  assert.equal(saved.scannedNotes[0].pageCount, 2);
  assert.ok(saved.scannedNotes[0].sizeBytes > 0);
  const originalPages = await imageBytes(source, saved.scannedNotes[0].pageKeys);
  assert.ok(originalPages.every(url => url?.startsWith('data:image/jpeg;base64,')));
  await source.reload({ waitUntil: 'networkidle' });
  await source.getByRole('button', { name: 'Saved notes', exact: true }).click();
  await source.getByText('Browser physics notes', { exact: true }).waitFor();
  await exportPdf(source, 'source-notes');
  record('real image upload, non-compounding edits, zero sliders, crop/perspective validation, per-page navigation, removal, save/reload and two-page PDF');
  record('populated scanner controls fit 320/360/390/768px with large text');

  await source.goto(`${base}#today`, { waitUntil: 'networkidle' });
  const tick = source.getByRole('region', { name: 'Selected day timeline' }).locator('.task-check').first();
  await tick.click();
  await source.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key)!).completed).length > 0, STORAGE_KEY);
  await source.reload({ waitUntil: 'networkidle' });
  assert.equal(await tick.getAttribute('aria-pressed'), 'true');
  await tick.click();
  await source.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key)!).completed).length === 0, STORAGE_KEY);
  await source.reload({ waitUntil: 'networkidle' });
  assert.equal(await tick.getAttribute('aria-pressed'), 'false');
  await source.locator('.preset-launch-btn').first().click();
  await source.locator('.live-timer-topbar.running').waitFor();
  await source.clock.setFixedTime(new Date('2026-11-20T06:02:00Z'));
  await source.waitForFunction(() => document.querySelector('.live-clock-chip.elapsed strong')?.textContent === '02:00');
  await source.getByRole('button', { name: 'Finish & save', exact: true }).click();
  await source.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).studySessions.length === 1, STORAGE_KEY);
  saved = await state(source);
  assert.equal(saved.studySessions[0].minutes, 2);
  assert.deepEqual(saved.completed, {});
  record('complete → reload → undo → reload remains undone; early preset finish saves two measured minutes without completing the task');

  await source.goto(`${base}#settings`, { waitUntil: 'networkidle' });
  await source.getByLabel(/^Routine start date/).fill('2026-11-26');
  await source.getByLabel(/^First session time/).fill('05:30');
  await source.getByRole('button', { name: 'Save', exact: true }).click();
  await source.getByRole('dialog').getByRole('button', { name: 'Update routine', exact: true }).click();
  await source.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).settings.startDate === '2026-11-26', STORAGE_KEY);
  const expected = await state(source);
  assert.equal(expected.settings.testExamDate, '2027-02-07');
  assert.equal(expected.settings.examDate, '2027-06-12');
  assert.equal(expected.studySessions[0].date, '2026-11-20');
  assert.deepEqual(expected.notes, seed.notes);
  const backupDownload = source.waitForEvent('download');
  await source.getByRole('button', { name: 'Export full backup', exact: true }).click();
  const fullPath = `${output}/scanned-notes.prostuti`; await (await backupDownload).saveAs(fullPath);
  const inspected = await inspectMediaBackup(new Blob([await readFile(fullPath)]));
  assert.equal(inspected.scans?.length, 2);
  assert.deepEqual(inspected.scans?.map(scan => scan.dataUrl), originalPages);
  assert.deepEqual(inspected.warnings, []);

  target = await pageFor('Fresh device profile');
  await target.goto(`${base}#today`, { waitUntil: 'networkidle' });
  await target.locator('.preset-launch-btn').first().click();
  await target.locator('.live-timer-topbar.running').waitFor();
  await target.goto(`${base}#settings`, { waitUntil: 'networkidle' });
  await target.getByLabel(/^Your name/).fill('Unsaved old profile');
  await target.evaluate(() => localStorage.setItem('hsc27-exam-clock-v1', 'old-exam-clock'));
  await target.getByLabel('Full backup file', { exact: true }).setInputFiles(fullPath);
  await target.getByRole('dialog', { name: 'Restore full backup?', exact: true }).getByRole('button', { name: 'Confirm', exact: true }).click();
  await target.waitForFunction(({ key, name }) => JSON.parse(localStorage.getItem(key)!).settings.name === name, { key: STORAGE_KEY, name: expected.settings.name });
  assert.equal(await target.getByLabel(/^Your name/).inputValue(), expected.settings.name);
  const restored = await state(target);
  assert.deepEqual(restored.studySessions, expected.studySessions);
  assert.deepEqual(restored.notes, expected.notes);
  assert.deepEqual(restored.completed, expected.completed);
  const newKeys = restored.scannedNotes[0].pageKeys;
  assert.ok(newKeys.every(key => !expected.scannedNotes[0].pageKeys.includes(key)));
  assert.deepEqual(await imageBytes(target, newKeys), originalPages);
  assert.equal(await target.evaluate(() => localStorage.getItem('hsc27-exam-clock-v1')), null);
  assert.equal(await target.evaluate(() => JSON.parse(localStorage.getItem('hsc27-study-timer-v2')!).accumulatedMs), 0);
  assert.equal(await target.locator('.live-timer-topbar').count(), 0);
  await target.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(await target.getByRole('dialog').count(), 0);
  await target.goto(`${base}#today`, { waitUntil: 'networkidle' });
  assert.equal(await target.getByLabel('Pick study date', { exact: true }).inputValue(), '2026-11-26');
  await target.goto(`${base}#scanner`, { waitUntil: 'networkidle' });
  await target.getByRole('button', { name: 'Saved notes', exact: true }).click();
  await exportPdf(target, 'fresh-device-notes');
  record('v2 full backup carries exact image bytes into a fresh browser profile under new keys; dirty Settings and old clocks are replaced, history retained and PDF exports again');

  await target.goto(`${base}#today`, { waitUntil: 'networkidle' });
  await target.locator('.preset-launch-btn').first().click();
  await target.locator('.live-timer-topbar.running').waitFor();
  await target.clock.setFixedTime(new Date('2026-11-20T06:01:00Z'));
  await target.locator('.live-timer-actions').getByRole('button', { name: 'Pause', exact: true }).click();
  await target.goto(`${base}#settings`, { waitUntil: 'networkidle' });
  await target.evaluate(() => localStorage.setItem('hsc27-exam-clock-v1', 'json-old-clock'));
  const beforeFailed = await state(target);
  const incoming = { ...beforeFailed, settings: { ...beforeFailed.settings, name: 'JSON restored profile' } };
  const jsonFile = { name: 'metadata.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) };
  await target.getByLabel(/^Your name/).fill('Unsaved JSON form');
  await target.getByLabel('Backup file', { exact: true }).setInputFiles(jsonFile);
  await target.getByRole('dialog', { name: 'ব্যাকআপ ফিরিয়ে আনবে?', exact: true }).waitFor();
  await target.evaluate(key => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__auditOriginalSetItem', { value: original, configurable: true });
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('Simulated quota limit', 'QuotaExceededError'); original.call(this, name, value); };
  }, STORAGE_KEY);
  await target.getByRole('dialog').getByRole('button', { name: 'ব্যাকআপ ইমপোর্ট করো', exact: true }).click();
  await target.locator('.toast.error').waitFor();
  assert.deepEqual(await state(target), beforeFailed);
  assert.equal(await target.evaluate(() => localStorage.getItem('hsc27-exam-clock-v1')), 'json-old-clock');
  assert.ok(await target.evaluate(() => JSON.parse(localStorage.getItem('hsc27-study-timer-v2')!).accumulatedMs) > 0);
  await target.evaluate(() => { Storage.prototype.setItem = (window as unknown as { __auditOriginalSetItem: typeof Storage.prototype.setItem }).__auditOriginalSetItem; });
  await target.getByLabel('Backup file', { exact: true }).setInputFiles(jsonFile);
  await target.getByRole('dialog').getByRole('button', { name: 'ব্যাকআপ ইমপোর্ট করো', exact: true }).click();
  await target.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).settings.name === 'JSON restored profile', STORAGE_KEY);
  assert.equal(await target.getByLabel(/^Your name/).inputValue(), 'JSON restored profile');
  assert.equal(await target.evaluate(() => localStorage.getItem('hsc27-exam-clock-v1')), null);
  assert.equal(await target.evaluate(() => JSON.parse(localStorage.getItem('hsc27-study-timer-v2')!).accumulatedMs), 0);
  assert.deepEqual(await imageBytes(target, newKeys), originalPages);
  record('simulated JSON storage failure preserves the profile and old clocks; retry commits the restored draft and resets unrelated clocks');
  assert.deepEqual(errors, []);
} catch (error) {
  if (source) await source.screenshot({ path: `${output}/source-failure.png`, fullPage: true }).catch(() => {});
  if (target) await target.screenshot({ path: `${output}/target-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ checks, pageErrors: errors }, null, 2));
  await browser.close();
}
console.log('Production post-release browser checks passed. Physical-phone permissions/background delivery remain unverified.');
