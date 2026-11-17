// Targeted mutation proof for the consequential date/capacity/history guards.
// Never run alongside a dev server or another test run: one source change at a time.
// Every original is restored in finally; no git checkout/reset or user-data edits.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const core = 'src/dateCascade.test.ts';
const ui = 'src/dateCascade.ui.test.tsx';
const native = 'src/dateCascade.native.test.ts';
const adaptive = 'src/adaptive.test.ts';
const recheck = 'src/scheduleRecheck.test.ts';
const cases = [
  ['linked-targets', 'src/planner.ts', "settings.examDatePolicy === 'shift' ? {", 'false ? {', core, 'moves all linked targets'],
  ['fixed-deadlines', 'src/planner.ts', "settings.examDatePolicy === 'shift' ? {", 'true ? {', core, 'keeps externally set exam deadlines'],
  ['invalid-date', 'src/planner.ts', 'if (![settings.startDate, settings.testExamDate, settings.examDate, settings.boostStartDate].every(isValidDate))', 'if (false)', core, 'rejects an invalid or reversed schedule'],
  ['730-day-bound', 'src/planner.ts', 'if (diffDays(settings.startDate, settings.examDate) > 730)', 'if (false)', core, 'rejects an invalid or reversed schedule'],
  ['boost-range', 'src/planner.ts', 'if (settings.boostEnabled && (settings.boostStartDate < settings.startDate || settings.boostStartDate >= settings.examDate))', 'if (false)', core, 'rejects an invalid or reversed schedule'],
  ['test-spill-reserve', 'src/planner.ts', 'const a = studyEndExclusive(settings, settings.testExamDate, true);', 'const a = settings.testExamDate;', core, 'keeps exact daily minutes'],
  ['board-cutoff', 'src/planner.ts', 'const c = studyEndExclusive(settings);', 'const c = addDays(studyEndExclusive(settings), 1);', core, 'keeps exact daily minutes'],
  ['locked-plan', 'src/reschedule.ts', 'if (changed && data.lockedDates.some(inOldPlan))', 'if (false)', core, 'refuses to regenerate a locked routine'],
  ['day-collision', 'src/reschedule.ts', 'if (Object.hasOwn(result, next))', 'if (false)', core, 'rejects collisions and customisations'],
  ['custom-horizon', 'src/reschedule.ts', 'if (next < settings.startDate || next > end)', 'if (false)', core, 'rejects collisions and customisations'],
  ['completed-one-off', 'src/reschedule.ts', 'if (!block.date || finished(`custom-${block.date}-${block.id}`))', 'if (!block.date)', core, 'moves all scheduled customisations together'],
  ['partial-history-remap', 'src/reschedule.ts', '? remapIds(data.completed, true) : data.completed;', '? data.completed : data.completed;', core, 'retains partial one-off task evidence'],
  ['completed-split-date', 'src/reschedule.ts', 'return hasFullTaskAllocation(originalTasks, id, data.completed);', 'return false;', core, 'retains partial one-off task evidence'],
  ['task-id-collision', 'src/reschedule.ts', 'if (new Set(entries.map(([id]) => id)).size !== entries.length)', 'if (false)', core, 'rejects remapped task-id collisions'],
  ['evidence-count-and-undo', 'src/reschedule.ts', '? remapIds(data.completed, true) : data.completed;', '? { ...data.completed, ...remapIds(data.completed, true) } : data.completed;', core, ['keeps the completion-entry count', 'cannot resurrect an undone partial task']],
  ['evidence-id-collision', 'src/reschedule.ts', 'if (new Set(entries.map(([id]) => id)).size !== entries.length)', 'if (false)', core, 'rejects a completion-evidence id collision'],
  ['calendar-sequence', 'src/reschedule.ts', 'data.settings.calendarRevision + (changed ? 1 : 0)', 'data.settings.calendarRevision', core, 'regenerates exports and increments'],
  ['export-boost-date', 'src/exports.ts', '${settings.boostStartDate}', '2026-12-01', core, 'moves all linked targets'],
  ['all-canonical-parts', 'src/planner.ts', 'Array.from({ length: chapter.effort }, (_, part)', 'Array.from({ length: 1 }, (_, part)', core, 'does not mark a partly allocated chapter'],
  ['whole-source-coverage', 'src/planner.ts', 'return through >= total - 0.01;', 'return through > 0;', core, 'does not treat a visible fragment'],
  ['practice-capacity', 'src/planHealth.ts', 'if (requiresPractice && !practiceFits && !practiceDone) missingPractice++;', '/* mutation: hidden missing practice */', core, 'warns about removed chapter practice'],
  ['required-final-practice', 'src/planner.ts', '(!requiresPractice || practice.length > 0)', 'true', core, 'does not complete a chapter when its required accompanying practice'],
  ['time-conflict-warning', 'src/planHealth.ts', 'if (clashingSessions) warnings.push(', 'if (false) warnings.push(', core, 'does not call a customised plan conflict-free'],
  ['prestart-dashboard', 'src/views/StudySystem.tsx', 'if (today < data.settings.startDate) return (', 'if (false) return (', ui, 'distinguishes a future routine preview'],
  ['start-day-dashboard', 'src/views/StudySystem.tsx', 'if (today < data.settings.startDate) return (', 'if (today <= data.settings.startDate) return (', ui, 'shows the actual smart target on the start date'],
  ['future-start-floor', 'src/smartSchedule.ts', 'let date = today < base[0].date ? base[0].date : today;', 'let date = today;', core, 'never begins before the chosen start'],
  ['integrated-deadline', 'src/smartSchedule.ts', 'while (date < data.settings.examDate && (', 'while (true && (', core, 'never begins before the chosen start'],
  ['atomic-mock-paper', 'src/smartSchedule.ts', "minutes <= 0.01 || (q.task.kind === 'exam' && minutes < q.to - q.from)", 'minutes <= 0.01', core, 'defers a whole mock paper'],
  ['canonical-split-promotion', 'src/study.ts', 'else if (tasks && hasFullTaskAllocation(tasks, source, completed)) completed[source] ||= stamp;', '/* mutation: complete fragments never become stable evidence */', core, 'promotes only fully finished split work'],
  ['completed-demand', 'src/testPrep.ts', 'if (!data.completed[id] && (!scheduledParts.has(id) || !hasFullTaskAllocation(aTasks, id, data.completed, true)))', 'if (!scheduledParts.has(id))', core, 'does not re-count completed A-learning'],
  ['actual-recall-anchor', 'src/revision.ts', 'return latest ? todayKey(new Date(latest)) : null;', "return tasks.at(-1)?.date || '2027-01-31';", core, 'preserves completed canonical work and its real recall anchor'],
  ['final-plan-preview', 'src/views/Settings.tsx', 'planHealth(buildStudyPlan(next, today), settings, next.completed)', 'planHealth([], settings, next.completed)', ui, 'uses the final customised video plan'],
  ['no-invented-hours', 'src/notifications.ts', 'const totalMinutes = tasks.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);', 'const totalMinutes = tasks.length ? tasks.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0) : data.settings.dailyHours * 60;', core, 'does not invent study hours'],
  ['adaptive-rollback', 'src/adaptive.ts', 'for (const item of dropped) {', 'for (const item of []) {', adaptive, 'rolls a replacement back'],
  ['adaptive-minimum-cap', 'src/adaptive.ts', 'tasks: tasks.filter(task => task.endMinute - task.startMinute >= minBlock)', 'tasks', adaptive, 'does not inflate a short victim'],
  ['adaptive-gap-clock', 'src/adaptive.ts', 'const slot = slotFor({ ...day, tasks }, minutes);', 'const slot = slotFor(day, minutes);', adaptive, 'appends multiple gap allocations'],
  ['adaptive-test-cutoff', 'src/adaptive.ts', 'const deadline = initial ? data.settings.testExamDate : data.settings.examDate;', 'const deadline = data.settings.examDate;', adaptive, 'keeps initial learning in place'],
  ['actual-adaptive-explanation', 'src/App.tsx', 'data, setData, plan, adaptive, today, now, view, navigate', 'data, setData, plan, adaptive: null, today, now, view, navigate', 'src/adaptive.ui.test.tsx', 'describes the actual first adaptation'],
  ['countdown-contrast', 'src/styles.css', '.exam-countdown-pill.hsc strong {\n  color: #ffffff;\n}', '.exam-countdown-pill.hsc strong {\n  color: #154230;\n}', 'src/ui.contrast.test.ts', 'keeps the HSC countdown number readable'],
  ['native-stale-cancellation', 'src/native.ts', 'if (stale.length) await LocalNotifications.cancel(', 'if (false) await LocalNotifications.cancel(', native, 'cancels stale study alarms'],
  ['native-midnight-window', 'src/native.ts', 'if (day.date > lastDate) break;', 'if (day.date < today) continue; if (day.date > lastDate) break;', native, 'keeps an after-midnight session'],
  ['native-absolute-briefing', 'src/native.ts', 'Math.min(...incompleteDayTasks.map(t => t.startMinute))', 'Math.min(...incompleteDayTasks.map(t => taskStart(t).minute))', native, 'derives a late day'],
  ['history-canonical-dedup', 'src/smartSchedule.ts', 'if (!task || data.completed[task.id]) continue;', 'if (!task) continue;', recheck, 'counts promoted split completion once'],
  ['history-overlap-dedup', 'src/smartSchedule.ts', 'const uniqueMinutes = rangeMinutes(covered) - rangeMinutes(seen);', 'const uniqueMinutes = range.to - range.from;', recheck, 'counts overlapping historical split ranges only once'],
  ['history-source-bound', 'src/smartSchedule.ts', 'const covered = mergeWatched(seen, [range.from, range.to], total);', 'const covered = mergeWatched(seen, [range.from, range.to], Math.max(total, range.to));', recheck, 'clips historical evidence to a source shortened'],
  ['legacy-range-decoding', 'src/taskReferences.ts', 'catch { return null; }', 'catch { sourceId = fields[1]; }', recheck, 'parses only complete finite positive task ranges'],
  ['range-reference-shape', 'src/taskReferences.ts', "if (fields.length !== 4 || !['smart-part', 'smart-video'].includes(fields[0]) ||\n      !fields[1] || !fields[2].trim() || !fields[3].trim()) return null;", 'if (false) return null;', recheck, 'parses only complete finite positive task ranges'],
  ['range-reference-bounds', 'src/taskReferences.ts', 'if (!sourceId || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) return null;', 'if (false) return null;', recheck, 'parses only complete finite positive task ranges'],
  ['history-invalid-keys', 'src/smartSchedule.ts', "if (!range || range.kind !== 'part') continue;", "if (range?.kind === 'video') continue;", recheck, 'retains malformed legacy split keys without crashing'],
  ['malformed-task-tick', 'src/study.ts', 'if (!range) return false;', 'if (!range) return true;', recheck, 'rejects malformed generated task ticks'],
  ['video-range-bound', 'src/study.ts', 'range.to / 1000 <= c.duration + 0.01', 'true', recheck, 'does not certify video content outside the actual class duration'],
  ['completion-reference-validation', 'src/planner.ts', 'const range = parseTaskRangeId(key);', "const fields = key.split('|'); const range = { kind: 'part', sourceId: decodeURIComponent(fields[1]), from: Number(fields[2]), to: Number(fields[3]) };", recheck, 'does not promote a malformed split reference'],
  ['remap-invalid-reference', 'src/reschedule.ts', "const range = parseTaskRangeId(id);\n      if (range?.kind === 'part' && idMap.has(range.sourceId))\n        return `smart-part|${encodeURIComponent(idMap.get(range.sourceId)!)}|${range.from}|${range.to}`;", "const [, encoded, ...range] = id.split('|'); const source = decodeURIComponent(encoded); if (idMap.has(source)) return `smart-part|${encodeURIComponent(idMap.get(source))}|${range.join('|')}`;", recheck, 'preserves malformed legacy references verbatim while shifting'],
  ['media-invalid-reference', 'src/mediaBackup.ts', "if (!range || range.kind !== 'video') return [id, at];", "if (!range || range.kind !== 'video') return ['erased', at];", 'src/mediaBackup.test.ts', 'restores media around malformed legacy completion keys'],
  ['boost-workload-copy', 'src/views/Settings.tsx', 'Allow time for breaks, meals and adequate sleep. More hours do not guarantee readiness.', '16, 17, or 18 hours (adjustable anytime)', ui, 'describes the boost by its saved date'],
];
const filter = process.argv[2];
const selected = filter ? cases.filter(([id]) => id.includes(filter)) : cases;
if (!selected.length) throw new Error(`No mutation matched ${filter}`);
const root = resolve('.');
const output = resolve('.cache/date-mutations');
mkdirSync(output, { recursive: true });
const originals = new Map([...new Set(selected.map(([, path]) => path))].map(path => [path, readFileSync(path, 'utf8')]));
for (const [path, text] of originals) {
  const backup = resolve(output, 'originals', path);
  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, text);
}
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function run(id, files, test) {
  const reportPath = resolve(output, `${id}.json`);
  rmSync(reportPath, { force: true }); // Never mistake a stale report for this run.
  const args = ['node_modules/vitest/vitest.mjs', 'run', ...files, '--reporter=json', `--outputFile=${reportPath}`, '--silent'];
  if (test) args.push('-t', (Array.isArray(test) ? test : [test]).map(escapeRegex).join('|'));
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: 'true', NO_COLOR: '1' } });
  writeFileSync(resolve(output, `${id}.log`), `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.error) throw result.error;
  let report;
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); }
  catch { throw new Error(`${id}: no test report; inspect .cache/date-mutations/${id}.log`); }
  const assertions = report.testResults.flatMap(suite => suite.assertionResults || []);
  const failed = assertions.filter(test => test.status === 'failed');
  const passed = assertions.filter(test => test.status === 'passed');
  return { code: result.status, failed, passed, runtimeErrors: report.numRuntimeErrorTestSuites || 0 };
}
const rows = [];
try {
  console.log('Running unmodified control tests…');
  const control = run('control', [...new Set(selected.map(([, , , , file]) => file))]);
  if (control.code !== 0 || !control.passed.length || control.failed.length || control.runtimeErrors) throw new Error('Unmodified control failed. No mutation score is valid.');
  for (const [id, , , , , tests] of selected) for (const title of (Array.isArray(tests) ? tests : [tests])) {
    if (!control.passed.some(assertion => assertion.fullName.includes(title))) throw new Error(`${id}: intended assertion was not passed by the control: ${title}`);
  }
  console.log(`Control: ${control.passed.length} passed.`);
  for (const [id, path, from, to, file, test] of selected) {
    const original = originals.get(path);
    if (original.split(from).length !== 2) throw new Error(`${id}: mutation anchor must match exactly once in ${path}`);
    let result;
    try {
      writeFileSync(path, original.replace(from, to));
      result = run(id, [file], test);
    } finally { writeFileSync(path, original); }
    const killed = result.code !== 0 && result.failed.length > 0 && result.runtimeErrors === 0;
    rows.push({ id, killed, failed: result.failed.length });
    console.log(`${killed ? 'KILLED' : 'SURVIVED/ERROR'} ${id} (${result.failed.length} failing assertions)`);
  }
} finally {
  for (const [path, text] of originals) writeFileSync(path, text);
  const unchanged = [...originals].every(([path, text]) => createHash('sha256').update(readFileSync(path)).digest('hex') === createHash('sha256').update(text).digest('hex'));
  const killed = rows.filter(row => row.killed).length;
  writeFileSync(resolve(output, 'report.md'), [
    '# Date guard mutation evidence', '', `Killed: **${killed}/${selected.length}**. Originals restored byte-for-byte: **${unchanged}**.`, '',
    '| Mutation | Result | Failing assertions |', '|---|---|---:|',
    ...rows.map(row => `| ${row.id} | ${row.killed ? 'killed' : 'SURVIVED / ERROR'} | ${row.failed} |`), '',
    'This is targeted fault injection, not a claim of exhaustive mutation coverage or zero bugs.', '',
  ].join('\n'));
  if (!unchanged) throw new Error('Source restoration failed. Stop and restore .cache/date-mutations/originals.');
}
if (rows.length !== selected.length || rows.some(row => !row.killed)) process.exitCode = 1;
