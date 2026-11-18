// Fail-closed release prerequisites. Never builds, publishes or changes an APK.
// The certificate/digest below are public facts from the unchanged v2.43.0 asset,
// not signing credentials. A newly generated key cannot satisfy this baseline.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLISHED_BASELINE = Object.freeze({
  tag: 'v2.43.0',
  packageName: 'com.prostuti.hsc27',
  versionCode: 23,
  assetId: 760227469,
  sha256: '38992c88d72797dac9c57d8100555f52d8b8e239e28696f7b6f516e94fb7653d',
  certificateSha256: '30c33e6e24b125db7291e3fb6f3ea746054532b2c016bb3f24d79023cac5ab72',
});

export const SIGNING_INPUTS = Object.freeze([
  'KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEYSTORE_KEY_ALIAS', 'KEYSTORE_KEY_PASSWORD',
]);

export function requireSigningInputs(env) {
  const missing = SIGNING_INPUTS.filter(name => typeof env[name] !== 'string' || !env[name].trim());
  assert.equal(missing.length, 0, `A tagged APK requires the original signing key. Missing inputs: ${missing.join(', ')}. Debug fallback is not allowed; keep the old app and its data.`);
  return true;
}

export function requireCompatibleUpdate(report) {
  assert.ok(report && typeof report === 'object', 'An exact uploaded-APK inspection report is required');
  assert.equal(report.packageName, PUBLISHED_BASELINE.packageName, 'Update package differs from the published app');
  assert.ok(Number.isSafeInteger(report.versionCode) && report.versionCode > PUBLISHED_BASELINE.versionCode, 'Update version code must exceed the published baseline');
  assert.equal(report.apkSignature, 'verified', 'APK signature has not been verified');
  assert.equal(report.zipIntegrity, 'passed', 'APK ZIP integrity has not been verified');
  assert.ok(report.previous, 'A previous published APK comparison is required; absence is not compatibility');
  const previous = report.previous;
  assert.equal(previous.tag, PUBLISHED_BASELINE.tag, 'Wrong signing baseline tag');
  assert.equal(previous.assetId, PUBLISHED_BASELINE.assetId, 'Published baseline asset was changed');
  assert.equal(previous.sha256, PUBLISHED_BASELINE.sha256, 'Published baseline bytes differ');
  assert.equal(previous.certificateSha256, PUBLISHED_BASELINE.certificateSha256, 'Published baseline certificate differs');
  assert.equal(report.certificateSha256, PUBLISHED_BASELINE.certificateSha256, 'Signing certificate differs: direct Android update blocked. Do not uninstall or Clear data.');
  assert.equal(previous.sameSigningCertificate, true, 'The inspection did not establish signing continuity');
  assert.equal(report.debuggable, false, 'A production update must explicitly be non-debuggable');
  return true;
}

function main() {
  const [command, filename, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, 'Unexpected release-check arguments');
  if (command === 'signing-inputs') {
    assert.equal(filename, undefined, 'Signing inputs must come from the environment, never command arguments');
    requireSigningInputs(process.env);
    console.log('Signing inputs supplied. Certificate continuity must still pass the exact-asset audit.');
  } else if (command === 'compatible-update') {
    assert.ok(filename, 'The exact-asset JSON report path is required');
    requireCompatibleUpdate(JSON.parse(readFileSync(filename, 'utf8')));
    console.log('Signing continuity passed against the pinned published APK. Device/Pages/draft gates remain separate.');
  } else {
    throw new Error('Expected signing-inputs or compatible-update <inspection.json>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    const message = String(error.message || error).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Android release blocked::${message}`);
    process.exitCode = 1;
  }
}
