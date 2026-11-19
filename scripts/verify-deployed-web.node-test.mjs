import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureWebProof, requireWebProof, verifyDeployedWeb } from './verify-deployed-web.mjs';

const sourceSha = 'a'.repeat(40), base = 'https://rahatportfolio.github.io/HSC-27-/';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'prostuti-pages-proof-'));
  const bytes = { 'index.html': 'current shell', 'sw.js': 'current service worker', 'manifest.webmanifest': '{}', 'assets/index-1234.js': 'current S/Brain entry', 'assets/index-1234.css': 'wrapped chapter', 'assets/lazy-route-1234.js': 'current optional route' };
  try {
    for (const [path, value] of Object.entries(bytes)) { const full = join(directory, path); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, value); }
    const proof = captureWebProof(directory, sourceSha);
    const fetcher = async url => { const value = Buffer.from(bytes[new URL(url).pathname.replace('/HSC-27-/', '')]); return { status: 200, arrayBuffer: async () => value }; };
    return { proof, bytes, fetcher };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('verifies every exact uploaded file, not merely the shell URL or first chunk', async () => {
  const { proof, fetcher } = fixture(); let calls = 0;
  const result = await verifyDeployedWeb(proof, base, { sourceSha, fetcher: async (...args) => { calls++; return fetcher(...args); } });
  assert.equal(calls, proof.files.length); assert.equal(result.filesVerified, proof.files.length);
  assert.equal(result.allUploadedBytesMatched, true); assert.equal(result.physicalDeviceCertified, false);
});
test('rejects an older source even when the public files would match', async () => {
  const { proof, fetcher } = fixture();
  await assert.rejects(verifyDeployedWeb(proof, base, { sourceSha: 'b'.repeat(40), fetcher }), /source does not match/);
});
for (const url of ['http://rahatportfolio.github.io/HSC-27-/', 'https://example.org/HSC-27-/', 'https://rahatportfolio.github.io/other/', 'https://rahatportfolio.github.io/HSC-27-/?old=1']) test(`rejects unrelated deployment URL ${url}`, async () => {
  const { proof, fetcher } = fixture(); await assert.rejects(verifyDeployedWeb(proof, url, { sourceSha, fetcher }), /actual public app URL/);
});
test('fails closed on a changed lazy chunk of exactly the same byte length', async () => {
  const { proof, fetcher } = fixture();
  await assert.rejects(verifyDeployedWeb(proof, base, { sourceSha, attempts: 1, fetcher: async url => new URL(url).pathname.includes('lazy-route') ? { status: 200, arrayBuffer: async () => Buffer.from('CURRENT optional route') } : fetcher(url) }), /stale\/wrong deployed bytes/);
});
test('retries bounded CDN propagation but never accepts stale bytes', async () => {
  const { proof, fetcher } = fixture(); let waits = 0;
  const result = await verifyDeployedWeb(proof, base, { sourceSha, attempts: 2, delayMs: 0, wait: async () => { waits++; }, fetcher: async url => waits ? fetcher(url) : { status: 404, arrayBuffer: async () => Buffer.alloc(0) } });
  assert.equal(waits, 1); assert.equal(result.attempt, 2);
  await assert.rejects(verifyDeployedWeb(proof, base, { sourceSha, attempts: 1, fetcher: async () => ({ status: 404 }) }), /HTTP 404/);
});
test('rejects corrupt, duplicate, traversing and shell-only evidence', () => {
  const { proof } = fixture();
  for (const mutate of [p => { p.treeSha256 = 'b'.repeat(64); }, p => p.files.push(p.files[0]), p => { p.files[0].path = '../secret'; }, p => { p.files = p.files.filter(file => file.path !== 'sw.js'); }, p => { p.files = p.files.filter(file => !file.path.startsWith('assets/')); }]) {
    const copy = structuredClone(proof); mutate(copy); assert.throws(() => requireWebProof(copy, sourceSha));
  }
});
