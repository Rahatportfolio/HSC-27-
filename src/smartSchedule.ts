import { chapterById } from "./data";
import type { SubjectId } from "./data";
import { addDays, diffDays, effectiveDailyHours, toMinutes, todayKey } from "./planner";
import type { AppData, Day, Task } from "./planner";
import { mergeWatched, priority } from "./advanced";
import { parseTaskRangeId } from './taskReferences';

const PREFIX = "smart-part|";
export function remainingTaskMinutes(
  task: Task,
  data: AppData,
): { from: number; to: number }[] {
  const total = Math.max(0, task.endMinute - task.startMinute);
  if (data.completed[task.id]) return [];
  let done: [number, number][] = [];
  for (const id of Object.keys(data.completed)) {
    if (!id.startsWith(PREFIX)) continue;
    const range = parseTaskRangeId(id);
    if (range?.kind === 'part' && range.sourceId === task.id)
      done = mergeWatched(done, [range.from, range.to], total);
  }
  const remaining: { from: number; to: number }[] = [];
  let cursor = 0;
  for (const [from, to] of done) {
    if (from > cursor) remaining.push({ from: cursor, to: from });
    cursor = to;
  }
  if (cursor < total) remaining.push({ from: cursor, to: total });
  return remaining;
}
export function remainingMedia(
  c: NonNullable<AppData["advanced"]>["classes"][number],
): [number, number][] {
  const seen = mergeWatched(
    c.ranges || (c.watched ? [[0, c.watched]] : []),
    [0, 0],
    c.duration,
  );
  const missing: [number, number][] = [];
  let cursor = 0;
  for (const [s, e] of seen) {
    if (s > cursor) missing.push([cursor, s]);
    cursor = e;
  }
  if (cursor < c.duration) missing.push([cursor, c.duration]);
  return missing;
}
/** Non-destructive projection over the original routine. Video workload gets real daily
 * slots, and displaced textbook/practice work stays in a bounded FIFO backlog. Neither
 * legacy ids nor saved manual edits are overwritten. Completed split ranges remain done. */
export function integrateStudyPlan(
  base: Day[],
  data: AppData,
  today: string,
): Day[] {
  if (!data.advanced?.classes.length || !base.length) return base;
  const a = data.advanced;
  const locked = new Set(data.lockedDates);
  const queue = base.flatMap((d) =>
    locked.has(d.date)
      ? []
      : d.tasks
          .filter((t) => !t.video)
          .flatMap((task) =>
            remainingTaskMinutes(task, data).map((range) => ({
              task,
              ...range,
            })),
          ),
  );
  const media = a.classes
    .map((c) => ({
      c,
      ranges: remainingMedia(c),
      rank: priority(data, c.chapterId, today),
    }))
    .sort((x, y) => y.rank - x.rank);
  const taskById = new Map(base.flatMap((d) => d.tasks).map((t) => [t.id, t]));
  const history = new Map<string, Task[]>();
  const accounted = new Map<string, [number, number][]>();
  const rangeMinutes = (ranges: [number, number][]) => ranges.reduce((sum, [from, to]) => sum + to - from, 0);
  // Attribute overlapping evidence to the earliest real completion, irrespective
  // of map insertion order. Do not erase old keys or change their timestamps.
  for (const [id, at] of Object.entries(data.completed).sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]) || a[0].localeCompare(b[0]))) {
    if (!id.startsWith(PREFIX)) continue;
    const range = parseTaskRangeId(id);
    if (!range || range.kind !== 'part') continue;
    const task = taskById.get(range.sourceId);
    if (!task || data.completed[task.id]) continue; // Canonical completion already represents every fragment.
    const total = Math.max(0, task.endMinute - task.startMinute);
    const seen = accounted.get(task.id) || [];
    const covered = mergeWatched(seen, [range.from, range.to], total);
    const uniqueMinutes = rangeMinutes(covered) - rangeMinutes(seen);
    accounted.set(task.id, covered);
    if (uniqueMinutes <= 0.001) continue;
    const date = todayKey(new Date(at));
    const list = history.get(date) || [];
    list.push({
      ...task,
      id,
      originalTaskId: task.id,
      sourceMinutes: total,
      date,
      startMinute: 0,
      endMinute: uniqueMinutes,
    });
    history.set(date, list);
  }
  const result = base
    .filter((d) => d.date < today)
    .map((d) => ({
      ...d,
      tasks: locked.has(d.date)
        ? d.tasks
        : d.tasks.filter((t) => !!data.completed[t.id]),
    }));
  for (const [date, done] of history)
    if (date < today) {
      const day = result.find((d) => d.date === date);
      if (day) day.tasks.push(...done);
    }

  const byDate = new Map(base.map((d) => [d.date, d]));
  const last = base.at(-1)!;
  let date = today < base[0].date ? base[0].date : today;
  let index = 0;
  // Added lectures cannot silently postpone the real preparation deadline.
  while (date < data.settings.examDate && (
    date <= last.date ||
    queue.length ||
    media.some((m) => m.ranges.length)
  )) {
    if (index++ > 5000) {
      if (result.length)
        result[result.length - 1] = {
          ...result[result.length - 1],
          deferredMinutes:
            queue.reduce((s, q) => s + q.to - q.from, 0) +
            media.reduce(
              (s, m) =>
                s +
                m.ranges.reduce(
                  (n, [x, y]) => n + ((y - x) / 60 / m.c.speed) * 1.5,
                  0,
                ),
              0,
            ),
        };
      break;
    }
    const original = byDate.get(date);
    const shell: Day = original || {
      ...last,
      date,
      index: diffDays(base[0].date, date) + 1,
      tasks: [],
    };
    if (locked.has(date)) {
      result.push(shell);
      date = addDays(date, 1);
      continue;
    }
    const logged = data.studySessions
      .filter((s) => s.date === date)
      .reduce((n, s) => n + s.minutes, 0);
    const capacity =
      a.targets[date] ??
      (data.dayOverrides[date]?.dailyHours ??
        effectiveDailyHours(data.settings, date)) * 60;
    const completed = [
      ...(original?.tasks.filter((t) => data.completed[t.id]) || []),
      ...(history.get(date) || []),
    ];
    const completedMinutes = completed.reduce(
      (s, t) => s + Math.max(0, t.endMinute - t.startMinute),
      0,
    );
    let budget = Math.max(0, capacity - Math.max(logged, completedMinutes));
    const tasks: Task[] = [];
    let cursor =
      data.dayOverrides[date]?.startMinute ??
      toMinutes(data.settings.startTime);
    for (const t of completed) {
      const minutes = t.endMinute - t.startMinute;
      tasks.push({ ...t, startMinute: cursor, endMinute: cursor + minutes });
      cursor += minutes;
    }
    const availableFor = (task?: Task) => {
      const custom = task ? data.dayOverrides[date]?.taskStartMinutes?.[task.originalTaskId || task.id] : undefined;
      return Math.max(0, Math.min(budget, diffDays(date, data.settings.examDate) * 1440 - Math.max(cursor, custom ?? cursor)));
    };
    const append = (task: Task, minutes: number) => {
      const custom =
        data.dayOverrides[date]?.taskStartMinutes?.[
          task.originalTaskId || task.id
        ];
      if (custom !== undefined) cursor = Math.max(cursor, custom);
      tasks.push({
        ...task,
        date,
        dayIndex: shell.index,
        startMinute: cursor,
        endMinute: cursor + minutes,
      });
      cursor += minutes;
      budget -= minutes;
    };
    const consume = (i: number): boolean => {
      const q = queue[i];
      const minutes = Math.min(availableFor(q.task), q.to - q.from);
      // A full paper is not a set of arbitrary fragments. Leave it pending if it cannot fit.
      if (minutes <= 0.01 || (q.task.kind === 'exam' && minutes < q.to - q.from)) return false;
      const end = q.from + minutes;
      const entire =
        q.from === 0 && end === q.task.endMinute - q.task.startMinute;
      append(
        {
          ...q.task,
          id: entire
            ? q.task.id
            : `${PREFIX}${encodeURIComponent(q.task.id)}|${q.from}|${end}`,
          originalTaskId: q.task.id,
          sourceMinutes: q.task.endMinute - q.task.startMinute,
        },
        minutes,
      );
      q.from = end;
      if (q.from >= q.to - 0.001) {
        queue.splice(i, 1);
        return true;
      }
      return false;
    };
    // An exam or due revision must not be displaced by a newly added lecture.
    for (let i = 0; i < queue.length && budget > 0.01;) {
      const q = queue[i];
      if (q.task.date > date || !["exam", "revision"].includes(q.task.kind)) {
        i++;
        continue;
      }
      if (!consume(i)) i++;
    }
    // Keep at least half of the day for textbook, revision and ordinary scheduled work.
    let mediaBudget = Math.min(
      budget * 0.5,
      media.reduce(
        (n, m) =>
          n +
          m.ranges.reduce(
            (s, [x, y]) => s + ((y - x) / 60 / m.c.speed) * 1.5,
            0,
          ),
        0,
      ),
    );
    if (!queue.some((q) => q.task.date <= date)) mediaBudget = budget;
    const used: Partial<Record<SubjectId, number>> = {};
    for (const m of media) {
      const subject = chapterById[m.c.chapterId].subject;
      while (
        m.ranges.length &&
        mediaBudget > 0.01 &&
        (used[subject] || 0) < a.subjectMinutes - 0.01
      ) {
        const [from, end] = m.ranges[0];
        const minutes = Math.min(
          30,
          availableFor(),
          mediaBudget,
          a.subjectMinutes - (used[subject] || 0),
          ((end - from) / 60 / m.c.speed) * 1.5,
        );
        if (minutes <= 0.01) break;
        const to = Math.min(end, from + (minutes / 1.5) * 60 * m.c.speed);
        append(
          {
            id: `smart-video|${encodeURIComponent(m.c.id)}|${Math.round(from * 1000)}|${Math.round(to * 1000)}`,
            date,
            dayIndex: shell.index,
            phase: shell.phase,
            subject,
            kind: "learn",
            title: m.c.title,
            detail: `Video ${Math.floor(from / 60)}–${Math.ceil(to / 60)} min · ${m.c.speed}× + breaks, notes, practice & revision`,
            chapterIds: [m.c.chapterId],
            startMinute: 0,
            endMinute: 0,
            video: { classId: m.c.id, from, to },
          },
          minutes,
        );
        mediaBudget -= minutes;
        used[subject] = (used[subject] || 0) + minutes;
        if (to >= end - 0.001) m.ranges.shift();
        else m.ranges[0][0] = to;
      }
    }
    for (let i = 0; i < queue.length && budget > 0.01;) {
      if (queue[i].task.date > date) {
        i++;
        continue;
      }
      if (!consume(i)) i++;
    }
    result.push({ ...shell, tasks });
    date = addDays(date, 1);
  }
  const deferred = queue.reduce((sum, q) => sum + q.to - q.from, 0) + media.reduce((sum, m) =>
    sum + m.ranges.reduce((n, [from, to]) => n + ((to - from) / 60 / m.c.speed) * 1.5, 0), 0);
  if (deferred > 0.01 && result.length) result[result.length - 1] = { ...result[result.length - 1], deferredMinutes: deferred };
  return result;
}
