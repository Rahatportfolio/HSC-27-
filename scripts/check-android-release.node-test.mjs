import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const moduleUrl = process.env.ANDROID_RELEASE_GUARD_MODULE || new URL('./check-android-release.mjs', import.meta.url).href;
const { PUBLISHED_BASELINE, SIGNING_INPUTS, requireSigningInputs, requireCompatibleUpdate } = await import(moduleUrl);
const publishedCertificate = '30c33e6e24b125db7291e3fb6f3ea746054532b2c016bb3f24d79023cac5ab72';
const publishedDigest = '38992c88d72797dac9c57d8100555f52d8b8e239e28696f7b6f516e94fb7653d';
const fixture = () => ({
  packageName: 'com.prostuti.hsc27', versionCode: 24, apkSignature: 'verified', zipIntegrity: 'passed',
  certificateSha256: publishedCertificate, debuggable: false,
  previous: { tag: 'v2.43.0', assetId: 760227469, sha256: publishedDigest, certificateSha256: publishedCertificate, sameSigningCertificate: true },
});
const inputs = () => ({ KEYSTORE_BASE64: 'synthetic-not-a-real-keystore', KEYSTORE_PASSWORD: 'synthetic-store-password', KEYSTORE_KEY_ALIAS: 'synthetic-alias', KEYSTORE_KEY_PASSWORD: 'synthetic-key-password' });
function cli(args, env = {}) {
  const clean = { ...process.env, ...env };
  for (const name of SIGNING_INPUTS) if (!(name in env)) delete clean[name];
  const result = spawnSync(process.execPath, [fileURLToPath(moduleUrl), ...args], { env: clean, encoding: 'utf8', timeout: 10_000 });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('pins the unchanged published baseline rather than trusting a new claimed signer', () => {
  assert.deepEqual(PUBLISHED_BASELINE, { tag: 'v2.43.0', packageName: 'com.prostuti.hsc27', versionCode: 23, assetId: 760227469, sha256: publishedDigest, certificateSha256: publishedCertificate });
});
test('accepts complete signing inputs without claiming their certificate matches', () => {
  assert.equal(requireSigningInputs(inputs()), true);
});
for (const name of ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEYSTORE_KEY_ALIAS', 'KEYSTORE_KEY_PASSWORD']) {
  test(`rejects missing signing input ${name}`, () => {
    const env = inputs(); delete env[name];
    assert.throws(() => requireSigningInputs(env), /original signing key/);
  });
}
test('rejects whitespace-only signing inputs', () => {
  assert.throws(() => requireSigningInputs({ ...inputs(), KEYSTORE_BASE64: ' \n\t' }), /Missing inputs/);
});
test('accepts a verified non-debuggable update with the exact pinned baseline signer', () => {
  assert.equal(requireCompatibleUpdate(fixture()), true);
});
for (const [name, change, message] of [
  ['absent inspection', () => null, /inspection report/],
  ['different package', f => { f.packageName = 'com.other.app'; return f; }, /package/],
  ['non-incremented version code', f => { f.versionCode = 23; return f; }, /version code/],
  ['fractional version code', f => { f.versionCode = 24.5; return f; }, /version code/],
  ['unverified APK signature', f => { f.apkSignature = 'not-checked'; return f; }, /signature/],
  ['unverified ZIP integrity', f => { f.zipIntegrity = 'not-checked'; return f; }, /integrity/],
  ['missing previous comparison', f => { f.previous = null; return f; }, /previous published APK/],
  ['different baseline tag', f => { f.previous.tag = 'v2.42.0'; return f; }, /baseline tag/],
  ['replaced baseline asset', f => { f.previous.assetId++; return f; }, /baseline asset/],
  ['changed baseline bytes', f => { f.previous.sha256 = 'a'.repeat(64); return f; }, /baseline bytes/],
  ['changed baseline certificate', f => { f.previous.certificateSha256 = 'b'.repeat(64); return f; }, /baseline certificate/],
  ['new certificate even with a forged true comparison flag', f => { f.certificateSha256 = 'c'.repeat(64); return f; }, /Signing certificate differs/],
  ['false comparison despite matching digest strings', f => { f.previous.sameSigningCertificate = false; return f; }, /signing continuity/],
  ['missing comparison flag', f => { delete f.previous.sameSigningCertificate; return f; }, /signing continuity/],
  ['debuggable update', f => { f.debuggable = true; return f; }, /non-debuggable/],
  ['missing debuggable fact', f => { delete f.debuggable; return f; }, /non-debuggable/],
]) {
  test(`rejects ${name}`, () => assert.throws(() => requireCompatibleUpdate(change(fixture())), message));
}
test('CLI blocks absent keys without exposing supplied secret values', () => {
  const env = inputs(); delete env.KEYSTORE_KEY_PASSWORD;
  const result = cli(['signing-inputs'], env);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Android release blocked/);
  assert.match(result.output, /KEYSTORE_KEY_PASSWORD/);
  for (const value of Object.values(env)) assert.ok(!result.output.includes(value), 'Secret value was printed');
});
test('CLI accepts complete inputs but explicitly defers certificate verification', () => {
  const result = cli(['signing-inputs'], inputs());
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /must still pass/);
});
test('CLI enforces the report gate, not just exported helper functions', () => {
  const root = mkdtempSync(join(tmpdir(), 'prostuti-upgrade-control-'));
  try {
    const path = join(root, 'report.json');
    writeFileSync(path, JSON.stringify(fixture()));
    assert.equal(cli(['compatible-update', path]).status, 0);
    const bad = fixture(); bad.certificateSha256 = '7c33848abbb4706ea70bb37b70da297bc5991e97fb04a510adb10f1af02303fb'; bad.previous.sameSigningCertificate = false; bad.debuggable = true;
    writeFileSync(path, JSON.stringify(bad));
    const result = cli(['compatible-update', path]);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /Signing certificate differs/);
    assert.match(result.output, /Do not uninstall or Clear data/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CLI fails closed for unknown or incomplete commands', () => {
  for (const args of [[], ['unknown'], ['compatible-update'], ['signing-inputs', 'secret-on-command-line']]) {
    assert.notEqual(cli(args).status, 0);
  }
});
