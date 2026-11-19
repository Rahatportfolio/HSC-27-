/** Fail-closed controls for the supplemental axe-incomplete reviewer.
 * Deliberate faults in isolated HTML, never mutations to the user's app/data.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { AxeResults } from 'axe-core';
import { reviewIncomplete } from './review-a11y-incomplete';

const output = process.env.A11Y_REVIEWER_OUTPUT || '.cache/a11y-reviewer';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/tmp/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 800 }, reducedMotion: 'reduce' });
  await page.setContent(`<!doctype html><html><head><style>textarea::placeholder{color:#123;opacity:1}#faint-placeholder::placeholder{color:#ddd;opacity:1}</style></head><body style="margin:30px;background:white;color:#123;font:16px/1.8 Arial">
    <p id="solid">Readable solid colour</p>
    <p id="faint" style="color:#ccc">ক</p>
    <p id="nested">Readable parent <span style="color:#ddd">faint child must fail</span></p>
    <div style="position:relative"><p id="covered">Text under an unrelated cover</p><div style="position:absolute;inset:0;background:white"></div></div>
    <p id="clipped" style="width:15px;white-space:nowrap;overflow:hidden">Clipped text is not verified</p>
    <p id="gradient" style="background:linear-gradient(white,#777)">An insufficient whole-gradient bound remains unresolved</p>
    <p id="safe-gradient" style="background:linear-gradient(white,#eee)">Every supported gradient colour is safe</p>
    <p id="radial" style="background:radial-gradient(white,#eee)">Unsupported images remain unresolved</p>
    <textarea id="native-value" style="color:#123;background:white">A real native-field value</textarea>
    <textarea id="placeholder" style="background:white" placeholder="Readable native placeholder"></textarea>
    <textarea id="faint-placeholder" style="background:white" placeholder="A faint native placeholder"></textarea>
    <textarea id="empty-field" style="background:white"></textarea>
    <p id="translucent" style="opacity:.7">Opacity needs a separate review</p>
    <button id="named" aria-label="Open notes — saved notes">Open notes</button>
    <button id="misnamed" aria-label="Different action">Open notes</button>
    <p id="offscreen" style="margin-top:1800px">Readable after ordinary scroll</p>
  </body></html>`);
  const input = [
    { id: 'color-contrast', nodes: ['solid', 'faint', 'nested', 'covered', 'clipped', 'gradient', 'safe-gradient', 'radial', 'native-value', 'placeholder', 'faint-placeholder', 'empty-field', 'translucent', 'offscreen', 'solid'].map(id => ({ target: [`#${id}`] })) },
    { id: 'label-content-name-mismatch', nodes: ['named', 'misnamed'].map(id => ({ target: [`#${id}`] })) },
    { id: 'color-contrast', nodes: [{ target: ['#shadow-host', '#shadow-text'] }] },
    { id: 'other-manual-rule', nodes: [{ target: ['#solid'] }] },
  ] as unknown as AxeResults['incomplete'];
  const expected = {
    '#solid': 'verified', '#faint': 'failed', '#nested': 'failed',
    '#covered': 'unresolved', '#clipped': 'unresolved', '#gradient': 'unresolved',
    '#translucent': 'unresolved', '#offscreen': 'verified', '#named': 'verified', '#misnamed': 'failed',
    '#safe-gradient': 'verified', '#radial': 'unresolved', '#native-value': 'verified', '#placeholder': 'verified', '#faint-placeholder': 'failed', '#empty-field': 'verified',
  };
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY, nameHelper: '__name' in globalThis }));
  const reviews = await reviewIncomplete(page, 'deliberate-controls', input);
  await writeFile(`${output}/report.json`, JSON.stringify({ reviews, expected }, null, 2));
  for (const [selector, status] of Object.entries(expected)) {
    assert.equal(reviews.find(row => row.rule !== 'other-manual-rule' && row.target[0] === selector)?.status, status, selector);
  }
  assert.equal(reviews.filter(row => row.rule === 'color-contrast' && row.target[0] === '#solid').length, 1, 'Identical raw targets are explicitly deduplicated');
  assert.equal(reviews.find(row => row.target.length === 2)?.status, 'unresolved', 'Compound targets are not guessed');
  assert.equal(reviews.find(row => row.rule === 'other-manual-rule')?.status, 'unresolved', 'Unsupported rules are not skipped into passes');
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY, nameHelper: '__name' in globalThis })), before, 'Ordinary scroll and test-only helper are restored');
  console.log(`PASS ${Object.keys(expected).length + 4} supplemental-reviewer positive/negative controls; every raw target retained in report.`);
} finally { await browser.close(); }
