// Optional production-browser smoke test. Run against `npm run preview`, not the dev server.
// Requires: npm install --no-save playwright-core
// Usage: CHROMIUM_PATH=/path/to/chrome BASE_URL=http://localhost:3000 node scripts/browser-smoke.mjs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('Install the optional runner first: npm install --no-save playwright-core'); process.exit(1); }

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const out = '.cache/browser-smoke';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Dhaka', acceptDownloads: true });
  await context.grantPermissions(['notifications'], { origin: BASE_URL });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('hsc27-prostuti-v1')));
  const nav = label => page.locator('nav[aria-label="মূল নেভিগেশন"] button').filter({ hasText: label }).click();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('.task-list .task-check').first().click();
  assert.equal(Object.keys((await stored()).completed).length, 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.task-list .task-check').first().getAttribute('aria-pressed'), 'true');
  await page.getByLabel('দিনের নোট', { exact: true }).fill('স্মোক টেস্ট নোট');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('দিনের নোট', { exact: true }).inputValue(), 'স্মোক টেস্ট নোট');
  await page.locator('.timer-start').click();
  await page.waitForFunction(() => document.querySelector('.timer-digits')?.textContent !== '২৫:০০', null, { timeout: 5000 });
  await page.locator('.timer-start').click();
  console.log('PASS progress, notes, reload persistence, focus timer');

  await page.keyboard.press('Control+k');
  await page.locator('.modal-search input').fill('ভেক্টর');
  await page.locator('.search-result').first().click();
  assert.match(await page.locator('.modal-header h2').innerText(), /ভেক্টর/);
  await page.getByLabel('বন্ধ করো', { exact: true }).click();
  await nav('সিলেবাস');
  await page.locator('.subject-tab').filter({ hasText: 'রসায়ন' }).click();
  await page.locator('.chapter-row').filter({ hasText: 'জৈব রসায়ন' }).click();
  await page.locator('.confidence-section button').filter({ hasText: 'আত্মবিশ্বাসী' }).click();
  assert.ok(Object.values((await stored()).confidence).includes('confident'));
  await page.getByLabel('বন্ধ করো', { exact: true }).click();
  console.log('PASS search, chapter dialog, confidence');

  await nav('মডেল টেস্ট');
  await page.locator('.exam-card').first().locator('button').filter({ hasText: 'নম্বর যোগ করো' }).click();
  await page.locator('.score-input-row input').fill('72');
  await page.locator('.modal textarea').fill('সময় ব্যবস্থাপনায় ভুল');
  await page.locator('.modal button[type=submit]').click();
  assert.equal(Object.values((await stored()).exams)[0].score, 72);
  console.log('PASS model-test score');

  await nav('রিমাইন্ডার');
  await page.getByRole('switch').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).settings.reminderEnabled === true, null, { timeout: 5000 });
  await page.locator('.reminder-controls button').filter({ hasText: 'টেস্ট নোটিফিকেশন' }).click();
  const dlPromise = page.waitForEvent('download');
  await page.locator('.export-card').nth(1).locator('button').click();
  const dl = await dlPromise;
  const icsPath = `${out}/routine.ics`;
  await dl.saveAs(icsPath);
  const ics = readFileSync(icsPath, 'utf8');
  assert.ok(ics.includes('BEGIN:VALARM'));
  assert.ok(ics.includes('TZID=Asia/Dhaka'));
  console.log('PASS notification setting, test notification, ICS download', (ics.match(/BEGIN:VEVENT/g) || []).length, 'events');

  await nav('ক্যালেন্ডার');
  await page.locator('.calendar-cell').nth(10).click();
  assert.ok(await page.locator('.calendar-day-panel').isVisible());
  await page.locator('.sidebar-bottom .nav-item').click();
  await page.locator('.form-grid input').first().fill('স্মোক টেস্ট');
  await page.locator('.form-grid input[type=date]').fill('2026-11-15');
  await page.locator('.form-actions button[type=submit]').click();
  await page.locator('.modal button').filter({ hasText: 'রুটিন আপডেট করো' }).click();
  assert.equal((await stored()).settings.startDate, '2026-11-15');
  assert.equal(Object.keys((await stored()).completed).length, 2);
  const backupPromise = page.waitForEvent('download');
  await page.locator('.data-actions button').filter({ hasText: 'ব্যাকআপ রাখো' }).click();
  const backup = await backupPromise;
  const backupPath = `${out}/backup.json`;
  await backup.saveAs(backupPath);
  assert.equal(JSON.parse(readFileSync(backupPath, 'utf8')).version, 1);
  await page.locator('input[type=file]').setInputFiles(backupPath);
  await page.locator('.modal button').filter({ hasText: 'ব্যাকআপ ইমপোর্ট করো' }).click();
  assert.equal((await stored()).settings.name, 'স্মোক টেস্ট');
  console.log('PASS calendar, reschedule preserving progress, JSON backup/import');

  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.locator('.brand').waitFor({ timeout: 5000 });
  assert.ok((await stored()).completed);
  console.log('PASS offline reload');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `horizontal overflow at ${width}px`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS responsive widths and zero browser errors');
} finally {
  await browser.close();
}
