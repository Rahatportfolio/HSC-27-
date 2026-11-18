/** Follow-up manual-review guards in real Chromium. Large in-app text,
 * reduced-height viewport (keyboard-space simulation, not an OEM keyboard),
 * touch hit-testing, modal keyboard loops and saved-paper retry consent.
 * All storage belongs to isolated synthetic contexts; no user profile is read.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Locator } from 'playwright-core';
import type { AxeResults } from 'axe-core';
import { freshData, STORAGE_KEY } from '../src/planner';
import { saveExamSession } from '../src/examSim';
import { parseBackup } from '../src/storage';

const require = createRequire(import.meta.url);
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.FOLLOWUP_BROWSER_OUTPUT || '.cache/followup-browser';
const fault = process.env.FOLLOWUP_BROWSER_FAULT || '';
const reviewOnly = process.env.FOLLOWUP_REVIEW_ONLY === '1';
const scenarios = [
  { id: '320-light-en', width: 320, height: 760, language: 'en', theme: 'light' },
  { id: '320-dark-bn', width: 320, height: 760, language: 'bn', theme: 'dark' },
  { id: '393-dark-en', width: 393, height: 852, language: 'en', theme: 'dark' },
  { id: '393-light-bn', width: 393, height: 852, language: 'bn', theme: 'light' },
  { id: '797-dark-en', width: 797, height: 393, language: 'en', theme: 'dark' },
  { id: '797-light-bn', width: 797, height: 393, language: 'bn', theme: 'light' },
  { id: '1280-light-en', width: 1280, height: 900, language: 'en', theme: 'light' },
  { id: '1280-dark-bn', width: 1280, height: 900, language: 'bn', theme: 'dark' },
] as const;
const selected = process.env.FOLLOWUP_SCENARIOS?.split(',');
const matrix = scenarios.filter(scenario => !selected || selected.includes(scenario.id));
assert(matrix.length && (!selected || selected.every(id => matrix.some(scenario => scenario.id === id))), 'Unknown/empty follow-up scenario selection');
assert(['', 'faint-profile-initial', 'faint-dark-summary', 'unnamed-completion-group', 'unnamed-rating', 'decorative-initial-in-name', 'covered-form-save', 'untrapped-dialog', 'oversized-dialog', 'pale-selected-option', 'pale-unselected-option', 'faint-option-placeholder', 'faint-option-letter', 'unnamed-option-input', 'wrong-option-radio-language', 'invisible-option-focus', 'undersized-option-radio'].includes(fault), 'Unknown follow-up browser fault');
await mkdir(output, { recursive: true });
const rows: { name: string; passed: boolean; detail?: unknown }[] = [];
const rgba = (css: string) => { const values = css.match(/[\d.]+/g)?.map(Number); assert(values && values.length >= 3, `Unresolved colour ${css}`); return values; };
const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const contrast = (foreground: string, background: string) => { const fg = rgba(foreground), bg = rgba(background), alpha = fg[3] ?? 1; const a = luminance(fg.slice(0, 3).map((value, index) => value * alpha + bg[index] * (1 - alpha))), b = luminance(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let activeName = 'startup';
try {
  for (const scenario of matrix) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, isMobile: scenario.width < 1000, hasTouch: true, reducedMotion: 'reduce', timezoneId: 'Asia/Dhaka' });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort('internetdisconnected'));
    const data = freshData(); data.settings.language = scenario.language; data.settings.theme = scenario.theme; data.settings.fontScale = 'lg';
    data.notes['2026-11-19'] = 'Preserve actual study history';
    const questions = Array.from({ length: 5 }, (_, index) => ({ id: `followup-browser-${index}`, question: `Original synthetic history question ${index}`, subject: 'physics' as const, chapterId: 'physics-1-7', options: ['A', 'B', 'C', 'D'], answer: 0, createdAt: '2026-11-19T03:00:00Z' }));
    const fixture = saveExamSession(data, { id: 'followup-browser-paper', mode: 'subject', subject: 'physics', title: 'Original five-question paper', questions, answers: Object.fromEntries(questions.map(question => [question.id, 0])), durationMin: 5, timeTakenSec: 120, date: '2026-11-19' });
    fixture.questions = fixture.questions.slice(0, 3);
    assert.equal(parseBackup(JSON.stringify(fixture)).questions.length, 3, 'Broken fixture must not fall back to a fresh profile');
    await page.addInitScript(({ data, key }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { data: fixture, key: STORAGE_KEY });
    await page.clock.install({ time: new Date('2026-11-20T03:00:00Z') });
    const state = async () => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
    const probe = async (name: string, action: () => Promise<unknown>) => { activeName = `${scenario.id}/${name}`; const detail = await action(); rows.push({ name: activeName, passed: true, detail }); console.log(`PASS ${activeName}`); };
    const goto = async (route: string, titleEn: string, titleBn: string) => {
      await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' }); await page.locator('main .view').waitFor();
      assert.equal(await page.locator('.breadcrumb strong').innerText(), scenario.language === 'en' ? titleEn : titleBn, 'Wrong rendered route');
      assert.equal(await page.locator('html').getAttribute('data-font'), 'lg', 'Large-text preference did not load');
      await page.evaluate(async () => { await document.fonts.ready; });
    };
    const tap = async (target: Locator) => {
      await target.scrollIntoViewIfNeeded();
      const hit = await target.evaluate(element => { const r = element.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { reachable: !!top && (top === element || element.contains(top)), target: r.toJSON(), blocker: top?.outerHTML.slice(0, 400), viewport: { width: innerWidth, height: innerHeight } }; });
      assert(hit.reachable, `Touch target is covered: ${JSON.stringify(hit)}`); await target.tap();
    };
    const trap = async () => {
      if (fault === 'untrapped-dialog') await page.evaluate(() => document.addEventListener('keydown', event => { if (event.key === 'Tab') event.stopImmediatePropagation(); }, { capture: true }));
      const controls = page.getByRole('dialog').locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]');
      assert(await controls.count() > 1, 'Dialog lacks keyboard controls');
      await controls.first().focus(); await page.keyboard.press('Shift+Tab');
      assert(await controls.last().evaluate(element => document.activeElement === element), 'Reverse Tab did not wrap to the dialog’s last control');
      await page.keyboard.press('Tab'); assert(await controls.first().evaluate(element => document.activeElement === element), 'Tab did not wrap to the dialog’s first control');
    };
    const geometry = async () => {
      if (fault === 'oversized-dialog' && await page.getByRole('dialog').count()) await page.addStyleTag({ content: '.modal{width:120vw!important;max-width:none!important;flex-shrink:0!important}' });
      const measurement = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, dialog: document.querySelector('[role="dialog"]')?.getBoundingClientRect().toJSON() }));
      if (measurement.dialog) assert(measurement.dialog.left >= -1 && measurement.dialog.right <= measurement.width + 1, `Dialog exceeds the viewport: ${JSON.stringify(measurement)}`);
      assert(measurement.scrollWidth <= measurement.width + 1, `Horizontal overflow: ${JSON.stringify(measurement)}`);
      return measurement;
    };
    const review = async (chapter: boolean) => {
      if (fault === 'faint-profile-initial') await page.addStyleTag({ content: '.topbar-avatar{color:#8a8067!important;background:#ece9df!important}' });
      if (fault === 'faint-dark-summary') await page.addStyleTag({ content: '.syllabus-summary{background:#1a241e!important}.syllabus-summary strong{color:#5b744f!important}' });
      if (fault === 'unnamed-completion-group') await page.locator('.filter-bar .segmented[aria-label]').evaluate(element => element.removeAttribute('role'));
      if (fault === 'unnamed-rating' && chapter) await page.locator('.chapter-plan-strip .star-badge').evaluate(element => element.removeAttribute('role'));
      if (fault === 'decorative-initial-in-name') await page.locator('.topbar-avatar span').evaluate(element => element.removeAttribute('aria-hidden'));
      const colours = await page.evaluate(() => ({
        profile: { foreground: getComputedStyle(document.querySelector('.topbar-avatar')!).color, background: getComputedStyle(document.querySelector('.topbar-avatar')!).backgroundColor },
        summary: [...document.querySelectorAll('.syllabus-summary strong')].map(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element.closest('.syllabus-summary')!).backgroundColor })),
      }));
      const ratios = { profile: contrast(colours.profile.foreground, colours.profile.background), summary: colours.summary.map(pair => contrast(pair.foreground, pair.background)) };
      assert(ratios.profile >= 4.5, `Profile initial contrast below 4.5:1: ${ratios.profile}`);
      assert.equal(ratios.summary.length, 5); assert(ratios.summary.every(ratio => ratio >= 4.5), `Summary number contrast below 4.5:1: ${ratios.summary}`);
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const axe = await page.evaluate(async () => (window as unknown as { axe: { run: (root: Document, options: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, iframes: false, resultTypes: ['violations', 'incomplete'] }));
      await writeFile(`${output}/${scenario.id}-${chapter ? 'chapter' : 'syllabus'}-axe.json`, JSON.stringify(axe, null, 2));
      assert.equal(axe.violations.length, 0, `Confirmed axe violation: ${axe.violations.map(rule => rule.id)}`);
      // Axe 4.14 returns incomplete before comparing a one-character Bengali
      // initial, even when it is explicitly decorative. Check this exact case
      // independently; keep it in the report, never turn all incompletes green.
      const profile = page.locator('.topbar-avatar');
      assert.equal(await profile.getAttribute('aria-label'), scenario.language === 'en' ? 'Profile & settings' : 'প্রোফাইল ও সেটিংস', 'Profile button lacks its descriptive name');
      assert.equal(await profile.locator('span').getAttribute('aria-hidden'), 'true', 'Profile initial must be explicitly decorative');
      const semantics = axe.incomplete.flatMap(rule => ['aria-prohibited-attr', 'label-content-name-mismatch'].includes(rule.id) ? rule.nodes.filter(node => !(rule.id === 'label-content-name-mismatch' && node.target.length === 1 && node.target[0] === '.topbar-avatar')).map(node => ({ rule: rule.id, target: node.target })) : []);
      assert.equal(semantics.length, 0, `Unresolved semantic review: ${JSON.stringify(semantics)}`);
      return { ratios, ...await geometry(), manuallyReviewedProfileInitial: true, remainingManualReview: axe.incomplete.map(rule => ({ rule: rule.id, nodes: rule.nodes.length })) };
    };
    await goto('syllabus', 'Syllabus', 'সিলেবাস');
    await probe('review-short-text-and-filter-semantics', () => review(false));
    const chapter = page.locator('.chapter-row').first(); await tap(chapter); await page.getByRole('dialog').waitFor();
    await probe('review-chapter-rating-and-keyboard-loop', async () => { const detail = await review(true); await trap(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' }); assert(await chapter.evaluate(element => document.activeElement === element), 'Chapter focus was not restored'); return detail; });
    if (!reviewOnly) {
      await goto('practice', 'Practice', 'অনুশীলন');
      const add = page.locator('.question-manage .button'); await tap(add); await page.getByRole('dialog').waitFor();
      await page.setViewportSize({ width: scenario.width, height: Math.min(scenario.height, 360) });
      const optionColours = async (phase: 'empty' | 'typed' | 'reselected') => {
        const faultStyles: Record<string, string> = {
          'pale-selected-option': '.option-input.selected{background:#f4f9ed!important}',
          'pale-unselected-option': '.option-input:not(.selected){background:#fcfdf9!important}',
          'faint-option-placeholder': '.option-input>input::placeholder{color:#a1a99f!important;opacity:1!important}',
          'faint-option-letter': '.option-input>span{color:#8a9c7d!important}',
          'invisible-option-focus': '.option-input:focus-within{outline:none!important;box-shadow:none!important}',
          'undersized-option-radio': '.option-input>input[type=radio]{width:16px!important;height:16px!important;min-height:0!important}',
        };
        if (faultStyles[fault]) await page.addStyleTag({ content: faultStyles[fault] });
        const colours = await page.locator('.option-input').evaluateAll(rows => {
          const paint = {
            rgba(css: string) { return css.match(/[\d.]+/g)!.map(Number); },
            background(element: Element) {
              const layers: number[][] = [];
              for (let parent: Element | null = element; parent; parent = parent.parentElement) layers.unshift(this.rgba(getComputedStyle(parent).backgroundColor));
              // These solid row surfaces have transparent text inputs. Composite
              // their ancestor colours instead of pretending transparent is black.
              const rgb = layers.reduce((under, over) => under.map((value, index) => over[index] * (over[3] ?? 1) + value * (1 - (over[3] ?? 1))), [255, 255, 255]);
              return `rgb(${rgb.join(',')})`;
            },
            sample(element: Element, pseudo?: string) {
              const style = getComputedStyle(element, pseudo), channels = this.rgba(style.color);
              let opacity = pseudo ? Number(style.opacity) : 1;
              for (let parent: Element | null = element; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
              return { foreground: `rgba(${channels.slice(0, 3).join(',')},${(channels[3] ?? 1) * opacity})`, background: this.background(element) };
            },
          };
          return rows.map(row => {
            const input = row.querySelector('input:not([type=radio])')!, radio = row.querySelector('input[type=radio]')!, rect = radio.getBoundingClientRect(), style = getComputedStyle(row);
            let zoom = 1; for (let parent: Element | null = row; parent; parent = parent.parentElement) zoom *= parseFloat(getComputedStyle(parent).zoom) || 1;
            // Chromium rounds outlines to painted pixels under CSS zoom. Keep
            // both values so a real 2px ring is not rejected as 1.78 CSS px.
            return { selected: row.classList.contains('selected'), value: (input as HTMLInputElement).value, text: paint.sample(input), placeholder: paint.sample(input, '::placeholder'), letter: paint.sample(row.querySelector('span')!), radio: { width: rect.width, height: rect.height }, focus: { within: row.contains(document.activeElement), style: style.outlineStyle, computedWidth: parseFloat(style.outlineWidth), zoom, width: parseFloat(style.outlineWidth) * zoom, colour: style.outlineColor, background: paint.background(row) } };
          });
        });
        assert.equal(colours.length, 4, 'MCQ colour guard requires all four options'); assert.equal(colours.filter(row => row.selected).length, 1, 'MCQ needs one selected answer');
        const ratios = colours.map(row => ({ ...row, textRatio: contrast(row.text.foreground, row.text.background), placeholderRatio: contrast(row.placeholder.foreground, row.placeholder.background), letterRatio: contrast(row.letter.foreground, row.letter.background) }));
        await writeFile(`${output}/${scenario.id}-options-${phase}.json`, JSON.stringify(ratios, null, 2));
        for (const row of ratios) {
          assert(row.textRatio >= 4.5, `MCQ option value contrast below 4.5:1 (${phase}, selected=${row.selected}): ${row.textRatio}`);
          assert(row.placeholderRatio >= 4.5, `MCQ option placeholder contrast below 4.5:1 (${phase}): ${row.placeholderRatio}`);
          assert(row.letterRatio >= 4.5, `MCQ option letter contrast below 4.5:1 (${phase}): ${row.letterRatio}`);
          assert(row.radio.width >= 24 && row.radio.height >= 24, `MCQ radio touch target below 24px: ${JSON.stringify(row.radio)}`);
          if (phase !== 'empty' && row.focus.within) assert(row.focus.style !== 'none' && row.focus.width >= 1.95 && contrast(row.focus.colour, row.focus.background) >= 3, 'MCQ option focus indicator is not visible');
        }
        if (phase !== 'empty') assert(ratios.some(row => row.focus.within), 'MCQ focus guard requires a focused option');
        return ratios;
      };
      await probe('mcq-option-colours-and-localised-control-names', async () => {
        const colours = await optionColours('empty');
        if (fault === 'unnamed-option-input') await page.locator('.option-input input:not([type=radio])').first().evaluate(element => element.removeAttribute('aria-label'));
        if (fault === 'wrong-option-radio-language') await page.locator('.option-input input[type=radio]').first().evaluate(element => element.setAttribute('aria-label', 'সঠিক উত্তর ক'));
        for (let index = 0; index < 4; index++) {
          const letter = (scenario.language === 'en' ? ['A', 'B', 'C', 'D'] : ['ক', 'খ', 'গ', 'ঘ'])[index];
          const name = scenario.language === 'en' ? `Option ${letter}` : `অপশন ${letter}`, answerName = scenario.language === 'en' ? `Correct answer ${letter}` : `সঠিক উত্তর ${letter}`;
          const input = page.locator('.option-input input:not([type=radio])').nth(index), radio = page.locator('.option-input input[type=radio]').nth(index);
          assert.equal(await input.getAttribute('aria-label'), name, 'MCQ option lacks its localised accessible name');
          assert.equal(await input.getAttribute('placeholder'), name, 'MCQ option lacks its localised placeholder');
          assert.equal(await radio.getAttribute('aria-label'), answerName, 'MCQ answer radio lacks its localised accessible name');
          assert.equal(await page.getByRole('dialog').getByRole('textbox', { name, exact: true }).count(), 1);
          assert.equal(await page.getByRole('dialog').getByRole('radio', { name: answerName, exact: true }).count(), 1);
        }
        return { colours, namedOptions: 4, namedRadios: 4 };
      });
      await probe('large-text-reduced-height-form-touch-and-keyboard-save', async () => {
        await trap(); const dialog = page.getByRole('dialog');
        const text = `Follow-up typed question ${scenario.id}`;
        await tap(dialog.getByLabel(scenario.language === 'en' ? 'Question' : 'প্রশ্ন', { exact: true })); await page.keyboard.insertText(text);
        const options = dialog.locator('.option-input input:not([type="radio"])');
        for (let index = 0; index < 4; index++) { await tap(options.nth(index)); await page.keyboard.insertText(`Typed option ${index}`); }
        await page.screenshot({ path: `${output}/${scenario.id}-reduced-height-form.png` });
        const typedColours = await optionColours('typed');
        const chosenAnswer = dialog.locator('.option-input input[type=radio]').nth(2); await tap(chosenAnswer); assert(await chosenAnswer.isChecked(), 'Touch did not select the intended correct answer');
        const reselectedColours = await optionColours('reselected');
        const save = dialog.getByRole('button', { name: scenario.language === 'en' ? 'Save question' : 'প্রশ্ন সেভ করো' });
        await save.focus(); await save.scrollIntoViewIfNeeded();
        if (fault === 'covered-form-save') await save.evaluate(element => { const overlay = document.createElement('div'); overlay.textContent = 'Broken touch overlay'; const rect = element.getBoundingClientRect(); Object.assign(overlay.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: '99999', background: 'white' }); document.body.append(overlay); });
        const reached = await save.evaluate(element => { const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && (hit === element || element.contains(hit)); });
        assert(reached, 'Reduced-height Save is covered');
        await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor({ state: 'detached' });
        const stored = await state(); assert.equal(stored.questions.at(-1)?.question, text); assert.deepEqual(stored.questions.at(-1)?.options, ['Typed option 0', 'Typed option 1', 'Typed option 2', 'Typed option 3']); assert.equal(stored.questions.at(-1)?.answer, 2, 'The touched correct-answer choice was not saved');
        assert.deepEqual(stored.examSessions, fixture.examSessions); assert.deepEqual(stored.notes, fixture.notes);
        // The fixture freezes time: dismiss its success toast with a real tap
        // rather than treating a deliberately unexpired overlay as app failure.
        if (await page.locator('.toast button').count()) await tap(page.locator('.toast button'));
        return { viewportHeight: 360, typedOptions: 4, savedWithKeyboard: true, touchedAnswer: 2, typedColours, reselectedColours, ...await geometry() };
      });
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await goto('examsim', 'Exam simulator', 'পরীক্ষা সিমুলেটর');
      await probe('missing-history-warning-and-actual-Friday', async () => {
        const warning = page.getByRole('status', { name: scenario.language === 'en' ? 'Unavailable saved questions' : 'অনুপস্থিত সেভ করা প্রশ্ন' }); assert(await warning.isVisible());
        const friday = page.locator('.exam-week-day').filter({ has: page.locator('strong', { hasText: scenario.language === 'en' ? /^Fri$/ : /^শুক্র$/ }) });
        assert((await friday.getAttribute('class'))?.includes('weekly')); assert.equal(await friday.locator('small').innerText(), scenario.language === 'en' ? 'weekly' : 'সাপ্তাহিক');
        return geometry();
      });
      const retry = page.locator('.exam-history-row .text-button').first();
      await probe('shortened-retry-consent-cancel-and-touch-confirm', async () => {
        await tap(retry); await page.getByRole('dialog').waitFor(); await trap();
        assert.equal((await state()).activeExam, undefined, 'Retry started before consent');
        const cancel = page.getByRole('dialog').getByRole('button', { name: scenario.language === 'en' ? 'Cancel' : 'বাতিল' });
        await tap(cancel); await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal((await state()).activeExam, undefined); assert(await retry.evaluate(element => document.activeElement === element), 'Cancel failed to restore Retry focus');
        await retry.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
        await tap(page.getByRole('dialog').getByRole('button', { name: scenario.language === 'en' ? 'Retry 3 question(s)' : '৩টি প্রশ্ন আবার দাও' }));
        await page.locator('.exam-run-card').waitFor(); const stored = await state();
        assert.deepEqual(stored.activeExam?.questionIds, fixture.questions.map(question => question.id)); assert.deepEqual(stored.examSessions, fixture.examSessions);
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.exam-run-card').waitFor(); assert.deepEqual((await state()).activeExam, stored.activeExam, 'Retry lost its identity/deadline on reload');
        return { retainedQuestions: 3, originalTotal: stored.examSessions[0].total, ...await geometry() };
      });
    }
    await probe('retained-history-and-runtime-errors', async () => { const stored = await state(); assert.deepEqual(stored.examSessions, fixture.examSessions); assert.deepEqual(stored.notes, fixture.notes); assert.deepEqual(errors, []); return { pageErrors: errors.length, savedScore: stored.examSessions[0].score }; });
    await context.close();
  }
} catch (error) { rows.push({ name: activeName, passed: false, detail: error instanceof Error ? error.message : String(error) }); throw error; }
finally { await browser.close(); await writeFile(`${output}/report.json`, JSON.stringify({ base, fault, reviewOnly, scenarios: matrix, rows, passed: rows.filter(row => row.passed).length, failed: rows.filter(row => !row.passed).length, limitations: 'Automated Chromium; reduced viewport height simulates space occupied by a keyboard, not physical-device or screen-reader certification.' }, null, 2)); }
console.log(`PASS ${rows.length} follow-up browser probes.`);
