/** Reproducible browser acceptance of the production build, including lazy
 * offline navigation. Vite preview is awaited, not a guessed sleep or a dev
 * server; every child failure propagates. Each browser uses isolated fixtures.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { preview } from 'vite';
import { appendBrowserLog, browserFailureAnnotation, requireFullBrowserEnvironment } from './builtWebPolicy';

assert(process.env.CHROMIUM_PATH, 'Set CHROMIUM_PATH to an installed Chromium');
requireFullBrowserEnvironment(process.env);
const output = process.env.WEB_BROWSER_OUTPUT || '.cache/built-web';
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '0.0.0.0', port: 0, strictPort: true } });
const address = server.httpServer.address();
assert(address && typeof address === 'object', 'Production preview did not bind');
const env = {
  ...process.env, BASE_URL: `http://127.0.0.1:${address.port}`, REVIEW_INCOMPLETE: '1', A11Y_REVIEW_INCOMPLETE: '1',
  LAZY_OUTPUT: `${output}/lazy`, RESPONSIVE_OUTPUT: `${output}/responsive`,
  PERSONAL_BROWSER_OUTPUT: `${output}/personal`, BRAIN_BROWSER_OUTPUT: `${output}/brain`,
  DIALOG_BROWSER_OUTPUT: `${output}/dialog`, MOBILE_EVIDENCE: `${output}/mobile`, STUDY_BROWSER_OUTPUT: `${output}/study`,
  A11Y_OUTPUT: `${output}/accessibility`, A11Y_REVIEWER_OUTPUT: `${output}/reviewer-controls`,
  STARTUP_OUTPUT: `${output}/startup`, DATE_BROWSER_OUTPUT: `${output}/dates`, POST_RELEASE_OUTPUT: `${output}/media-backup`,
  INPUT_A11Y_OUTPUT: `${output}/inputs`, FOLLOWUP_BROWSER_OUTPUT: `${output}/followup`,
};
const scripts = ['test:startup-recovery', 'test:a11y-reviewer', 'test:lazy-browser', 'test:responsive', 'test:personal-browser', 'test:brain-browser', 'test:dialog-offline-browser', 'test:mobile-shell', 'test:study-browser', 'test:date-browser', 'test:post-release-browser', 'test:input-accessibility', 'test:followup-browser', 'test:accessibility'];
type BrowserResult = { script: string; exitCode: number | null; signal: NodeJS.Signals | null; logTail?: string };
const results: BrowserResult[] = [];
let failure = '';
try {
  for (const script of scripts) {
    console.log(`\n=== Built web: ${script} ===`);
    const result = await new Promise<BrowserResult>((resolve, reject) => {
      let logTail = '';
      const child = spawn('npm', ['run', script], { stdio: ['ignore', 'pipe', 'pipe'], env });
      child.stdout.setEncoding('utf8').on('data', (text: string) => { process.stdout.write(text); logTail = appendBrowserLog(logTail, text); });
      child.stderr.setEncoding('utf8').on('data', (text: string) => { process.stderr.write(text); logTail = appendBrowserLog(logTail, text); });
      child.once('error', reject);
      // close, not exit: retain the last assertion output after stdio drains.
      child.once('close', (exitCode, signal) => resolve({ script, exitCode, signal, ...(exitCode === 0 ? {} : { logTail }) }));
    });
    results.push(result);
    assert.equal(result.exitCode, 0, `${script} failed (${result.signal || result.exitCode})`);
  }
} catch (error) {
  failure = String(error); process.exitCode = 1; console.error(error);
  if (process.env.GITHUB_ACTIONS === 'true') console.error(browserFailureAnnotation(failure, results.at(-1)?.logTail));
}
finally {
  await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  await writeFile(`${output}/report.json`, JSON.stringify({ base: env.BASE_URL, productionBuild: true, complete: !failure, physicalDeviceCertified: false, results, failure }, null, 2));
}
