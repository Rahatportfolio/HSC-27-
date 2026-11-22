import type { AppData, Day, Task } from './planner';
import { addDays, diffDays, formatDurationBn, formatDate, isValidDate, todayKey } from './planner';
import { chapterById } from './data';
import { t } from './i18n';
import { parseTaskRangeId } from './taskReferences';
import { PERSONAL_SESSIONS, WORK_STAGES, chapterWorkEstimate, isPersonalTaskComplete, personalCapacity, personalChapterSpeed, personalChapterPairs, personalCategory, activePersonalCategory, personalFreeWindows, personalStageSourceId, personalUnfinishedRanges, weeklyWindows, workloadFor } from './personalRoutine';
import type { PersonalWork, WorkStage } from './personalRoutine';

const ordered = (a: Task, b: Task) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.id.localeCompare(b.id);
const primary = (stage: WorkStage) => ['class', 'reading', 'notes'].includes(stage);
export function personalSlotFits(data: AppData, task: Task): boolean {
  return !!data.personalRoutine && task.startMinute >= 0 && task.endMinute <= 1440 && task.endMinute > task.startMinute &&
    weeklyWindows(data.personalRoutine, task.date).some(window => task.startMinute >= Math.max(window.startMinute, data.dayOverrides[task.date]?.startMinute ?? 0) && task.endMinute <= window.endMinute);
}
function fragment(task: Task, from: number, to: number): Task {
  const work = task.personalWork!;
  const minutes = Math.ceil(to - from);
  return { ...task, id: `smart-part|${encodeURIComponent(work.sourceId)}|${from}|${to}`, startMinute: task.startMinute + Math.floor(from - work.from),
    endMinute: task.startMinute + Math.floor(from - work.from) + minutes,
    personalWork: { ...work, from, to, ...(work.mediaFromSec !== undefined ? { mediaFromSec: from / task.sourceMinutes! * work.rawMinutes * 60, mediaToSec: to / task.sourceMinutes! * work.rawMinutes * 60 } : {}) } };
}
function coveredFragments(task: Task, completed: Record<string, string>): Task[] {
  const missing = personalUnfinishedRanges(task, completed), result: Task[] = [];
  let from = task.personalWork!.from;
  for (const range of missing) { if (range.from > from) result.push(fragment(task, from, range.from)); from = range.to; }
  if (from < task.personalWork!.to) result.push(fragment(task, from, task.personalWork!.to));
  return result;
}
/** Pure rolling reallocation: unpaid ranges replace future work in available space.
 * They are NEVER a carry-over bonus added on top of a full day. The old records
 * and timestamps remain in AppData; this returns a new effective calendar only.
 */
export function reflowPersonalPlan(data: AppData, baseline: Day[], asOf: string): Day[] {
  const routine = data.personalRoutine;
  if (!routine || !isValidDate(asOf) || !baseline.length) return baseline;
  const start = [asOf, data.settings.startDate, routine.startsOn || data.settings.startDate].sort().at(-1)!;
  const original = baseline.flatMap(day => day.tasks);
  const overdue = original.some(task => task.personalWork && task.date < start && !isPersonalTaskComplete(task, data.completed));
  const invalid = baseline.some(day => {
    if (day.date < start) return false;
    let through = -Infinity;
    for (const task of [...day.tasks].sort((a, b) => a.startMinute - b.startMinute)) {
      if (!personalSlotFits(data, task) || task.startMinute < through) return true;
      through = Math.max(through, task.endMinute);
    }
    return day.tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) > personalCapacity(data, day.date);
  });
  // The untouched category-sorted baseline is already safe; avoid a full
  // rolling reconstruction until evidence or explicit schedule changes exist.
  const untouchedAll = routine.scope === 'ALL' && !Object.keys(data.completed).some(id => id.startsWith('personal:') || id.startsWith('smart-part|')) &&
    !data.lockedDates.length && !data.removedTasks.length && !Object.keys(data.taskEdits).length && !Object.keys(data.dayOverrides).length;
  if (!overdue && !invalid && !routine.history?.length && (routine.scope !== 'ALL' || untouchedAll)) return baseline;
  const activeCategory = activePersonalCategory(data);
  const earliest = [data.settings.startDate, ...(routine.history || []).map(task => task.date)].sort()[0];
  const plan: Day[] = Array.from({ length: Math.max(0, diffDays(earliest, data.settings.examDate)) }, (_, index) => ({ date: addDays(earliest, index), index: index + 1, phase: 'learn', isCatchup: false, personalRoutine: true, tasks: [] }));
  if (plan[0]) plan[0].reflowFrom = start;
  const days = new Map(plan.map(day => [day.date, day]));
  const append = (task: Task) => { const day = days.get(task.date); if (day && !day.tasks.some(item => item.id === task.id)) day.tasks.push({ ...task, dayIndex: day.index }); };
  const allocated = new Map<string, Task[]>(), unscheduled = new Map<string, Task[]>();
  const reserve = (task: Task) => { allocated.set(task.date, [...(allocated.get(task.date) || []), task]); append(task); };
  const omit = (task: Task) => { unscheduled.set(task.date, [...(unscheduled.get(task.date) || []), task]); };
  const occupied = (date: string) => (allocated.get(date) || []).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
  const clashes = (task: Task) => (allocated.get(task.date) || []).some(other => other.startMinute < task.endMinute && other.endMinute > task.startMinute);
  // Fixed custom appointments are not rewritten. Invalid ones are retained in
  // `unscheduled`, not drawn as study outside the student's availability.
  for (const task of original.filter(task => !task.personalWork).sort(ordered)) {
    if (task.date < start) { append(task); continue; }
    if (!personalSlotFits(data, task) || clashes(task) || occupied(task.date) + task.endMinute - task.startMinute > personalCapacity(data, task.date)) omit(task);
    else reserve(task);
  }
  const historical = new Map<string, Task>(), historyMask: Record<string, string> = {};
  for (const task of [...(routine.history || []), ...original.filter(task => task.personalWork && task.date < start)]) {
    if (!task.personalWork) continue;
    for (const done of coveredFragments(task, data.completed)) for (const range of personalUnfinishedRanges(done, historyMask)) {
      const unique = fragment(done, range.from, range.to);
      historical.set(unique.id, unique); historyMask[unique.id] = 'history-only';
    }
  }
  for (const task of historical.values()) {
    if (personalSlotFits(data, task) && !clashes(task) && (task.date < start || occupied(task.date) + task.endMinute - task.startMinute <= personalCapacity(data, task.date))) {
      if (task.date >= start) reserve(task); else append(task);
    } else {
      const day = days.get(task.date); if (day) day.historyTasks = [...(day.historyTasks || []), task];
    }
  }
  const masked = { ...data.completed };
  const lockedPast = original.filter(task => task.personalWork && task.date < start && data.lockedDates.includes(task.date))
    .flatMap(task => personalUnfinishedRanges(task, data.completed).map(range => fragment(task, range.from, range.to)));
  // A partially covered locked allocation keeps its original wall-clock position,
  // but only its unpaid range is pending. Do not draw/count the done part twice.
  for (const task of lockedPast) { append(task); masked[task.id] = 'locked-only'; }
  // Preserve actual future completion slots, date locks and valid explicit edits.
  for (const task of original.filter(task => task.personalWork && task.date >= start).sort(ordered)) {
    const explicit = data.lockedDates.includes(task.date) || !!data.taskEdits[task.id]?.date || data.dayOverrides[task.date]?.taskStartMinutes?.[task.id] !== undefined;
    // Completion history may already reserve part of this exact slot. Pin only
    // the unpaid fragments at their original positions, not the overlapping
    // whole task; otherwise a partial confirmation silently unlocks/moves work.
    if (explicit) for (const range of personalUnfinishedRanges(task, data.completed)) {
      // A saved pin is retained but cannot bypass an unfinished earlier category.
      if (activeCategory && ['S', 'A', 'B', 'C'].indexOf(personalCategory(data, task.chapterIds[0])) > ['S', 'A', 'B', 'C'].indexOf(activeCategory)) { omit(fragment(task, range.from, range.to)); continue; }
      const pending = fragment(task, range.from, range.to);
      if (personalSlotFits(data, pending) && !clashes(pending) && occupied(pending.date) + pending.endMinute - pending.startMinute <= personalCapacity(data, pending.date)) {
        reserve(pending); masked[pending.id] = 'reserved-only';
      }
    }
    for (const done of coveredFragments(task, data.completed)) for (const range of personalUnfinishedRanges(done, historyMask)) {
      const unique = fragment(done, range.from, range.to);
      if (personalSlotFits(data, unique) && !clashes(unique) && occupied(unique.date) + unique.endMinute - unique.startMinute <= personalCapacity(data, unique.date)) reserve(unique);
    }
  }
  // A deliberate deletion remains an unallocated obligation, not resurrected or certified.
  for (const id of data.removedTasks) if (parseTaskRangeId(id)?.sourceId.startsWith('personal:')) masked[id] = 'removed-only';
  const bySource = new Map<string, Task[]>();
  for (const task of original) if (task.personalWork) bySource.set(task.personalWork.sourceId, [...(bySource.get(task.personalWork.sourceId) || []), task]);
  const originalFor = (sourceId: string, from: number) => bySource.get(sourceId)?.find(task => task.personalWork!.from <= from && task.personalWork!.to > from);
  const sourceRequirements = (id: string) => WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id) || workloadFor(routine, id)[stage.id].minutes !== 0).map(stage => personalStageSourceId(routine, id, stage.id));
  let dayCursor = Math.max(0, diffDays(earliest, start));
  const reservedPairEnd = (pair: string[]) => [...allocated.values()].flat().filter(task => task.personalWork && pair.includes(task.chapterIds[0])).map(task => task.date).sort().at(-1);
  for (const pair of personalChapterPairs(routine, data)) {
    // Later categories are provisional future projections. Today they are not
    // actionable until every required source in the current category is done.
    if (activeCategory && ['S', 'A', 'B', 'C'].indexOf(personalCategory(data, pair[0])) > ['S', 'A', 'B', 'C'].indexOf(activeCategory)) dayCursor = Math.max(dayCursor, diffDays(earliest, addDays(start, 1)));
    if (pair.some(id => !chapterWorkEstimate(routine, id).complete)) break;
    const chapters = pair.map(id => {
      const work = workloadFor(routine, id), estimate = chapterWorkEstimate(routine, id);
      const pieces = PERSONAL_SESSIONS.flatMap(session => session.stages.flatMap(stageId => {
        const stage = WORK_STAGES.find(item => item.id === stageId)!;
        const budget = work[stage.id]; if (!budget.minutes) return [];
        const minutes = Math.ceil(budget.minutes / (stage.media ? personalChapterSpeed(routine, id) : 1));
        const from = 0, to = minutes;
        const sourceId = personalStageSourceId(routine, id, stage.id), old = originalFor(sourceId, from);
        const personalWork: PersonalWork = { stage: stage.id, sourceId, from, to, requiredSources: sourceRequirements(id), chapterMinutes: estimate.minutes, pairDay: 1,
          rawMinutes: budget.minutes, durationSource: budget.source, ...(budget.url ? { url: budget.url } : {}), ...(stage.media ? { mediaFromSec: from / minutes * budget.minutes * 60, mediaToSec: to / minutes * budget.minutes * 60 } : {}) };
        const task: Task = { id: `smart-part|${encodeURIComponent(sourceId)}|${from}|${to}`, originalTaskId: sourceId, sourceMinutes: minutes,
          date: old?.date || data.settings.startDate, dayIndex: 1, phase: 'learn', subject: chapterById[id].subject,
          kind: stage.id === 'revision' ? 'revision' : stage.media || primary(stage.id) ? 'learn' : 'practice', chapterIds: [id], title: `${chapterById[id].title} · ${t(stage.bn, stage.en)}`,
          detail: old?.detail || t('প্রকৃত উৎসের আলাদা কাজ।', 'Separate work from the actual source.'), startMinute: 0, endMinute: to - from, personalWork };
        return personalUnfinishedRanges(task, masked).map(range => ({ task, from: range.from, to: range.to }));
      }));
      return { id, pieces };
    });
    // Preserve the pair-day label based on actual earlier work.
    const currentSources = new Set(pair.flatMap(id => sourceRequirements(id)));
    const workedDates = [...historical.values(), ...[...allocated.values()].flat()].filter(task => task.personalWork && currentSources.has(task.personalWork.sourceId) && isPersonalTaskComplete(task, data.completed)).map(task => task.date);
    if (!workedDates.length) for (const [id, at] of Object.entries(data.completed)) {
      const source = parseTaskRangeId(id)?.sourceId || id;
      // A replaced URL/duration/calculation is a new source. Its predecessor's
      // timestamps remain history, never permission to skip this pair's day one.
      if (currentSources.has(source) && Number.isFinite(Date.parse(at))) workedDates.push(todayKey(new Date(at)));
    }
    const firstWorked = workedDates.sort()[0];
    let pairDay = 0;
    const lastPinned = reservedPairEnd(pair);
    while (dayCursor < plan.length && chapters.some(chapter => chapter.pieces.length)) {
      const day = plan[dayCursor++]; if (data.lockedDates.includes(day.date)) continue;
      const free = personalFreeWindows(data, day.date, allocated.get(day.date) || []);
      let budget = Math.max(0, personalCapacity(data, day.date) - occupied(day.date) - (day.historyTasks || []).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)); if (!free.length || !budget) continue;
      pairDay = firstWorked && day.date > firstWorked ? Math.max(2, pairDay + 1) : firstWorked && day.date === firstWorked ? 1 : pairDay + 1;
      let windowIndex = 0, cursor = free[0][0], turn = (pairDay - 1) % chapters.length;
      const served = new Set<number>();
      const eligible = (index: number) => chapters[index].pieces.length > 0;
      let guard = 0;
      while (chapters.some((_, index) => eligible(index)) && budget > 0 && windowIndex < free.length && guard++ < 500) {
        while (windowIndex < free.length && cursor >= free[windowIndex][1]) { windowIndex++; if (free[windowIndex]) cursor = Math.max(cursor, free[windowIndex][0]); }
        if (windowIndex >= free.length) break;
        const available = chapters.flatMap((_, index) => eligible(index) ? [index] : []);
        const index = available.find(value => value >= turn) ?? available[0], piece = chapters[index].pieces[0];
        if (available.every(value => served.has(value))) served.clear();
        const peers = available.filter(value => !served.has(value)).length, wall = free[windowIndex][1] - cursor;
        const share = peers > 1 && wall > routine.breakMinutes * (peers - 1)
          ? Math.max(1, Math.min(Math.ceil(budget / peers), Math.ceil((wall - routine.breakMinutes * (peers - 1)) / peers))) : wall;
        const minutes = Math.min(routine.sessionMinutes, wall, share, budget, Math.ceil(piece.to - piece.from)); if (minutes < 1) break;
        const to = Math.min(piece.to, piece.from + minutes), task = fragment(piece.task, piece.from, to), old = originalFor(piece.task.personalWork!.sourceId, piece.from);
        task.date = day.date; task.startMinute = cursor; task.endMinute = cursor + minutes; task.dayIndex = day.index; task.personalWork!.pairDay = pairDay;
        if (old && old.date !== day.date) task.rescheduledFrom = old.rescheduledFrom || old.date;
        const media = WORK_STAGES.find(stage => stage.id === task.personalWork!.stage)!.media;
        task.detail = `${routine.scope} · ${t('জোড়ার পড়ার দিন', 'Pair study day')} ${pairDay} · ${media ? t(`পূর্ণ ভিডিও ${formatDurationBn(task.personalWork!.rawMinutes)}; শুধু উৎসের এই অংশ।`, `Full video ${formatDurationBn(task.personalWork!.rawMinutes)}; only this source segment.`) : t('আলাদা পরিকল্পিত নিজে করার কাজ।', 'Separate planned independent work.')}${task.rescheduledFrom ? t(` আগের বরাদ্দ ${formatDate(task.rescheduledFrom)} থেকে খালি সময়ে সরেছে; কোনো বাড়তি ঘণ্টা নয়।`, ` Moved from ${formatDate(task.rescheduledFrom)} into free time, without bonus hours.`) : ''}`;
        append(task); reserveForNext(task);
        cursor += minutes + routine.breakMinutes; budget -= minutes; piece.from = to; if (piece.from >= piece.to) chapters[index].pieces.shift(); turn = (index + 1) % chapters.length; served.add(index);
      }
    }
    function reserveForNext(task: Task) { allocated.set(task.date, [...(allocated.get(task.date) || []), task]); }
    if (chapters.some(chapter => chapter.pieces.length)) {
      if (plan.length) plan[plan.length - 1].deferredMinutes = chapters.reduce((sum, chapter) => sum + chapter.pieces.reduce((n, piece) => n + piece.to - piece.from, 0), 0);
      break;
    }
    if (lockedPast.some(task => pair.includes(task.chapterIds[0]))) break;
    if (lastPinned && dayCursor <= diffDays(earliest, lastPinned)) dayCursor = diffDays(earliest, lastPinned) + 1;
  }
  for (const day of plan) {
    day.tasks.sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
    if (unscheduled.has(day.date)) day.unscheduled = unscheduled.get(day.date);
  }
  return plan;
}
