import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFreshApk } from './check-fresh-apk.mjs';
const cert = 'a'.repeat(64);
const fixture = () => ({
  badging: "package: name='com.prostuti.hsc27.fresh' versionCode='24' versionName='2.44.0'",
  manifest: 'E: manifest\n  E: application',
  signature: `Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${cert}\n`,
  expectedCertificate: cert,
  zipTest: 'No errors detected in compressed data of APK.',
});
test('accepts only the separately installed, non-debuggable, verified release certificate', () => {
  assert.equal(validateFreshApk(fixture()).packageName, 'com.prostuti.hsc27.fresh');
});
for (const [name, mutate] of [
  ['old package', f => f.badging = f.badging.replace('.fresh', '')],
  ['debuggable', f => f.manifest += '\nandroid:debuggable(0x0101000f)=(type 0x12)0xffffffff'],
  ['unexpected certificate', f => f.expectedCertificate = 'b'.repeat(64)],
  ['additional signer', f => f.signature = f.signature.replace('Number of signers: 1', 'Number of signers: 2') + `\nSigner #2 certificate SHA-256 digest: ${cert}\n`],
  ['missing certificate', f => f.expectedCertificate = ''],
  ['missing scheme verification', f => f.signature = f.signature.replace('v2): true', 'v2): false')],
  ['missing manifest', f => f.manifest = ''],
  ['bad zip', f => f.zipTest = 'error'],
]) test(`rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => validateFreshApk(f)); });

test('supports modern SDK scheme-labelled signer output', () => {
  const f = fixture();
  f.signature = f.signature.replace('Signer #1 certificate SHA-256', 'V2 Signer: certificate SHA-256');
  assert.equal(validateFreshApk(f).certificateSha256, cert);
});
