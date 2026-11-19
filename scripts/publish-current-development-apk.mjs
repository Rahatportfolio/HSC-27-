// Explicit current-branch DEVELOPMENT download, never a production updater.
// Only immutable bytes from this exact run, after web + API34/API35 success.
// No signing/rebuild, old-asset replacement, Latest change or data-reset advice.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requireDevelopmentApk } from './publish-development-apk.mjs';

export const CURRENT_POLICY = Object.freeze({
  repo: 'Rahatportfolio/HSC-27-', branch: 'arena/80a86bf2-hsc-27',
  workflow: '.github/workflows/android-apk.yml',
  confirmation: 'current-development-only-no-compatible-update',
  jobs: ['Build installable APK', 'Android WebView device checks (API 34)', 'Android WebView device checks (API 35)', 'Built web acceptance'],
});
export function requireCurrentSource(env, run, jobs, artifact) {
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_REPOSITORY, CURRENT_POLICY.repo, 'Wrong repository');
  assert.equal(env.GITHUB_REF, `refs/heads/${CURRENT_POLICY.branch}`, 'Wrong branch');
  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Only the explicit push acknowledgement is accepted');
  assert.equal(env.CURRENT_DEV_APK_CONFIRMATION, CURRENT_POLICY.confirmation, 'Explicit development-only acknowledgement required');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9]\d*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^[1-9]\d*$/);
  assert.equal(run.id, Number(env.GITHUB_RUN_ID), 'Wrong source run');
  assert.equal(run.run_attempt, Number(env.GITHUB_RUN_ATTEMPT), 'Wrong run attempt');
  assert.equal(run.repository?.full_name, CURRENT_POLICY.repo, 'Wrong run repository');
  assert.equal(run.path, CURRENT_POLICY.workflow, 'Wrong source workflow');
  assert.equal(run.event, 'push');
  assert.equal(run.head_branch, CURRENT_POLICY.branch);
  assert.equal(run.head_sha, env.GITHUB_SHA, 'Wrong source commit');
  assert.match(run.head_commit?.message || '', /\[current-dev-apk\]/, 'Commit must explicitly request this development download');
  assert.ok(['in_progress', 'completed'].includes(run.status), 'Source run is not active/completed');
  for (const name of CURRENT_POLICY.jobs) {
    const matches = jobs.jobs.filter(job => job.name === name);
    assert.equal(matches.length, 1, `Missing/ambiguous required job: ${name}`);
    assert.equal(matches[0].status, 'completed', `${name} is incomplete`);
    assert.equal(matches[0].conclusion, 'success', `${name} must pass`);
  }
  assert.equal(artifact.name, 'prostuti-hsc27-apk');
  assert.equal(artifact.expired, false);
  assert.equal(artifact.workflow_run?.id, run.id);
  assert.equal(artifact.workflow_run?.head_branch, CURRENT_POLICY.branch);
  assert.equal(artifact.workflow_run?.head_sha, env.GITHUB_SHA);
  assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0);
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0);
  assert.match(artifact.digest || '', /^sha256:[a-f0-9]{64}$/);
  return { tag: `dev-apk-${env.GITHUB_SHA.slice(0, 12)}`, assetName: `prostuti-hsc27-${env.GITHUB_SHA.slice(0, 12)}-development.apk`, sourceSha: env.GITHUB_SHA, runId: run.id, artifactId: artifact.id };
}
export function requireCurrentArchive(artifact, size, sha256, entries) {
  assert.equal(size, artifact.size_in_bytes, 'Downloaded archive size differs');
  assert.equal(`sha256:${sha256}`, artifact.digest, 'Downloaded archive hash differs');
  const prefix = `prostuti-hsc27-${CURRENT_POLICY.branch.replaceAll('/', '-')}`;
  const debug = `${prefix}-debug.apk`, allowed = [debug, `${prefix}-release.apk`, `${prefix}.aab`];
  assert.equal(new Set(entries).size, entries.length, 'Duplicate archive entries');
  assert.ok(entries.includes(debug), 'Missing exact debug APK');
  assert.ok(entries.every(entry => allowed.includes(entry)), 'Unexpected archive entry/path');
  return debug;
}
export function requireCurrentUploadedAssets(assets, files, delivery, published = true) {
  assert.match(delivery.tag, /^dev-apk-[a-f0-9]{12}$/);
  assert.equal(assets.length, files.length, 'Unexpected/missing uploaded assets');
  for (const file of files) {
    const matches = assets.filter(asset => asset.name === file.name);
    assert.equal(matches.length, 1, 'Missing/ambiguous uploaded asset');
    const asset = matches[0];
    assert.equal(asset.state, 'uploaded');
    assert.equal(asset.size, file.size);
    assert.equal(asset.digest, `sha256:${file.sha256}`);
    if (published) assert.equal(asset.browser_download_url, `https://github.com/${CURRENT_POLICY.repo}/releases/download/${delivery.tag}/${file.name}`);
  }
  return true;
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function main() {
  // Check local preconditions before issuing any network or publication request.
  const env = process.env;
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.CURRENT_DEV_APK_CONFIRMATION, CURRENT_POLICY.confirmation);
  assert.equal(env.GITHUB_REPOSITORY, CURRENT_POLICY.repo);
  assert.equal(env.GITHUB_REF, `refs/heads/${CURRENT_POLICY.branch}`);
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9]\d*$/);
  const api = (path, method = 'GET', body) => JSON.parse(execFileSync('gh', ['api', `repos/${CURRENT_POLICY.repo}/${path}`, '--method', method, ...(body ? ['--input', '-'] : [])], { encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, maxBuffer: 8 * 1024 * 1024 }));
  const run = api(`actions/runs/${env.GITHUB_RUN_ID}`), jobs = api(`actions/runs/${env.GITHUB_RUN_ID}/jobs?per_page=100`);
  const artifacts = api(`actions/runs/${env.GITHUB_RUN_ID}/artifacts?per_page=100`).artifacts.filter(artifact => artifact.name === 'prostuti-hsc27-apk');
  assert.equal(artifacts.length, 1, 'Expected one immutable build artifact');
  const artifact = api(`actions/artifacts/${artifacts[0].id}`);
  const delivery = requireCurrentSource(env, run, jobs, artifact);
  const latestBefore = api('releases/latest');
  assert.equal(api(`git/matching-refs/tags/${delivery.tag}`).length, 0, 'Never replace an existing tag');
  assert.ok(!api('releases?per_page=100').some(release => release.tag_name === delivery.tag), 'Never replace an existing release');
  const work = resolve('.cache/current-dev-apk'); mkdirSync(work, { recursive: true });
  const archive = join(work, 'source.zip'), descriptor = openSync(archive, 'w', 0o600);
  try { execFileSync('gh', ['api', `repos/${CURRENT_POLICY.repo}/actions/artifacts/${artifact.id}/zip`], { stdio: ['ignore', descriptor, 'pipe'] }); }
  finally { closeSync(descriptor); }
  execFileSync('unzip', ['-tqq', archive]);
  const archiveBytes = readFileSync(archive), entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
  const sourceName = requireCurrentArchive(artifact, archiveBytes.length, digest(archiveBytes), entries);
  const apk = join(work, delivery.assetName);
  writeFileSync(apk, execFileSync('unzip', ['-p', archive, sourceName], { maxBuffer: 100 * 1024 * 1024 }));
  execFileSync('unzip', ['-tqq', apk]);
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  assert.ok(sdk, 'Android SDK required for real APK inspection');
  const tools = readdirSync(join(sdk, 'build-tools')).filter(version => /^\d+\.\d+\.\d+$/.test(version)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  assert.ok(tools, 'Android build tools required');
  const badging = execFileSync(join(sdk, 'build-tools', tools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' });
  const signature = execFileSync(join(sdk, 'build-tools', tools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' });
  const identity = requireDevelopmentApk(badging, signature);
  const packaged = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(packaged.includes('assets/public/index.html') && packaged.includes('assets/public/sw.js'), 'Missing packaged app shell');
  const html = execFileSync('unzip', ['-p', apk, 'assets/public/index.html'], { encoding: 'utf8' });
  const entry = html.match(/<script[^>]*\bsrc="\.\/(assets\/index-[^"]+\.js)"/)?.[1];
  assert.ok(entry && packaged.includes(`assets/public/${entry}`), 'Packaged entry is missing');
  const apkBytes = readFileSync(apk);
  const inspection = { ...delivery, ...identity, compatibleProductionUpdate: false, zipIntegrity: 'passed', apkSha256: digest(apkBytes), apkSize: apkBytes.length, artifactArchiveSha256: digest(archiveBytes), requiredJobs: CURRENT_POLICY.jobs, externalPlayerCertified: false, physicalDeviceCertified: false, originalSigningKeyRecovered: false };
  writeFileSync(join(work, 'inspection.json'), JSON.stringify(inspection, null, 2));
  writeFileSync(join(work, 'SHA256SUMS.txt'), `${inspection.apkSha256}  ${delivery.assetName}\n`);
  const files = [delivery.assetName, 'inspection.json', 'SHA256SUMS.txt'].map(name => { const bytes = readFileSync(join(work, name)); return { name, size: bytes.length, sha256: digest(bytes) }; });
  const body = `Current S-first routine + optional local Study Brain — DEVELOPMENT APK ONLY.\n\nSource: ${delivery.sourceSha}\nBuild and Android API 34/API 35 + built-web acceptance: https://github.com/${CURRENT_POLICY.repo}/actions/runs/${delivery.runId}\nAPK SHA-256: ${inspection.apkSha256}\nSigning certificate SHA-256: ${inspection.certificateSha256}\n\nThis is a debuggable prerelease, NOT an approved compatible update of the published app. Original signing-key continuity is NOT established. Do NOT uninstall the old app, Clear data, or discard the original device to install this. Keep verified full-media backups/PDFs; JSON and legacy backups omit scan bytes. PWA/APK private storage is separate. Intended only for a separate test device/profile with no conflicting installation. No historical release/asset or Latest pointer is replaced.\n\nএটি development/test APK; পুরোনো app uninstall বা Clear data করবে না। পুরোনো app-এর নিরাপদ update হিসেবে অনুমোদিত নয়।`;
  const draft = api('releases', 'POST', { tag_name: delivery.tag, target_commitish: delivery.sourceSha, name: `Prostuti HSC27 ${delivery.sourceSha.slice(0, 12)} — development only`, body, draft: true, prerelease: true, make_latest: 'false' });
  assert.equal(draft.draft, true); assert.equal(draft.prerelease, true);
  // No --clobber and no edit of any historical asset. Any failure leaves a draft.
  execFileSync('gh', ['release', 'upload', delivery.tag, ...files.map(file => join(work, file.name)), '--repo', CURRENT_POLICY.repo], { stdio: 'inherit' });
  const uploaded = api(`releases/${draft.id}`);
  requireCurrentUploadedAssets(uploaded.assets, files, delivery, false);
  assert.equal(api('releases/latest').id, latestBefore.id, 'Latest changed concurrently; hold development download');
  const published = api(`releases/${draft.id}`, 'PATCH', { draft: false, prerelease: true, make_latest: 'false' });
  assert.equal(published.draft, false); assert.equal(published.prerelease, true); assert.equal(published.target_commitish, delivery.sourceSha);
  requireCurrentUploadedAssets(published.assets, files, delivery);
  assert.equal(api('releases/latest').id, latestBefore.id, 'Development prerelease must never become Latest');
  const result = { ...inspection, releaseId: published.id, releaseUrl: published.html_url, directApkUrl: published.assets.find(asset => asset.name === delivery.assetName).browser_download_url, latestReleaseUnchanged: true };
  writeFileSync(join(work, 'delivery.json'), JSON.stringify(result, null, 2));
  console.log(`Current development APK: ${result.directApkUrl}\nSHA-256: ${inspection.apkSha256}\nNOT a compatible production update. Keep the original app and data.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
