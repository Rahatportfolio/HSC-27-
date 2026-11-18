// Targeted fault proof for release prerequisites and new inspection facts.
// Mutants are isolated module copies. The real source is never edited.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const guard = 'scripts/check-android-release.mjs';
const auditor = 'scripts/verify-release-asset.mjs';
const guardTests = 'scripts/check-android-release.node-test.mjs';
const auditorTests = 'scripts/verify-release-asset.node-test.mjs';
const cases = [
  ['missing-signing-inputs', guard, 'assert.equal(missing.length, 0,', 'assert.equal(0, 0,', guardTests, 'rejects missing signing input KEYSTORE_BASE64'],
  ['new-certificate', guard, "  assert.equal(report.certificateSha256, PUBLISHED_BASELINE.certificateSha256, 'Signing certificate differs: direct Android update blocked. Do not uninstall or Clear data.');", '  // fault: new signer accepted', guardTests, 'rejects new certificate even with a forged true comparison flag'],
  ['baseline-certificate', guard, "  assert.equal(previous.certificateSha256, PUBLISHED_BASELINE.certificateSha256, 'Published baseline certificate differs');", '  // fault: baseline certificate ignored', guardTests, 'rejects changed baseline certificate'],
  ['baseline-bytes', guard, "  assert.equal(previous.sha256, PUBLISHED_BASELINE.sha256, 'Published baseline bytes differ');", '  // fault: baseline digest ignored', guardTests, 'rejects changed baseline bytes'],
  ['baseline-asset', guard, "  assert.equal(previous.assetId, PUBLISHED_BASELINE.assetId, 'Published baseline asset was changed');", '  // fault: baseline asset ignored', guardTests, 'rejects replaced baseline asset'],
  ['comparison-flag', guard, "  assert.equal(previous.sameSigningCertificate, true, 'The inspection did not establish signing continuity');", '  // fault: contradictory comparison accepted', guardTests, 'rejects false comparison despite matching digest strings'],
  ['production-debuggable', guard, "  assert.equal(report.debuggable, false, 'A production update must explicitly be non-debuggable');", '  // fault: debug APK accepted', guardTests, 'rejects debuggable update'],
  ['version-increment', guard, "  assert.ok(Number.isSafeInteger(report.versionCode) && report.versionCode > PUBLISHED_BASELINE.versionCode, 'Update version code must exceed the published baseline');", '  // fault: non-incremented version accepted', guardTests, 'rejects non-incremented version code'],
  ['signing-cli-bypass', guard, '    requireSigningInputs(process.env);', '    // fault: signing-input CLI skipped', guardTests, 'CLI blocks absent keys without exposing supplied secret values'],
  ['report-cli-bypass', guard, "    requireCompatibleUpdate(JSON.parse(readFileSync(filename, 'utf8')));", "    JSON.parse(readFileSync(filename, 'utf8')); // fault: parsed but never checked", guardTests, 'CLI enforces the report gate, not just exported helper functions'],
  ['debuggable-fact', auditor, 'debuggable: /^application-debuggable\\s*$/m.test(f.badging)', 'debuggable: false', auditorTests, 'reports the actual debuggable flag rather than mistaking a valid signature for a production build'],
  ['previous-size', auditor, "  assert.equal(bytes.length, asset.size, 'Previous APK size mismatch');", '  // fault: previous size ignored', auditorTests, 'rejects incorrect previous APK size even when its digest matches'],
  ['previous-digest', auditor, "  assert.equal(`sha256:${digest}`, asset.digest, 'Previous APK SHA-256 mismatch');", '  // fault: previous digest ignored', auditorTests, 'rejects incorrect previous APK digest even when its size matches'],
];
const output = resolve('.cache/release-v2.44.0/continuation/guard-mutations');
mkdirSync(output, { recursive: true });
const originals = new Map([guard, auditor].map(path => [path, readFileSync(path, 'utf8')]));
const hash = text => createHash('sha256').update(text).digest('hex');
const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [id, path, from] of cases) assert.equal(originals.get(path).split(from).length, 2, `${id}: anchor must match once`);
function run(id, files, env = {}, title) {
  const clean = { ...process.env, NO_COLOR: '1' };
  delete clean.ANDROID_RELEASE_GUARD_MODULE; delete clean.RELEASE_AUDITOR_MODULE;
  Object.assign(clean, env);
  const args = ['--test', '--test-reporter=tap'];
  if (title) args.push(`--test-name-pattern=^${esc(title)}$`);
  const result = spawnSync(process.execPath, [...args, ...files], { encoding: 'utf8', timeout: 60_000, env: clean, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  writeFileSync(resolve(output, `${id}.log`), text);
  return { code: result.status, text };
}
const control = run('control', [guardTests, auditorTests]);
assert.equal(control.code, 0, 'Unmodified Node controls failed; no mutation score is valid');
assert.match(control.text, /# fail 0\b/);
for (const [, , , , , title] of cases) assert.match(control.text, new RegExp(`^ok \\d+ - ${esc(title)}\\s*$`, 'm'), `Missing passing control: ${title}`);
const rows = [];
for (const [id, path, from, to, test, title] of cases) {
  const copy = resolve(output, `${id}.mjs`);
  writeFileSync(copy, originals.get(path).replace(from, to));
  const variable = path === guard ? 'ANDROID_RELEASE_GUARD_MODULE' : 'RELEASE_AUDITOR_MODULE';
  const result = run(id, [test], { [variable]: pathToFileURL(copy).href }, title);
  const intended = new RegExp(`^not ok \\d+ - ${esc(title)}(?:\\s|$)`, 'm').test(result.text);
  const caught = result.code !== 0 && intended && /ERR_ASSERTION/.test(result.text) && !/SyntaxError|ERR_MODULE_NOT_FOUND/.test(result.text);
  rows.push({ id, caught, intendedTest: title });
  console.log(`${caught ? 'CAUGHT' : 'SURVIVED / ERROR'} ${id}`);
}
const unchanged = [...originals].every(([path, text]) => hash(readFileSync(path, 'utf8')) === hash(text));
const report = { controls: Number(control.text.match(/# pass (\d+)/)?.[1]), caught: rows.filter(row => row.caught).length, selected: cases.length, sourceUnchanged: unchanged, rows };
writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, rows: undefined }));
assert.ok(unchanged, 'Original source changed during isolated fault proof');
assert.equal(report.caught, report.selected, 'A selected release guard fault survived or failed for the wrong reason');
