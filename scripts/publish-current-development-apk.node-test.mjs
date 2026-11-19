import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { CURRENT_POLICY, requireCurrentSource, requireCurrentArchive, requireCurrentUploadedAssets, requireCurrentRecovery } from './publish-current-development-apk.mjs';

const sha = 'a'.repeat(40), hash = 'b'.repeat(64);
function fixture() {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: CURRENT_POLICY.repo, GITHUB_REF: `refs/heads/${CURRENT_POLICY.branch}`, GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'push', CURRENT_DEV_APK_CONFIRMATION: CURRENT_POLICY.confirmation };
  const run = { id: 123, run_attempt: 1, repository: { full_name: CURRENT_POLICY.repo }, path: CURRENT_POLICY.workflow, event: 'push', head_branch: CURRENT_POLICY.branch, head_sha: sha, head_commit: { message: '[current-dev-apk] Explicit development installer request' }, status: 'in_progress' };
  const jobs = { jobs: CURRENT_POLICY.jobs.map(name => ({ name, status: 'completed', conclusion: 'success' })) };
  const artifact = { id: 456, name: 'prostuti-hsc27-apk', expired: false, size_in_bytes: 100, digest: `sha256:${hash}`, workflow_run: { id: 123, head_branch: CURRENT_POLICY.branch, head_sha: sha } };
  return { env, run, jobs, artifact };
}
function source(f = fixture()) { return requireCurrentSource(f.env, f.run, f.jobs, f.artifact); }
test('accepts only this exact tested run and returns an explicitly development-only immutable name', () => {
  assert.deepEqual(source(), { tag: `dev-apk-${sha.slice(0, 12)}`, assetName: `prostuti-hsc27-${sha.slice(0, 12)}-development.apk`, sourceSha: sha, runId: 123, artifactId: 456 });
});
test('pins this delivery branch in both the publisher and workflow without weakening any prerequisite', () => {
  assert.equal(CURRENT_POLICY.branch, 'arena/2a6136bf-hsc-27');
  const workflow = readFileSync(new URL('../.github/workflows/android-apk.yml', import.meta.url), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  current-development-download:'));
  assert.match(job, /needs: \[apk, device-checks, built-web\]/);
  assert.ok(job.includes(`github.ref == 'refs/heads/${CURRENT_POLICY.branch}'`));
  assert.match(job, /github\.event_name == 'push'/);
  assert.ok(job.includes("contains(github.event.head_commit.message, '[current-dev-apk]')"));
  assert.ok(job.includes(`CURRENT_DEV_APK_CONFIRMATION: ${CURRENT_POLICY.confirmation}`));
});
for (const branch of ['main', 'arena/80a86bf2-hsc-27', 'arena/25b5228c-hsc-27']) test(`rejects a coherent successful run from the non-current branch ${branch}`, () => {
  const f = fixture();
  f.env.GITHUB_REF = `refs/heads/${branch}`;
  f.run.head_branch = branch; f.artifact.workflow_run.head_branch = branch;
  assert.throws(() => source(f), /Wrong branch/);
});
for (const [name, mutate] of [
  ['non-Actions caller', f => { f.env.GITHUB_ACTIONS = 'false'; }],
  ['wrong repo', f => { f.env.GITHUB_REPOSITORY = 'other/repo'; }],
  ['another branch', f => { f.env.GITHUB_REF = 'refs/heads/main'; }],
  ['missing acknowledgement', f => { delete f.env.CURRENT_DEV_APK_CONFIRMATION; }],
  ['non-push event', f => { f.env.GITHUB_EVENT_NAME = 'pull_request'; }],
  ['wrong run', f => { f.run.id++; }],
  ['wrong attempt', f => { f.run.run_attempt++; }],
  ['wrong workflow', f => { f.run.path = '.github/workflows/other.yml'; }],
  ['different source', f => { f.run.head_sha = 'c'.repeat(40); }],
  ['missing explicit request', f => { f.run.head_commit.message = 'Regular source update'; }],
  ['queued run', f => { f.run.status = 'queued'; }],
  ['another artifact source', f => { f.artifact.workflow_run.head_sha = 'd'.repeat(40); }],
  ['artifact from another run', f => { f.artifact.workflow_run.id++; }],
  ['expired artifact', f => { f.artifact.expired = true; }],
  ['unknown archive digest', f => { f.artifact.digest = null; }],
]) test(`rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => source(f)); });
for (const name of CURRENT_POLICY.jobs) for (const conclusion of ['failure', 'skipped', null]) test(`requires ${name}: not ${conclusion}`, () => {
  const f = fixture(); f.jobs.jobs.find(job => job.name === name).conclusion = conclusion; assert.throws(() => source(f));
});
test('does not accept an unfinished or duplicated dependency job', () => {
  const f = fixture(); f.jobs.jobs[0].status = 'in_progress'; assert.throws(() => source(f));
  const duplicate = fixture(); duplicate.jobs.jobs.push({ ...duplicate.jobs.jobs[0] }); assert.throws(() => source(duplicate));
});
const debug = `prostuti-hsc27-${CURRENT_POLICY.branch.replaceAll('/', '-')}-debug.apk`;
test('checks ZIP bytes separately from APK bytes and accepts only exact flat build outputs', () => {
  const { artifact } = fixture(); assert.equal(requireCurrentArchive(artifact, 100, hash, [debug]), debug);
  for (const entries of [[`../${debug}`], [debug, 'unexpected.apk'], [debug, debug], []]) assert.throws(() => requireCurrentArchive(artifact, 100, hash, entries));
  assert.throws(() => requireCurrentArchive(artifact, 99, hash, [debug]));
  assert.throws(() => requireCurrentArchive(artifact, 100, 'c'.repeat(64), [debug]));
});
test('requires exact uploaded sizes, hashes, names and direct GitHub URLs', () => {
  const delivery = source(), files = [{ name: delivery.assetName, size: 200, sha256: hash }];
  const assets = [{ name: files[0].name, size: 200, digest: `sha256:${hash}`, state: 'uploaded', browser_download_url: `https://github.com/${CURRENT_POLICY.repo}/releases/download/${delivery.tag}/${delivery.assetName}` }];
  assert.equal(requireCurrentUploadedAssets(assets, files, delivery), true);
  for (const mutation of [asset => { asset.size++; }, asset => { asset.digest = `sha256:${'c'.repeat(64)}`; }, asset => { asset.name = 'other.apk'; }, asset => { asset.state = 'new'; }, asset => { asset.browser_download_url = 'https://example.org/installer.apk'; }]) {
    const copy = structuredClone(assets); mutation(copy[0]); assert.throws(() => requireCurrentUploadedAssets(copy, files, delivery));
  }
  assert.throws(() => requireCurrentUploadedAssets([...assets, ...assets], files, delivery));
  assert.throws(() => requireCurrentUploadedAssets(assets, files, { ...delivery, tag: 'v2.44.0' }));
});
function recoveryFixture() {
  const expected = { 'recovery.html': Buffer.from('independent HTML'), 'recovery.js': Buffer.from('independent JS') };
  return { expected, packaged: { ...expected }, config: { android: { minWebViewVersion: 107 }, server: { errorPath: 'recovery.html' } }, worker: 'const SHELL = ["./recovery.html","./recovery.js"];' };
}
function recovery(f = recoveryFixture()) { return requireCurrentRecovery(f.packaged, f.expected, f.config, f.worker); }
test('requires standalone recovery bytes identical to source, correct native fallback and offline inclusion', () => {
  const proof = recovery(); assert.equal(proof.standaloneRawJsonOnly, true); assert.equal(proof.minWebViewVersion, 107);
  assert.equal(proof.errorPath, 'recovery.html'); assert.deepEqual(Object.keys(proof.sha256), ['recovery.html', 'recovery.js']);
  for (const hash of Object.values(proof.sha256)) assert.match(hash, /^[a-f0-9]{64}$/);
});
for (const name of ['recovery.html', 'recovery.js']) {
  test(`rejects missing or stale packaged ${name}`, () => {
    const missing = recoveryFixture(); delete missing.packaged[name]; assert.throws(() => recovery(missing));
    const stale = recoveryFixture(); stale.packaged[name] = Buffer.from('an old file'); assert.throws(() => recovery(stale));
  });
}
for (const [name, mutate] of [
  ['old WebView minimum', f => { f.config.android.minWebViewVersion = 60; }],
  ['no native fallback', f => { delete f.config.server; }],
  ['wrong fallback document', f => { f.config.server.errorPath = 'index.html'; }],
  ['uncached recovery HTML', f => { f.worker = 'const SHELL = ["./recovery.js"];'; }],
  ['uncached recovery script', f => { f.worker = 'const SHELL = ["./recovery.html"];'; }],
]) test(`holds publication on ${name}`, () => { const f = recoveryFixture(); mutate(f); assert.throws(() => recovery(f)); });
