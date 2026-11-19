/** Reproducible browser acceptance of the production build, including lazy
 * offline navigation. Vite preview is awaited, not a guessed sleep or a dev
 * server; every child failure propagates. Each browser uses isolated fixtures.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { preview } from 'vite';

assert(process.env.CHROMIUM_PATH, 'Set CHROMIUM_PATH to an installed Chromium');
const output = process.env.WEB_BROWSER_OUTPUT || '.cache/built-web';
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '0.0.0.0', port: 0, strictPort: true } });
const address = server.httpServer.address();
assert(address && typeof address === 'object', 'Production preview did not bind');
const env = {
  ...process.env, BASE_URL: `http://127.0.0.1:${address.port}`, REVIEW_INCOMPLETE: '1', A11Y_REVIEW_INCOMPLETE: '1',
  LAZY_OUTPUT: `${output}/lazy`, RESPONSIVE_OUTPUT: `${output}/responsive`,
  PERSONAL_BROWSER_OUTPUT: `${output}/personal`, BRAIN_BROWSER_OUTPUT: `${output}/brain`,
  DIALOG_BROWSER_OUTPUT: `${output}/dialog`, MOBILE_EVIDENCE: `${output}/mobile`,
  A11Y_OUTPUT: `${output}/accessibility`, A11Y_REVIEWER_OUTPUT: `${output}/reviewer-controls`,
};
// Refuse inherited filters: this single command means the complete matrix.
for (const key of Object.keys(process.env)) assert(!/^(?:A11Y_(?:ROUTES|SCENARIOS|DIALOGS|EXAM_STATES_ONLY|FAULT)|RESPONSIVE_(?:ROUTES|PROFILES|SCENARIOS|FAULT)|MOBILE_(?:CASE|MUTATION))$/.test(key), `Remove subset/fault filter ${key} for full built-web acceptance`);
const scripts = ['test:a11y-reviewer', 'test:lazy-browser', 'test:responsive', 'test:personal-browser', 'test:brain-browser', 'test:dialog-offline-browser', 'test:mobile-shell', 'test:study-browser', 'test:accessibility'];
const results: { script: string; exitCode: number | null; signal: NodeJS.Signals | null }[] = [];
let failure = '';
try {
  for (const script of scripts) {
    console.log(`\n=== Built web: ${script} ===`);
    const result = await new Promise<{ script: string; exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn('npm', ['run', script], { stdio: 'inherit', env });
      child.once('error', reject);
      child.once('exit', (exitCode, signal) => resolve({ script, exitCode, signal }));
    });
    results.push(result);
    assert.equal(result.exitCode, 0, `${script} failed (${result.signal || result.exitCode})`);
  }
} catch (error) { failure = String(error); process.exitCode = 1; console.error(error); }
finally {
  await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  await writeFile(`${output}/report.json`, JSON.stringify({ base: env.BASE_URL, productionBuild: true, complete: !failure, physicalDeviceCertified: false, results, failure }, null, 2));
}
