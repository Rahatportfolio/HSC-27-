/** Touch/geometry regression for the Android screenshots, not a DOM visibility smoke test.
 * CHROMIUM_PATH is required. BASE_URL optionally targets a built preview; otherwise
 * a temporary Vite server is used. All fixtures live in isolated browser storage.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { createServer } from 'vite';
import { freshData, STORAGE_KEY } from '../src/planner';
import { freshTimerState, TIMER_KEY } from '../src/hooks';
import { parseBackup } from '../src/storage';
import { personalDataFixture } from '../src/test/personalRoutineFixture';

if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to an installed Chromium/Chrome executable.');
const output = process.env.MOBILE_EVIDENCE || '.cache/mobile-shell/browser';
await mkdir(output, { recursive: true });
const server = process.env.BASE_URL ? undefined : await createServer({ server: { host: '0.0.0.0', port: 0 } });
await server?.listen();
const address = server?.httpServer?.address();
const base = process.env.BASE_URL || `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results: { name: string; passed: boolean; detail?: string; measurement?: unknown }[] = [];
const failures: string[] = [];
const selected = process.env.MOBILE_CASE;
const mutation = process.env.MOBILE_MUTATION;
const mutations: Record<string, string> = {
  'no-card-inset': '.home-progress-card { padding: 0 !important; }',
  'no-card-gap': '.home-progress-card { margin-bottom: 0 !important; }',
  'oversized-ring': '.timer-main-card .progress-ring > svg { width: 270px !important; height: 270px !important; pointer-events: auto !important; }',
  'unsafe-header': '.top-chrome-stack { padding-top: 0 !important; } .top-chrome-stack .topbar, .live-timer-topbar { padding-top: 0 !important; min-height: 60px !important; }',
  'nonsticky-clock': '.top-chrome-stack { position: relative !important; }',
  'tiny-clock': '.live-clock-chip strong { font-size: 9px !important; }',
  'covered-clock': '.live-timer-clocks::after { content: ""; position: fixed; top: 0; left: 0; width: 100vw; height: 180px; z-index: 9999; background: white; }',
  'clipped-clock': '.live-clock-chip { height: 24px !important; overflow: hidden !important; }',
  'unsafe-bottom': '.mobile-bottom-nav { padding-bottom: 0 !important; }',
  'no-scroll-clearance': 'html { scroll-padding-top: 0 !important; scroll-padding-bottom: 0 !important; }',
  'wrong-status-background': '.top-chrome-stack { background: #14271f !important; }',
  'faint-nav-label': '.mobile-bottom-nav button:not(.active) { color: #a4b297 !important; }',
  'faint-active-nav-label': '.mobile-bottom-nav button.active { color: #62864d !important; }',
  'faint-dark-nav-label': '[data-theme="dark"] .mobile-bottom-nav button:not(.active) { color: #4e6155 !important; }',
  'faint-dark-active-nav-label': '[data-theme="dark"] .mobile-bottom-nav button.active { color: #236149 !important; }',
  'wrong-nav-surface': '[data-theme="dark"] .mobile-bottom-nav { background: #000 !important; }',
  'translucent-nav-label': '.mobile-bottom-nav button { opacity: .5 !important; }',
  'colliding-toolbar': '.topbar-progress-pill { display: inline-flex !important; }',
};
if (mutation && !mutations[mutation]) throw new Error(`Unknown mobile-shell mutation: ${mutation}`);

async function probe(name: string, action: () => Promise<unknown>) {
  if (selected && !name.includes(selected)) return;
  try { const measurement = await action(); results.push({ name, passed: true, measurement }); console.log(`PASS ${name}`); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); results.push({ name, passed: false, detail }); failures.push(`${name}: ${detail}`); console.error(`FAIL ${name}: ${detail}`); }
}

async function prepare(page: Page, view = 'today', reload = false) {
  await page.goto(`${base}/#${view}`, { waitUntil: 'networkidle' });
  if (reload) await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.setProperty('--safe-area-inset-top', '36px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px');
    document.getElementById('mobile-regression-mutation')?.remove();
    const style = document.createElement('style'); style.id = 'mobile-regression-mutation'; document.head.append(style);
  });
  if (mutation) await page.locator('#mobile-regression-mutation').evaluate((e, css) => { e.textContent = css; }, mutations[mutation]);
}

async function tapVisible(page: Page, selector: string) {
  const target = page.locator(selector);
  await target.evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const point = await target.evaluate(e => {
    const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      visible: !!hit && (hit === e || e.contains(hit)), blocker: hit?.tagName + '.' + hit?.getAttribute('class'),
      target: r.toJSON(), hit: hit?.outerHTML.slice(0, 600), hitRect: hit?.getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight },
      chrome: document.querySelector('.top-chrome-stack')?.getBoundingClientRect().toJSON(),
      navigation: document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect().toJSON(),
      padding: { top: getComputedStyle(document.documentElement).scrollPaddingTop, bottom: getComputedStyle(document.documentElement).scrollPaddingBottom },
    };
  });
  if (!point.visible) await page.screenshot({ path: `${output}/blocked-touch.png` });
  assert.ok(point.visible, `Touch target ${selector} is covered by ${point.blocker}: ${JSON.stringify(point)}`);
  await target.tap({ timeout: 2200 });
}

async function checkClock(page: Page, label: string, count = 2) {
  const measurement = await page.locator('.live-timer-topbar').evaluate(bar => {
    const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) || 0;
    const clocks = [...bar.querySelectorAll<HTMLElement>('.live-clock-chip strong')].map(e => {
      const r = e.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(e); const text = range.getBoundingClientRect();
      const visible = [0.12, 0.5, 0.88].every(x => { const hit = document.elementFromPoint(r.x + r.width * x, r.y + r.height / 2); return hit === e || !!hit && e.contains(hit); });
      let clipped = false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p), pr = p.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(s.overflowX) && (text.left < pr.left - 1 || text.right > pr.right + 1)) clipped = true;
        if (/(hidden|clip|auto|scroll)/.test(s.overflowY) && (text.top < pr.top - 1 || text.bottom > pr.bottom + 1)) clipped = true;
      }
      return { text: e.textContent, rect: r.toJSON(), glyphs: text.toJSON(), visible, clipped, font: parseFloat(getComputedStyle(e).fontSize) };
    });
    const sample = document.createElement('span'); sample.style.background = 'var(--surface, #fcfdf9)'; document.body.append(sample);
    const themeSurface = getComputedStyle(sample).backgroundColor; sample.remove();
    return { safe, width: innerWidth, height: innerHeight, bar: bar.getBoundingClientRect().toJSON(), clocks, themeSurface, statusBackground: getComputedStyle(bar.parentElement!).backgroundColor };
  });
  assert.equal(measurement.statusBackground, measurement.themeSurface, 'Status-bar background must match the theme used for native icon contrast');
  assert.equal(measurement.clocks.length, count, `${label}: missing clock`);
  for (const c of measurement.clocks) {
    assert.ok(c.font >= 16, `${label}: clock font ${c.font}px is too small on a phone`);
    assert.ok(c.rect.top >= measurement.safe - 1 && c.rect.bottom < measurement.height - 60 && c.rect.left >= 0 && c.rect.right <= measurement.width + 1, `${label}: clock outside safe viewport: ${JSON.stringify(measurement)}`);
    assert.ok(c.visible && !c.clipped, `${label}: digits are covered or cut off: ${JSON.stringify(measurement)}`);
  }
  return measurement;
}

async function checkNavigationContrast(page: Page) {
  const measurement = await page.locator('.mobile-bottom-nav').evaluate(nav => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    // Canvas resolves computed rgb()/color-mix() values to sRGB. Composite the
    // active pill and label backgrounds instead of assuming white behind text.
    // Method syntax also keeps this browser callback independent of tsx's
    // Node-only function-name helper when Playwright serialises it.
    const color = {
      rgba(css: string) {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].map((value, i) => i === 3 ? value / 255 : value);
      },
      over(front: number[], back: number[]) { return [...front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3])), 1]; },
      luminance(rgb: number[]) { return rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0); },
    };
    const style = getComputedStyle(nav);
    const sample = document.createElement('span'); sample.style.background = 'var(--surface)'; document.body.append(sample);
    const themeSurface = getComputedStyle(sample).backgroundColor; sample.remove();
    const labels = [...nav.querySelectorAll('button')].map(button => {
      const label = button.querySelector<HTMLElement>('span:last-child')!;
      const buttonStyle = getComputedStyle(button), labelStyle = getComputedStyle(label);
      const background = color.over(color.rgba(labelStyle.backgroundColor), color.over(color.rgba(buttonStyle.backgroundColor), color.rgba(style.backgroundColor)));
      const foreground = color.over(color.rgba(labelStyle.color), background), a = color.luminance(foreground), b = color.luminance(background);
      return { text: label.textContent?.trim(), active: button.classList.contains('active'), color: labelStyle.color, background, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), opacity: [style.opacity, buttonStyle.opacity, labelStyle.opacity] };
    });
    return { background: style.backgroundColor, themeSurface, labels };
  });
  // An opaque themed bar makes the contrast independent of the card/scroll
  // position underneath it, including in dark mode. Alpha colors inside it are
  // composited above; group opacity is deliberately disallowed for these tabs.
  assert.equal(measurement.background, measurement.themeSurface, 'Bottom navigation surface must follow the selected theme');
  assert.equal(measurement.labels.length, 5, 'Missing bottom navigation labels');
  assert.ok(measurement.labels.some(label => label.active) && measurement.labels.some(label => !label.active), 'Both active and inactive navigation labels must be exercised');
  for (const label of measurement.labels) {
    assert.ok(label.text, 'Bottom navigation label is empty');
    assert.ok(label.opacity.every(value => Number(value) === 1), `Bottom navigation text must not be faded by opacity: ${label.text}`);
    assert.ok(label.contrast >= 4.5, `Bottom navigation text contrast is below 4.5:1: ${JSON.stringify(label)}`);
  }
  return measurement;
}

try {
  const scenarios = [
    { width: 320, height: 760, language: 'bn' as const, theme: 'light' as const },
    { width: 360, height: 797, language: 'bn' as const, theme: 'light' as const },
    { width: 393, height: 852, language: 'bn' as const, theme: 'dark' as const },
    { width: 412, height: 915, language: 'en' as const, theme: 'light' as const },
    { width: 797, height: 393, language: 'en' as const, theme: 'dark' as const },
  ];
  for (const scenario of scenarios.filter(s => selected !== 'first-study-day-toolbar' && (!process.env.MOBILE_VIEWPORT || String(s.width) === process.env.MOBILE_VIEWPORT))) {
    const key = `${scenario.width}x${scenario.height}-${scenario.language}-${scenario.theme}`;
    const context = await browser.newContext({ viewport: scenario, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', timezoneId: 'Asia/Dhaka' });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.setDefaultNavigationTimeout(30000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-11-16T06:00:00Z') });
    const data = freshData(); data.settings.fontScale = 'lg'; data.settings.language = scenario.language; data.settings.theme = scenario.theme;
    data.notes['2026-11-15'] = 'Preserve my real note';
    data.completed['legacy-mobile-evidence'] = '2026-11-15T08:00:00Z';
    data.studySessions = [{ id: 'mobile-history', date: '2026-11-15', at: '2026-11-15T08:00:00Z', minutes: 17, subject: 'physics', mode: 'stopwatch' }];
    await page.addInitScript(({ data, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { data, key: STORAGE_KEY });
    const state = async () => parseBackup(await page.evaluate(key => localStorage.getItem(key)!, STORAGE_KEY));
    await prepare(page);
    const original = await state();
    await probe(`${key} progress-insets-and-text`, async () => {
      const layout = await page.locator('.test-readiness-subjects').evaluate(e => {
        const card = e.closest('section')!, style = getComputedStyle(card), r = card.getBoundingClientRect(), next = card.nextElementSibling!.getBoundingClientRect();
        const text = [...card.querySelectorAll('h2, p, .test-readiness-row > span, .test-readiness-row > small')].map(el => { const range = document.createRange(); range.selectNodeContents(el); return { text: el.textContent, rect: range.getBoundingClientRect().toJSON() }; });
        return { paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight), paddingBottom: parseFloat(style.paddingBottom), gap: next.top - r.bottom, card: r.toJSON(), text };
      });
      assert.ok(layout.paddingLeft >= 12 && layout.paddingRight >= 12 && layout.paddingBottom >= 12, `Progress has no breathing room: ${JSON.stringify(layout)}`);
      assert.ok(layout.gap >= 10, `Adjacent dashboard cards touch: gap=${layout.gap}px`);
      for (const t of layout.text) assert.ok(t.rect.left >= layout.card.left + 11 && t.rect.right <= layout.card.right - 11, `Text touches/crosses progress border: ${t.text}`);
      await page.locator('.test-readiness-subjects').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${key}-progress.png` });
      return layout;
    });
    await probe(`${key} safe-toolbar-and-bottom-nav`, async () => {
      const layout = await page.evaluate(() => {
        const menu = document.querySelector('.topbar .mobile-menu')!.getBoundingClientRect();
        const bottom = document.querySelector('.mobile-bottom-nav')!, style = getComputedStyle(bottom);
        const sample = document.createElement('span'); sample.style.background = 'var(--surface, #fcfdf9)'; document.body.append(sample);
        const themeSurface = getComputedStyle(sample).backgroundColor; sample.remove();
        return { menu: menu.toJSON(), bottomPadding: parseFloat(style.paddingBottom), pointer: matchMedia('(pointer: coarse)').matches, scrollWidth: document.documentElement.scrollWidth, width: innerWidth, themeSurface, statusBackground: getComputedStyle(document.querySelector('.top-chrome-stack')!).backgroundColor };
      });
      assert.equal(layout.pointer, true, 'Not a realistic touch context');
      assert.equal(layout.statusBackground, layout.themeSurface, 'Status-bar background must match the theme used for native icon contrast');
      assert.ok(layout.menu.top >= 36, `Toolbar is under the status bar: ${JSON.stringify(layout)}`);
      assert.ok(layout.bottomPadding >= 24, `Gesture bar padding was overridden: ${JSON.stringify(layout)}`);
      assert.ok(layout.scrollWidth <= layout.width + 1, `Horizontal overflow: ${JSON.stringify(layout)}`);
      return layout;
    });
    await probe(`${key} bottom-navigation-contrast`, () => checkNavigationContrast(page));
    await prepare(page, 'timer');
    await probe(`${key} actual-touch-start`, async () => {
      await tapVisible(page, '.timer-main-button');
      await page.waitForSelector('.live-timer-topbar.running', { timeout: 2200 });
      return { startedWithRealTouch: true };
    });
    // Independent persisted-session fixture: clock coverage must still run if Start
    // itself is broken. It must never turn a failed touch probe into a success.
    const timer = { ...freshTimerState(), mode: 'countdown' as const, phase: 'none' as const, durationMin: 180, accumulatedMs: 3_605_000, running: true, startedAt: new Date('2026-11-16T06:00:00Z').getTime(), label: 'দীর্ঘ অধ্যায়ের ক্লাস ও অনুশীলন — long saved session' };
    await page.evaluate(({ timer, key }) => localStorage.setItem(key, JSON.stringify(timer)), { timer, key: TIMER_KEY });
    await prepare(page, 'today', true);
    await probe(`${key} running-clock`, async () => {
      const start = await checkClock(page, key);
      const elapsed = await page.locator('.live-clock-chip.elapsed strong').innerText();
      await page.clock.runFor(2000);
      assert.notEqual(await page.locator('.live-clock-chip.elapsed strong').innerText(), elapsed, 'Clock digits do not tick');
      await page.screenshot({ path: `${output}/${key}-running.png` });
      return start;
    });
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    await probe(`${key} scrolled-clock-and-controls`, async () => {
      assert.ok(await page.evaluate(() => scrollY > 100), 'Did not actually scroll');
      const m = await checkClock(page, `${key} scrolled`);
      await page.locator('.live-btn.toggle').tap({ timeout: 2200 });
      assert.equal(await page.locator('.live-timer-topbar.paused').count(), 1, 'Pause could not be tapped');
      const paused = await page.locator('.live-clock-chip.elapsed strong').innerText();
      await page.clock.runFor(3000);
      assert.equal(await page.locator('.live-clock-chip.elapsed strong').innerText(), paused, 'Paused digits still tick');
      await checkClock(page, `${key} paused`);
      await page.screenshot({ path: `${output}/${key}-scrolled.png` });
      await page.locator('.live-btn.toggle').tap({ timeout: 2200 });
      assert.equal(await page.locator('.live-timer-topbar.running').count(), 1, 'Resume could not be tapped');
      return m;
    });
    await prepare(page, 'syllabus');
    await probe(`${key} navigated-and-open-clock`, async () => {
      const m = await checkClock(page, `${key} syllabus`);
      await page.locator('.live-timer-indicator').tap({ timeout: 2200 });
      await page.waitForSelector('.timer-view', { timeout: 2200 });
      // A lucky centre scroll can leave this button tappable even with no scroll
      // padding. Independently verify clearance against actual occupied chrome.
      await page.clock.runFor(100);
      const clearance = await page.evaluate(() => ({
        top: document.querySelector('.top-chrome-stack')!.getBoundingClientRect().height,
        bottom: document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect().height,
        topPadding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
        bottomPadding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
      }));
      assert.ok(clearance.topPadding >= clearance.top - 1 && clearance.bottomPadding >= clearance.bottom - 1, `Measured scroll clearance is smaller than fixed chrome: ${JSON.stringify(clearance)}`);
      await tapVisible(page, '.timer-main-button');
      assert.equal(await page.locator('.live-timer-topbar.paused').count(), 1, 'Main Pause was blocked by the SVG');
      return { ...m, clearance };
    });
    const stopwatch = { ...timer, mode: 'stopwatch' as const, running: false, startedAt: null };
    await page.evaluate(({ timer, key }) => localStorage.setItem(key, JSON.stringify(timer)), { timer: stopwatch, key: TIMER_KEY });
    await prepare(page, 'calendar', true);
    await probe(`${key} paused-stopwatch`, () => checkClock(page, `${key} stopwatch`, 1));
    await probe(`${key} retained-data-and-browser-errors`, async () => {
      const saved = await state();
      assert.deepEqual(saved.settings, original.settings);
      assert.deepEqual(saved.notes, original.notes);
      assert.deepEqual(saved.completed, original.completed);
      assert.deepEqual(saved.studySessions, original.studySessions);
      assert.deepEqual(errors, []);
      return { preserved: true };
    });
    await context.close();
  }
  const legacyFirstDay = freshData(); legacyFirstDay.settings.startDate = '2026-11-20'; legacyFirstDay.settings.boostStartDate = '2026-12-07';
  for (const profile of [{ name: 'first-study-day-toolbar', data: legacyFirstDay }, { name: 'first-study-day-toolbar-personal', data: personalDataFixture() }]) await probe(profile.name, async () => {
    // Before-start profiles do not show the daily progress pill. Exercise saved
    // legacy AND S profiles on their first study day, with the PWA install button.
    // Empty storage correctly opens availability setup and has no assigned work;
    // first-launch onboarding itself is covered by check-personal-routine.ts.
    const context = await browser.newContext({ viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    try {
      profile.data.settings.fontScale = 'lg';
      await context.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data: profile.data });
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-11-20T06:00:00Z') });
      await prepare(page);
      await page.evaluate(() => {
        document.documentElement.dataset.font = 'lg';
        const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
        event.prompt = async () => {}; event.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(event);
      });
      await page.waitForSelector('.install-app-btn');
      // The personal S-home is code-split and may mount just after chrome does.
      await page.waitForSelector(profile.data.personalRoutine ? '.personal-home' : '.today-view');
      assert.equal(await page.locator('.personal-home').count(), profile.data.personalRoutine ? 1 : 0, 'Wrong first-study-day profile');
      assert.equal(await page.locator('.topbar-progress-pill').count(), 1, 'First-day progress state was not exercised');
      const layout = await page.locator('.topbar').evaluate(bar => [...bar.querySelectorAll('button')].map(e => ({ name: e.getAttribute('aria-label') || e.className, rect: e.getBoundingClientRect().toJSON() })).filter(e => e.rect.width && e.rect.height));
      for (let i = 0; i < layout.length; i++) for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i].rect, b = layout[j].rect;
        assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1, `Toolbar buttons overlap: ${layout[i].name} / ${layout[j].name}`);
      }
      assert.ok(await page.locator('.global-search').evaluate(e => e.getBoundingClientRect().width >= 32), 'Search shrank below a usable touch target');
      await page.screenshot({ path: `${output}/${profile.name}.png` });
      return layout;
    } finally { await context.close(); }
  });
  assert.ok(results.length > 0, 'No mobile shell checks were selected');
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ mutation: mutation || null, results, failures }, null, 2));
  await browser.close();
  await server?.close();
}
if (failures.length) throw new Error(`${failures.length} mobile shell probes failed. See ${output}/results.json`);
console.log(`Mobile shell: ${results.length} touch/occlusion/safe-inset checks passed.`);
