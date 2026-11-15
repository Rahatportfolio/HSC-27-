// Browser-level responsive smoke test. Set CHROMIUM_PATH to a locally installed
// Chromium/Chrome executable before running `npm run test:responsive`.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) {
  console.error('Set CHROMIUM_PATH to a Chromium/Chrome executable.');
  process.exit(1);
}

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });
  const views = ['today', 'calendar', 'syllabus', 'revision', 'timer', 'practice', 'exams', 'analytics', 'library', 'reminders', 'settings'];
  const assertFits = async label => {
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (size.scrollWidth > size.width + 1) throw new Error(`${label}: page width ${size.width}, content width ${size.scrollWidth}`);
    // Check separately laid-out text-bearing siblings, not icons or intentional absolute overlays.
    const collision = await page.evaluate(() => {
      for (const parent of document.querySelectorAll('.view *, .modal *, .live-timer-topbar')) {
        const children = [...parent.children].filter(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.position !== 'absolute' && style.position !== 'fixed' && style.visibility !== 'hidden' && style.display !== 'none' && element.tagName !== 'svg' && element.tagName !== 'INPUT' && element.textContent.trim().length > 1;
        });
        if (children.length > 25) continue;
        for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
          const a = children[i].getBoundingClientRect(), b = children[j].getBoundingClientRect();
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 3 && y > 3 && Math.min(a.width, b.width, a.height, b.height) > 10) {
            return `${parent.className}: ${children[i].textContent.trim().slice(0, 35)} / ${children[j].textContent.trim().slice(0, 35)}`;
          }
        }
      }
      return null;
    });
    if (collision) throw new Error(`${label}: overlapping elements in ${collision}`);
  };
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const view of views) {
      await page.goto(`${base}/#${view}`, { waitUntil: 'networkidle' });
      await page.evaluate(async () => { await document.fonts.ready; document.documentElement.dataset.font = 'lg'; });
      await assertFits(`${view} at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const [view, selector] of [['today', '.task-title-button'], ['today', '.global-search'], ['calendar', '.calendar-day-panel .task-title-button'], ['syllabus', '.chapter-row'], ['exams', '.page-heading .button']]) {
    await page.goto(`${base}/#${view}`, { waitUntil: 'networkidle' });
    await page.locator(selector).first().click();
    await assertFits(`${view} after ${selector}`);
  }
  await page.goto(`${base}/#today`, { waitUntil: 'networkidle' });
  await page.locator('.preset-launch-btn').first().click();
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await assertFits(`running timer at ${width}px`);
  }
  await page.goto(`${base}/#calendar`, { waitUntil: 'networkidle' });
  if (!await page.locator('.live-timer-topbar.running').isVisible()) throw new Error('Running timer disappeared after navigation');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${base}/#today`, { waitUntil: 'networkidle' });
  await page.locator('.lang-toggle-chip').click();
  await page.locator('.quick-tool-btn').nth(1).click();
  for (const view of views) {
    await page.goto(`${base}/#${view}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => { document.documentElement.dataset.font = 'lg'; });
    await assertFits(`${view}, English/dark at 320px`);
  }
  console.log('Responsive smoke test passed for 11 views, 320–768px, large text and English/dark mode.');
} finally {
  await browser?.close();
  await server.close();
}
