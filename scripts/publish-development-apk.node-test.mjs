import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { DELIVERY, requireArtifactArchive, requireDevelopmentApk, requireDevelopmentRelease, requireTestedSource, requireUploadedAssets } from './publish-development-apk.mjs';
import { PUBLISHED_BASELINE, requireCompatibleUpdate } from './check-android-release.mjs';

function sourceFixture() {
  return {
    run: { id: DELIVERY.sourceRun, repository: { full_name: DELIVERY.repo }, head_sha: DELIVERY.sourceSha, head_branch: 'main',
      event: 'push', path: '.github/workflows/android-apk.yml', status: 'completed', conclusion: 'success' },
    jobs: { jobs: ['Build installable APK', 'Android WebView device checks (API 34)', 'Android WebView device checks (API 35)']
      .map(name => ({ name, status: 'completed', conclusion: 'success' })) },
    artifact: { id: DELIVERY.artifactId, name: 'prostuti-hsc27-apk', expired: false, size_in_bytes: DELIVERY.artifactSize,
      digest: `sha256:${DELIVERY.artifactDigest}`, workflow_run: { id: DELIVERY.sourceRun, head_sha: DELIVERY.sourceSha, head_branch: 'main' } },
  };
}
const verifySource = fixture => requireTestedSource(fixture.run, fixture.jobs, fixture.artifact);
test('accepts only the pinned, completed main build with both successful native jobs', () => {
  assert.equal(verifySource(sourceFixture()), true);
});
for (const [name, mutate] of Object.entries({
  'wrong run': f => { f.run.id++; },
  'other repository': f => { f.run.repository.full_name = 'someone/else'; },
  'wrong source SHA': f => { f.run.head_sha = 'a'.repeat(40); },
  'unmerged branch': f => { f.run.head_branch = 'arena/example'; },
  'manual run': f => { f.run.event = 'workflow_dispatch'; },
  'other workflow': f => { f.run.path = '.github/workflows/static.yml'; },
  'still running': f => { f.run.status = 'in_progress'; },
  'failed run': f => { f.run.conclusion = 'failure'; },
  'missing device job': f => { f.jobs.jobs.pop(); },
  'duplicate device job': f => { f.jobs.jobs.push(f.jobs.jobs[1]); },
  'device job still running': f => { f.jobs.jobs[1].status = 'in_progress'; },
  'device job failed': f => { f.jobs.jobs[2].conclusion = 'failure'; },
  'skipped APK job': f => { f.jobs.jobs[0].conclusion = 'skipped'; },
  'wrong artifact ID': f => { f.artifact.id++; },
  'wrong artifact name': f => { f.artifact.name = 'android-device-results-api-34'; },
  'expired artifact': f => { f.artifact.expired = true; },
  'changed artifact size': f => { f.artifact.size_in_bytes++; },
  'changed artifact digest': f => { f.artifact.digest = `sha256:${'b'.repeat(64)}`; },
  'artifact from another run': f => { f.artifact.workflow_run.id++; },
  'artifact from another SHA': f => { f.artifact.workflow_run.head_sha = 'c'.repeat(40); },
  'artifact from another branch': f => { f.artifact.workflow_run.head_branch = 'main-old'; },
})) test(`rejects source delivery: ${name}`, () => {
  const fixture = sourceFixture(); mutate(fixture); assert.throws(() => verifySource(fixture));
});

const archiveFixture = () => ({ size: DELIVERY.artifactSize, sha256: DELIVERY.artifactDigest, entries: [DELIVERY.inputName] });
test('accepts verified archive facts from the original downloaded bytes', () => assert.equal(requireArtifactArchive(archiveFixture()), true));
for (const [name, value] of Object.entries({
  size: { size: 1 }, digest: { sha256: '0'.repeat(64) },
  extra: { entries: [DELIVERY.inputName, 'other.apk'] }, traversal: { entries: [`../${DELIVERY.inputName}`] },
  nested: { entries: [`artifacts/${DELIVERY.inputName}`] }, release: { entries: ['app-release.apk'] },
})) test(`rejects downloaded archive: ${name}`, () => assert.throws(() => requireArtifactArchive({ ...archiveFixture(), ...value })));

const badging = `package: name='${DELIVERY.packageName}' versionCode='${DELIVERY.versionCode}' versionName='${DELIVERY.versionName}'\napplication-debuggable\n`;
const signature = (cert = 'a'.repeat(64)) => `Verifies\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${cert}\n`;
test('inspects a valid debug APK without claiming production compatibility', () => {
  const report = requireDevelopmentApk(badging, signature());
  assert.equal(report.debuggable, true); assert.equal(report.apkSignature, 'verified');
  assert.equal(report.sameSigningCertificate, false); assert.equal(report.compatibleProductionUpdate, false);
});
for (const [name, text, signing] of [
  ['package', badging.replace(DELIVERY.packageName, 'com.other.app'), signature()],
  ['version', badging.replace("versionName='2.44.0'", "versionName='2.43.0'"), signature()],
  ['code', badging.replace("versionCode='24'", "versionCode='23'"), signature()],
  ['not explicitly debug', badging.replace('application-debuggable', ''), signature()],
  ['unverified signature', badging, signature().replace('Verifies', 'DOES NOT VERIFY')],
  ['multiple signers', badging, signature().replace('signers: 1', 'signers: 2')],
  ['invalid certificate', badging, signature('invalid')],
]) test(`rejects APK: ${name}`, () => assert.throws(() => requireDevelopmentApk(text, signing)));
test('even a debug APK matching the old certificate cannot pass the unchanged production gate', () => {
  const report = { ...requireDevelopmentApk(badging, signature(PUBLISHED_BASELINE.certificateSha256)), zipIntegrity: 'passed',
    previous: { ...PUBLISHED_BASELINE, sameSigningCertificate: true } };
  assert.equal(report.sameSigningCertificate, true); assert.equal(report.compatibleProductionUpdate, false);
  assert.throws(() => requireCompatibleUpdate(report), /non-debuggable/);
});

const releaseFixture = () => ({ id: 999999999, tag_name: DELIVERY.tag, target_commitish: DELIVERY.sourceSha,
  prerelease: true, draft: true, name: 'Development APK — not a production update', body: 'NOT A PRODUCTION UPDATE. Do not uninstall or Clear data.' });
test('accepts a new warning-labelled draft, then only its prerelease state', () => {
  const release = releaseFixture(); assert.equal(requireDevelopmentRelease(release, true), true);
  assert.equal(requireDevelopmentRelease({ ...release, draft: false }, false), true);
});
for (const [name, value] of Object.entries({
  id: { id: 0 }, held: { id: DELIVERY.heldReleaseId }, tag: { tag_name: 'v2.44.0' },
  source: { target_commitish: 'main' }, production: { prerelease: false }, premature: { draft: false },
  title: { name: 'Latest APK' }, warning: { body: 'Install now' },
})) test(`rejects release: ${name}`, () => assert.throws(() => requireDevelopmentRelease({ ...releaseFixture(), ...value }, true)));

function uploadFixture() {
  const files = [{ name: DELIVERY.assetName, size: 15000000, sha256: 'd'.repeat(64) }];
  return { files, assets: files.map(file => ({ name: file.name, size: file.size, digest: `sha256:${file.sha256}`, state: 'uploaded',
    browser_download_url: `https://github.com/${DELIVERY.repo}/releases/download/${DELIVERY.tag}/${file.name}` })) };
}
test('requires exact upload size/digest and actual public APK URL', () => {
  const { assets, files } = uploadFixture(); assert.equal(requireUploadedAssets(assets, files), true);
});
test('allows GitHub-generated draft URLs only before publication', () => {
  const { assets, files } = uploadFixture(); assets[0].browser_download_url = `https://github.com/${DELIVERY.repo}/releases/download/untagged-example/${DELIVERY.assetName}`;
  assert.equal(requireUploadedAssets(assets, files, false), true);
  assert.throws(() => requireUploadedAssets(assets, files), /download URL/);
});
for (const [name, mutate] of Object.entries({
  extra: f => { f.assets.push(f.assets[0]); }, missing: f => { f.assets = []; },
  renamed: f => { f.assets[0].name = 'app.apk'; }, pending: f => { f.assets[0].state = 'new'; },
  size: f => { f.assets[0].size++; }, digest: f => { f.assets[0].digest = `sha256:${'e'.repeat(64)}`; },
  link: f => { f.assets[0].browser_download_url = 'https://example.com/app.apk'; },
})) test(`rejects uploaded APK: ${name}`, () => {
  const f = uploadFixture(); mutate(f); assert.throws(() => requireUploadedAssets(f.assets, f.files));
});

test('workflow requires deliberate opt-in on this branch, keeps normal/tagged production builds separate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/direct-development-apk.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches: \['arena\/80a86bf2-hsc-27'\]/);
  assert.match(workflow, /inputs\.confirm_development_download == true/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, '\[direct-apk\]'\)/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /DIRECT_APK_CONFIRMATION: development-only-no-compatible-update/);
  assert.match(workflow, /node --test scripts\/publish-development-apk\.node-test\.mjs scripts\/check-android-release\.node-test\.mjs scripts\/verify-release-asset\.node-test\.mjs/);
  assert.doesNotMatch(workflow, /tags:|assembleDebug|assembleRelease|KEYSTORE/);
  assert.doesNotMatch(DELIVERY.tag, /^v/);
});
test('running the publisher outside CI fails before any release or filesystem operation', () => {
  const result = spawnSync(process.execPath, ['scripts/publish-development-apk.mjs'], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' } });
  assert.equal(result.status, 1); assert.match(result.stderr, /reviewed GitHub workflow/);
});
