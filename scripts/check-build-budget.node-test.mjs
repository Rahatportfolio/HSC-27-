import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectBuild } from './check-build-budget.mjs';
function fixture() {
  const manifest = { 'index.html': { isEntry: true, file: 'assets/index.js', imports: ['_react.js'] }, '_react.js': { file: 'assets/react.js' } }, sizes = { 'assets/index.js': 400_000, 'assets/react.js': 200_000 };
  for (const route of ['StudyBrain', 'StudySystem', 'Practice', 'ExamSim', 'NotesScanner', 'Pdfs', 'Calendar', 'Settings']) { const file = `assets/${route}.js`; manifest[`src/views/${route}.tsx`] = { file, isDynamicEntry: true, imports: ['index.html'] }; sizes[file] = 20_000; }
  return { manifest, sizes };
}
test('counts unique transitive initial imports while optional cyclic route references stay lazy', () => { const { manifest, sizes } = fixture(); const report = inspectBuild(manifest, sizes); assert.equal(report.criticalJavaScriptBytes, 600_000); assert.equal(report.chunks, 10); });
test('rejects an oversized entry instead of hiding the warning', () => { const { manifest, sizes } = fixture(); sizes['assets/index.js'] = 500_001; assert.throws(() => inspectBuild(manifest, sizes), /Chunk exceeds/); });
test('rejects an oversized lazy chunk as well', () => { const { manifest, sizes } = fixture(); sizes['assets/Pdfs.js'] = 500_001; assert.throws(() => inspectBuild(manifest, sizes), /Chunk exceeds/); });
test('counts transitive eager dependencies against the startup budget', () => { const { manifest, sizes } = fixture(); manifest['_extra.js'] = { file: 'assets/extra.js', imports: ['_more.js'] }; manifest['_more.js'] = { file: 'assets/more.js' }; manifest['_react.js'].imports = ['_extra.js']; sizes['assets/extra.js'] = 400_000; sizes['assets/more.js'] = 200_000; assert.throws(() => inspectBuild(manifest, sizes), /Critical startup JS/); });
test('catches an accidentally eager question bank even within the byte budget', () => { const { manifest, sizes } = fixture(); manifest['_bank.js'] = { file: 'assets/quiz-data-abc.js' }; sizes['assets/quiz-data-abc.js'] = 1_000; manifest['_react.js'].imports = ['_bank.js']; assert.throws(() => inspectBuild(manifest, sizes), /Heavy question/); });
test('does not accept a missing optional route or missing chunk bytes', () => { const { manifest, sizes } = fixture(); delete manifest['src/views/StudyBrain.tsx']; assert.throws(() => inspectBuild(manifest, sizes), /Missing lazy route/); const fresh = fixture(); delete fresh.sizes['assets/react.js']; assert.throws(() => inspectBuild(fresh.manifest, fresh.sizes), /Missing\/empty chunk/); });
