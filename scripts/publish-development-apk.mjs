// One explicitly requested direct download of an already-tested debug APK.
// This is NOT the production release path. Never changes an existing release,
// rebuilds/re-signs an APK, or satisfies/bypasses the compatible-update gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLISHED_BASELINE } from './check-android-release.mjs';
import { signingFingerprint } from './verify-release-asset.mjs';

export const DELIVERY = Object.freeze({
  repo: 'Rahatportfolio/HSC-27-',
  sourceSha: '14e6640e9ae4046372fb0f97ebe89b489de93934',
  sourceRun: 44377968065,
  artifactId: 14463465347,
  artifactSize: 10922621,
  artifactDigest: '16ddb0801b48b464dab0861e8c4791c56736dfe25a8220cf1c9ee84e39d93853',
  inputName: 'prostuti-hsc27-main-debug.apk',
  tag: 'dev-apk-14e6640e9ae4',
  assetName: 'prostuti-hsc27-14e6640-development.apk',
  packageName: 'com.prostuti.hsc27',
  versionName: '2.44.0',
  versionCode: 24,
  mainSha256: '9c83e73874ba39d334cf234a844a7ab2011ae4c0003e54d7932972f3ef0e4849',
  cssSha256: 'a85e88df7b01b2559554420b25bf70f7f23b7442f48fb5c680b73751ae2e16e4',
  heldReleaseId: 449690511,
  heldAssetId: 762550392,
  heldAssetDigest: 'sha256:6bc0b311fabda582b9f9a4c67c1e873ecb7cbf216e1d1060943e69ab90dbfec0',
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function requireTestedSource(run, jobs, artifact) {
  assert.equal(run.id, DELIVERY.sourceRun, 'Wrong build run');
  assert.equal(run.repository?.full_name, DELIVERY.repo, 'Wrong source repository');
  assert.equal(run.head_sha, DELIVERY.sourceSha, 'Wrong build source');
  assert.equal(run.head_branch, 'main', 'Expected the merged main build');
  assert.equal(run.event, 'push', 'Expected the automatic main build');
  assert.equal(run.path, '.github/workflows/android-apk.yml', 'Wrong source workflow');
  assert.equal(run.status, 'completed', 'Source build is not completed');
  assert.equal(run.conclusion, 'success', 'Source workflow must pass');
  for (const name of ['Build installable APK', 'Android WebView device checks (API 34)', 'Android WebView device checks (API 35)']) {
    const matches = jobs.jobs.filter(job => job.name === name);
    assert.equal(matches.length, 1, `Missing/ambiguous source job: ${name}`);
    assert.equal(matches[0].status, 'completed', `Incomplete source job: ${name}`);
    assert.equal(matches[0].conclusion, 'success', `Failed source job: ${name}`);
  }
  assert.equal(artifact.id, DELIVERY.artifactId, 'Wrong artifact ID');
  assert.equal(artifact.name, 'prostuti-hsc27-apk', 'Wrong artifact name');
  assert.equal(artifact.expired, false, 'Artifact has expired');
  assert.equal(artifact.size_in_bytes, DELIVERY.artifactSize, 'Artifact size changed');
  assert.equal(artifact.digest, `sha256:${DELIVERY.artifactDigest}`, 'Artifact digest changed');
  assert.equal(artifact.workflow_run?.id, DELIVERY.sourceRun, 'Artifact belongs to another run');
  assert.equal(artifact.workflow_run?.head_sha, DELIVERY.sourceSha, 'Artifact source changed');
  assert.equal(artifact.workflow_run?.head_branch, 'main', 'Artifact is not from main');
  return true;
}

export function requireArtifactArchive({ size, sha256, entries }) {
  assert.equal(size, DELIVERY.artifactSize, 'Downloaded archive size mismatch');
  assert.equal(sha256, DELIVERY.artifactDigest, 'Downloaded archive digest mismatch');
  assert.deepEqual(entries, [DELIVERY.inputName], 'Expected exactly the pinned debug APK; no paths/extra files');
  return true;
}

export function requireDevelopmentApk(badging, signature) {
  const line = badging.match(/^package: .+$/m)?.[0] || '';
  assert.equal(line.match(/\bname='([^']+)'/)?.[1], DELIVERY.packageName, 'APK package changed');
  assert.equal(line.match(/\bversionName='([^']+)'/)?.[1], DELIVERY.versionName, 'APK version changed');
  assert.equal(Number(line.match(/\bversionCode='(\d+)'/)?.[1]), DELIVERY.versionCode, 'APK version code changed');
  assert.match(badging, /^application-debuggable\s*$/m, 'This delivery is only the explicitly labelled debug artifact');
  const certificateSha256 = signingFingerprint(signature);
  return {
    packageName: DELIVERY.packageName, versionName: DELIVERY.versionName, versionCode: DELIVERY.versionCode,
    apkSignature: 'verified', certificateSha256, debuggable: true,
    baselineCertificateSha256: PUBLISHED_BASELINE.certificateSha256,
    sameSigningCertificate: certificateSha256 === PUBLISHED_BASELINE.certificateSha256,
    compatibleProductionUpdate: false,
  };
}

export function requireDevelopmentRelease(release, draft) {
  assert.ok(Number.isSafeInteger(release.id) && release.id > 0, 'Missing new release ID');
  assert.notEqual(release.id, DELIVERY.heldReleaseId, 'Cannot modify the held production release');
  assert.equal(release.tag_name, DELIVERY.tag, 'Only the pinned non-version development tag is allowed');
  assert.equal(release.target_commitish, DELIVERY.sourceSha, 'Release source changed');
  assert.equal(release.prerelease, true, 'Must remain a prerelease');
  assert.equal(release.draft, draft, 'Unexpected draft state');
  assert.match(release.name, /Development APK/);
  assert.match(release.body, /NOT A PRODUCTION UPDATE/);
  assert.match(release.body, /Do not uninstall or Clear data/);
  return true;
}

export function requireUploadedAssets(assets, files, published = true) {
  assert.equal(assets.length, files.length, 'Unexpected/missing release assets');
  for (const file of files) {
    const matches = assets.filter(asset => asset.name === file.name);
    assert.equal(matches.length, 1, `Missing/ambiguous asset: ${file.name}`);
    const asset = matches[0];
    assert.equal(asset.state, 'uploaded', 'Upload is incomplete');
    assert.equal(asset.size, file.size, 'Uploaded size differs');
    assert.equal(asset.digest, `sha256:${file.sha256}`, 'Uploaded digest differs');
    // Draft assets can have GitHub-generated untagged-* URLs until publication.
    if (published) assert.equal(asset.browser_download_url, `https://github.com/${DELIVERY.repo}/releases/download/${DELIVERY.tag}/${file.name}`, 'Unexpected download URL');
  }
  return true;
}

function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only in the reviewed GitHub workflow');
  assert.equal(process.env.GITHUB_REPOSITORY, DELIVERY.repo, 'Wrong delivery repository');
  assert.equal(process.env.DIRECT_APK_CONFIRMATION, 'development-only-no-compatible-update', 'Explicit development-download acknowledgement required');
  const api = (path, method = 'GET', body) => JSON.parse(execFileSync('gh', ['api', `repos/${DELIVERY.repo}/${path}`, '--method', method, ...(body ? ['--input', '-'] : [])], {
    encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, maxBuffer: 8 * 1024 * 1024,
  }));
  const notice = (title, value) => console.log(`::notice title=${title}::${JSON.stringify(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  const run = api(`actions/runs/${DELIVERY.sourceRun}`);
  const jobs = api(`actions/runs/${DELIVERY.sourceRun}/jobs?per_page=100`);
  const artifact = api(`actions/artifacts/${DELIVERY.artifactId}`);
  requireTestedSource(run, jobs, artifact);
  const heldBefore = api(`releases/${DELIVERY.heldReleaseId}`);
  assert.equal(heldBefore.draft, true, 'The held release must remain draft');
  assert.equal(heldBefore.assets.find(asset => asset.id === DELIVERY.heldAssetId)?.digest, DELIVERY.heldAssetDigest, 'Held release asset changed');
  const latestBefore = api('releases/latest');
  assert.equal(api(`git/matching-refs/tags/${DELIVERY.tag}`).length, 0, 'Never replace an existing development tag');
  assert.ok(!api('releases?per_page=100').some(release => release.tag_name === DELIVERY.tag), 'Never replace an existing development release');

  const work = resolve('.cache/direct-apk');
  mkdirSync(work, { recursive: true });
  const archive = join(work, 'source.zip');
  const fd = openSync(archive, 'w', 0o600);
  try { execFileSync('gh', ['api', `repos/${DELIVERY.repo}/actions/artifacts/${DELIVERY.artifactId}/zip`], { stdio: ['ignore', fd, 'pipe'] }); }
  finally { closeSync(fd); }
  execFileSync('unzip', ['-tqq', archive]);
  const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
  const archiveBytes = readFileSync(archive);
  requireArtifactArchive({ size: archiveBytes.length, sha256: digest(archiveBytes), entries });
  const apk = join(work, DELIVERY.assetName);
  const bytes = execFileSync('unzip', ['-p', archive, DELIVERY.inputName], { maxBuffer: 40 * 1024 * 1024 });
  writeFileSync(apk, bytes);
  execFileSync('unzip', ['-tqq', apk]);
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  assert.ok(sdk, 'Android SDK is required to inspect the original APK');
  const root = join(sdk, 'build-tools');
  const tools = readdirSync(root).filter(version => ['aapt', 'apksigner'].every(tool => existsSync(join(root, version, tool))))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
  assert.ok(tools, 'aapt/apksigner are required');
  const checked = requireDevelopmentApk(execFileSync(join(root, tools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' }),
    execFileSync(join(root, tools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' }));
  const entry = execFileSync('unzip', ['-p', apk, 'assets/public/index.html'], { encoding: 'utf8' });
  const mainAsset = entry.match(/<script\b[^>]*\bsrc=["'](?:\.\/|\/)?(assets\/[a-zA-Z0-9_.-]+\.js)["']/)?.[1];
  const cssAsset = entry.match(/<link\b[^>]*\bhref=["'](?:\.\/|\/)?(assets\/[a-zA-Z0-9_.-]+\.css)["']/)?.[1];
  assert.ok(mainAsset && cssAsset, 'Offline web entry assets are required');
  const embeddedDigest = path => digest(execFileSync('unzip', ['-p', apk, `assets/public/${path}`], { maxBuffer: 20 * 1024 * 1024 }));
  assert.equal(embeddedDigest(mainAsset), DELIVERY.mainSha256, 'Embedded JS differs from the tested production snapshot');
  assert.equal(embeddedDigest(cssAsset), DELIVERY.cssSha256, 'Embedded CSS differs from the tested production snapshot');
  const report = { sourceCommit: DELIVERY.sourceSha, sourceRun: DELIVERY.sourceRun, artifactId: DELIVERY.artifactId,
    artifactSha256: DELIVERY.artifactDigest, assetName: DELIVERY.assetName, size: bytes.length, sha256: digest(bytes),
    ...checked, zipIntegrity: 'passed', mainAsset, mainAssetSha256: DELIVERY.mainSha256, cssAsset, cssAssetSha256: DELIVERY.cssSha256,
    sourceBuildAndApi34And35: 'success', classification: 'Development/debug; fresh installations only; NOT A PRODUCTION UPDATE' };
  const reportPath = join(work, 'direct-apk-inspection.json');
  const sumsPath = join(work, 'SHA256SUMS.txt');
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(sumsPath, `${report.sha256}  ${DELIVERY.assetName}\n`);
  notice('Inspected development APK', report);
  const body = `## NOT A PRODUCTION UPDATE\n\nDirect development APK from tested source \`${DELIVERY.sourceSha}\` ([successful build + API 34/35 checks](https://github.com/${DELIVERY.repo}/actions/runs/${DELIVERY.sourceRun})). The original APK bytes are unchanged: not rebuilt, re-signed or repackaged.\n\n**পুরোনো প্রস্তুতি অ্যাপ থাকলে এই APK দিয়ে update করবেন না। মূল app/data রাখুন; Uninstall বা Clear data করবেন না।**\n\nThis APK is **debuggable**, version ${DELIVERY.versionName} / code ${DELIVERY.versionCode}, package \`${DELIVERY.packageName}\`. Development/testing on a **fresh installation only**; not a compatible production update. Do not uninstall or Clear data to bypass a signing conflict. No package-identity change, migration, account or cloud sync. PWA and APK storage are separate; legacy JSON/full backups do not include scan image bytes.\n\nTo install on a device **without an existing copy**, download the **.apk** asset (not Source code ZIP), open it and follow Android's installation prompts. Android/OEM compatibility is not guaranteed.\n\nSHA-256: \`${report.sha256}\`. Inspect \`direct-apk-inspection.json\` and \`SHA256SUMS.txt\` below. This prerelease is not Latest; historical production releases and the held v2.44.0 draft remain unchanged.\n`;
  const release = api('releases', 'POST', { tag_name: DELIVERY.tag, target_commitish: DELIVERY.sourceSha,
    name: 'Development APK — tested PR #18 (NOT a production update)', body, draft: true, prerelease: true, make_latest: 'false' });
  requireDevelopmentRelease(release, true);
  assert.notEqual(release.id, latestBefore.id, 'Cannot change the current latest production release');
  // Never --clobber. Any failure leaves a draft, rather than publishing a partial upload.
  execFileSync('gh', ['release', 'upload', DELIVERY.tag, apk, reportPath, sumsPath, '--repo', DELIVERY.repo], { stdio: 'inherit' });
  const files = [apk, reportPath, sumsPath].map(path => ({ name: path.split('/').at(-1), size: readFileSync(path).length, sha256: digest(readFileSync(path)) }));
  requireUploadedAssets(api(`releases/${release.id}/assets?per_page=100`), files, false);
  const published = api(`releases/${release.id}`, 'PATCH', { draft: false, prerelease: true, make_latest: 'false' });
  requireDevelopmentRelease(published, false);
  const uploaded = api(`releases/${release.id}/assets?per_page=100`);
  requireUploadedAssets(uploaded, files);
  const tag = api(`git/ref/tags/${DELIVERY.tag}`);
  assert.equal(tag.object.type, 'commit', 'Expected a direct commit tag');
  assert.equal(tag.object.sha, DELIVERY.sourceSha, 'Published tag source mismatch');
  assert.equal(api('releases/latest').id, latestBefore.id, 'Development download must not become Latest');
  const heldAfter = api(`releases/${DELIVERY.heldReleaseId}`);
  assert.equal(heldAfter.draft, heldBefore.draft, 'Held draft state changed');
  assert.deepEqual(heldAfter.assets.map(asset => [asset.id, asset.name, asset.size, asset.digest]), heldBefore.assets.map(asset => [asset.id, asset.name, asset.size, asset.digest]), 'Historical assets changed');
  const result = { ...report, releaseId: published.id, releaseUrl: published.html_url,
    downloadUrl: uploaded.find(asset => asset.name === DELIVERY.assetName).browser_download_url,
    tag: DELIVERY.tag, publishedAsPrerelease: true, latestProductionReleaseUnchanged: true, heldDraftUnchanged: true };
  writeFileSync(join(work, 'direct-apk-delivery.json'), JSON.stringify(result, null, 2) + '\n');
  notice('Direct development APK', result);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Development download — NOT an update\n\n[Download .apk](${result.downloadUrl})\n\nDo not uninstall or Clear data. Original app/data must be retained.\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) {
    const message = String(error.stack || error).slice(0, 3500).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Development APK download blocked::${message}`);
    process.exitCode = 1;
  }
}
