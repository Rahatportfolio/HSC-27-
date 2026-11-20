/** Production browser proof: real model, persistent cache, cold offline restart. */
import { chromium } from 'playwright-core';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'ai-model-test-'));
const fixture = await readFile('android/app/src/androidTest/assets/native-personal-profile.json', 'utf8');
const options = { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] };
let context;
let stage = 'online';
async function openAndAsk(page) {
  await page.goto('http://127.0.0.1:3000/#brain', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('.brain-view').waitFor({ timeout: 60000 });
  const enable = page.locator('.brain-welcome button.primary');
  if (await enable.isVisible()) await enable.click();
  await page.locator('.ai-modes button:nth-child(2)').click();
  await page.locator('.ai-download button').click();
  await page.locator('.ai-ready, .ai-panel .field-error').first().waitFor({ timeout: 300000 });
  if (!await page.locator('.ai-ready').isVisible()) throw new Error('Model load failed: ' + await page.locator('.ai-panel').innerText());
  await page.locator('#ai-input').fill('What is water made of? Answer briefly.');
  await page.locator('.ai-input button[type=submit]').click();
  await page.locator('.ai-message.assistant, .ai-panel .field-error').first().waitFor({ timeout: 300000 });
  const answer = await page.locator('.ai-message.assistant').first().textContent().catch(() => '');
  if (!answer || answer.includes('মডেল কোনো উত্তর দিতে পারেনি')) throw new Error('No model response: ' + await page.locator('.ai-panel').innerText());
  console.log(stage + ' model response:', answer.slice(0, 300));
}
try {
  context = await chromium.launchPersistentContext(profile, options);
  await context.addInitScript(raw => {
    if (!localStorage.getItem('hsc27-prostuti-v1')) {
      localStorage.setItem('hsc27-prostuti-v1', raw);
      localStorage.setItem('hsc27-prostuti-v1-saved-at', new Date().toISOString());
    }
  }, fixture);
  const page = await context.newPage();
  // Make sure the installed service worker owns the tab before AI files load;
  // those large optional files are cached on demand, not on first install.
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 60000 });
  await openAndAsk(page);
  await context.close();
  stage = 'offline after browser restart';
  context = await chromium.launchPersistentContext(profile, options);
  await context.setOffline(true);
  const fresh = await context.newPage();
  await openAndAsk(fresh);
} catch (error) {
  console.error('::error::AI integration failed during ' + stage + ': ' + String(error).replaceAll('\n', ' '));
  throw error;
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
