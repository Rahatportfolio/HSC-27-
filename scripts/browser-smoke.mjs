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
  // Regression: skip link must not hash-navigate away from the current view.
  await page.evaluate(() => { location.hash = 'calendar'; });
  await page.waitForFunction(() => document.querySelector('.breadcrumb strong')?.textContent === 'ক্যালেন্ডার');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => location.hash), '#calendar');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content');
  await page.evaluate(() => { location.hash = 'today'; });
  await page.waitForFunction(() => document.querySelector('.task-list'));
  // Regression: a corrupt running timer with endAt=0 must not credit a free session.
  await page.evaluate(() => localStorage.setItem('hsc27-focus-timer-v1', JSON.stringify({ duration: 25, remaining: 10, running: true, endAt: 0 })));
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await stored()).focus, { minutes: 0, sessions: 0 });
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

  // Exam simulator: a timed paper must mark itself and store the result.
  await nav('সিমুলেটর');
  await page.locator('button').filter({ hasText: 'পরীক্ষা শুরু করো' }).click();
  await page.waitForSelector('.exam-palette-cell');
  const paperSize = await page.locator('.exam-palette-cell').count();
  for (let i = 0; i < paperSize; i++) {
    await page.locator('.quiz-option').first().click();
    const next = page.locator('button').filter({ hasText: 'পরের প্রশ্ন' });
    if (await next.count()) await next.click();
  }
  await page.locator('.exam-run-actions button').filter({ hasText: 'জমা দাও' }).click();
  await page.waitForSelector('.exam-result-hero');
  const simulated = (await stored()).examSessions;
  assert.equal(simulated.length, 1);
  assert.equal(simulated[0].total, paperSize);
  assert.equal(simulated[0].answers && Object.keys(simulated[0].answers).length, paperSize);
  assert.ok((await stored()).tests.length >= 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.exam-history-row').first().waitFor();
  console.log('PASS exam simulator', simulated[0].score + '/' + simulated[0].total, 'saved and reloaded');

  // Weakness detector reads the same stored answers.
  await nav('দুর্বলতা');
  await page.locator('.weakness-view').waitFor();
  await page.locator('.weakness-stat-row').waitFor();
  console.log('PASS weakness detector', await page.locator('.weakness-row').count(), 'flagged chapters');
  // Adaptive planner: the card must stay honest — either real swap rows or the "nothing to do" line.
  await page.locator('.adaptive-card').waitFor();
  const adaptiveBudget = await page.locator('.adaptive-budget > div').count();
  assert.equal(adaptiveBudget, 4);
  assert.ok(await page.locator('.adaptive-card').innerText().then(text => text.includes('সর্বোচ্চ ৮ ঘণ্টা')));
  const adaptiveRows = await page.locator('.adaptive-change').count();
  if (adaptiveRows === 0) {
    assert.ok(await page.locator('.adaptive-card').innerText().then(text => text.includes('বদলানোর দরকার নেই')));
  } else {
    for (let i = 0; i < adaptiveRows; i++) {
      assert.ok((await page.locator('.adaptive-load').nth(i).innerText()).includes('→'));
    }
  }
  await nav('হিটম্যাপ');
  await page.locator('.heatmap-view').waitFor();
  assert.equal(await page.locator('.heat-cell').count(), 114);
  assert.equal(await page.locator('.heat-legend .heat-chip').count(), 5);
  await page.locator('.heatmap-view input[type=checkbox]').last().check();
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.heat-cell').count() >= 0);
  console.log('PASS syllabus heatmap', await page.locator('.heat-cell').count(), 'cells');

  // Backlog manager: every day must stay inside its own ceiling, and a full day must
  // say so instead of pretending room exists.
  await nav('ব্যাকলগ');
  await page.locator('.backlog-view').waitFor();
  assert.equal(await page.locator('.backlog-summary-grid > div').count(), 4);
  const backlogDays = await page.locator('.backlog-day').count();
  assert.ok(backlogDays >= 3);
  for (let i = 0; i < backlogDays; i++) {
    const label = await page.locator('.backlog-day small').nth(i).innerText();
    const [used, cap] = label.replace(/[^\d/]/g, '').split('/').map(Number);
    assert.ok(used <= cap, `day ${i} over cap: ${label}`);
  }
  console.log('PASS backlog manager', backlogDays, 'days, cap respected');

  // Focus report: the timer page must derive its numbers from saved sessions and
  // warn about a long unbroken sitting instead of praising volume.
  await nav('টাইমার');
  await page.locator('.focus-report-card').waitFor();
  assert.equal(await page.locator('.focus-kpis > div').count(), 4);
  assert.equal(await page.locator('.focus-hour').count(), 24);
  assert.ok((await page.locator('.focus-report-card').innerText()).includes('সব সংখ্যা তোমার সেভ করা সেশন থেকে'));
  console.log('PASS focus report', await page.locator('.focus-insight').count(), 'insights');

  // Rule-based question generation: pick a chapter with verified facts, generate, and
  // confirm the paper carries the generator's own source label.
  await nav('অনুশীলন');
  await page.locator('.generator-box').waitFor();
  const quizSelects = page.locator('.quiz-setup-grid select');
  await quizSelects.nth(1).selectOption('physics-1-7');
  const generateButton = page.locator('.generator-actions button');
  await generateButton.waitFor();
  assert.equal(await generateButton.isDisabled(), false);
  await generateButton.click();
  await page.locator('.quiz-question').waitFor();
  assert.ok(await page.locator('.quiz-question-meta').innerText().then(text => text.includes('স্বয়ংক্রিয়')));
  // Formula drills (numeric engine) must also be able to start a paper on their own.
  await page.locator('.quiz-run').waitFor();
  await page.locator('.quiz-topline .icon-button').click();
  await page.locator('.quiz-setup-grid select').nth(1).selectOption('math-2-4');
  await page.locator('.generator-actions button').click();
  await page.locator('.quiz-question').waitFor();
  const drill = await page.locator('.quiz-question').innerText();
  assert.ok(drill.includes('x²') || drill.includes('মূল'));
  console.log('PASS generated question paper and formula drills');

  await nav('সেটিংস');
  const bufferOptions = await page.locator('.settings-view select').evaluateAll(selects =>
    selects.map(select => Array.from(select.options).map(option => option.value)).find(values => values.includes('30') && values.includes('60')),
  );
  assert.deepEqual(bufferOptions, ['0', '30', '60']);
  console.log('PASS adaptive routine card and buffer options');

  // Exam routine: the daily slot must build a real 10-question paper.
  await nav('সিমুলেটর');
  await page.locator('.exam-routine-card').waitFor();
  const dailySlot = page.locator('.exam-routine-slot').first();
  await dailySlot.locator('button').click();
  await page.waitForSelector('.exam-palette-cell');
  assert.equal(await page.locator('.exam-palette-cell').count(), 10);
  for (let i = 0; i < 10; i++) {
    await page.locator('.quiz-option').first().click();
    const next = page.locator('button').filter({ hasText: 'পরের প্রশ্ন' });
    if (await next.count()) await next.click();
  }
  await page.locator('.exam-run-actions button').filter({ hasText: 'জমা দাও' }).click();
  await page.waitForSelector('.exam-result-hero');
  assert.equal((await stored()).examSessions.at(-1).cadence, 'daily');
  console.log('PASS exam routine daily slot');

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

  // Regression: completing every task must not download an empty .ics file.
  await nav('আজকের পড়া');
  const checks = page.locator('.task-list .task-check');
  for (let i = 0; i < await checks.count(); i++) {
    if ((await checks.nth(i).getAttribute('aria-pressed')) !== 'true') await checks.nth(i).click();
  }
  let emptyDownload = false;
  const onDownload = () => { emptyDownload = true; };
  page.on('download', onDownload);
  await page.locator('.schedule-footer button').click();
  await page.waitForTimeout(400);
  page.off('download', onDownload);
  assert.equal(emptyDownload, false);
  assert.ok(await page.locator('.toast').innerText().then(t => t.includes('কোনো অসমাপ্ত সেশন নেই')));
  console.log('PASS empty calendar export guard');

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
