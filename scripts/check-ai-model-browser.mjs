/** Explicit integration probe: real remote runtime, real model and local inference. */
import { chromium } from 'playwright-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'ai-model-test-'));
const options = { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] };
let context;
let stage = 'online';
try {
  context = await chromium.launchPersistentContext(profile, options);
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') console.error('browser:', message.text()); });
  page.on('pageerror', error => console.error('browser error:', error.message));
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const ai = await import('/src/aiModel.ts');
    await ai.loadAiModel();
    return ai.chatWithAi([{ role: 'user', content: 'What is water made of? Answer briefly.' }]);
  });
  if (!result || result.includes('মডেল কোনো উত্তর দিতে পারেনি')) throw new Error('Model returned an empty answer');
  console.log('Real model inference returned a nonempty answer:', result.slice(0, 300));
  // Close and reopen the browser with the same on-disk profile. A model or
  // runtime held in RAM from the first session does not prove offline startup.
  await context.close();
  context = await chromium.launchPersistentContext(profile, options);
  const fresh = await context.newPage();
  await fresh.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await fresh.evaluate(async () => { window.__ai = await import('/src/aiModel.ts'); });
  // Supply only the app's own local files through the test host after going
  // offline, as an installed APK (or a PWA precache) would. Remote runtime and
  // model requests are NOT intercepted and must come from browser cache.
  await context.route('http://127.0.0.1:3000/**', async route => {
    const response = await fetch(route.request().url());
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  stage = 'offline after browser restart';
  await context.setOffline(true);
  const offline = await fresh.evaluate(async () => {
    await window.__ai.loadAiModel();
    return window.__ai.chatWithAi([{ role: 'user', content: 'What is water made of? Answer briefly.' }]);
  });
  if (!offline || offline.includes('মডেল কোনো উত্তর দিতে পারেনি')) throw new Error('Offline model returned an empty answer');
  console.log('Fresh offline model inference returned a nonempty answer:', offline.slice(0, 300));
} catch (error) {
  console.error('::error::AI integration failed during ' + stage + ': ' + String(error).replaceAll('\n', ' '));
  throw error;
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
