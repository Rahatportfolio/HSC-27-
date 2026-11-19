import { BUILTIN_QUESTION_META } from "./questionBankIndex";
import { CHAPTERS, chapterById, SUBJECTS } from "./data";
import type { SubjectId } from "./data";
import { addDays, diffDays, isValidDate } from "./planner";
import type { AppData, Day } from "./planner";
export const PREPARATION = [
  "lecture",
  "textbook",
  "notes",
  "mcq",
  "cq",
  "revision1",
  "revision2",
  "modelTest",
  "examReady",
] as const;
export type PreparationStep = (typeof PREPARATION)[number];
export interface StudyClass {
  ranges?: [number, number][];
  id: string;
  title: string;
  url: string;
  chapterId: string;
  teacher: string;
  duration: number;
  position: number;
  watched: number;
  speed: number;
  permitted: boolean;
  local?: boolean;
  size?: number;
  note: string;
}
export interface AdvancedData {
  classes: StudyClass[];
  preparation: Record<string, Partial<Record<PreparationStep, boolean>>>;
  targets: Record<string, number>;
  subjectMinutes: number;
  activityDates?: string[];
  coverageDates?: Record<string, string>;
  dailyGoals?: Record<
    string,
    { mcq: number; cq: number; revision: number; locked: boolean }
  >;
}
export const emptyAdvanced = (): AdvancedData => ({
  classes: [],
  preparation: {},
  targets: {},
  subjectMinutes: 90,
});
export function canonicalUrl(raw: string): string {
  const u = new URL(raw.trim());
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw new Error("শুধু public HTTP/HTTPS লিংক ব্যবহার করো");
  u.hash = "";
  u.searchParams.sort();
  return u.href;
}
export function directVideo(raw: string): boolean {
  try {
    const u = new URL(canonicalUrl(raw));
    return (
      /\.(mp4|webm|ogg|m4v)$/i.test(u.pathname) &&
      !/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(u.hostname)
    );
  } catch {
    return false;
  }
}
export function parseAdvanced(raw: unknown): AdvancedData {
  if (raw === undefined) return emptyAdvanced();
  const a = raw as AdvancedData;
  if (
    !a ||
    !Array.isArray(a.classes) ||
    a.classes.length > 1000 ||
    !a.preparation ||
    typeof a.preparation !== "object" ||
    Array.isArray(a.preparation) ||
    !a.targets ||
    typeof a.targets !== "object" ||
    Array.isArray(a.targets) ||
    !Number.isFinite(a.subjectMinutes) ||
    a.subjectMinutes < 1 ||
    a.subjectMinutes > 1440
  )
    throw new Error("Study system data invalid");
  if (
    a.coverageDates &&
    (typeof a.coverageDates !== "object" ||
      Array.isArray(a.coverageDates) ||
      Object.entries(a.coverageDates).some(
        ([id, date]) => !Object.hasOwn(chapterById, id) || !isValidDate(date),
      ))
  )
    throw new Error("Coverage dates invalid");
  if (
    a.activityDates &&
    (!Array.isArray(a.activityDates) ||
      a.activityDates.length > 10000 ||
      a.activityDates.some((date) => !isValidDate(date)))
  )
    throw new Error("Study activity dates invalid");
  if (a.dailyGoals) {
    if (
      typeof a.dailyGoals !== "object" ||
      Array.isArray(a.dailyGoals) ||
      Object.keys(a.dailyGoals).length > 10000
    )
      throw new Error("Daily goals invalid");
    for (const [date, g] of Object.entries(a.dailyGoals))
      if (
        !isValidDate(date) ||
        !g ||
        typeof g.locked !== "boolean" ||
        ![g.mcq, g.cq, g.revision].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= 10000,
        )
      )
        throw new Error("Daily goals invalid");
  }
  const ids = new Set<string>();
  for (const c of a.classes) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 180 ||
      ids.has(c.id) ||
      !Object.hasOwn(chapterById, c.chapterId) ||
      typeof c.title !== "string" ||
      !c.title.trim() ||
      c.title.length > 300 ||
      typeof c.teacher !== "string" ||
      c.teacher.length > 200 ||
      typeof c.url !== "string" ||
      c.url.length > 2000 ||
      typeof c.note !== "string" ||
      c.note.length > 20000 ||
      typeof c.permitted !== "boolean" ||
      ![1, 1.25, 1.5, 2].includes(c.speed) ||
      ![c.duration, c.position, c.watched].every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      c.duration <= 0 ||
      c.position > c.duration ||
      c.watched > c.duration
    )
      throw new Error("Class data invalid");
    if (
      c.ranges &&
      (!Array.isArray(c.ranges) ||
        c.ranges.length > 20000 ||
        c.ranges.some(
          (r) =>
            !Array.isArray(r) ||
            r.length !== 2 ||
            !r.every(Number.isFinite) ||
            r[0] < 0 ||
            r[1] < r[0] ||
            r[1] > c.duration,
        ))
    )
      throw new Error("Watched ranges invalid");
    if (c.local !== undefined && typeof c.local !== "boolean")
      throw new Error("Offline status invalid");
    if (
      c.size !== undefined &&
      (!Number.isFinite(c.size) || c.size < 0 || c.size > 2_000_000_000)
    )
      throw new Error("File size invalid");
    canonicalUrl(c.url);
    ids.add(c.id);
    if (c.permitted && !directVideo(c.url))
      throw new Error("Only direct permitted files can be downloaded");
  }
  for (const [id, steps] of Object.entries(a.preparation))
    if (
      !Object.hasOwn(chapterById, id) ||
      !steps ||
      typeof steps !== "object" ||
      Array.isArray(steps) ||
      Object.entries(steps).some(
        ([k, v]) =>
          !PREPARATION.includes(k as PreparationStep) || typeof v !== "boolean",
      )
    )
      throw new Error("Preparation data invalid");
  for (const [date, minutes] of Object.entries(a.targets))
    if (
      !isValidDate(date) ||
      !Number.isFinite(minutes) ||
      minutes < 0 ||
      minutes > 1440
    )
      throw new Error("Target invalid");
  return a;
}
export function readiness(data: AppData, chapterId: string) {
  const a = data.advanced || emptyAdvanced();
  const classes = a.classes.filter((c) => c.chapterId === chapterId);
  const total = classes.reduce((s, c) => s + c.duration, 0);
  const watched = classes.reduce((s, c) => s + c.watched, 0);
  const steps = { ...a.preparation[chapterId] };
  if (
    data.revisions.some(
      (r) =>
        r.chapterId === chapterId &&
        r.interval === 1 &&
        r.completedAt &&
        !r.sourceTaskId?.startsWith("auto-"),
    )
  )
    steps.revision1 = true;
  if (
    data.revisions.some(
      (r) =>
        r.chapterId === chapterId &&
        r.interval === 3 &&
        r.completedAt &&
        !r.sourceTaskId?.startsWith("auto-"),
    )
  )
    steps.revision2 = true;
  const lectures = classes.length
    ? classes.every((c) => c.watched >= Math.max(0, c.duration - 2))
    : !!steps.lecture;
  const done = PREPARATION.filter((k) =>
    k === "lecture"
      ? lectures
      : k === "examReady"
        ? !!steps[k] &&
          PREPARATION.slice(1, 8).every((s) => steps[s]) &&
          lectures
        : !!steps[k],
  ).length;
  return {
    watched: total ? Math.round((watched / total) * 100) : 0,
    coverage: Math.round((Number(lectures) + Number(!!steps.textbook)) * 50),
    readiness: Math.round((done / 9) * 100),
    lectures,
  };
}
export function priority(data: AppData, id: string, today: string): number {
  const c = chapterById[id];
  if (!c) return 0;
  const tests = data.tests.filter((t) => t.chapterIds.includes(id));
  const questions = new Set(
    [...BUILTIN_QUESTION_META, ...data.questions]
      .filter((q) => q.chapterId === id)
      .map((q) => q.id),
  );
  const attempts = data.attempts.filter((a) => questions.has(a.questionId));
  const cq = data.cq.filter((c) => c.chapterId === id);
  const scores = [
    ...tests.map((t) => t.score / Math.max(1, t.total)),
    ...attempts.map((a) => Number(a.correct)),
    ...cq.map((c) => c.marks / Math.max(1, c.total)),
  ];
  const weakness = scores.length
    ? 1 -
      scores.reduce((n, s) => n + Math.min(1, Math.max(0, s)), 0) /
        scores.length
    : 0.5;
  const deadline = [
    ...data.importantDates,
    { date: data.settings.testExamDate },
    { date: data.settings.examDate },
  ]
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    (100 - readiness(data, id).readiness) / 5 +
    { A: 30, B: 20, C: 10 }[data.chapterMeta[id]?.priority || c.priority] +
    weakness * 25 +
    (data.chapterMeta[id]?.weak || data.confidence[id] === "weak" ? 20 : 0) +
    (data.revisions.some(
      (r) => r.chapterId === id && !r.completedAt && r.dueDate <= today,
    )
      ? 25
      : 0) +
    (deadline ? 30 / Math.max(1, diffDays(today, deadline.date)) : 0)
  );
}
export interface VideoSession {
  id: string;
  title: string;
  subject: SubjectId;
  minutes: number;
  videoMinutes: number;
  from: number;
  to: number;
}
/** Uses only spare capacity in the existing plan: never double-books its workload. Remaining media is rebuilt from actual progress, so missed sessions roll forward. */
export function videoWeek(data: AppData, plan: Day[], today: string) {
  const a = data.advanced || emptyAdvanced();
  if (plan.some((d) => d.tasks.some((t) => t.video)))
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i);
      const tasks = plan.find((d) => d.date === date)?.tasks || [];
      const sessions: VideoSession[] = tasks
        .filter((t) => t.video && !data.completed[t.id])
        .map((t) => ({
          id: t.video!.classId,
          title: t.title,
          subject: t.subject,
          minutes: t.endMinute - t.startMinute,
          videoMinutes: (t.endMinute - t.startMinute) / 1.5,
          from: t.video!.from,
          to: t.video!.to,
        }));
      return {
        date,
        sessions,
        reserved: tasks
          .filter((t) => !t.video && !data.completed[t.id])
          .reduce((n, t) => n + t.endMinute - t.startMinute, 0),
        logged: data.studySessions
          .filter((s) => s.date === date)
          .reduce((n, s) => n + s.minutes, 0),
        capacity:
          a.targets[date] ??
          (data.dayOverrides[date]?.dailyHours ?? data.settings.dailyHours) *
            60,
      };
    });
  const queue = [...a.classes]
    .sort(
      (x, y) =>
        priority(data, y.chapterId, today) - priority(data, x.chapterId, today),
    )
    .map((c) => ({ ...c, cursor: c.watched }));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const day = plan.find((d) => d.date === date);
    const reserved =
      day?.tasks
        .filter((t) => !data.completed[t.id])
        .reduce((s, t) => s + Math.max(0, t.endMinute - t.startMinute), 0) || 0;
    const logged = data.studySessions
      .filter((s) => s.date === date)
      .reduce((s, t) => s + t.minutes, 0);
    const capacity =
      a.targets[date] ??
      (data.dayOverrides[date]?.dailyHours ?? data.settings.dailyHours) * 60;
    let spare = Math.max(0, capacity - logged - reserved);
    const used: Partial<Record<SubjectId, number>> = {};
    const sessions: VideoSession[] = [];
    for (const c of queue) {
      const subject = chapterById[c.chapterId].subject;
      let budget = Math.min(spare, a.subjectMinutes - (used[subject] || 0));
      while (budget >= 1 && c.cursor < c.duration) {
        // 50% overhead: breaks, notes, practice and revision. Maximum 30-minute blocks.
        const minutes = Math.min(
          30,
          budget,
          ((c.duration - c.cursor) / 60 / c.speed) * 1.5,
        );
        const from = c.cursor;
        c.cursor = Math.min(
          c.duration,
          c.cursor + (minutes / 1.5) * 60 * c.speed,
        );
        sessions.push({
          id: c.id,
          title: c.title,
          subject,
          minutes,
          videoMinutes: minutes / 1.5,
          from,
          to: c.cursor,
        });
        spare -= minutes;
        budget -= minutes;
        used[subject] = (used[subject] || 0) + minutes;
      }
    }
    return { date, sessions, reserved, logged, capacity };
  });
}
export const priorityChapters = (data: AppData, today: string) =>
  [...CHAPTERS].sort(
    (a, b) => priority(data, b.id, today) - priority(data, a.id, today),
  );
export const subjectReadiness = (data: AppData) =>
  SUBJECTS.map((s) => ({
    ...s,
    percent: Math.round(
      CHAPTERS.filter((c) => c.subject === s.id).reduce(
        (n, c) => n + readiness(data, c.id).readiness,
        0,
      ) / CHAPTERS.filter((c) => c.subject === s.id).length,
    ),
  }));

/** Merge real played ranges; replaying the same section never inflates completion. */
export function mergeWatched(
  ranges: [number, number][],
  range: [number, number],
  duration: number,
): [number, number][] {
  const sorted = [...ranges, range]
    .map(
      ([s, e]) => [Math.max(0, s), Math.min(duration, e)] as [number, number],
    )
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = result[result.length - 1];
    if (last && s <= last[1] + 0.25) last[1] = Math.max(last[1], e);
    else result.push([s, e]);
  }
  return result;
}

export function resourceKey(raw: string): string {
  const u = new URL(canonicalUrl(raw));
  if (["drive.google.com", "docs.google.com"].includes(u.hostname)) {
    const id =
      u.pathname.match(/\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id");
    if (id) return `google-drive:${id}`;
  }
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith("utm_") || key === "fbclid") u.searchParams.delete(key);
  return u.href;
}
export function collectLinks(text: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const raw = match[0].replace(/[.,;!?।)\]}]+$/g, "");
    try {
      const key = resourceKey(raw);
      if (!seen.has(key)) {
        seen.add(key);
        links.push(canonicalUrl(raw));
      }
    } catch {
      /* invalid copied text is not a resource */
    }
  }
  return links.slice(0, 50);
}
