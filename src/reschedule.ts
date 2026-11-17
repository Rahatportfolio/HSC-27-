import { addDays, diffDays, getPhases, hasFullTaskAllocation, isValidDate, scheduleDateError } from './planner';
import type { AppData, Settings, Task } from './planner';
import { t } from './i18n';
import { buildOrdinaryStudyPlan } from './studyPlan';
import { parseTaskRangeId } from './taskReferences';

export const SCHEDULE_FIELDS = [
  'startDate', 'startTime', 'dailyHours', 'boostEnabled', 'boostStartDate', 'boostDailyHours',
  'testExamDate', 'examDate', 'adaptiveEnabled', 'adaptiveBuffer',
] as const;
export const scheduleChanged = (before: Settings, after: Settings): boolean =>
  SCHEDULE_FIELDS.some(key => before[key] !== after[key]);

/** Atomic settings transaction. Shift schedule customisations, NOT historical evidence.
 * Notes, marks, completed timestamps, spaced recall, holidays, important dates and weekly
 * appointments have real calendar meanings and remain on their original dates.
 * A locked schedule must be explicitly unlocked before a global regeneration.
 */
export function applyScheduleSettings(data: AppData, settings: Settings): AppData {
  const error = scheduleDateError(settings);
  if (error) throw new Error(error);
  const changed = scheduleChanged(data.settings, settings);
  const inOldPlan = (date: string) => date >= data.settings.startDate && date < data.settings.examDate;
  if (changed && data.lockedDates.some(inOldPlan)) {
    throw new Error(t('গোটা রুটিন বদলানোর আগে পরিকল্পনার লক করা দিনগুলো আনলক করো।', 'Unlock the plan’s locked dates before changing the whole routine.'));
  }
  const delta = diffDays(data.settings.startDate, settings.startDate);
  const nextSettings = { ...settings, calendarRevision: data.settings.calendarRevision + (changed ? 1 : 0) };
  if (!changed) return { ...data, settings: nextSettings };
  const end = getPhases(settings).at(-1)!.end;

  const shift = (date: string) => {
    if (!inOldPlan(date)) return date;
    const next = addDays(date, delta);
    if (!isValidDate(next)) throw new Error(t('সরানো তারিখ অনুমোদিত সীমার বাইরে।', 'A shifted date is outside the supported range.'));
    if (next < settings.startDate || next > end) throw new Error(t('এই পরিবর্তনে কাস্টম দিনের কাজ নতুন রুটিনের বাইরে পড়ছে। আগে কাজটি রুটিনের ভেতরে সরাও।', 'This change would put a custom day outside the new routine. Move it inside the routine first.'));
    return next;
  };
  const remapDates = <T,>(map: Record<string, T>): Record<string, T> => {
    const result: Record<string, T> = {};
    for (const [date, value] of Object.entries(map)) {
      const next = shift(date);
      // Never silently overwrite a setting that already belongs to the destination date.
      if (Object.hasOwn(result, next)) throw new Error(t('দুটি কাস্টম দিনের সেটিং একই তারিখে পড়ছে। আগে সেগুলো মিলিয়ে নাও।', 'Two custom day settings collide. Resolve them before shifting the plan.'));
      result[next] = value;
    }
    return result;
  };
  const idMap = new Map<string, string>();
  const hasSplitHistory = Object.keys(data.completed).some(id => id.startsWith('smart-part|'));
  let originalTasks: Task[] | undefined;
  const finished = (id: string) => {
    if (data.completed[id]) return true;
    if (!hasSplitHistory) return false;
    originalTasks ??= buildOrdinaryStudyPlan(data).flatMap(day => day.tasks);
    return hasFullTaskAllocation(originalTasks, id, data.completed);
  };
  const routineBlocks = data.routineBlocks.map(block => {
    if (!block.date || finished(`custom-${block.date}-${block.id}`)) return block;
    const date = shift(block.date);
    if (date === block.date) return block;
    idMap.set(`custom-${block.date}-${block.id}`, `custom-${date}-${block.id}`);
    return { ...block, date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
  });
  const idFor = (id: string): string => {
    if (idMap.has(id)) return idMap.get(id)!;
    if (id.startsWith('smart-part|')) {
      const range = parseTaskRangeId(id);
      if (range?.kind === 'part' && idMap.has(range.sourceId))
        return `smart-part|${encodeURIComponent(idMap.get(range.sourceId)!)}|${range.from}|${range.to}`;
    }
    return id;
  };
  const remapIds = <T,>(map: Record<string, T>, completionEvidence = false): Record<string, T> => {
    const entries = Object.entries(map).map(([id, value]) => [idFor(id), value] as const);
    if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error(completionEvidence
      ? t('সম্পন্ন কাজের তথ্যের সঙ্গে নতুন ID মিলে যাচ্ছে। আগে ব্যাকআপ রাখো ও কাস্টম কাজটি মিলিয়ে নাও।', 'The remapped task id collides with completion evidence. Back up and resolve the custom task first.')
      : t('দুটি কাজের কাস্টম সেটিং একই ID-তে পড়ছে। আগে সেগুলো মিলিয়ে নাও।', 'Two custom task settings collide. Resolve them before shifting the plan.'));
    return Object.fromEntries(entries);
  };
  // Only pending dated tasks need new references. Retain every completion instant
  // exactly once under the remapped id; duplicate aliases could resurrect an undone
  // fragment after moving the start back, or exceed storage's 10,000-entry limit.
  // Fully completed tasks never enter idMap, so their dated identities stay intact.
  const completed = Object.keys(data.completed).some(id => idFor(id) !== id)
    ? remapIds(data.completed, true) : data.completed;
  const dayOverrides = Object.fromEntries(Object.entries(remapDates(data.dayOverrides)).map(([date, override]) => [date, {
    ...override,
    ...(override.taskMinutes ? { taskMinutes: remapIds(override.taskMinutes) } : {}),
    ...(override.taskStartMinutes ? { taskStartMinutes: remapIds(override.taskStartMinutes) } : {}),
  }]));
  const taskEdits = remapIds(Object.fromEntries(Object.entries(data.taskEdits).map(([id, edit]) => [id, {
    ...edit, ...(edit.date && !finished(id) ? { date: shift(edit.date) } : {}),
  }])));
  const carryovers = data.carryovers.map(item => item.completedAt || finished(item.taskId) ? item : {
    ...item, taskId: idFor(item.taskId), date: shift(item.date), fromDate: shift(item.fromDate),
  });
  const advanced = data.advanced ? {
    ...data.advanced,
    targets: remapDates(data.advanced.targets),
    ...(data.advanced.dailyGoals ? { dailyGoals: remapDates(data.advanced.dailyGoals) } : {}),
  } : undefined;
  return {
    ...data, settings: nextSettings, completed, routineBlocks, dayOverrides, taskEdits, carryovers,
    removedTasks: [...new Set(data.removedTasks.map(idFor))],
    ...(advanced ? { advanced } : {}),
  };
}
