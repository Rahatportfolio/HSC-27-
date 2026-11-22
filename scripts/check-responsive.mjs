/** Browser-level responsive regression, including saved legacy/S profiles and
 * unfinished availability setup. Set CHROMIUM_PATH; BASE_URL optionally targets
 * a production build instead of a temporary Vite dev server. All profiles are
 * synthetic and isolated. Filters and raw measurements are recorded in report.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { tsImport } from 'tsx/esm/api';

const { freshData, STORAGE_KEY } = await tsImport('../src/planner.ts', import.meta.url);
const { parseBackup } = await tsImport('../src/storage.ts', import.meta.url);
const { personalDataFixture } = await tsImport('../src/test/personalRoutineFixture.ts', import.meta.url);
const executablePath = process.env.CHROMIUM_PATH;
assert(executablePath, 'Set CHROMIUM_PATH to a Chromium/Chrome executable.');
const output = process.env.RESPONSIVE_OUTPUT || '.cache/responsive';
await mkdir(output, { recursive: true });
const routeTitles = {
  today: ['হোম ড্যাশবোর্ড', 'Home dashboard'], brain: ['স্টাডি ব্রেইন', 'Study Brain'],
  calendar: ['আমার স্টাডি প্ল্যান', 'My study plan'], syllabus: ['সিলেবাস', 'Syllabus'],
  videos: ['ভিডিও ক্লাস', 'Video classes'], pdfs: ['পিডিএফ লাইব্রেরি', 'PDF library'],
  studySystem: ['স্টাডি ও অফলাইন', 'Study & offline'], scanner: ['নোট স্ক্যানার', 'Note scanner'],
  testprep: ['টেস্ট প্রস্তুতি', 'Test preparation'], flashcards: ['ফ্ল্যাশকার্ড', 'Flashcards'],
  revision: ['স্মার্ট রিভিশন', 'Smart revision'], timer: ['স্টাডি টাইমার', 'Study timer'],
  practice: ['অনুশীলন', 'Practice'], examsim: ['পরীক্ষা সিমুলেটর', 'Exam simulator'],
  weakness: ['দুর্বলতা ডিটেক্টর', 'Weakness detector'], heatmap: ['সিলেবাস হিটম্যাপ', 'Syllabus heatmap'],
  backlog: ['ব্যাকলগ ম্যানেজার', 'Backlog manager'], audit: ['অ্যাপ অডিট', 'App audit'],
  exams: ['পরীক্ষা ও GPA', 'Exams & GPA'], analytics: ['অগ্রগতি ও বিশ্লেষণ', 'Progress & analytics'],
  library: ['লাইব্রেরি', 'Library'], reminders: ['রিমাইন্ডার', 'Reminders'],
  storage: ['স্টোরেজ', 'Storage'], settings: ['সেটিংস ও ব্যাকআপ', 'Settings & backup'],
};
const allProfiles = ['onboarding', 'legacy', 'personal'];
const allScenarios = [
  { id: '320-light-bn', width: 320, language: 'bn', theme: 'light' },
  { id: '360-light-bn', width: 360, language: 'bn', theme: 'light' },
  { id: '390-dark-bn', width: 390, language: 'bn', theme: 'dark' },
  { id: '768-light-en', width: 768, language: 'en', theme: 'light' },
  { id: '320-dark-en', width: 320, language: 'en', theme: 'dark' },
];
function selection(value, available) {
  const selected = value ? value.split(',') : available;
  assert(selected.length && selected.every(item => available.includes(item)), `Unknown/empty filter: ${value}`);
  assert.equal(new Set(selected).size, selected.length, `Duplicate filter entries: ${value}`);
  return selected;
}
const profiles = selection(process.env.RESPONSIVE_PROFILES, allProfiles);
const selectedScenarios = selection(process.env.RESPONSIVE_SCENARIOS, allScenarios.map(item => item.id));
const scenarios = allScenarios.filter(item => selectedScenarios.includes(item.id));
const routes = selection(process.env.RESPONSIVE_ROUTES, Object.keys(routeTitles));
const fault = process.env.RESPONSIVE_FAULT || '';
assert(['', 'horizontal-overflow', 'duplicate-page-heading'].includes(fault), 'Unknown responsive fault');
const server = process.env.BASE_URL ? undefined : await createServer({ server: { host: '0.0.0.0', port: 0, strictPort: false } });
let browser, base = process.env.BASE_URL?.replace(/\/$/, ''), failure = '', active = 'startup';
const results = [], pageErrors = [];
try {
  await server?.listen();
  if (!base) base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const profile of profiles) for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 800 }, reducedMotion: 'reduce', timezoneId: 'Asia/Dhaka', hasTouch: true, isMobile: true });
    try {
      const data = profile === 'personal' ? personalDataFixture() : freshData();
      if (profile === 'onboarding') data.routineSetupRequired = true;
      data.settings.language = scenario.language; data.settings.theme = scenario.theme; data.settings.fontScale = 'lg';
      data.notes['2026-11-19'] = 'Preserve this synthetic history through every route.';
      const fixture = parseBackup(JSON.stringify(data)); // Invalid fixtures must fail, not fall back to empty data.
      assert.deepEqual(fixture.personalRoutine, data.personalRoutine);
      assert.equal(fixture.routineSetupRequired, data.routineSetupRequired);
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => pageErrors.push({ active, message: error.message }));
      await page.clock.setFixedTime(new Date('2026-11-20T06:00:00Z'));
      await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort('internetdisconnected'));
      await page.addInitScript(({ key, data }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data });
      const go = async route => {
        active = `${profile}/${scenario.id}/${route}`;
        await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('main > .view').waitFor();
        assert.equal(await page.locator('.breadcrumb strong').innerText(), routeTitles[route][scenario.language === 'en' ? 1 : 0], `Wrong rendered route #${route}`);
        await page.evaluate(() => document.fonts.ready);
      };
      const assertFits = async label => {
        active = `${profile}/${scenario.id}/${label}`;
        assert.equal(pageErrors.length, 0, `${active}: browser error: ${JSON.stringify(pageErrors)}`);
        const view = page.locator('main > .view');
        assert.equal(await view.count(), 1, `${active}: expected one real root view`);
        assert((await view.innerText()).trim().length >= 40, `${active}: blank page`);
        assert.equal(await page.locator('html').getAttribute('data-font'), 'lg', `${active}: actual large-text setting did not load`);
        assert.equal(await page.locator('html').getAttribute('data-theme'), scenario.theme, `${active}: wrong theme`);
        if (fault === 'horizontal-overflow') await page.addStyleTag({ content: 'main > .view{min-width:150vw!important}' });
        if (fault === 'duplicate-page-heading') await view.evaluate(element => { const heading = document.createElement('h1'); heading.textContent = 'Erroneous second page title'; element.append(heading); });
        assert.equal(await page.locator('main h1').count(), 1, `${active}: expected one page-level heading`);
        const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert(size.scrollWidth <= size.width + 1, `${active}: page width ${size.width}, content width ${size.scrollWidth}`);
        // Keep the original sibling-collision check: not just a width or visibility smoke test.
        const collision = await page.evaluate(() => {
          for (const parent of document.querySelectorAll('main > .view *, .modal *, .live-timer-topbar')) {
            const children = [...parent.children].filter(element => {
              const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
              return rect.width > 0 && rect.height > 0 && style.position !== 'absolute' && style.position !== 'fixed' && style.visibility !== 'hidden' && style.display !== 'none' && element.tagName !== 'svg' && element.tagName !== 'INPUT' && element.textContent.trim().length > 1;
            });
            if (children.length > 25) continue;
            for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
              const a = children[i].getBoundingClientRect(), b = children[j].getBoundingClientRect();
              const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (x > 3 && y > 3 && Math.min(a.width, b.width, a.height, b.height) > 10)
                return { parent: parent.className, first: children[i].textContent.trim().slice(0, 55), second: children[j].textContent.trim().slice(0, 55), a: a.toJSON(), b: b.toJSON() };
            }
          }
          return null;
        });
        assert.equal(collision, null, `${active}: overlapping siblings: ${JSON.stringify(collision)}`);
        for (const dialog of await page.locator('.modal:visible').all()) {
          const rect = await dialog.boundingBox(); assert(rect && rect.x >= -1 && rect.x + rect.width <= size.width + 1, `${active}: dialog exceeds viewport`);
        }
        results.push({ name: active, passed: true, measurement: size });
      };
      for (const route of routes) {
        active = `${profile}/${scenario.id}/${route}`; await go(route);
        if (profile === 'onboarding' && ['today', 'calendar', 'testprep', 'backlog'].includes(route)) {
          assert.equal(await page.locator('.quick-start').count(), 1, 'Unfinished availability must not produce an assumed legacy timetable');
          assert.equal(await page.locator('.task-card').count(), 0);
        }
        if (route === 'today' && profile !== 'onboarding') assert.equal(await page.locator(profile === 'personal' ? '.personal-home' : '.today-view').count(), 1, 'Wrong saved-profile home');
        await assertFits(route);
      }
      if (scenario.id === '320-light-bn' && !process.env.RESPONSIVE_ROUTES) {
        const dialogs = profile === 'onboarding' ? [['today', '.global-search']] : [
          ['today', '.task-title-button'], ['today', '.global-search'],
          ['calendar', '.calendar-day-panel .task-title-button'], ['syllabus', '.chapter-row'], ['exams', '.page-heading .button'],
        ];
        for (const [route, selector] of dialogs) {
          await go(route);
          if (profile === 'personal' && selector.endsWith('.task-title-button')) await page.locator('.personal-session details > summary').first().click();
          const target = page.locator(selector).filter({ visible: true }).first(); await target.click();
          const expansion = selector.endsWith('.task-title-button');
          if (expansion) {
            assert.equal(await target.getAttribute('aria-expanded'), 'true', 'Task details must really expand');
            assert.equal(await page.locator('.task-expanded-wrap').first().isVisible(), true);
          } else assert.equal(await page.getByRole('dialog').count(), 1, `Expected the ${selector} dialog`);
          await assertFits(`${route} after ${selector}`);
          if (expansion) { await target.click(); assert.equal(await target.getAttribute('aria-expanded'), 'false'); }
          else { await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0, 'Dialog must close before the next journey'); }
        }
        await go(profile === 'onboarding' ? 'timer' : 'today');
        if (profile === 'personal') await page.locator('.personal-session details > summary').first().click();
        await page.locator(profile === 'onboarding' ? '.timer-main-button' : profile === 'personal' ? '.task-preset-timer-btn' : '.preset-launch-btn').filter({ visible: true }).first().click();
        await page.locator('.live-timer-topbar.running').waitFor();
        for (const width of [320, 360, 390]) {
          await page.setViewportSize({ width, height: 800 }); await assertFits(`running timer ${width}px`);
        }
        await go('calendar');
        assert.equal(await page.locator('.live-timer-topbar.running').count(), 1, 'Running timer disappeared after navigation');
        await assertFits('running timer after calendar navigation');
      }
      const saved = parseBackup(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY));
      for (const field of ['notes', 'completed', 'personalRoutine', 'routineSetupRequired']) assert.deepEqual(saved[field], fixture[field], `${profile}: rendering/navigation changed ${field}`);
      console.log(`PASS ${profile}/${scenario.id}: ${routes.length} routes, saved large text, collision checks and retained history`);
    } finally { await context.close(); }
  }
} catch (error) {
  failure = error.stack || String(error); results.push({ name: active, passed: false, detail: failure }); console.error(failure); process.exitCode = 1;
} finally {
  await browser?.close(); await server?.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ base, complete: !failure, fullMatrix: profiles.length === allProfiles.length && scenarios.length === allScenarios.length && routes.length === Object.keys(routeTitles).length,
    profiles, scenarios, routes, fault, results, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length, pageErrors, failure,
    limitations: 'Synthetic saved onboarding/legacy/S profiles; 24 views, 320–768px, real large-text preference, Bengali/English and light/dark states, selected dialogs and running clocks. Not physical Android, OEM keyboard, screen-reader or exhaustive accessibility/performance acceptance.',
  }, null, 2));
}
console.log(`Responsive: ${results.filter(row => row.passed).length} passed, ${results.filter(row => !row.passed).length} failed.`);
