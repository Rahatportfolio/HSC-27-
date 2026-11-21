/** Production build regression gate; no raised Vite warning threshold. */
import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const BUILD_LIMITS = Object.freeze({ entry: 500_000, chunk: 500_000, criticalJavaScript: 1_100_000 });
export function inspectBuild(manifest, sizes, limits = BUILD_LIMITS) {
  assert(manifest['index.html']?.isEntry, 'Missing production entry');
  const initial = new Set();
  function visit(key) {
    if (initial.has(key)) return;
    assert(manifest[key], `Missing imported manifest entry: ${key}`);
    initial.add(key); for (const imported of manifest[key].imports || []) visit(imported);
  }
  visit('index.html');
  const entries = Object.values(manifest), js = [...new Set(entries.map(entry => entry.file).filter(file => file.endsWith('.js')))];
  for (const file of js) { assert(Number.isSafeInteger(sizes[file]) && sizes[file] > 0, `Missing/empty chunk: ${file}`); assert(sizes[file] <= limits.chunk, `Chunk exceeds ${limits.chunk} bytes: ${file} (${sizes[file]})`); }
  const entryFile = manifest['index.html'].file;
  assert(sizes[entryFile] <= limits.entry, 'Startup entry budget exceeded');
  const critical = [...new Set([...initial].map(key => manifest[key].file).filter(file => file.endsWith('.js')))];
  const criticalJavaScriptBytes = critical.reduce((sum, file) => sum + sizes[file], 0);
  assert(criticalJavaScriptBytes <= limits.criticalJavaScript, `Critical startup JS budget exceeded: ${criticalJavaScriptBytes}`);
  assert(!critical.some(file => /\/(?:quiz-data|questionGen|numericGen|jspdf|html2canvas)[-.]/i.test(file)), 'Heavy question/PDF engines became eager dependencies');
  for (const route of ['StudyBrain', 'StudySystem', 'Practice', 'ExamSim', 'NotesScanner', 'Pdfs', 'Calendar', 'Settings']) {
    const routeKey = `src/views/${route}.tsx`;
    assert(manifest[routeKey]?.isDynamicEntry, `Missing lazy route: ${route}`);
    assert(!initial.has(routeKey), `Optional route became eager: ${route}`);
  }
  return { entryFile, entryBytes: sizes[entryFile], criticalJavaScriptBytes, criticalFiles: critical, largestChunkBytes: Math.max(...js.map(file => sizes[file])), chunks: js.length, limits };
}
export async function checkBuild(root = 'dist', output = process.env.BUILD_BUDGET_OUTPUT) {
  const manifest = JSON.parse(await readFile(join(root, '.vite/manifest.json'), 'utf8')), sizes = {};
  for (const entry of Object.values(manifest)) sizes[entry.file] = (await stat(join(root, entry.file))).size;
  const report = inspectBuild(manifest, sizes);
  const worker = await readFile(join(root, 'sw.js'), 'utf8');
  const shell = new Set(JSON.parse(worker.match(/const SHELL = (\[[^;]*\]);/)?.[1] || '[]'));
  for (const entry of Object.values(manifest)) {
    assert(shell.has(`./${entry.file}`), `Offline precache is missing: ${entry.file}`);
    for (const file of [...entry.css || [], ...entry.assets || []]) assert(shell.has(`./${file}`), `Offline precache is missing dependency: ${file}`);
  }
  // Vite workers are not manifest chunks. The optional AI engine is larger
  // than normal chunks, but must remain bounded and download only on use.
  const assets = await readdir(join(root, 'assets'));
  const aiWorker = assets.filter(file => /^aiModel\.worker-.*\.js$/.test(file));
  const aiWasm = assets.filter(file => /^ort-wasm-simd-threaded\.jsep-.*\.(?:wasm|mjs)$/.test(file));
  assert(aiWorker.length === 1 && aiWasm.length === 2, 'Missing optional AI runtime assets');
  const aiWorkerBytes = (await stat(join(root, 'assets', aiWorker[0]))).size;
  assert(aiWorkerBytes <= 1_000_000, `Optional AI worker exceeds 1 MB: ${aiWorkerBytes}`);
  for (const file of [...aiWorker, ...aiWasm]) assert(!shell.has(`./assets/${file}`), `Optional AI runtime must not be precached: ${file}`);
  report.allManifestAssetsPrecached = true;
  report.optionalAiWorkerBytes = aiWorkerBytes;
  if (output) { await mkdir(resolve(output, '..'), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
  console.log(`PASS build budget: entry ${report.entryBytes} B; critical JS ${report.criticalJavaScriptBytes} B; ${report.chunks} chunks; manifest assets precached; AI runtime on demand.`);
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkBuild(process.argv[2] || 'dist');
