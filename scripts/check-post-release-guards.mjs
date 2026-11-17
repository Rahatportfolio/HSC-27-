// Targeted fault injection for the post-release backup/scanner/timer fixes.
// Run with no dev server or parallel test processes. Sources are snapshotted at
// invocation and restored byte-for-byte in finally; no git checkout/reset.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const restore = 'src/backupRestore.ui.test.tsx';
const storage = 'src/postRelease.storage.test.ts';
const timer = 'src/postRelease.timer.test.tsx';
const persistence = 'src/scanner.persistence.test.ts';
const processing = 'src/scanner.processing.test.ts';
const scanner = 'src/scanner.ui.test.tsx';
const media = 'src/mediaBackup.test.ts';
const concurrent = 'src/fullBackup.concurrent.test.tsx';
const release = 'src/releasePolicy.test.ts';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const cases = [
  ['release-version-name', 'android/app/build.gradle', `versionName "${version}"`, 'versionName "0.0.0"', release, 'keeps the Android, package and lockfile versions aligned'],
  ['release-lock-version', 'package-lock.json', `"version": "${version}",\n  "lockfileVersion"`, '"version": "0.0.0",\n  "lockfileVersion"', release, 'keeps the Android, package and lockfile versions aligned'],
  ['release-lock-root-version', 'package-lock.json', `"": {\n      "name": "hsc-27-prostuti",\n      "version": "${version}"`, '"": {\n      "name": "hsc-27-prostuti",\n      "version": "0.0.0"', release, 'keeps the Android, package and lockfile versions aligned'],
  ['release-version-code', 'android/app/build.gradle', readFileSync('android/app/build.gradle', 'utf8').match(/versionCode\s+\d+/)[0], 'versionCode 22', release, 'increments the Android version code'],
  ['release-draft-gate', '.github/workflows/android-apk.yml', '\n          draft: true\n', '\n          draft: false\n', release, 'attaches tagged APKs as drafts'],
  ['release-emulator-dependency', '.github/workflows/android-apk.yml', '  device-checks:\n    name: Android WebView device checks\n    needs: apk', '  device-checks:\n    name: Android WebView device checks\n    needs: []', release, 'attaches tagged APKs as drafts'],
  ['timer-completion-copy', 'src/App.tsx', 'পড়া সময় সেভ করো; পুরো সময় পূর্ণ হলেই কাজ সম্পন্ন হবে', 'পড়া সেভ করে সম্পন্ন দাও', 'src/features.test.tsx', 'asks before replacing a paused preset'],
  ['backup-image-limits-copy', 'src/components/FullBackup.tsx', 'JSON and legacy full backups contain scan metadata, not images', 'Every backup includes every image', restore, 'explains that JSON and legacy'],
  ['json-image-limits-copy', 'src/views/Settings.tsx', 'Scanned images and offline PDF/video bytes are not included', 'All image and media bytes are included', restore, 'explains that JSON and legacy'],
  ['snapshot-write-order', 'src/storage.ts', 'localStorage.setItem(SAVED_AT_KEY, stamp);\n    try { localStorage.setItem(STORAGE_KEY, payload); }', 'localStorage.setItem(STORAGE_KEY, payload);\n    try { localStorage.setItem(SAVED_AT_KEY, stamp); }', storage, 'does not replace progress if the snapshot timestamp'],
  ['snapshot-rollback-previous', 'src/storage.ts', 'else localStorage.setItem(SAVED_AT_KEY, previousStamp);', 'else { /* fault: freshness marker left changed */ }', storage, 'restores the old timestamp'],
  ['snapshot-rollback-first', 'src/storage.ts', 'if (previousStamp === null) localStorage.removeItem(SAVED_AT_KEY);', 'if (previousStamp === null) { /* fault */ }', storage, 'removes a newly written timestamp'],
  ['scan-reference-validation', 'src/storage.ts', " || item.pageKeys.some(key => !nonEmpty(key, 180) || !key.startsWith('scan:'))", '', storage, 'rejects unsafe scanner page references'],
  ['timer-early-finish', 'src/hooks.ts', "const taskId = state.mode !== 'stopwatch' && currentElapsed >= state.durationMin * 60_000 ? state.taskId : '';", 'const taskId = state.taskId;', timer, 'saves an early finish'],
  ['timer-full-finish', 'src/hooks.ts', "const taskId = state.mode !== 'stopwatch' && currentElapsed >= state.durationMin * 60_000 ? state.taskId : '';", "const taskId = '';", timer, 'keeps genuine full-duration completion'],
  ['timer-duration-detach', 'src/hooks.ts', "durationMin: Math.max(1, Math.min(720, Math.round(minutes))), accumulatedMs: 0, running: false, startedAt: null, taskId: ''", 'durationMin: Math.max(1, Math.min(720, Math.round(minutes))), accumulatedMs: 0, running: false, startedAt: null', timer, 'detaches a task when its timer duration'],
  ['timer-subject-detach', 'src/hooks.ts', "subject, chapterId: '', taskId: ''", "subject, chapterId: ''", timer, 'detaches a task when its timer subject'],
  ['timer-chapter-detach', 'src/hooks.ts', "({ ...current, chapterId, taskId: '' })", '({ ...current, chapterId })', timer, 'detaches a task when its timer chapter'],
  ['timer-unchanged-subject', 'src/hooks.ts', 'subject === current.subject ? current :', 'false ? current :', timer, 'retains the task association for unchanged'],
  ['timer-unchanged-chapter', 'src/hooks.ts', 'chapterId === current.chapterId ? current :', 'false ? current :', timer, 'retains the task association for unchanged'],
  ['timer-legacy-stopwatch', 'src/hooks.ts', "mode: 'stopwatch', label: state.label, taskId: ''", "mode: 'stopwatch', label: state.label, taskId: state.taskId", timer, 'does not turn a legacy stopwatch'],
  ['image-write-rejection', 'src/scanner.ts', "if (await idbSet(key, page.dataUrl, 'image') === null)", 'if (false)', persistence, 'does not claim a scan was saved'],
  ['image-write-rollback', 'src/scanner.ts', 'await deletePagesFromDb(keys);', '/* fault: staged pages leaked */', persistence, 'cleans earlier pages'],
  ['image-partial-source', 'src/scanner.ts', "if (typeof value !== 'string' || !isScannedPageDataUrl(value)) return [];", "if (typeof value !== 'string' || !isScannedPageDataUrl(value)) continue;", persistence, 'refuses a partial PDF source'],
  ['image-byte-accounting', 'src/scanner.ts', 'total += new TextEncoder().encode(image).byteLength;', 'total += 0;', persistence, 'counts the stored image strings'],
  ['image-contrast', 'src/scanner.ts', 'const factor = contrast / 100;', 'const factor = 1;', processing, 'changes contrast around the midpoint'],
  ['image-rotation-bounds', 'src/scanner.ts', 'Math.ceil(Math.abs(canvas.width * Math.cos(rad)) + Math.abs(canvas.height * Math.sin(rad)) - 1e-10)', 'canvas.width', processing, 'rotates 90 degrees'],
  ['image-rotation-centre', 'src/scanner.ts', 'ctx.translate(result.width / 2, result.height / 2);', 'ctx.translate(0, 0);', processing, 'rotates 90 degrees'],
  ['image-perspective-source', 'src/scanner.ts', "const source = canvas.getContext('2d');", "const source = result.getContext('2d');", processing, 'copies source pixels during perspective'],
  ['image-url-success', 'src/scanner.ts', 'finally { release(); }', 'finally { /* fault: upload URL leaked */ }', processing, 'releases a temporary uploaded-image URL on success/failure (false)'],
  ['image-url-failure', 'src/scanner.ts', 'img.onerror = error => { release(); reject(error); };', 'img.onerror = error => { reject(error); };', processing, 'releases a temporary uploaded-image URL on success/failure (true)'],
  ['image-canvas-failure', 'src/scanner.ts', '} catch (error) { reject(error); }', '} catch (error) { resolve({ width: 0, height: 0 }); }', processing, 'rejects and releases the uploaded-image URL'],
  ['scanner-backed-metadata', 'src/views/NotesScanner.tsx', 'const meta = data.scannedNotes;', 'const meta = data.scannedNotes.slice(1);', scanner, 'shows restored metadata'],
  ['scanner-dhaka-date', 'src/views/NotesScanner.tsx', 'formatDate(todayKey(new Date(note.createdAt)))', 'formatDate(note.createdAt.slice(0, 10))', scanner, 'shows restored metadata'],
  ['scanner-title-limit', 'src/views/NotesScanner.tsx', 'form.title.trim().length > 300 || ', '', scanner, 'rejects a title too long'],
  ['scanner-note-limit', 'src/views/NotesScanner.tsx', 'data.scannedNotes.length >= LIMITS.scannedNotes', 'false', scanner, 'refuses a 201st scanned note'],
  ['scanner-page-limit', 'src/views/NotesScanner.tsx', 'MAX_SCANNED_PAGES - pages.length', 'MAX_SCANNED_PAGES + 1 - pages.length', scanner, 'limits an image-selection batch'],
  ['scanner-metadata-durability', 'src/views/NotesScanner.tsx', "if (!saveData(next, true)) throw new Error('Note metadata could not be saved.');", "saveData(next, true); if (false) throw new Error('Note metadata could not be saved.');", scanner, 'keeps the editable page and removes staged images'],
  ['scanner-metadata-rollback', 'src/views/NotesScanner.tsx', 'if (!committed && pageKeys.length) await deletePagesFromDb(pageKeys);', '/* fault: staged pages retained after failed commit */', scanner, 'keeps the editable page and removes staged images'],
  ['scanner-concurrent-progress', 'src/views/NotesScanner.tsx', "if (latestData.current !== expected) throw new Error('Study data changed while saving. Retry with the editable pages.');", "if (false) throw new Error('Study data changed while saving. Retry with the editable pages.');", scanner, 'rolls staged pages back instead of replacing progress'],
  ['scanner-after-commit', 'src/views/NotesScanner.tsx', 'committed = true;', 'committed = false;', scanner, 'never rolls back image bytes after metadata'],
  ['scanner-delete-durability', 'src/views/NotesScanner.tsx', "if (!saveData(next, true)) { notify(t('নোট মুছতে পারিনি। ছবিগুলো অক্ষত আছে।', 'The note could not be deleted. Its images are unchanged.'), 'error'); return; }", "saveData(next, true);", scanner, 'does not destroy image bytes when deleting'],
  ['scanner-original-pixels', 'src/views/NotesScanner.tsx', 'loadImageToCanvas(page.sourceDataUrl)', 'loadImageToCanvas(page.dataUrl)', scanner, 'uses the original image for successive edits'],
  ['scanner-zero-brightness', 'src/views/NotesScanner.tsx', 'value={pageEdit?.brightness ?? 100}', 'value={pageEdit?.brightness || 100}', scanner, 'uses the original image for successive edits'],
  ['scanner-zero-contrast', 'src/views/NotesScanner.tsx', 'value={pageEdit?.contrast ?? 100}', 'value={pageEdit?.contrast || 100}', scanner, 'uses the original image for successive edits'],
  ['scanner-last-edit-wins', 'src/views/NotesScanner.tsx', 'const version = (editVersions.current.get(page.id) || 0) + 1;', 'const version = 1;', scanner, 'does not let a slower old edit'],
  ['scanner-per-page-edit', 'src/views/NotesScanner.tsx', 'edit: freshEdit(), pending: false', 'edit: pages[0]?.edit || freshEdit(), pending: false', scanner, 'retains separate edit settings'],
  ['scanner-crop-bounds', 'src/views/NotesScanner.tsx', 'if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > c.width || y + h > c.height)', 'if (false)', scanner, 'exposes actual crop controls'],
  ['scanner-perspective-bounds', 'src/views/NotesScanner.tsx', 'if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > c.width || y > c.height))', 'if (false)', scanner, 'validates perspective corners'],
  ['scanner-perspective-crossing', 'src/views/NotesScanner.tsx', 'if (turns.some(turn => turn <= 0))', 'if (false)', scanner, 'validates perspective corners'],
  ['scanner-pending-save', 'src/views/NotesScanner.tsx', 'saving || capturing || editsPending || !form.title.trim()', 'saving || capturing || !form.title.trim()', scanner, 'keeps save disabled while an image edit'],
  ['scanner-open-upload', 'src/views/NotesScanner.tsx', "setViewMode('capture');\n      notify", '/* fault: hidden upload */\n      notify', scanner, 'opens new images from the saved library'],
  ['scanner-remove-neighbour', 'src/views/NotesScanner.tsx', 'setActivePage(pages.length > 1 ? Math.min(index, pages.length - 2) : null)', 'setActivePage(null)', scanner, 'opens new images from the saved library'],
  ['scanner-pdf-completeness', 'src/views/NotesScanner.tsx', "if (urls.length !== note.pageCount) throw new Error('One or more scanned pages are missing.');", "if (false) throw new Error('One or more scanned pages are missing.');", scanner, 'does not export an incomplete note'],
  ['scanner-pdf-exporter', 'src/views/NotesScanner.tsx', "await saveBackupBlob(pdf.output('blob'), `${note.title.replace(/\\s+/g, '_')}.pdf`);", "pdf.output('blob');", scanner, 'exports every scanned page through the native-compatible'],
  ['scanner-pdf-decode', 'src/views/NotesScanner.tsx', 'const image = await loadImageToCanvas(url);', "const image = document.createElement('canvas');", scanner, 'reports an invalid image'],
  ['scanner-pdf-await', 'src/views/NotesScanner.tsx', "await saveBackupBlob(pdf.output('blob'),", "void saveBackupBlob(pdf.output('blob'),", scanner, 'leaves the original scan unmarked'],
  ['json-durable-restore', 'src/views/Settings.tsx', 'if (!saveData(parsed, true)) {', 'if (false) {', restore, 'does not report JSON restore success'],
  ['json-exam-clock', 'src/views/Settings.tsx', "try { localStorage.removeItem('hsc27-exam-clock-v1'); } catch { /* storage unavailable */ }\n        setDirty(false);", '/* fault: previous exam clock retained */\n        setDirty(false);', restore, 'persists a successful JSON restore'],
  ['json-dirty-draft', 'src/views/Settings.tsx', 'setDirty(false); setDraft(parsed.settings); startAnchor.current = parsed.settings.startDate;', '/* fault: dirty draft retained */', restore, 'replaces a dirty JSON Settings draft'],
  ['full-dirty-draft', 'src/components/FullBackup.tsx', 'onRestored?.(staged.data.settings);', '/* fault: stale Settings draft */', restore, 'replaces a dirty Settings draft and selects'],
  ['full-selected-date', 'src/components/FullBackup.tsx', 'setSelectedDate(staged.data.settings.startDate);', '/* fault: wrong selected routine */', restore, 'replaces a dirty Settings draft and selects'],
  ['full-exam-clock', 'src/components/FullBackup.tsx', "try { localStorage.removeItem('hsc27-exam-clock-v1'); } catch { /* storage unavailable */ }", '/* fault: old exam clock */', restore, 'clears the previous exam clock after a successful full-media'],
  ['full-durable-restore', 'src/components/FullBackup.tsx', 'if (!saveData(staged.data, true))', 'if (false)', restore, 'keeps clocks/profile and rolls staged media back'],
  ['full-after-commit', 'src/components/FullBackup.tsx', 'if (!committed) await staged?.rollback();', 'await staged?.rollback();', concurrent, 'does not erase staged images after a durable restore commit'],
  ['full-concurrent-progress', 'src/components/FullBackup.tsx', 'if (latestData.current !== expected)', 'if (false)', concurrent, 'keeps new study progress'],
  ['full-legacy-toast', 'src/components/FullBackup.tsx', "warnings.length ? 'info' : 'success'", "'success'", restore, 'makes absent scanned images in an old full backup'],
  ['backup-scan-byte-inclusion', 'src/mediaBackup.ts', 'for (const key of scanRefs) {', 'for (const key of []) {', media, 'restores scan image bytes under fresh keys'],
  ['backup-scan-source-count', 'src/mediaBackup.ts', 'if (note.pageKeys.length !== note.pageCount)', 'if (false)', media, 'rejects scan metadata that promises more pages'],
  ['backup-scan-missing-source', 'src/mediaBackup.ts', 'if (!isScannedPageDataUrl(dataUrl))', 'if (false)', media, 'refuses a supposedly full export'],
  ['backup-v2-metadata-count', 'src/mediaBackup.ts', 'if (manifest.version === 2 && data.scannedNotes.some(note => note.pageKeys.length !== note.pageCount))', 'if (false)', media, 'rejects a v2 manifest that promises scanned pages'],
  ['backup-legacy-empty-refs', 'src/mediaBackup.ts', 'manifest.version === 1 && data.scannedNotes.length', 'manifest.version === 1 && scanReferences(data).size', media, 'warns that a legacy v1 archive'],
  ['backup-scan-checksum', 'src/mediaBackup.ts', 'if (actual.some((h, i) => h !== entry.hashes[i]))', 'if (false)', media, 'detects damaged scanned-image bytes'],
  ['backup-new-page-keys', 'src/mediaBackup.ts', 'note.pageKeys.map(key => pageMapping.get(key) || key)', 'note.pageKeys.map(key => key)', media, 'restores scan image bytes under fresh keys'],
  ['backup-page-write-rejection', 'src/mediaBackup.ts', "if (await idbSet(key, page.dataUrl, 'image') === null)", "await idbSet(key, page.dataUrl, 'image'); if (false)", media, 'rolls back PDF, video and earlier scanned pages'],
  ['backup-cross-store-rollback', 'src/mediaBackup.ts', 'for (const id of staged) await deleteFile(id);', '/* fault: staged media leaked */', media, 'rolls back PDF, video and earlier scanned pages'],
  ['backup-page-rollback', 'src/mediaBackup.ts', 'for (const key of stagedPages) await idbDelete(key);', '/* fault: staged images leaked */', media, 'rolls back PDF, video and earlier scanned pages'],
  ['youtube-channel-persistence', 'src/views/Library.tsx', 'channel: channel.trim() || undefined, watched:', 'channel: undefined, watched:', 'src/features.test.tsx', 'stores a YouTube class link with its channel'],
  ["image-source-type", "src/scanner.ts", "if (typeof value !== 'string' || !isScannedPageDataUrl(value)) return [];", "if (typeof value !== 'string') return [];", "src/scanner.persistence.test.ts", "refuses a partial PDF source"],
  ["scanner-delete-confirmation", "src/views/NotesScanner.tsx", "onClick={() => confirm({ title: t('স্ক্যান করা নোট মুছবে?', 'Delete scanned note?'), message: t('এই নোটের পৃষ্ঠাগুলোও মুছবে। আগে PDF বা full backup রাখো।', 'This also deletes the note images. Keep a PDF or full backup first.'), danger: true, label: t('মুছে ফেলো', 'Delete'), action: () => { void deleteNote(note); } })}", "onClick={() => { void deleteNote(note); }}", "src/scanner.ui.test.tsx", "shows a just-saved note immediately"],
  ["json-study-clock", "src/views/Settings.tsx", "timer.reset();\n        try { localStorage.removeItem('hsc27-exam-clock-v1');", "/* fault: study clock retained */\n        try { localStorage.removeItem('hsc27-exam-clock-v1');", "src/backupRestore.ui.test.tsx", "persists a successful JSON restore"],
  ["full-study-clock", "src/components/FullBackup.tsx", "              timer.reset();", "              /* fault: study clock retained */", "src/backupRestore.ui.test.tsx", "clears the previous exam clock after a successful full-media"],
];

const filter = process.argv[2];
const selected = filter ? cases.filter(([id]) => filter.split(',').some(term => id.includes(term))) : cases;
if (!selected.length) throw new Error(`No mutation matched ${filter}`);
const root = resolve('.'), output = resolve('.cache/post-release/mutations', filter ? `filtered-${filter.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '');
mkdirSync(output, { recursive: true });
const originals = new Map([...new Set(selected.map(([, path]) => path))].map(path => [path, readFileSync(path, 'utf8')]));
for (const [id, path, from] of selected) {
  if (originals.get(path).split(from).length !== 2) throw new Error(`${id}: anchor must match exactly once in ${path}`);
}
for (const [path, text] of originals) {
  const backup = resolve(output, 'originals', path);
  mkdirSync(dirname(backup), { recursive: true }); writeFileSync(backup, text);
}
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function run(id, files, test) {
  const reportPath = resolve(output, `${id}.json`);
  rmSync(reportPath, { force: true });
  const args = ['node_modules/vitest/vitest.mjs', 'run', ...files, '--reporter=json', `--outputFile=${reportPath}`, '--silent'];
  if (test) args.push('-t', escapeRegex(test));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: 'true', NO_COLOR: '1' } });
  writeFileSync(resolve(output, `${id}.log`), `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.error) throw result.error;
  let report;
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); }
  catch { throw new Error(`${id}: no report; inspect ${output}/${id}.log`); }
  const assertions = report.testResults.flatMap(suite => suite.assertionResults || []);
  return { code: result.status, failed: assertions.filter(t => t.status === 'failed'), passed: assertions.filter(t => t.status === 'passed'), runtimeErrors: report.numRuntimeErrorTestSuites || 0, unhandled: report.numUnhandledErrors || 0 };
}
const rows = [];
let controlPassed = 0;
try {
  console.log('Running unmodified controls…');
  const control = run('control', [...new Set(selected.map(([, , , , file]) => file))]);
  if (control.code !== 0 || !control.passed.length || control.failed.length || control.runtimeErrors || control.unhandled) throw new Error('Unmodified control failed; no mutation score is valid.');
  controlPassed = control.passed.length;
  for (const [id, , , , , title] of selected)
    if (!control.passed.some(t => t.fullName.includes(title))) throw new Error(`${id}: intended assertion was not passed by the control: ${title}`);
  console.log(`Control: ${controlPassed} passed.`);
  for (const [id, path, from, to, file, title] of selected) {
    const original = originals.get(path);
    let result;
    try { writeFileSync(path, original.replace(from, to)); result = run(id, [file], title); }
    finally { writeFileSync(path, original); }
    const expectedFailures = result.failed.filter(t => t.fullName.includes(title));
    const killed = result.code !== 0 && expectedFailures.length > 0 && result.runtimeErrors === 0;
    rows.push({ id, killed, failed: expectedFailures.length, unhandled: result.unhandled });
    console.log(`${killed ? 'KILLED' : 'SURVIVED/ERROR'} ${id} (${expectedFailures.length} intended failures)`);
  }
} finally {
  for (const [path, text] of originals) writeFileSync(path, text);
  const unchanged = [...originals].every(([path, text]) => createHash('sha256').update(readFileSync(path)).digest('hex') === createHash('sha256').update(text).digest('hex'));
  const killed = rows.filter(row => row.killed).length;
  writeFileSync(resolve(output, 'report.md'), [
    '# Post-release guard mutation evidence', '', `Unmodified controls: **${controlPassed}**. Killed: **${killed}/${selected.length}**. Sources restored byte-for-byte: **${unchanged}**.`, '',
    '| Mutation | Result | Intended failing assertions |', '|---|---|---:|',
    ...rows.map(row => `| ${row.id} | ${row.killed ? 'killed' : 'SURVIVED / ERROR'} | ${row.failed} |`), '',
    'Each mutation runs only its intended named test(s). Parse/load errors, missing reports and unrelated failures do not count as kills. The deliberate un-awaited failed export can also produce an unhandled rejection; its changed metadata assertion must still fail. Controls permit no unhandled errors.', '',
    'This is targeted fault injection, not exhaustive mutation coverage or a zero-bug guarantee.', '',
  ].join('\n'));
  if (!unchanged) throw new Error('Source restoration failed. Stop and inspect the per-invocation originals.');
}
if (rows.length !== selected.length || rows.some(row => !row.killed)) process.exitCode = 1;
