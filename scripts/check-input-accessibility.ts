/** Native fields, not just DOM text: real Chromium composited contrast,
 * keyboard focus, permanent search labels and proxy file-button reachability.
 * Isolated synthetic profiles only; this does not certify WCAG or OEM keyboards.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Locator } from 'playwright-core';
import { freshData, STORAGE_KEY } from '../src/planner';
import { parseBackup } from '../src/storage';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const output = process.env.INPUT_A11Y_OUTPUT || '.cache/input-accessibility';
const fault = process.env.INPUT_A11Y_FAULT || '';
const routeIds = ['today', 'calendar', 'syllabus', 'videos', 'studySystem', 'scanner', 'pdfs', 'testprep', 'practice', 'flashcards', 'revision', 'examsim', 'weakness', 'heatmap', 'backlog', 'exams', 'timer', 'analytics', 'library', 'reminders', 'audit', 'storage', 'settings'];
const scenarios = [
  { id: '320-light-en', width: 320, height: 760, theme: 'light', language: 'en' },
  { id: '320-dark-bn', width: 320, height: 760, theme: 'dark', language: 'bn' },
  { id: '393-dark-en', width: 393, height: 852, theme: 'dark', language: 'en' },
  { id: '393-light-bn', width: 393, height: 852, theme: 'light', language: 'bn' },
  { id: '797-dark-en', width: 797, height: 393, theme: 'dark', language: 'en' },
  { id: '797-light-bn', width: 797, height: 393, theme: 'light', language: 'bn' },
  { id: '1280-light-en', width: 1280, height: 900, theme: 'light', language: 'en' },
  { id: '1280-dark-bn', width: 1280, height: 900, theme: 'dark', language: 'bn' },
] as const;
const selection = process.env.INPUT_A11Y_SCENARIOS?.split(',');
const matrix = scenarios.filter(scenario => !selection || selection.includes(scenario.id));
const routes = process.env.INPUT_A11Y_ROUTES?.split(',') || routeIds;
const checks = process.env.INPUT_A11Y_CHECKS?.split(',') || ['fields', 'note', 'date', 'flashcards', 'backup', 'backup-actions'];
assert(matrix.length && (!selection || selection.every(id => matrix.some(scenario => scenario.id === id))), 'Unknown scenario selection');
assert(routes.length && routes.every(route => routeIds.includes(route)), 'Unknown route selection');
assert(checks.length && checks.every(check => ['fields', 'note', 'date', 'flashcards', 'backup', 'backup-actions'].includes(check)), 'Unknown check selection');
assert(['', 'faint-note-placeholder', 'faint-native-value', 'faint-native-placeholder', 'invisible-native-focus', 'invisible-search-focus', 'invisible-date-focus', 'faint-button-focus', 'unnamed-flashcard-search', 'wrong-flashcard-search-language', 'invisible-json-stop', 'broken-json-button', 'lost-saved-note', 'study-date-changes-plan-start', 'squeezed-backup-actions', 'wrong-native-colour-scheme'].includes(fault), 'Unknown native-field fault');
await mkdir(output, { recursive: true });
const rows: { name: string; passed: boolean; detail: unknown }[] = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let active = 'startup';
try {
  for (const scenario of matrix) {
    // Force the OS preference opposite to the explicit app theme: native picker
    // glyphs must follow the app, not disappear against an opposite UA surface.
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, colorScheme: scenario.theme === 'dark' ? 'light' : 'dark', hasTouch: true, isMobile: scenario.width < 1000, reducedMotion: 'reduce', timezoneId: 'Asia/Dhaka' });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', request => new URL(request.request().url()).origin === new URL(base).origin ? request.continue() : request.abort('internetdisconnected'));
    const data = freshData(); data.settings.startDate = '2026-11-20'; data.settings.boostStartDate = '2026-12-07'; data.settings.language = scenario.language; data.settings.theme = scenario.theme; data.settings.fontScale = 'lg';
    data.notes['2026-11-19'] = 'Keep unrelated actual-history note';
    data.flashcards = ['Alpha synthetic front', 'Beta synthetic front'].map((front, index) => ({ id: `native-field-${index}`, subject: 'physics', chapterId: 'physics-1-7', front, back: `Synthetic answer ${index}`, category: 'definition', interval: 1, dueDate: '2020-01-01', repetitions: 0, easeFactor: 2.5, createdAt: '2020-01-01T03:00:00Z' }));
    assert.equal(parseBackup(JSON.stringify(data)).flashcards.length, 2, 'Fixture must survive validation');
    const expectedNotes = { ...data.notes };
    await page.addInitScript(({ data, key }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { data, key: STORAGE_KEY });
    await page.clock.install({ time: new Date('2026-11-20T03:00:00Z') });
    const stored = async () => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
    const probe = async (name: string, action: () => Promise<unknown>) => { active = `${scenario.id}/${name}`; const detail = await action(); rows.push({ name: active, passed: true, detail }); console.log(`PASS ${active}`); };
    const tap = async (target: Locator) => {
      await target.scrollIntoViewIfNeeded();
      const hit = await target.evaluate(element => { const rect = element.getBoundingClientRect(), top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return { reachable: !!top && (top === element || element.contains(top)), blocker: top?.outerHTML.slice(0, 300) }; });
      assert(hit.reachable, `Field touch target is covered: ${JSON.stringify(hit)}`); await target.tap();
    };
    const sample = async (target: Locator) => target.evaluate(element => {
      // Object methods avoid transpiler name-helper references in page.evaluate.
      const paint = {
        rgba(css: string) { return css.match(/[\d.]+/g)!.map(Number); },
        luminance(rgb: number[]) { return rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0); },
        ratio(fg: number[], bg: number[]) { const a = this.luminance(fg), b = this.luminance(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); },
        background(element: Element) {
          const layers: number[][] = [], uncertain: string[] = [];
          for (let parent: Element | null = element; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), colour = this.rgba(style.backgroundColor); layers.unshift(colour);
            if (style.backgroundImage !== 'none') uncertain.push(`Background image on ${parent.className}`);
            if ((colour[3] ?? 1) === 1) break;
          }
          return { rgb: layers.reduce((under, over) => under.map((value, index) => over[index] * (over[3] ?? 1) + value * (1 - (over[3] ?? 1))), [255, 255, 255]), uncertain };
        },
        opacity(element: Element) { let opacity = 1; for (let parent: Element | null = element; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity); return opacity; },
        colour(element: Element, pseudo?: string) {
          const style = getComputedStyle(element, pseudo), colour = this.rgba(style.color), background = this.background(element), opacity = this.opacity(element) * (pseudo ? Number(style.opacity) : 1), alpha = (colour[3] ?? 1) * opacity;
          return { foreground: style.color, background, opacity, ratio: this.ratio(colour.slice(0, 3).map((value, index) => value * alpha + background.rgb[index] * (1 - alpha)), background.rgb) };
        },
      };
      const focus = [];
      for (let node: Element | null = element; node && focus.length < 3; node = node.parentElement) {
        const style = getComputedStyle(node); let zoom = 1;
        for (let parent: Element | null = node; parent; parent = parent.parentElement) zoom *= parseFloat(getComputedStyle(parent).zoom) || 1;
        const background = paint.background(node.parentElement || node), colour = paint.rgba(style.outlineColor), opacity = paint.opacity(node), alpha = (colour[3] ?? 1) * opacity;
        focus.push({ tag: node.tagName, className: node.className, style: style.outlineStyle, computedWidth: parseFloat(style.outlineWidth), zoom, paintedWidth: parseFloat(style.outlineWidth) * zoom, colour: style.outlineColor, background, opacity, ratio: paint.ratio(colour.slice(0, 3).map((value, index) => value * alpha + background.rgb[index] * (1 - alpha)), background.rgb) });
      }
      const input = element as HTMLInputElement;
      return { tag: element.tagName, type: input.type, nativeScheme: getComputedStyle(element).colorScheme, aria: element.getAttribute('aria-label'), placeholder: input.placeholder || '', value: input.value, focusVisible: element.matches(':focus-visible'), text: paint.colour(element), hint: input.placeholder ? paint.colour(element, '::placeholder') : null, focus, html: element.outerHTML.slice(0, 400) };
    });
    const visibleFocus = async (target: Locator, message: string) => {
      const result = await sample(target);
      assert(result.focusVisible, `${message}: field did not enter keyboard-focus mode`);
      assert(result.focus.some(ring => ring.style !== 'none' && ring.paintedWidth >= 1.95 && ring.opacity >= .99 && ring.background.uncertain.length === 0 && ring.ratio >= 3), `${message}: no opaque 2px, 3:1 outline on the focused field or its visible wrapper: ${JSON.stringify(result.focus)}`);
      return result;
    };
    for (const route of routes) {
      await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' }); await page.locator('main .view').waitFor();
      assert.equal(await page.evaluate(() => location.hash), `#${route}`, 'Unexpected route fallback');
      assert.equal(await page.locator('html').getAttribute('data-font'), 'lg');
      await page.evaluate(async () => { await document.fonts.ready; });
      const styles: Record<string, string> = {
        'faint-note-placeholder': '.note-card textarea::placeholder{color:#9aa68c!important;opacity:1!important}',
        'faint-native-value': 'main input,main textarea,main select{color:#a1a99f!important}',
        'faint-native-placeholder': 'main input::placeholder,main textarea::placeholder{color:#a1a99f!important;opacity:1!important}',
        'invisible-native-focus': 'main input:focus,main textarea:focus,main select:focus{outline:none!important;box-shadow:none!important}',
        'invisible-search-focus': '.search-field:focus-within,.search-field input:focus{outline:none!important;box-shadow:none!important}',
        'invisible-date-focus': '.daily-date-picker:focus-within{outline:none!important;box-shadow:none!important}',
        'faint-button-focus': 'button:focus-visible{outline:3px solid #8eb49b!important}',
        'wrong-native-colour-scheme': ':root{color-scheme:light!important}',
      };
      if (styles[fault]) await page.addStyleTag({ content: styles[fault] });
      if (checks.includes('note') && route === 'today') await probe('day-note-placeholder-typing-and-reload', async () => {
        const note = page.getByRole('textbox', { name: scenario.language === 'en' ? 'Day note' : 'দিনের নোট', exact: true });
        const before = await sample(note);
        assert(before.hint && before.hint.background.uncertain.length === 0 && before.hint.ratio >= 4.5, `Day-note placeholder contrast below 4.5:1: ${before.hint?.ratio}`);
        await tap(note); const text = `Synthetic saved day note ${scenario.id}`; await page.keyboard.insertText(text);
        const typed = await sample(note); assert(typed.text.ratio >= 4.5, 'Typed day note is not readable');
        if (fault === 'lost-saved-note') await page.evaluate(key => { const data = JSON.parse(localStorage.getItem(key)!); delete data.notes['2026-11-20']; localStorage.setItem(key, JSON.stringify(data)); }, STORAGE_KEY);
        assert.equal((await stored()).notes['2026-11-20'], text, 'Typed day note was not saved'); expectedNotes['2026-11-20'] = text;
        await page.reload({ waitUntil: 'domcontentloaded' }); await note.waitFor(); assert.equal(await note.inputValue(), text, 'Day note disappeared on reload');
        return { placeholder: before.hint, typed: typed.text, savedAndReloaded: true };
      });
      if (checks.includes('date') && route === 'today') await probe('study-date-visible-keyboard-focus-and-unchanged-plan-start', async () => {
        const previous = page.getByRole('button', { name: scenario.language === 'en' ? 'Previous day' : 'আগের দিন', exact: true });
        await previous.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
        const buttonFocus = await visibleFocus(previous, 'Shared button focus is not distinguishable');
        await page.keyboard.press('Tab');
        const date = page.locator('.daily-date-picker input');
        assert(await date.evaluate(element => document.activeElement === element), 'Tab did not reach the study date');
        const dateFocus = await visibleFocus(date, 'Study-date keyboard focus is invisible');
        await page.screenshot({ path: `${output}/${scenario.id}-study-date-focus.png` });
        await date.fill('2026-11-21'); await date.press('Tab'); assert.equal(await date.inputValue(), '2026-11-21');
        assert(await page.locator('.selected-date-bar').isVisible(), 'Selecting another study date did not update the page');
        if (fault === 'study-date-changes-plan-start') await page.evaluate(key => { const data = JSON.parse(localStorage.getItem(key)!); data.settings.startDate = '2026-11-21'; localStorage.setItem(key, JSON.stringify(data)); }, STORAGE_KEY);
        assert.equal((await stored()).settings.startDate, data.settings.startDate, 'Viewing another study date changed the plan start');
        await date.fill('2026-11-20'); await date.press('Tab');
        return { buttonFocus: buttonFocus.focus, dateFocus: dateFocus.focus, selectedDay: '2026-11-21', preservedPlanStart: data.settings.startDate };
      });
      if (checks.includes('flashcards') && route === 'flashcards') await probe('flashcard-permanent-name-and-filter', async () => {
        const input = page.locator('.flashcards-view .search-field input'), name = scenario.language === 'en' ? 'Search flashcards' : 'ফ্ল্যাশকার্ড খুঁজো';
        if (fault === 'unnamed-flashcard-search') await input.evaluate(element => element.removeAttribute('aria-label'));
        if (fault === 'wrong-flashcard-search-language') await input.evaluate(element => element.setAttribute('aria-label', 'ফ্ল্যাশকার্ড খুঁজো'));
        assert.equal(await input.getAttribute('aria-label'), name, 'Flashcard search lacks its permanent localised name');
        assert.equal(await page.getByRole('textbox', { name, exact: true }).count(), 1);
        assert.equal(await page.locator('.flashcard-row').count(), 2);
        await tap(input); await page.keyboard.insertText('Alpha'); assert.equal(await page.locator('.flashcard-row').count(), 1);
        assert.equal(await input.getAttribute('aria-label'), name); assert.equal(await page.locator('.flashcard-front').innerText(), 'Alpha synthetic front');
        await input.fill(''); assert.equal(await page.locator('.flashcard-row').count(), 2);
        return { name, filtered: 1, restored: 2 };
      });
      if (checks.includes('backup') && route === 'settings') await probe('json-file-keyboard-path-and-visible-button-opens-chooser', async () => {
        const input = page.getByLabel(scenario.language === 'en' ? 'Backup file' : 'ব্যাকআপ ফাইল', { exact: true });
        if (fault === 'invisible-json-stop') await input.evaluate(element => { const input = element as HTMLInputElement; input.hidden = false; input.className = 'sr-only'; input.tabIndex = 0; });
        assert(await input.evaluate(element => (element as HTMLInputElement).hidden || (element as HTMLInputElement).tabIndex < 0), 'JSON proxy creates an invisible keyboard stop');
        const button = page.getByRole('button', { name: scenario.language === 'en' ? 'Choose file' : 'ফাইল নির্বাচন', exact: true });
        await page.getByRole('button', { name: scenario.language === 'en' ? 'Share / copy' : 'শেয়ার / কপি', exact: true }).focus();
        await page.keyboard.press('Tab'); assert(await button.evaluate(element => document.activeElement === element), 'Tab reached an invisible JSON input instead of Choose file');
        const focus = await visibleFocus(button, 'Visible backup button focus is not distinguishable');
        if (fault === 'broken-json-button') await button.evaluate(element => element.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); }, { capture: true }));
        const opened = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null); await tap(button);
        const chooser = await opened; assert(chooser, 'Visible JSON button did not open the native file chooser');
        assert.equal(await chooser.element().getAttribute('accept'), '.json,application/json'); await chooser.setFiles([]);
        await page.screenshot({ path: `${output}/${scenario.id}-backup-button-focus.png` });
        return { invisibleStops: 0, realFileChooserOpenedAndCancelled: true, buttonFocus: focus.focus };
      });
      if (checks.includes('backup-actions') && route === 'settings') await probe('backup-actions-use-available-width-with-contained-labels', async () => {
        if (fault === 'squeezed-backup-actions') await page.addStyleTag({ content: '.data-actions>div>.data-action-buttons{grid-column:1!important;width:42px!important}' });
        const groups = page.locator('.data-actions>div>.data-action-buttons'); assert.equal(await groups.count(), 2);
        const measured = [];
        for (const group of await groups.all()) {
          await group.scrollIntoViewIfNeeded();
          const result = await group.evaluate(element => {
            const card = element.parentElement!, rect = element.getBoundingClientRect(), cardRect = card.getBoundingClientRect(), style = getComputedStyle(card);
            return { width: rect.width, cardDisplay: style.display, availableWidth: cardRect.width - (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)) };
          });
          assert(result.cardDisplay !== 'grid' || result.width >= result.availableWidth - 1, `Backup action group is squeezed into the icon column: ${JSON.stringify(result)}`);
          const buttons = [];
          for (const button of await group.locator('button').all()) {
            await button.scrollIntoViewIfNeeded();
            const bounds = await button.evaluate(element => {
              const button = element.getBoundingClientRect(), walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), labels = [];
              for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.trim()) { const range = document.createRange(); range.selectNodeContents(node); for (const rect of range.getClientRects()) labels.push(rect.toJSON()); }
              return { name: element.textContent, button: button.toJSON(), labels, viewportWidth: innerWidth };
            });
            assert(bounds.labels.length > 0 && bounds.labels.every(rect => rect.left >= bounds.button.left - 1 && rect.right <= bounds.button.right + 1 && rect.top >= bounds.button.top - 1 && rect.bottom <= bounds.button.bottom + 1), `Backup action label paints outside its button: ${JSON.stringify(bounds)}`);
            assert(bounds.button.left >= 0 && bounds.button.right <= bounds.viewportWidth + 1, 'Backup action exceeds the viewport');
            buttons.push(bounds);
          }
          measured.push({ ...result, buttons });
        }
        await groups.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${scenario.id}-backup-actions.png` });
        return measured;
      });
      if (checks.includes('fields')) await probe(`native-fields/${route}`, async () => {
        const fields = page.locator('main input:not([type=hidden]):not([type=file]):not(:disabled),main textarea:not(:disabled),main select:not(:disabled)');
        const measured = []; await page.keyboard.press('Tab');
        for (const field of await fields.all()) {
          if (!await field.isVisible()) continue; await field.focus(); await field.scrollIntoViewIfNeeded();
          const result = await visibleFocus(field, 'Native-field keyboard focus is not visible');
          assert.equal(result.nativeScheme, scenario.theme, 'Native control colour scheme does not match the selected app theme');
          const transparentDateProxy = await field.evaluate(element => !!element.closest('.daily-date-picker'));
          if (!transparentDateProxy && !['radio', 'checkbox', 'range', 'color'].includes(result.type)) {
            assert.equal(result.text.background.uncertain.length, 0, 'Native-field background requires manual contrast review');
            assert(result.text.opacity >= .99 && result.text.ratio >= 4.5, `Native-field value contrast below 4.5:1: ${result.text.ratio}`);
            if (result.hint) assert(result.hint.background.uncertain.length === 0 && result.hint.ratio >= 4.5, `Native-field placeholder contrast below 4.5:1: ${result.hint.ratio}`);
          }
          measured.push({ ...result, transparentDateProxy });
        }
        return { fieldCount: measured.length, fields: measured, emptyRouteState: measured.length === 0 };
      });
      const current = await stored();
      assert.deepEqual(current.notes, expectedNotes, 'Native-field checks altered unrelated daily notes');
      assert.deepEqual(current.flashcards, data.flashcards, 'Search changed stored flashcards');
      assert.equal(current.settings.startDate, data.settings.startDate, 'Native-field checks moved the plan start');
    }
    assert.deepEqual(errors, [], 'Runtime page errors during native-field review');
    await context.close();
  }
  assert(rows.length > 0, 'No applicable native-field checks were executed');
} catch (error) { rows.push({ name: active, passed: false, detail: error instanceof Error ? error.message : String(error) }); throw error; }
finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ base, fault, scenarios: matrix, systemColourSchemes: matrix.map(scenario => ({ scenario: scenario.id, system: scenario.theme === 'dark' ? 'light' : 'dark' })), routes, checks, rows, passed: rows.filter(row => row.passed).length, failed: rows.filter(row => !row.passed).length, limitations: 'Chromium synthetic profiles; visible initial native fields on 23 routes plus five targeted journeys. Not all dynamic states, physical keyboards, screen readers, full WCAG or axe-incomplete clearance.' }, null, 2));
}
console.log(`PASS ${rows.length} native-field accessibility probes.`);
