/** Explicit integration probe: real remote runtime, real model and local inference. */
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
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
  // Start a fresh JS realm in the same persistent browser context, then block
  // the network. A model already in RAM does not prove offline startup.
  const context = page.context();
  const fresh = await context.newPage();
  await fresh.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
  await fresh.evaluate(async () => { window.__ai = await import('/src/aiModel.ts'); });
  await page.close();
  await context.setOffline(true);
  const offline = await fresh.evaluate(async () => {
    await window.__ai.loadAiModel();
    return window.__ai.chatWithAi([{ role: 'user', content: 'What is water made of? Answer briefly.' }]);
  });
  if (!offline || offline.includes('মডেল কোনো উত্তর দিতে পারেনি')) throw new Error('Offline model returned an empty answer');
  console.log('Fresh offline model inference returned a nonempty answer:', offline.slice(0, 300));
} catch (error) {
  console.error('::error::AI integration failed: ' + String(error).replaceAll('\n', ' '));
  throw error;
} finally {
  await browser.close();
}
