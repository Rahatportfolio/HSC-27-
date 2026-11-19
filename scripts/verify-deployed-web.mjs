/** Verify real Pages bytes against the exact uploaded build, not a success URL
 * or an older deployment. GET-only; no student profile or token is involved. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evidenceAnnotation } from './summarize-browser-evidence.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const treeHash = files => sha256(files.map(file => `${file.path}\0${file.sha256}\0${file.bytes}\n`).join(''));
export function requireWebProof(proof, sourceSha) {
  assert.match(sourceSha || '', /^[a-f0-9]{40}$/);
  assert.equal(proof?.sourceSha, sourceSha, 'Deployment source does not match the uploaded build');
  assert.ok(Array.isArray(proof.files) && proof.files.length > 0 && proof.files.length <= 1000);
  const names = new Set();
  for (const file of proof.files) {
    assert.match(file.path, /^[A-Za-z0-9_./-]+$/);
    assert.ok(!file.path.startsWith('/') && file.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe deployed path');
    assert.ok(!names.has(file.path), 'Duplicate deployed path'); names.add(file.path);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
  }
  for (const name of ['index.html', 'sw.js', 'manifest.webmanifest']) assert.ok(names.has(name), `Missing uploaded ${name}`);
  assert.ok(proof.files.some(file => /^assets\/index-[A-Za-z0-9_-]+\.js$/.test(file.path)), 'Missing uploaded entry script');
  assert.ok(proof.files.some(file => /^assets\/index-[A-Za-z0-9_-]+\.css$/.test(file.path)), 'Missing uploaded stylesheet');
  assert.equal(proof.treeSha256, treeHash(proof.files), 'Corrupted deployment proof');
  return proof;
}
export function captureWebProof(directory, sourceSha) {
  const files = [];
  const walk = (root, prefix = '') => {
    for (const item of readdirSync(root, { withFileTypes: true })) {
      const path = prefix + item.name;
      assert.ok(!item.isSymbolicLink(), 'Symlinks cannot be deployment evidence');
      if (item.isDirectory()) walk(join(root, item.name), path + '/');
      else { assert.ok(item.isFile()); const bytes = readFileSync(join(root, item.name)); files.push({ path, bytes: bytes.length, sha256: sha256(bytes) }); }
    }
  };
  walk(directory); files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return requireWebProof({ sourceSha, files, treeSha256: treeHash(files) }, sourceSha);
}
export async function verifyDeployedWeb(proof, base, { sourceSha, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 10, delayMs = 15000 } = {}) {
  requireWebProof(proof, sourceSha);
  const url = new URL(base);
  assert.equal(url.href, 'https://rahatportfolio.github.io/HSC-27-/', 'Only the actual public app URL is accepted');
  assert.ok(Number.isInteger(attempts) && attempts >= 1 && attempts <= 20);
  assert.ok(Number.isInteger(delayMs) && delayMs >= 0 && delayMs <= 30000);
  let lastFailure;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Bound request concurrency, but compare EVERY uploaded file, including
      // lazy chunks/fonts/icons and the real service worker. No sample pass.
      for (let start = 0; start < proof.files.length; start += 6) {
        await Promise.all(proof.files.slice(start, start + 6).map(async file => {
          const request = new URL(file.path, url); request.searchParams.set('verify', sourceSha);
          const response = await fetcher(request, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
          assert.equal(response.status, 200, `${file.path}: HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          assert.equal(bytes.length, file.bytes, `${file.path}: stale/wrong deployed size`);
          assert.equal(sha256(bytes), file.sha256, `${file.path}: stale/wrong deployed bytes`);
        }));
      }
      const entry = proof.files.find(file => /^assets\/index-.*\.js$/.test(file.path));
      const css = proof.files.find(file => /^assets\/index-.*\.css$/.test(file.path));
      return { sourceSha, deployedUrl: url.href, filesVerified: proof.files.length, bytesVerified: proof.files.reduce((sum, file) => sum + file.bytes, 0), treeSha256: proof.treeSha256, webEntry: entry.path, webEntrySha256: entry.sha256, webCss: css.path, webCssSha256: css.sha256, attempt, allUploadedBytesMatched: true, physicalDeviceCertified: false };
    } catch (error) { lastFailure = error; if (attempt < attempts) await wait(delayMs); }
  }
  throw new Error(`Public Pages did not match this exact build after ${attempts} attempts: ${lastFailure}`, { cause: lastFailure });
}
async function main() {
  if (process.argv[2] === 'capture') {
    const proof = captureWebProof(process.argv[3] || 'dist', process.env.GITHUB_SHA);
    assert.ok(process.env.GITHUB_OUTPUT, 'GitHub output file is required');
    appendFileSync(process.env.GITHUB_OUTPUT, `proof=${Buffer.from(JSON.stringify(proof)).toString('base64')}\n`);
    console.log(`Recorded ${proof.files.length} exact uploaded files: ${proof.treeSha256}`);
  } else {
    assert.equal(process.argv[2], 'verify', 'Use capture or verify');
    const proof = JSON.parse(Buffer.from(process.env.EXPECTED_WEB_PROOF || '', 'base64').toString('utf8'));
    const result = await verifyDeployedWeb(proof, process.env.DEPLOYED_URL, { sourceSha: process.env.GITHUB_SHA });
    console.log(evidenceAnnotation('notice', 'Verified public PWA deployment', result));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
