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
} finally {
  await browser.close();
}
