// Fail closed: a separate-install release must not overwrite the old package,
// be debuggable, use an unexpected key, or skip Android's signature check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { signingFingerprint } from './verify-release-asset.mjs';

export function validateFreshApk({ badging, manifest, signature, expectedCertificate, zipTest }) {
  assert.match(badging, /package: name='com\.prostuti\.hsc27\.fresh'\s+versionCode='\d+'/);
  const debug = manifest.match(/^.*android:debuggable.*$/mi)?.[0];
  if (debug) assert.match(debug, /\(type 0x12\)0x0(?:\s|$)/i, 'A production APK must explicitly be non-debuggable');
  assert.match(manifest, /E: application\b/, 'Cannot inspect application manifest');
  assert.match(signature, /Verified using v2 scheme \(APK Signature Scheme v2\): true/);
  assert.match(zipTest, /No errors detected in compressed data/);
  // Android SDK versions differ: some print "Signer #1", others print a
  // V2/V3 signer line for the same signer. Require one signer and one
  // unambiguous fingerprint rather than assuming one textual format.
  const actual = signingFingerprint(signature);
  const expected = (expectedCertificate || '').replaceAll(':', '').toLowerCase();
  assert.match(expected, /^[a-f0-9]{64}$/, 'Expected signing certificate SHA-256 must be explicitly configured');
  assert.equal(actual, expected, 'Fresh app signing certificate mismatch');
  return { packageName: 'com.prostuti.hsc27.fresh', certificateSha256: actual, debuggable: false };
}

function main() {
  const [apk, aapt, apksigner, output] = process.argv.slice(2);
  assert.ok(apk && aapt && apksigner && !output, 'Usage: check-fresh-apk <apk> <aapt> <apksigner>');
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const result = validateFreshApk({
    badging: run(aapt, ['dump', 'badging', apk]),
    manifest: run(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml']),
    signature: run(apksigner, ['verify', '--verbose', '--print-certs', apk]),
    zipTest: run('unzip', ['-t', apk]),
    expectedCertificate: process.env.FRESH_ANDROID_CERT_SHA256,
  });
  // Confirm the APK was actually readable before any publish step.
  assert.ok(readFileSync(apk).length > 0);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`Fresh APK verification failed: ${error.message}`); process.exitCode = 1; }
}
