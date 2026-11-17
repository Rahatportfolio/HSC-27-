// Read-only verification of an already-uploaded APK. Does not build, replace or
// publish a release. Run in Android CI, where GitHub's asset CDN is reachable.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function signingFingerprint(output) {
  assert.match(output, /^Verifies\s*$/m, 'APK signature must verify');
  const fingerprints = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9:]+)\s*$/gm)];
  assert.equal(fingerprints.length, 1, 'Exactly one signing certificate is required for this comparison');
  const fingerprint = fingerprints[0][1].replaceAll(':', '').toLowerCase();
  assert.match(fingerprint, /^[a-f0-9]{64}$/, 'Invalid signing certificate digest');
  return fingerprint;
}

export function verifyFacts(f) {
  assert.match(f.tag, /^v\d+\.\d+\.\d+$/);
  assert.match(f.sha, /^[a-f0-9]{40}$/);
  assert.equal(f.release.tag_name, f.tag, 'Release tag mismatch');
  assert.equal(f.tagSha, f.sha, 'Git tag source mismatch');
  assert.equal(f.release.target_commitish, f.sha, 'Release source mismatch');
  assert.equal(f.asset.name, `prostuti-hsc27-${f.tag}.apk`, 'Asset name mismatch');
  assert.equal(f.asset.state, 'uploaded', 'Asset is not uploaded');
  assert.ok(f.actualSize > 0);
  assert.equal(f.actualSize, f.asset.size, 'Downloaded size mismatch');
  assert.match(f.actualDigest, /^[a-f0-9]{64}$/);
  assert.equal(`sha256:${f.actualDigest}`, f.asset.digest, 'Downloaded SHA-256 mismatch');
  const line = f.badging.match(/^package: .+$/m)?.[0] || '';
  const packageName = line.match(/\bname='([^']+)'/)?.[1];
  const versionCode = Number(line.match(/\bversionCode='(\d+)'/)?.[1]);
  const versionName = line.match(/\bversionName='([^']+)'/)?.[1];
  assert.equal(packageName, 'com.prostuti.hsc27', 'APK package mismatch');
  assert.equal(versionCode, f.code, 'APK version code mismatch');
  assert.equal(versionName, f.tag.slice(1), 'APK version name mismatch');
  return { packageName, versionCode, versionName, certificateSha256: signingFingerprint(f.signature) };
}

function main() {
  const { GITHUB_REPOSITORY: repo, AUDIT_RELEASE_TAG: tag, AUDIT_EXPECTED_SHA: sha, AUDIT_PREVIOUS_TAG: previousTag } = process.env;
  assert.match(repo || '', /^[\w.-]+\/[\w.-]+$/);
  assert.match(tag || '', /^v\d+\.\d+\.\d+$/);
  assert.match(sha || '', /^[a-f0-9]{40}$/);
  if (previousTag) assert.match(previousTag, /^v\d+\.\d+\.\d+$/);
  const api = path => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const releases = api('releases?per_page=100');
  const matches = releases.filter(r => r.tag_name === tag);
  assert.equal(matches.length, 1, 'Expected exactly one matching draft/published release');
  const release = matches[0];
  const tagRef = api(`git/ref/tags/${tag}`);
  assert.equal(tagRef.object.type, 'commit', 'Expected a lightweight commit tag');
  // Read expected metadata from the intended release source, not this audit branch.
  const content = path => Buffer.from(api(`contents/${path}?ref=${sha}`).content, 'base64').toString('utf8');
  const pkg = JSON.parse(content('package.json'));
  assert.equal(pkg.version, tag.slice(1));
  const gradle = content('android/app/build.gradle');
  assert.equal(gradle.match(/versionName\s+"([^"]+)"/)?.[1], pkg.version);
  const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(code) && code > 0);
  const asset = release.assets.find(a => a.name === `prostuti-hsc27-${tag}.apk`);
  assert.ok(asset, 'Expected tagged APK asset is missing');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  assert.ok(sdk, 'Android SDK is required');
  const root = join(sdk, 'build-tools');
  const tools = readdirSync(root).filter(v => ['aapt', 'apksigner'].every(tool => existsSync(join(root, v, tool))))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
  assert.ok(tools, 'aapt/apksigner are required');
  const aapt = join(root, tools, 'aapt');
  const apksigner = join(root, tools, 'apksigner');
  const work = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'release-apk-audit-'));
  const download = (a, filename) => {
    const path = join(work, filename);
    const fd = openSync(path, 'w', 0o600);
    try { execFileSync('gh', ['api', `repos/${repo}/releases/assets/${a.id}`, '-H', 'Accept: application/octet-stream'], { stdio: ['ignore', fd, 'pipe'] }); }
    finally { closeSync(fd); }
    return path;
  };
  const apk = download(asset, 'current.apk');
  const bytes = readFileSync(apk);
  execFileSync('unzip', ['-tqq', apk]);
  const facts = {
    tag, sha, code, release, tagSha: tagRef.object.sha, asset,
    actualSize: bytes.length, actualDigest: createHash('sha256').update(bytes).digest('hex'),
    badging: execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' }),
    signature: execFileSync(apksigner, ['verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' }),
  };
  const checked = verifyFacts(facts);
  const index = execFileSync('unzip', ['-p', apk, 'assets/public/index.html'], { encoding: 'utf8' });
  const mainAsset = index.match(/<script\b[^>]*\bsrc=["'](?:\.\/|\/)?(assets\/[a-zA-Z0-9_.-]+\.js)["']/)?.[1];
  assert.ok(mainAsset, 'Embedded offline web entry point is missing');
  const mainBytes = execFileSync('unzip', ['-p', apk, `assets/public/${mainAsset}`], { maxBuffer: 16 * 1024 * 1024 });
  assert.ok(mainBytes.length > 0);
  let previous = null;
  if (previousTag) {
    const previousRelease = api(`releases/tags/${previousTag}`);
    const previousAsset = previousRelease.assets.find(a => a.name === `prostuti-hsc27-${previousTag}.apk`);
    assert.ok(previousAsset, 'Previous APK is required for a signing comparison');
    const oldApk = download(previousAsset, 'previous.apk');
    const oldBytes = readFileSync(oldApk);
    assert.equal(oldBytes.length, previousAsset.size);
    const oldCertificate = signingFingerprint(execFileSync(apksigner, ['verify', '--verbose', '--print-certs', oldApk], { encoding: 'utf8' }));
    previous = {
      tag: previousTag, assetId: previousAsset.id, certificateSha256: oldCertificate,
      sameSigningCertificate: oldCertificate === checked.certificateSha256,
    };
  }
  const report = {
    tag, sourceCommit: sha, releaseId: release.id, draftAtInspection: release.draft,
    assetId: asset.id, assetName: asset.name, size: facts.actualSize, sha256: facts.actualDigest,
    ...checked, zipIntegrity: 'passed', apkSignature: 'verified',
    mainAsset, mainAssetSha256: createHash('sha256').update(mainBytes).digest('hex'), previous,
  };
  writeFileSync('release-asset-verification.json', JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Uploaded APK inspection\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
  // Notices are readable through the check-run annotations API, unlike CDN logs.
  console.log(`::notice title=APK artifact verification::${JSON.stringify(report).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
