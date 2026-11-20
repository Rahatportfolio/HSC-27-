/** Production-browser date regression. Run `npm run build && npm run preview` first.
 * CHROMIUM_PATH is an installed browser; BASE_URL can point at the running preview.
 * Uses isolated browser storage only, never an existing student profile.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { buildPlan, freshData, STORAGE_KEY } from '../src/planner';
import type { AppData } from '../src/planner';
import { parseBackup } from '../src/storage';
import { emptyAdvanced } from '../src/advanced';
import { CHAPTERS } from '../src/data';

if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium/Chrome executable.');
const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/?$/, '/');
const output = process.env.DATE_BROWSER_OUTPUT || '.cache/date-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results: { timezone: string; status: string; assertions: string[] }[] = [];
const shortcutFaults: Record<string, string> = {
  covered: '.routine-start-shortcut { position:relative; } .routine-start-shortcut::after { content:""; position:absolute; inset:0; z-index:9999; }',
  cramped: '.routine-start-shortcut .button { height:20px!important; min-height:20px!important; padding:0!important; }',
};
if (process.env.DATE_SHORTCUT_FAULT && !shortcutFaults[process.env.DATE_SHORTCUT_FAULT]) throw new Error('Unknown DATE_SHORTCUT_FAULT');
async function verifyStartShortcut(timezoneId: string) {
  const english = timezoneId !== 'Asia/Dhaka';
  const data = freshData(); data.settings.startDate = '2026-11-20'; data.settings.boostStartDate = '2026-12-07';
  data.settings = { ...data.settings, language: english ? 'en' : 'bn', fontScale: 'lg', adaptiveEnabled: false, name: 'Keep my profile', dailyHours: 6, startDate: '2026-11-14', boostStartDate: '2026-12-01' };
  data.notes['2026-11-15'] = 'Keep this real dated note';
  data.completed['physics-1-2:part-1'] = '2026-11-15T08:00:00Z';
  const context = await browser.newContext({ timezoneId, viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
    await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data });
    await page.goto(`${base}#settings`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const state = async () => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
    const original = await state();
    const shortcut = page.locator('.routine-start-shortcut button');
    await shortcut.scrollIntoViewIfNeeded();
    if (process.env.DATE_SHORTCUT_FAULT) await page.addStyleTag({ content: shortcutFaults[process.env.DATE_SHORTCUT_FAULT] });
    const box = await shortcut.evaluate(e => {
      const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { left: r.left, right: r.right, height: r.height, width: innerWidth, hit: hit === e || !!hit && e.contains(hit) };
    });
    assert.ok(box.height >= 44, 'Start-date shortcut touch target is too small');
    assert.ok(box.left >= 0 && box.right <= box.width && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Start-date shortcut overflows the phone');
    assert.ok(box.hit, 'Start-date shortcut is covered');
    await page.screenshot({ path: `${output}/start-shortcut-320-${english ? 'en' : 'bn'}.png` });
    await shortcut.tap();
    assert.equal(await page.getByLabel(english ? /^Routine start date/ : /^রুটিন শুরুর তারিখ/).inputValue(), '2026-11-20');
    assert.equal(await page.getByLabel(english ? /^Boost start date/ : /^বাড়তি পড়া শুরুর তারিখ/).inputValue(), '2026-12-07');
    assert.equal((await state()).settings.startDate, '2026-11-14');
    const save = page.locator('.settings-form button[type="submit"]');
    await save.tap();
    await page.getByRole('dialog').getByRole('button', { name: english ? 'Cancel' : 'বাতিল', exact: true }).tap();
    assert.equal((await state()).settings.startDate, '2026-11-14');
    await save.tap();
    await page.getByRole('dialog').getByRole('button', { name: english ? 'Update routine' : 'রুটিন আপডেট করো', exact: true }).tap();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).settings.startDate === '2026-11-20', STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    const saved = await state();
    assert.deepEqual([saved.settings.startDate, saved.settings.boostStartDate, saved.settings.testExamDate, saved.settings.examDate, saved.settings.dailyHours, saved.settings.name, saved.settings.calendarRevision], ['2026-11-20', '2026-12-07', '2027-02-07', '2027-06-12', 6, 'Keep my profile', 1]);
    assert.deepEqual(saved.notes, original.notes); assert.deepEqual(saved.completed, original.completed);
    assert.equal(await page.locator('.routine-start-shortcut').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS 320px real-touch 20 November shortcut (${timezoneId}, ${english ? 'en' : 'bn'}, large text, cancel/save/reload/history)`);
  } finally { await context.close(); }
}
try {
  for (const timezoneId of ['Asia/Dhaka', 'America/New_York']) {
    await verifyStartShortcut(timezoneId);
    if (process.env.DATE_SHORTCUT_ONLY) {
      results.push({ timezone: timezoneId, status: 'passed', assertions: ['320px touch start shortcut', '20 November saved after confirmation only', 'cancel preserves old date', 'large text fits', 'history/workload retained', 'reload without double shift'] });
      continue;
    }
    const context = await browser.newContext({ timezoneId, viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
    await page.goto(`${base}#settings`, { waitUntil: 'networkidle' });
    // A completely new user starts on the 20th; no private fixture is needed for this assertion.
    assert.equal(await page.getByLabel(/^রুটিন শুরুর তারিখ/).inputValue(), '2026-11-20');
    const data = freshData(); data.settings.startDate = '2026-11-20'; data.settings.boostStartDate = '2026-12-07';
    data.settings.language = 'en';
    data.settings.adaptiveEnabled = false;
    const originalId = 'custom-2026-11-22-one';
    const oldPart = `smart-part|${encodeURIComponent(originalId)}|0|30`;
    const at = '2026-11-15T14:00:00Z';
    data.routineBlocks = [{ id: 'one', date: '2026-11-22', weekday: 0, title: 'Browser personal task', subject: 'physics', startMinute: 1200, minutes: 60, createdAt: at }];
    data.dayOverrides['2026-11-22'] = { taskMinutes: { [originalId]: 60 } };
    data.completed = { [buildPlan()[2].tasks[0].id]: at, [oldPart]: at };
    data.notes['2026-11-21'] = 'Real dated journal';
    data.studySessions = [{ id: 'real-study', date: '2026-11-15', at, minutes: 30, subject: 'physics', mode: 'stopwatch' }];
    data.importantDates = [{ id: 'appointment', date: '2026-11-23', title: 'Real appointment', note: '', notify: false, createdAt: at }];
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data });
    await page.reload({ waitUntil: 'networkidle' });
    const state = async (): Promise<AppData> => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
    const original = await state(); // Compare validated snapshots, including optional undefined fields.
    const start = page.getByLabel(/^Routine start date/);
    await start.fill('2026-11-26');
    await page.getByLabel(/^First session time/).fill('05:30');
    assert.equal(await page.getByLabel(/^Boost start date/).inputValue(), '2026-12-13');
    assert.equal(await page.getByLabel(/^Test exam target date/).inputValue(), '2027-02-07');
    assert.equal(await page.getByLabel(/^HSC '27 exam target date/).inputValue(), '2027-06-12');
    const preview = page.getByRole('region', { name: 'Date change preview' });
    assert.match(await preview.innerText(), /11 June 2027/);
    assert.match(await preview.innerText(), /not an official exam routine/);
    assert.equal((await state()).settings.startDate, '2026-11-20');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Update routine dates and times?' });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await state()).settings.calendarRevision, 0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Update routine dates and times?' });
    await dialog.getByRole('button', { name: 'Update routine', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).settings.calendarRevision === 1, STORAGE_KEY);
    const shifted = await state();
    assert.deepEqual([shifted.settings.startDate, shifted.settings.startTime, shifted.settings.boostStartDate, shifted.settings.testExamDate, shifted.settings.examDate], ['2026-11-26', '05:30', '2026-12-13', '2027-02-07', '2027-06-12']);
    assert.equal(shifted.routineBlocks[0].date, '2026-11-28');
    assert.equal(shifted.routineBlocks[0].startMinute, 1200); // Explicit clock time keeps priority.
    assert.equal(shifted.completed['smart-part|custom-2026-11-28-one|0|30'], at);
    assert.equal(shifted.completed[oldPart], undefined);
    assert.equal(Object.keys(shifted.completed).length, Object.keys(data.completed).length);
    assert.deepEqual(shifted.notes, original.notes);
    assert.deepEqual(shifted.studySessions, original.studySessions);
    assert.deepEqual(shifted.importantDates, original.importantDates);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await state()).settings.calendarRevision, 1);
    assert.equal(await page.getByLabel(/^Boost start date/).inputValue(), '2026-12-13');
    const markdownDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .md', exact: true }).click();
    const mdPath = `${output}/plan-${timezoneId.replaceAll('/', '-')}.md`;
    await (await markdownDownload).saveAs(mdPath);
    const md = await readFile(mdPath, 'utf8');
    for (const date of ['2026-11-26', '2026-12-13', '2027-02-07', '2027-06-12']) assert.ok(md.includes(date), `Markdown omitted ${date}`);
    await page.goto(`${base}#today`, { waitUntil: 'networkidle' });
    assert.match(await page.getByRole('region', { name: 'Plan has not started' }).innerText(), /26 November 2026/);
    assert.equal(await page.getByRole('heading', { name: 'Today’s smart target' }).count(), 0);
    assert.equal(await page.getByLabel('Pick study date', { exact: true }).inputValue(), '2026-11-26');
    const timeline = page.getByRole('region', { name: 'Selected day timeline' });
    assert.equal(await timeline.locator('.task-time strong').first().innerText(), '5:30');
    const calendarDownload = page.waitForEvent('download');
    await timeline.getByRole('button', { name: 'Export .ics', exact: true }).click();
    const icsPath = `${output}/calendar-${timezoneId.replaceAll('/', '-')}.ics`;
    await (await calendarDownload).saveAs(icsPath);
    const ics = await readFile(icsPath, 'utf8');
    assert.ok(ics.includes('DTSTART;TZID=Asia/Dhaka:20261126T053000'));
    assert.ok(ics.includes('SEQUENCE:1\r\n'));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (timezoneId === 'Asia/Dhaka') await page.screenshot({ path: `${output}/shifted-timeline-mobile.png`, fullPage: true });
    await page.goto(`${base}#settings`, { waitUntil: 'networkidle' });
    await page.getByLabel(/^Exam target date policy/).selectOption('fixed');
    await page.getByLabel(/^Routine start date/).fill('2026-12-20');
    assert.equal(await page.getByLabel(/^Test exam target date/).inputValue(), '2027-02-07');
    assert.equal(await page.getByLabel(/^HSC '27 exam target date/).inputValue(), '2027-06-12');
    assert.match(await page.getByRole('region', { name: 'Date change preview' }).innerText(), /not full coverage/);
    assert.equal((await state()).settings.startDate, '2026-11-26');
    if (timezoneId === 'Asia/Dhaka') await page.screenshot({ path: `${output}/fixed-target-warning-mobile.png`, fullPage: true });
    // Imported legacy references must neither blank the app nor duplicate a promoted
    // source's completed minutes. Exercise the final UI, not just a pure projection.
    const recovered = freshData(); recovered.settings.startDate = '2026-11-20'; recovered.settings.boostStartDate = '2026-12-07';
    recovered.settings = { ...recovered.settings, language: 'en', dailyHours: 4, boostEnabled: false, adaptiveEnabled: false };
    recovered.advanced = { ...emptyAdvanced(), classes: [{
      id: 'recheck', title: 'Completed lecture', url: 'https://example.org/a.mp4', chapterId: CHAPTERS[0].id,
      teacher: 'T', duration: 120, position: 120, watched: 120, speed: 1, permitted: true, note: '',
    }] };
    const originalPlan = buildPlan(recovered.settings);
    const source = originalPlan[0].tasks[0];
    const total = source.endMinute - source.startMinute;
    recovered.completed = {
      [source.id]: at,
      [`smart-part|${encodeURIComponent(source.id)}|0|${total / 2}`]: at,
      [`smart-part|${encodeURIComponent(source.id)}|${total / 2}|${total}`]: at,
      'smart-part|%|0|30': at,
      'smart-video|%|0|30000': at,
    };
    recovered.notes['2026-11-15'] = 'Legacy history retained';
    await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
    await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: recovered });
    await page.goto(`${base}#today`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    const restoredTimeline = page.getByRole('region', { name: 'Selected day timeline' });
    assert.equal(await restoredTimeline.locator('.task-card.done').count(), 1);
    assert.equal(await restoredTimeline.locator('.task-card').count(), originalPlan[0].tasks.length);
    assert.deepEqual((await state()).completed, recovered.completed);
    assert.deepEqual((await state()).notes, recovered.notes);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await restoredTimeline.locator('.task-card.done').count(), 1);
    assert.deepEqual(errors, [], `Browser errors in ${timezoneId}`);
    results.push({ timezone: timezoneId, status: 'passed', assertions: ['20 November defaults', 'linked date/time preview', 'cancel is non-destructive', 'atomic save', 'partial progress remapping', 'real history retained', 'reload without double shift', 'Markdown + Dhaka ICS exports', 'mobile timeline', 'fixed dates + capacity warning', 'legacy reference recovery without lost history', 'promoted split work counted once after reload'] });
    console.log(`PASS date cascade in ${timezoneId}`);
    await context.close();
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log('Production date-browser checks passed in both device timezones. Native alarms still require a real Android device check.');
