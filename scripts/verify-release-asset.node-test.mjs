import assert from 'node:assert/strict';
import { test } from 'node:test';

const { verifyFacts, signingFingerprint } = await import(process.env.RELEASE_AUDITOR_MODULE || './verify-release-asset.mjs');
const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const certificate = 'c'.repeat(64);
const fixture = () => ({
  tag: 'v2.43.0', sha, code: 23,
  release: { tag_name: 'v2.43.0', target_commitish: sha }, tagSha: sha,
  asset: { name: 'prostuti-hsc27-v2.43.0.apk', state: 'uploaded', size: 100, digest: `sha256:${digest}` },
  actualSize: 100, actualDigest: digest,
  badging: "package: name='com.prostuti.hsc27' versionCode='23' versionName='2.43.0' platformBuildVersionName='16'",
  signature: `Verifies\nNumber of signers: 1\nSigner #1 certificate DN: CN=Android Debug\nSigner #1 certificate SHA-256 digest: ${certificate}\n`,
});

test('accepts the exact independently inspected release facts', () => {
  assert.deepEqual(verifyFacts(fixture()), { packageName: 'com.prostuti.hsc27', versionCode: 23, versionName: '2.43.0', certificateSha256: certificate });
});

for (const [name, mutate] of [
  ['tag format', f => { f.tag = 'latest'; f.release.tag_name = 'latest'; f.asset.name = 'prostuti-hsc27-latest.apk'; f.badging = f.badging.replace("versionName='2.43.0'", "versionName='atest'"); }],
  ['source SHA format', f => { f.sha = 'z'.repeat(40); f.tagSha = f.sha; f.release.target_commitish = f.sha; }],
  ['empty APK', f => { f.actualSize = 0; f.asset.size = 0; }],
  ['digest format', f => { f.actualDigest = 'x'.repeat(64); f.asset.digest = `sha256:${f.actualDigest}`; }],
  ['certificate format', f => { f.signature = f.signature.replace(certificate, 'c'.repeat(32)); }],
  ['release tag', f => { f.release.tag_name = 'v2.42.0'; }],
  ['tag source commit', f => { f.tagSha = 'd'.repeat(40); }],
  ['release source commit', f => { f.release.target_commitish = 'main'; }],
  ['asset identity', f => { f.asset.name = 'other.apk'; }],
  ['upload state', f => { f.asset.state = 'new'; }],
  ['asset size', f => { f.actualSize = 99; }],
  ['asset digest', f => { f.actualDigest = 'e'.repeat(64); }],
  ['application id', f => { f.badging = f.badging.replace('com.prostuti.hsc27', 'com.other.app'); }],
  ['version code', f => { f.badging = f.badging.replace("versionCode='23'", "versionCode='22'"); }],
  ['version name', f => { f.badging = f.badging.replace("versionName='2.43.0'", "versionName='2.42.0'"); }],
  ['unverified signature', f => { f.signature = f.signature.replace('Verifies', 'DOES NOT VERIFY'); }],
  ['missing certificate', f => { f.signature = 'Verifies\n'; }],
  ['multiple signers', f => { f.signature += `Signer #2 certificate SHA-256 digest: ${'f'.repeat(64)}\n`; }],
]) {
  test(`rejects mismatched ${name}`, () => {
    const f = fixture(); mutate(f); assert.throws(() => verifyFacts(f));
  });
}

test('normalises the certificate digest for an exact previous-release comparison', () => {
  const colonDigest = certificate.toUpperCase().match(/../g).join(':');
  assert.equal(signingFingerprint(`Verifies\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${colonDigest}\n`), certificate);
});

test('accepts the actual new Android SDK V2 Signer format', () => {
  assert.equal(signingFingerprint(`Verifies\nNumber of signers: 1\nV2 Signer: certificate SHA-256 digest: ${certificate}\n`), certificate);
});

test('accepts repeated certification of the same signer across APK schemes', () => {
  assert.equal(signingFingerprint(`Verifies\nNumber of signers: 1\nV1 Signer #1: certificate SHA-256 digest: ${certificate}\nV2 Signer: certificate SHA-256 digest: ${certificate}\n`), certificate);
});

test('rejects a multi-signer count even if certificate lines repeat the same key', () => {
  assert.throws(() => signingFingerprint(fixture().signature.replace('Number of signers: 1', 'Number of signers: 2')));
});

test('rejects missing signer count instead of assuming a single signer', () => {
  assert.throws(() => signingFingerprint(fixture().signature.replace('Number of signers: 1\n', '')));
});
