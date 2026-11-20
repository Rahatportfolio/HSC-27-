/** Bounded Chromium acceptance for S-first phase planning. Isolated synthetic browser
 * profiles only. Saved-page references have an unverified observation date; fixture workloads
 * and player tests are synthetic and must never be described as a catalogue audit.
 * Run against `npm run build && npm run preview`; set CHROMIUM_PATH and BASE_URL.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import type { AxeResults } from 'axe-core';
import { reviewIncomplete } from './review-a11y-incomplete';
import type { A11yReview } from './review-a11y-incomplete';
import { buildStudyPlan } from '../src/studyPlan';
import { STORAGE_KEY } from '../src/planner';
import type { AppData } from '../src/planner';
import { parseBackup } from '../src/storage';
import { chapterById, subjectById } from '../src/data';
import { WORK_STAGES, isPersonalTaskComplete, personalCapacity, personalRoutineHealth, setPersonalStageCompletion, weeklyWindows } from '../src/personalRoutine';
import { PERSONAL_IDS, personalDataFixture } from '../src/test/personalRoutineFixture';
import { setTaskCompletion } from '../src/study';

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const output = process.env.PERSONAL_BROWSER_OUTPUT || '.cache/personal-routine/browser';
const require = createRequire(import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results: object[] = [];
const violations: object[] = [], incomplete: object[] = [], supplementalReviews: A11yReview[] = [];
let failure = '';
async function layout(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
  assert.equal(await page.locator('main h1').count(), 1, `${name}: one main heading`);
}
async function accessibility(page: Page, name: string) {
  if (!await page.evaluate(() => 'axe' in window)) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const result = await page.evaluate(async () => (window as unknown as { axe: { run: (document: Document, options: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, iframes: false, resultTypes: ['violations', 'incomplete'] }));
  violations.push(...result.violations.map(value => ({ name, ...value })));
  incomplete.push(...result.incomplete.map(value => ({ name, ...value })));
  if (process.env.REVIEW_INCOMPLETE === '1') {
    const review = await reviewIncomplete(page, name, result.incomplete); supplementalReviews.push(...review);
    const rows = review.filter(row => row.status !== 'verified');
    const detail = rows.map(row => {
      const d = row.detail as { measured?: number; unresolved?: string[]; measurements?: { text?: string; ratio?: number | null; unsupported?: string[]; clipped?: boolean; reliable?: boolean; opacity?: number }[] } | undefined;
      const bad = d?.measurements?.filter(m => !m.reliable || (m.ratio ?? 99) + .001 < 4.5).map(m => ({ text: (m.text || '').slice(0, 60), ratio: m.ratio != null ? Number(m.ratio.toFixed(2)) : null, unsupported: m.unsupported, clipped: m.clipped, reliable: m.reliable, opacity: m.opacity }));
      return { rule: row.rule, target: row.target, status: row.status, method: row.method, measured: d?.measured, unresolved: d?.unresolved, bad };
    });
    assert.equal(rows.length, 0, `${name}: supplemental text/label measurement failed or unresolved: ${JSON.stringify(detail)}`);
  }
  assert.equal(result.violations.length, 0, `${name}: ${result.violations.map(value => `${value.id}: ${value.nodes.map(node => node.target.join(' ')).join(',')}`).join('; ')}`);
}
const read = async (page: Page): Promise<AppData> => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
async function go(page: Page, route: string) {
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  // RouteLoading has an accessible h1 too; wait for actual feature content.
  await page.locator('main > .view').waitFor();
  assert.equal(await page.locator('main > .route-error').count(), 0, `Route #${route} failed to load`);
}
async function flow() {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Dhaka', reducedMotion: 'reduce' });
  try {
    const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
    await go(page, 'today');
    assert.equal(await page.locator('main h1').innerText(), 'অ্যাপ খুলে পড়া শুরু করো — ফর্ম পূরণ নয়');
    await page.getByRole('button', { name: /সব আমি নিজে সাজিয়ে নিতে চাই/ }).click();
    await page.getByRole('heading', { name: 'আগে বলো, কখন পড়তে পারবে?' }).waitFor();
    assert.equal(await page.locator('main h1').innerText(), 'আগে বলো, কখন পড়তে পারবে?');
    assert.equal(await page.locator('.task-card').count(), 0);
    assert.equal(await page.getByLabel('সময় 1 শুরু').inputValue(), '');
    await layout(page, 'empty Bengali first launch'); await accessibility(page, 'empty Bengali first launch');
    await page.screenshot({ path: `${output}/first-launch-320-bn.png`, fullPage: true });
    await page.locator('.lang-toggle-chip').click();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    assert.match(await page.locator('[role=alert]').innerText(), /Choose your study days/);
    await page.getByRole('button', { name: 'This time every day' }).click();
    await page.getByLabel('Window 1 start', { exact: true }).fill('09:00'); await page.getByLabel('Window 1 end', { exact: true }).fill('10:00');
    await page.getByRole('button', { name: 'Add another window', exact: true }).click();
    await page.getByRole('group', { name: 'Study window 2', exact: true }).getByRole('button', { name: 'This time every day', exact: true }).click();
    await page.getByLabel('Window 2 start', { exact: true }).fill('18:00'); await page.getByLabel('Window 2 end', { exact: true }).fill('22:00');
    await page.getByLabel('Daily total study hours (net)', { exact: false }).fill('4');
    await page.getByRole('radio', { name: 'Yes—do not schedule study in these intervals', exact: true }).check();
    await page.getByRole('button', { name: 'This obligation every day', exact: true }).click();
    await page.getByLabel('Obligation 1 start', { exact: true }).fill('19:00'); await page.getByLabel('Obligation 1 end', { exact: true }).fill('19:30');
    await layout(page, 'multiple availability windows and fixed obligations'); await accessibility(page, 'multiple availability windows and fixed obligations');
    await page.screenshot({ path: `${output}/availability-obligations-320-en.png`, fullPage: true });
    await page.getByLabel('Maximum continuous session (minutes)', { exact: false }).fill('120');
    await page.getByLabel('Break between sessions (minutes)', { exact: false }).fill('0');
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    for (const id of PERSONAL_IDS) await page.getByRole('checkbox', { name: new RegExp(`^${chapterById[id].title}`) }).check();
    await layout(page, 'S shortlist'); await accessibility(page, 'S shortlist');
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    const chapter = page.getByLabel('Chapter to configure', { exact: true });
    for (const id of PERSONAL_IDS) {
      await chapter.selectOption(id);
      const lecture = page.locator('.workload-stage').filter({ has: page.getByText('Chapter class', { exact: true }) });
      assert.match(await lecture.innerText(), /Observation date unverified/);
      assert.doesNotMatch(await lecture.innerText(), /Page checked/);
      await lecture.getByRole('button', { name: 'Use this reference duration', exact: true }).click();
      for (const stage of WORK_STAGES.filter(stage => stage.id !== 'class')) {
        const budget = ({ reading: 25, notes: 20, mcqPractice: 45, cqPractice: 60, revision: 20 } as Partial<Record<typeof stage.id, number>>)[stage.id] || 0;
        await page.getByLabel(`${stage.en} minutes`, { exact: true }).fill(String(budget));
      }
      await layout(page, `${id} actual separate duration editor`);
    }
    await accessibility(page, 'actual duration editor');
    await page.screenshot({ path: `${output}/actual-duration-320-en.png`, fullPage: true });
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    assert.match(await page.locator('.personal-preview').innerText(), /SAME pair continues on extra days/);
    await layout(page, 'effective preview'); await accessibility(page, 'effective preview');
    await page.getByRole('button', { name: 'Save this availability & S routine', exact: true }).click();
    await page.locator('.personal-home').waitFor();
    const data = await read(page); assert.equal(data.settings.startDate, '2026-11-20'); assert.equal(data.routineSetupRequired, false); assert.deepEqual(data.personalRoutine!.chapterIds, PERSONAL_IDS);
    assert.equal(data.personalRoutine!.workloads[PERSONAL_IDS[0]].class.minutes, 26734 / 60); assert.equal(data.personalRoutine!.workloads[PERSONAL_IDS[1]].class.minutes, 28915 / 60);
    assert.equal(data.personalRoutine!.workloads[PERSONAL_IDS[0]].class.source, 'reference-metadata');
    assert.match(await page.locator('.personal-home .backup-nudge').innerText(), /No backup recorded yet/);
    assert.equal(await page.locator('.personal-home .backup-nudge').getByRole('button', { name: 'Save backup', exact: true }).count(), 1);
    for (const id of PERSONAL_IDS) {
      assert.equal(data.personalRoutine!.workloads[id].class.observedAt, undefined);
      assert.ok(Number.isFinite(Date.parse(data.personalRoutine!.workloads[id].class.acceptedAt!)));
    }
    const plan = buildStudyPlan(data, data.settings.startDate), active = plan.filter(day => day.tasks.length);
    assert.ok(active.length > 2);
    assert.equal(data.personalRoutine!.dailyLimitMinutes, 240); assert.equal(data.personalRoutine!.exclusions!.length, 7);
    assert.ok(active.every(day => day.tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) <= personalCapacity(data, day.date)));
    assert.ok(active.every(day => day.tasks.every(task => PERSONAL_IDS.includes(task.chapterIds[0]) && weeklyWindows(data.personalRoutine!, day.date).some(window => task.startMinute >= window.startMinute && task.endMinute <= window.endMinute))));
    assert.equal(new Set(active[0].tasks.map(task => task.chapterIds[0])).size, 2);
    assert.ok(personalRoutineHealth(data, plan).issues.some(issue => issue.code === 'two-day-capacity'));
    await page.locator('.personal-tasks .task-check').first().click();
    await page.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key)!).completed).length > 0, STORAGE_KEY);
    assert.equal(await page.locator('.personal-goal .card-heading > strong').innerText(), '0/2');
    await page.getByLabel('Day note', { exact: true }).fill('Keep this dated note after reload');
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.getByLabel('Day note', { exact: true }).inputValue(), 'Keep this dated note after reload');
    assert.equal(await page.locator('.personal-tasks .task-check[aria-pressed=true]').count(), 1);
    await page.screenshot({ path: `${output}/s-home-320-en.png`, fullPage: true });
    const evidenceBeforeModal = (await read(page)).completed;
    await page.locator('.personal-pair-chapter').first().click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('Chapter status', { exact: true }).count(), 0);
    const groups = dialog.getByRole('region', { name: 'Six required chapter groups', exact: true });
    assert.equal(await groups.getByRole('group').count(), 6);
    await groups.getByRole('checkbox', { name: /^Chapter class/ }).check();
    assert.match(await groups.locator('.card-heading > strong').innerText(), /Not fully completed/);
    await accessibility(page, 'six required groups chapter sheet');
    await page.screenshot({ path: `${output}/six-groups-320-en.png`, fullPage: true });
    for (const label of ['Textbook reading', 'Note making', 'Own MCQ practice', 'Own CQ practice']) await groups.getByRole('checkbox', { name: new RegExp(`^${label}`) }).check();
    assert.match(await groups.locator('.card-heading > strong').innerText(), /Not fully completed/);
    await groups.getByRole('checkbox', { name: /^Chapter revision/ }).check();
    assert.match(await groups.locator('.card-heading > strong').innerText(), /Fully completed/);
    const afterGroups = await read(page);
    for (const [id, at] of Object.entries(evidenceBeforeModal)) assert.equal(afterGroups.completed[id], at, 'whole-step confirmation retains original segment stamps');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: /Prepare next phase/ }).count(), 0, 'one of two S chapters is not the whole S phase');
    await context.setOffline(true); await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.personal-home').waitFor(); assert.equal(await page.getByLabel('Day note', { exact: true }).inputValue(), 'Keep this dated note after reload');
    assert.deepEqual((await read(page)).completed, afterGroups.completed);
    assert.deepEqual(errors, []); results.push({ scenario: '320 first launch → multiple windows/net cap/obligations → S → actual durations → bounded overrun → dashboard → segment not chapter → six groups → offline reload', status: 'passed' });
  } finally { await context.close(); }
}
async function nextPhaseAndUndo() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Dhaka', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    let data = personalDataFixture(); data.settings.theme = 'dark'; data.notes['2026-11-20'] = 'Retain S notes through A and undo';
    const plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, plan[0].tasks.slice(0, 2).map(task => task.id), true, plan);
    for (const id of PERSONAL_IDS) for (const stage of WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id))) data = setPersonalStageCompletion(data, id, stage.id, true, '2026-11-23T12:00:00Z');
    const completed = { ...data.completed }, sWork = data.personalRoutine!.workloads;
    await page.clock.setFixedTime(new Date('2026-11-24T12:05:00Z'));
    await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(data) });
    await go(page, 'today');
    await page.getByRole('button', { name: 'Prepare next phase · A', exact: true }).click();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    assert.equal(await page.locator('main h1').innerText(), 'A phase chapters');
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    const notes = page.getByRole('group', { name: 'Note making', exact: true });
    await notes.getByLabel('Note topics/sections', { exact: true }).fill('8');
    await notes.getByLabel('Note-making minutes per section', { exact: true }).fill('4');
    await notes.getByLabel('Work difficulty', { exact: false }).selectOption('hard');
    await notes.getByRole('button', { name: 'Calculate workload time', exact: true }).click();
    assert.equal(await page.getByLabel('Note making minutes', { exact: true }).inputValue(), '45');
    await layout(page, 'next-phase calculator 390 dark'); await accessibility(page, 'next-phase calculator 390 dark');
    await page.screenshot({ path: `${output}/next-phase-calculator-390-dark.png`, fullPage: true });
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.getByRole('button', { name: 'Save this phase routine', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply my routine', exact: true }).click();
    await page.locator('.personal-home').waitFor();
    const saved = await read(page);
    assert.equal(saved.personalRoutine!.scope, 'A'); assert.equal(saved.personalRoutine!.startsOn, '2026-11-24');
    assert.deepEqual(saved.personalPhases!.S!.workloads, sWork); assert.deepEqual(saved.completed, completed);
    assert.ok(saved.personalRoutine!.chapterIds.every(id => !PERSONAL_IDS.includes(id)));
    assert.equal(saved.notes['2026-11-20'], data.notes['2026-11-20']);
    assert.equal(await page.locator('.personal-goal .card-heading > strong').innerText(), '2/2');
    await layout(page, 'archived S/current A 390 dark'); await accessibility(page, 'archived S/current A 390 dark');
    await go(page, 'syllabus'); await page.locator('.chapter-card-item .chapter-row').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: /^Chapter revision/ }).uncheck();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)!).personalRoutine.scope === 'S', STORAGE_KEY);
    const reopened = await read(page); assert.equal(reopened.personalRoutine!.scope, 'S');
    assert.equal(reopened.personalPhases!.A!.scope, 'A'); assert.equal(reopened.personalRoutine!.workloads[PERSONAL_IDS[0]].class.url, sWork[PERSONAL_IDS[0]].class.url);
    const history = dialog.locator('.personal-history'); assert.equal(await history.count(), 1);
    await history.locator('summary').click(); await accessibility(page, 'reopened S and retained chapter history 390 dark');
    const expectedHistory = reopened.personalRoutine!.history!.filter(task => task.chapterIds.includes(PERSONAL_IDS[0]) && isPersonalTaskComplete(task, reopened.completed));
    assert.ok(expectedHistory.length > 0); assert.equal(await history.locator('li').count(), expectedHistory.length);
    assert.ok((await history.locator('li > strong').allTextContents()).every(title => title.includes(chapterById[PERSONAL_IDS[0]].title)));
    await page.screenshot({ path: `${output}/reopened-s-history-390-dark.png`, fullPage: true });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await go(page, 'settings');
    await page.getByRole('button', { name: 'Set availability, S list & class durations', exact: true }).click();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    const retained = reopened.personalPhases!.A!.chapterIds[0];
    const retainedSubject = page.getByRole('group', { name: subjectById[chapterById[retained].subject].name, exact: true });
    assert.equal(await retainedSubject.getByRole('checkbox', { name: new RegExp(`^${chapterById[retained].title}`) }).isDisabled(), true);
    await page.getByRole('button', { name: 'Use recommended shortlist', exact: true }).click();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await page.getByRole('button', { name: 'Save this availability & S routine', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply my routine', exact: true }).click();
    await page.locator('.personal-home').waitFor();
    const edited = await read(page);
    assert.ok(edited.personalRoutine!.chapterIds.every(id => !edited.personalPhases!.A!.chapterIds.includes(id)));
    assert.deepEqual(edited.completed, reopened.completed); assert.equal(edited.notes['2026-11-20'], data.notes['2026-11-20']);
    await page.reload({ waitUntil: 'networkidle' }); assert.deepEqual((await read(page)).personalPhases!.A, edited.personalPhases!.A);
    assert.deepEqual(errors, []);
    results.push({ scenario: '390 dark: fully confirmed S → next A phase → calculator → save/archive → undo S reopens S → edit S without archived overlap → reload keeps both phases/history/notes', status: 'passed' });
  } finally { await context.close(); }
}
async function retainedAppointments() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Dhaka', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const data = personalDataFixture(), date = data.settings.startDate;
    data.settings.theme = 'light'; data.notes[date] = 'Preserve my dated note and original appointments';
    data.routineBlocks = [
      { id: 'retained-coaching', date, weekday: 5, startMinute: 540, minutes: 60, subject: 'physics', title: 'Re-time retained coaching', createdAt: '2026-11-16T08:00:00Z' },
      { id: 'retained-self-work', date, weekday: 5, startMinute: 630, minutes: 30, subject: 'math', title: 'Explicitly confirm retained work', createdAt: '2026-11-16T08:00:00Z' },
    ];
    await page.clock.setFixedTime(new Date(`${date}T06:00:00Z`));
    await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: STORAGE_KEY, value: JSON.stringify(data) });
    await go(page, 'calendar');
    const unallocated = page.getByRole('region', { name: 'Retained unallocated appointments' });
    assert.equal(await unallocated.locator('.task-card').count(), 2);
    const coaching = unallocated.locator('.task-card').filter({ hasText: 'Re-time retained coaching' });
    await coaching.getByRole('button', { name: 'Re-time retained coaching', exact: true }).click();
    await coaching.getByLabel('Start time:', { exact: true }).fill('18:30');
    await page.waitForFunction(({ key, date }) => Object.values(JSON.parse(localStorage.getItem(key)!).dayOverrides[date]?.taskStartMinutes || {}).includes(1110), { key: STORAGE_KEY, date });
    assert.equal(await unallocated.locator('.task-card').count(), 1);
    const saved = await read(page), effective = buildStudyPlan(saved, date), day = effective.find(day => day.date === date)!;
    const appointment = day.tasks.find(task => task.title === 'Re-time retained coaching')!;
    assert.ok(appointment); assert.equal(appointment.startMinute, 1110); assert.equal(appointment.endMinute, 1170);
    assert.deepEqual(saved.routineBlocks, data.routineBlocks, 'Explicit overrides must not overwrite the original appointment records');
    assert.equal(saved.notes[date], data.notes[date]); assert.deepEqual(saved.completed, {});
    assert.ok(day.tasks.every(task => task.kind === 'custom' || task.endMinute <= 1110 || task.startMinute >= 1170));
    assert.ok(day.tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) <= personalCapacity(saved, date));
    const remaining = unallocated.locator('.task-card').filter({ hasText: 'Explicitly confirm retained work' });
    await remaining.locator('.task-check').click();
    await page.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key)!).completed).length === 1, STORAGE_KEY);
    const confirmed = await read(page), taskId = `custom-${date}-retained-self-work`;
    assert.ok(confirmed.completed[taskId]);
    assert.equal(await remaining.locator('.task-check').getAttribute('aria-pressed'), 'true');
    await layout(page, '390 light Calendar: retained appointment edited and explicitly confirmed');
    await accessibility(page, '390 light Calendar: retained appointment edited and explicitly confirmed');
    await page.locator('.calendar-day-panel').screenshot({ path: `${output}/calendar-retained-custom-390-light.png` });
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual((await read(page)).completed, confirmed.completed);
    await page.getByRole('region', { name: 'Retained unallocated appointments' }).locator('.task-check').click();
    await page.waitForFunction(key => Object.keys(JSON.parse(localStorage.getItem(key)!).completed).length === 0, STORAGE_KEY);
    assert.equal((await read(page)).notes[date], data.notes[date]); assert.deepEqual(errors, []);
    results.push({ scenario: '390 light Calendar: retain out-of-window custom appointments → explicit time edit displaces future work within cap → completion/reload/undo keeps original records and notes', status: 'passed' });
  } finally { await context.close(); }
}
async function matrix() {
  for (const scenario of [
    { width: 320, language: 'bn' as const, theme: 'light' as const, fontScale: 'lg' as const },
    { width: 390, language: 'en' as const, theme: 'dark' as const, fontScale: 'lg' as const },
    { width: 1280, language: 'en' as const, theme: 'light' as const, fontScale: 'md' as const },
  ]) {
    let data = personalDataFixture(); const plan = buildStudyPlan(data, data.settings.startDate);
    data = setTaskCompletion(data, [plan[0].tasks[0].id], true, plan); const oldEvidence = { ...data.completed };
    data.personalRoutine!.sessionMinutes = 30; data.settings = { ...data.settings, language: scenario.language, theme: scenario.theme, fontScale: scenario.fontScale };
    data.notes['2026-11-21'] = 'Synthetic retained day note';
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 900 }, isMobile: scenario.width < 700, hasTouch: scenario.width < 700, timezoneId: 'America/New_York', reducedMotion: 'reduce' });
    try {
      const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.clock.setFixedTime(new Date('2026-11-21T06:00:00Z'));
      await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data });
      for (const route of ['today', 'calendar', 'syllabus', 'exams', 'backlog', 'reminders', 'settings']) {
        await go(page, route); const name = `${scenario.width}-${scenario.language}-${scenario.theme}-large-${route}`;
        await layout(page, name); await accessibility(page, name);
        if (route === 'syllabus') assert.equal(await page.locator('.chapter-card-item').count(), 1, 'S physics filter must not include every A chapter');
        if (route === 'backlog') {
          assert.equal(await page.getByRole('button', { name: /Spread into free room|খালি জায়গায় ভাগ/ }).count(), 0);
          const expected = buildStudyPlan(data, '2026-11-21').flatMap(day => day.tasks).filter(task => (task.date < '2026-11-21' || task.rescheduledFrom && task.rescheduledFrom < '2026-11-21') && !isPersonalTaskComplete(task, data.completed));
          assert.equal(await page.locator('.task-card').count(), expected.length);
        }
        if (route === 'settings') {
          assert.equal(await page.getByLabel(/Daily study target \(before boost\)|বাড়তি পর্যায়ের আগে দৈনিক/).count(), 0);
          assert.equal(await page.getByLabel(/Adaptive planner|অ্যাডাপ্টিভ প্ল্যানার/).count(), 0);
        }
        if (route === 'today' || route === 'syllabus') await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
        assert.deepEqual((await read(page)).completed, oldEvidence, 'Viewing screens must not rewrite timestamps or range evidence');
        results.push({ scenario: name, status: 'passed' });
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
}
try { await flow(); await nextPhaseAndUndo(); await retainedAppointments(); await matrix(); }
catch (error) { failure = (error as Error).stack || String(error); console.error(failure); process.exitCode = 1; }
finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ base, complete: !failure, scope: 'one new-user flow, one next-phase/calculator/archive/undo-history flow, one retained-appointment Calendar edit/completion/reload/undo flow and 21 saved-personal route/theme/language/layout states; no native-device or exhaustive-accessibility guarantee', results, violations, incomplete, supplementalReviews, failure }, null, 2)); }
console.log(`Personal browser: ${results.length} passed cases, ${violations.length} automatic accessibility violations, ${incomplete.length} manual-review results. ${failure ? 'FAILED' : 'PASSED'}`);
