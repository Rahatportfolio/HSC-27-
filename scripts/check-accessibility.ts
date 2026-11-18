/** Real Chromium WCAG 2.1 A/AA checks. No rules or failing elements are excluded.
 * Run against the built preview; reports/screenshots belong under ignored .cache.
 * Optional A11Y_* filters are printed in the report so a subset cannot masquerade
 * as the complete route/theme/language/profile matrix. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import type { AxeResults } from 'axe-core';
import { freshData, STORAGE_KEY } from '../src/planner';
import { emptyAdvanced } from '../src/advanced';
import { parseBackup } from '../src/storage';
import { allQuestions } from '../src/analytics';

const require = createRequire(import.meta.url);
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.A11Y_OUTPUT || '.cache/accessibility';
const fault = process.env.A11Y_FAULT || '';
const routeTitles = {
  today: 'Home dashboard', calendar: 'My study plan', syllabus: 'Syllabus', videos: 'Video classes',
  studySystem: 'Study & offline', scanner: 'Note scanner', pdfs: 'PDF library', testprep: 'Test preparation',
  practice: 'Practice', flashcards: 'Flashcards', revision: 'Smart revision', examsim: 'Exam simulator',
  weakness: 'Weakness detector', heatmap: 'Syllabus heatmap', backlog: 'Backlog manager', exams: 'Exams & GPA',
  timer: 'Study timer', analytics: 'Progress & analytics', library: 'Library', reminders: 'Reminders',
  audit: 'App audit', storage: 'Storage', settings: 'Settings & backup',
} as const;
type Route = keyof typeof routeTitles;
const routeTitlesBn: Record<Route, string> = {
  today: 'হোম ড্যাশবোর্ড', calendar: 'আমার স্টাডি প্ল্যান', syllabus: 'সিলেবাস', videos: 'ভিডিও ক্লাস',
  studySystem: 'স্টাডি ও অফলাইন', scanner: 'নোট স্ক্যানার', pdfs: 'পিডিএফ লাইব্রেরি', testprep: 'টেস্ট প্রস্তুতি',
  practice: 'অনুশীলন', flashcards: 'ফ্ল্যাশকার্ড', revision: 'স্মার্ট রিভিশন', examsim: 'পরীক্ষা সিমুলেটর',
  weakness: 'দুর্বলতা ডিটেক্টর', heatmap: 'সিলেবাস হিটম্যাপ', backlog: 'ব্যাকলগ ম্যানেজার', exams: 'পরীক্ষা ও GPA',
  timer: 'স্টাডি টাইমার', analytics: 'অগ্রগতি ও বিশ্লেষণ', library: 'লাইব্রেরি', reminders: 'রিমাইন্ডার',
  audit: 'অ্যাপ অডিট', storage: 'স্টোরেজ', settings: 'সেটিংস ও ব্যাকআপ',
};
const allRoutes = Object.keys(routeTitles) as Route[];
const routes = process.env.A11Y_ROUTES ? process.env.A11Y_ROUTES.split(',') as Route[] : allRoutes;
assert(routes.length && routes.every(route => allRoutes.includes(route)), 'Unknown/empty accessibility route selection');
const matrix = [
  { id: '320-light-en', width: 320, theme: 'light', language: 'en', populated: false },
  { id: '393-dark-bn', width: 393, theme: 'dark', language: 'bn', populated: false },
  { id: '393-light-bn', width: 393, theme: 'light', language: 'bn', populated: true },
  { id: '1280-dark-en', width: 1280, theme: 'dark', language: 'en', populated: true },
  // Light wide-screen chrome exposed a contrast failure hidden on narrow
  // phones. Cover both landscape and desktop, not only dark desktop.
  { id: '797-light-bn', width: 797, theme: 'light', language: 'bn', populated: true },
  { id: '797-dark-en', width: 797, theme: 'dark', language: 'en', populated: true },
  { id: '1280-light-en', width: 1280, theme: 'light', language: 'en', populated: true },
  { id: '1280-dark-bn', width: 1280, theme: 'dark', language: 'bn', populated: true },
] as const;
const selected = process.env.A11Y_SCENARIOS?.split(',');
const scenarios = matrix.filter(s => !selected || selected.includes(s.id));
assert(scenarios.length && (!selected || selected.every(id => scenarios.some(s => s.id === id))), 'Unknown/empty scenario selection');
const dialogs: { route: Route; name: string; selector: string; populatedOnly?: boolean; before?: (page: Page) => Promise<void> }[] = [
  { route: 'syllabus', name: 'chapter-modal', selector: '.chapter-row' },
  { route: 'practice', name: 'question-modal', selector: '.question-manage .button' },
  { route: 'practice', name: 'cq-modal', selector: '.cq-main .button.primary', before: async page => { await page.locator('.practice-tabs button').nth(1).click(); } },
  { route: 'flashcards', name: 'flashcard-modal', selector: '.filters .icon-button' },
  { route: 'exams', name: 'test-modal', selector: '.page-heading .button' },
  { route: 'exams', name: 'marks-modal', selector: '.exam-card .button' },
  { route: 'library', name: 'note-modal', selector: '.library-panel .heading-actions .button.primary' },
  { route: 'today', name: 'mistake-modal', selector: '.topbar-quick-tools .quick-tool-btn' },
  { route: 'today', name: 'search-modal', selector: '.global-search' },
  { route: 'videos', name: 'video-player-modal', selector: '.video-card .button.primary' },
  { route: 'library', name: 'video-link-modal', selector: '.library-panel .card-heading .button.primary', before: async page => { await page.locator('.library-tabs button').nth(1).click(); } },
  { route: 'library', name: 'formula-modal', selector: '.library-panel .card-heading .button.primary', before: async page => { await page.locator('.library-tabs button').nth(2).click(); } },
  { route: 'library', name: 'board-question-modal', selector: '.library-panel .card-heading .button.primary', before: async page => { await page.locator('.library-tabs button').nth(3).click(); } },
  { route: 'settings', name: 'reset-confirmation', selector: '.reset-row .button' },
  { route: 'library', name: 'delete-confirmation', selector: '.personal-note .delete-button', populatedOnly: true },
  { route: 'pdfs', name: 'missing-pdf-modal', selector: '.pdf-row-actions .button.primary', populatedOnly: true },
  { route: 'studySystem', name: 'duration-player-modal', selector: '.study-actions .button.primary', populatedOnly: true },
];
const dialogFilter = process.env.A11Y_DIALOGS?.split(',');
const extraPopulatedStates = !dialogFilter || process.env.A11Y_EXTRA_STATES === '1';
const examStatesOnly = process.env.A11Y_EXAM_STATES_ONLY === '1';
const chosenDialogs = dialogFilter?.includes('none') ? [] : dialogs.filter(d => !dialogFilter || dialogFilter.includes(d.name));
assert(!dialogFilter || dialogFilter.every(name => name === 'none' || dialogs.some(d => d.name === name)), 'Unknown dialog selection');
await mkdir(output, { recursive: true });
const rows: { name: string; violations: AxeResults['violations']; incomplete: { id: string; nodes: number }[]; pageErrors: string[] }[] = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const scenario of scenarios) {
    const data = freshData();
    data.settings.theme = scenario.theme; data.settings.language = scenario.language; data.settings.fontScale = 'lg';
    data.notes['2026-11-19'] = 'Accessibility fixture: unrelated history must stay intact.';
    if (scenario.populated) {
      data.flashcards = [{ id: 'a11y-card', subject: 'physics', chapterId: 'physics-1-7', front: 'What is elasticity?', back: 'Recovery after removal of a deforming force.', category: 'definition', interval: 1, dueDate: '2026-11-20', repetitions: 2, easeFactor: 2.5, createdAt: '2026-11-19T01:00:00Z' }];
      data.pdfs = [{ id: 'a11y-missing-pdf', title: 'Revision PDF — unavailable bytes fixture', subject: 'physics', chapterId: 'physics-1-7', material: 'notes', local: true, createdAt: '2026-11-19T01:00:00Z' }];
      data.advanced = { ...emptyAdvanced(), classes: [{ id: 'a11y-class', title: 'Actual duration bookmark', chapterId: 'physics-1-7', url: 'https://www.youtube.com/watch?v=CSQeIf9p4W8', teacher: 'Revision teacher', duration: 600, position: 120, watched: 120, speed: 1, note: 'Saved bookmark notes', permitted: false }] };
      data.gpaMarks = { physics: 160, chemistry: 159.99, biology: 160, math: 0, bangla: 160, english: 160, ict: 80 };
      data.libraryNotes = [{ id: 'a11y-note', subject: 'physics', title: 'Actual saved revision note', body: 'Notes and flashcards should remain readable in both themes.', tags: ['revision'], pinned: true, createdAt: '2026-11-19T01:00:00Z', updatedAt: '2026-11-19T01:00:00Z' }];
    }
    const restored = parseBackup(JSON.stringify(data)); // Reject a broken fixture instead of auditing fallback data.
    for (const field of ['flashcards', 'gpaMarks', 'libraryNotes', 'pdfs', 'advanced'] as const) assert.deepEqual(JSON.parse(JSON.stringify(restored[field] ?? null)), JSON.parse(JSON.stringify(data[field] ?? null)), `Invalid accessibility fixture: ${field}`);
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 900 }, isMobile: scenario.width < 800, hasTouch: scenario.width < 800, reducedMotion: 'reduce', timezoneId: 'Asia/Dhaka' });
    const page = await context.newPage(), pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    // Only the app's player chrome is audited. External YouTube playback is a
    // third-party dependency, not something this no-network fixture can certify.
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>External player fixture</title><p>Third-party playback is not tested by this audit.</p>' });
      return route.abort('internetdisconnected');
    });
    await page.addInitScript(({ data, key }) => { if (window !== window.top) return; if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { data, key: STORAGE_KEY });
    await page.clock.install({ time: new Date('2026-11-20T03:00:00Z') });
    const goto = async (route: Route) => {
      await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' });
      await page.locator('main .view').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), scenario.theme, 'Theme fixture did not load');
      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
      assert.equal(stored.settings.language, scenario.language, 'Language fixture did not survive reload');
      assert.equal(stored.notes['2026-11-19'], data.notes['2026-11-19'], 'Audit changed real-history fixture');
      // A hash alone is not coverage: a misspelt route would silently show Today.
      assert.equal((await page.locator('.breadcrumb strong').innerText()).trim(), (scenario.language === 'en' ? routeTitles : routeTitlesBn)[route], `Wrong rendered route for #${route}`);
      if (route === 'studySystem') await page.locator('.study-workspace').waitFor();
    };
    const scan = async (name: string) => {
      await page.evaluate(async () => { await document.fonts.ready; });
      if (fault) {
        await page.evaluate(injected => {
          if (injected === 'unnamed-progress') document.querySelector('[role="progressbar"]')?.removeAttribute('aria-label');
          if (injected === 'wrong-class-name') document.querySelector('.class-link')?.setAttribute('aria-label', 'Unrelated action');
          if (injected === 'wrong-language-name') document.querySelector('.lang-toggle-chip')?.setAttribute('aria-label', 'Switch language');
          if (injected === 'unfocusable-timeline') document.querySelector('.plan-timeline')?.removeAttribute('tabindex');
          if (injected === 'invalid-filter-tablist') document.querySelector('.search-subject-pills')?.setAttribute('role', 'tablist');
        }, fault);
        const css: Record<string, string> = {
          'faint-secondary': '.plan-timeline-node small{color:#cfd5d0!important}',
          'faint-dark-subject': '.testprep-subject-name{color:#2c5e8a!important}',
          'light-action-with-white-text': ':root{--action:#9edbbc!important}',
          'foreground-as-background': '.generator-box{background:var(--soft)!important}',
          'faded-calendar-dates': '.calendar-cell{opacity:.3!important}',
          'undecorated-source-link': '.study-source-link{text-decoration:none!important}',
          'pale-dark-exam-mistakes': '.exam-wrong-row:not(.unanswered){background:#fdf6f5!important}',
        };
        if (css[fault]) await page.addStyleTag({ content: css[fault] });
      }
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const result = await page.evaluate(async () => (window as unknown as { axe: { run: (root: Document, options: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, iframes: false, resultTypes: ['violations', 'incomplete'] }));
      const row = { name: `${scenario.id}/${name}`, violations: result.violations, incomplete: result.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })), pageErrors: [...pageErrors] };
      rows.push(row);
      await writeFile(`${output}/report.json`, JSON.stringify({ base, fault, routes, scenarios, dialogs: chosenDialogs.map(d => d.name), extraPopulatedStates, examStatesOnly, rows }, null, 2));
      console.log(`${row.violations.length || row.pageErrors.length ? 'FAIL' : 'PASS'} ${row.name}: ${row.violations.map(v => `${v.id}(${v.nodes.length})`).join(', ')}`);
      if (process.env.A11Y_SCREENSHOTS === '1') await page.screenshot({ path: `${output}/${scenario.id}-${name}.png`, fullPage: false });
    };
    for (const route of routes) { await goto(route); await scan(route); }
    for (const dialog of chosenDialogs.filter(d => !d.populatedOnly || scenario.populated)) {
      await goto(dialog.route); if (dialog.before) await dialog.before(page);
      const trigger = page.locator(dialog.selector).first(); await trigger.click();
      await page.getByRole('dialog').waitFor(); await scan(dialog.name);
      // Real Tab/Shift+Tab key events must remain in the dialog. Escape must
      // close it and restore focus to its still-mounted invoking control.
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'Tab escaped the dialog');
      await page.keyboard.press('Shift+Tab');
      assert(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'Shift+Tab escaped the dialog');
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert(await trigger.evaluate(element => element === document.activeElement), `Focus was not restored after ${dialog.name}`);
    }
    if (scenario.populated && extraPopulatedStates && (!fault || examStatesOnly)) {
      if (!examStatesOnly) {
        await goto('flashcards'); await page.locator('.flip-btn').first().click(); await page.locator('.answer-btn').first().click(); await scan('flashcard-rating');
        await goto('practice'); await page.locator('.quiz-setup-grid select').nth(1).selectOption('physics-1-7'); await page.locator('.generator-actions .button').click(); await scan('generated-quiz');
        const chosenAnswer = async (correct: boolean) => {
          const text = await page.locator('.quiz-question').innerText();
          const questions = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).questions as { question: string; answer: number }[], STORAGE_KEY);
          const answer = questions.find(q => q.question === text)?.answer; assert.notEqual(answer, undefined, 'Generated quiz question was not persisted');
          await page.locator('.quiz-option').nth(correct ? answer! : (answer! + 1) % 4).click();
        };
        await chosenAnswer(false); await scan('wrong-answer-quiz');
        await page.locator('.quiz-actions .button').click(); await chosenAnswer(true); await scan('correct-answer-quiz');
        while (await page.locator('.quiz-actions .button').innerText() !== (scenario.language === 'en' ? 'New quiz' : 'নতুন কুইজ')) {
          await page.locator('.quiz-actions .button').click(); await chosenAnswer(true);
        }
        await scan('completed-quiz');
        await goto('practice'); await page.locator('.practice-tabs button').nth(1).click(); await scan('cq-tab'); await page.locator('.practice-tabs button').nth(2).click(); await scan('mistakes-tab');
        await goto('library');
        for (const tab of [1, 2, 3]) { await page.locator('.library-tabs button').nth(tab).click(); await scan(`library-tab-${tab}`); }
      }
      await goto('examsim'); await page.locator('.exam-setup-card .wide-button').click(); await page.locator('.exam-run-card').waitFor();
      // Never rely on the first option being wrong. That previously made the
      // wrong-answer surface disappear from some otherwise-green audit runs.
      const started = parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
      assert(started.activeExam, 'The running paper fixture was not retained');
      const definitions = new Map(allQuestions(started).map(question => [question.id, question]));
      const answeredIndex = started.activeExam.questionIds.findIndex(id => {
        const question = definitions.get(id); return !!question?.explanation && !!question.chapterId;
      });
      assert(answeredIndex >= 0, 'Need a real question with explanation and chapter action');
      const answeredQuestion = definitions.get(started.activeExam.questionIds[answeredIndex])!;
      await page.locator('.exam-palette-cell').nth(answeredIndex).click();
      await page.locator('.quiz-option').nth((answeredQuestion.answer + 1) % 4).click(); await scan('running-exam');
      const live = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).activeExam, STORAGE_KEY); assert(live, 'The running paper was not saved');
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.exam-run-card').waitFor();
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).activeExam, STORAGE_KEY), live, 'Reload restarted or lost the active paper');
      await scan('restored-exam');
      await page.locator('.exam-run-footer .button').click(); await page.getByRole('dialog').waitFor(); await scan('incomplete-paper-confirmation');
      await page.getByRole('dialog').locator('.modal-actions .button.primary').click(); await page.locator('.exam-result').waitFor();
      const wrongRow = page.locator('.exam-wrong-row:not(.unanswered)');
      assert.equal(await wrongRow.count(), 1, 'Coverage requires one genuinely wrong answer');
      assert.equal(await wrongRow.locator('strong').innerText(), answeredQuestion.question);
      assert.equal(await wrongRow.locator('p.correct').count(), 1, 'Correct-answer feedback was not rendered');
      assert.equal(await wrongRow.locator('small').innerText(), answeredQuestion.explanation);
      assert.equal(await page.locator('.exam-wrong-row.unanswered').count(), live.questionIds.length - 1, 'Unanswered rows must also be covered');
      await scan('submitted-exam');
      if (await page.locator('.toast button').count()) await page.locator('.toast button').click();
      await wrongRow.locator('.text-button').hover(); await scan('submitted-exam-hover');
      await page.mouse.move(0, 0);
      await page.locator('.page-heading .button').click();
      await page.locator('.exam-history-list .exam-history-row').first().waitFor();
      assert.equal(await page.locator('.exam-result').count(), 0, 'History coverage must render history, not rescan the retained result component');
      await scan('exam-history-and-retries');
    }
    await context.close();
  }
} finally { await browser.close(); }
const failed = rows.filter(row => row.violations.length || row.pageErrors.length);
console.log(JSON.stringify({ checked: rows.length, failed: failed.length, repeatedViolationInstances: failed.reduce((n, row) => n + row.violations.reduce((m, v) => m + v.nodes.length, 0), 0), automatedOnly: true, incompleteChecksNeedManualReview: rows.reduce((n, row) => n + row.incomplete.reduce((m, v) => m + v.nodes, 0), 0) }));
if (failed.length) process.exitCode = 1;
