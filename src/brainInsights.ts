/** Full-strength local study insight for the Study Brain: trends, time-of-day and
 * energy-versus-output patterns, a pace projection, and a merged recall pre-flight.
 * Everything here is derived, read-only and bounded: no storage writes, no plan
 * changes, no mastery or exam-probability claims. Thin evidence says "low data". */
import { chapterById } from './data';
import { addDays, todayKey } from './planner';
import type { AppData, Day } from './planner';
import { chapterStage, isLearningComplete } from './learning';
import { personalUnfinishedRanges } from './personalRoutine';
import { brainCurrentPair, brainRevisionQueue } from './studyBrain';

export type BrainTimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';
export const TIME_BUCKETS: readonly BrainTimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];
const dhakaHour = (instant: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', hourCycle: 'h23' }).format(instant));
const bucketOf = (hour: number): BrainTimeBucket => hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night';

const selectedSessions = (data: AppData, start: string, end: string, now: Date) =>
  data.studySessions.filter(session => session.chapterId && data.personalRoutine?.chapterIds.includes(session.chapterId)
    && session.date >= start && session.date <= end && Date.parse(session.at) <= now.getTime()
    && Number.isFinite(session.minutes) && session.minutes > 0);

export interface BrainConsistency {
  windowDays: number;
  activeDays: number;
  minutes: number;
  bestWeekday: number | null;
  bestWeekdayMinutes: number;
  currentStreak: number;
  longestStreak: number;
  enough: boolean;
}
export function brainConsistency(data: AppData, now: Date): BrainConsistency {
  const today = todayKey(now), start = addDays(today, -27);
  const sessions = selectedSessions(data, start, today, now);
  const minutesByDate = new Map<string, number>();
  for (const session of sessions) minutesByDate.set(session.date, (minutesByDate.get(session.date) ?? 0) + session.minutes);
  const minutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const weekday = Array.from({ length: 7 }, () => 0);
  for (const [date, value] of minutesByDate) weekday[new Date(`${date}T00:00:00Z`).getUTCDay()] += value;
  const bestWeekday = minutes > 0 ? weekday.indexOf(Math.max(...weekday)) : null;
  let currentStreak = 0;
  for (let offset = 0; offset < 28; offset++) {
    const date = addDays(today, -offset);
    if (minutesByDate.has(date)) currentStreak += 1;
    else if (offset === 0) continue; // today is still open, it does not break the run
    else break;
  }
  let longestStreak = 0, run = 0;
  for (let offset = 27; offset >= 0; offset--) {
    if (minutesByDate.has(addDays(today, -offset))) { run += 1; longestStreak = Math.max(longestStreak, run); } else run = 0;
  }
  return { windowDays: 28, activeDays: minutesByDate.size, minutes: Math.round(minutes),
    bestWeekday, bestWeekdayMinutes: Math.round(minutes > 0 ? Math.max(...weekday) : 0),
    currentStreak, longestStreak, enough: sessions.length >= 1 };
}

export interface BrainTimeOfDay {
  rows: { bucket: BrainTimeBucket; minutes: number; sessions: number }[];
  total: { minutes: number; sessions: number };
  best: BrainTimeBucket | null;
  enough: boolean;
}
export function brainTimeOfDay(data: AppData, now: Date): BrainTimeOfDay {
  const today = todayKey(now), start = addDays(today, -27);
  const buckets: Record<BrainTimeBucket, { minutes: number; sessions: number }> = { morning: { minutes: 0, sessions: 0 }, afternoon: { minutes: 0, sessions: 0 }, evening: { minutes: 0, sessions: 0 }, night: { minutes: 0, sessions: 0 } };
  for (const session of selectedSessions(data, start, today, now)) {
    const bucket = bucketOf(dhakaHour(new Date(session.at)));
    buckets[bucket].minutes += session.minutes; buckets[bucket].sessions += 1;
  }
  const rows = TIME_BUCKETS.map(bucket => ({ bucket, ...buckets[bucket] }));
  const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
  const best = sessions >= 5 ? rows.reduce((left, right) => right.minutes > left.minutes ? right : left).bucket : null;
  return { rows, total: { minutes: Math.round(rows.reduce((sum, row) => sum + row.minutes, 0)), sessions }, best, enough: sessions >= 5 };
}

export interface BrainEnergyOutput {
  rows: { energy: 'low' | 'okay' | 'fresh'; days: number; minutes: number; avgMinutes: number | null }[];
  joinedDays: number;
  enough: boolean;
}
export function brainEnergyOutput(data: AppData, now: Date): BrainEnergyOutput {
  const today = todayKey(now), start = addDays(today, -27);
  const checkIns = data.studyBrain?.checkIns.filter(item => item.date >= start && item.date <= today && Date.parse(item.at) <= now.getTime()) ?? [];
  const minutesByDate = new Map<string, number>();
  for (const session of selectedSessions(data, start, today, now)) minutesByDate.set(session.date, (minutesByDate.get(session.date) ?? 0) + session.minutes);
  const rows = (['low', 'okay', 'fresh'] as const).map(energy => {
    const days = checkIns.filter(item => item.energy === energy);
    const minutes = days.reduce((sum, item) => sum + (minutesByDate.get(item.date) ?? 0), 0);
    return { energy, days: days.length, minutes: Math.round(minutes), avgMinutes: days.length ? Math.round(minutes / days.length) : null };
  });
  return { rows, joinedDays: checkIns.length, enough: checkIns.length >= 4 };
}

export interface BrainPace {
  /** Remaining work minutes in the current S pair, per the personal plan. */
  neededAfterToday: number;
  /** Full-day S minutes per calendar day across the previous 28 days. */
  minutesPerDay: number | null;
  projectedFinish: string | null;
  projectedDays: number | null;
  enough: boolean;
}
export function brainPaceProjection(data: AppData, plan: Day[], now: Date): BrainPace {
  const today = todayKey(now);
  const windowStart = addDays(today, -28), windowEnd = addDays(today, -1); // full days only
  const fullDays = selectedSessions(data, windowStart, windowEnd, now);
  const totalMinutes = fullDays.reduce((sum, session) => sum + session.minutes, 0);
  const minutesPerDay = totalMinutes > 0 ? Math.round((totalMinutes / 28) * 10) / 10 : null;
  const pair = brainCurrentPair(data, plan);
  const needed = plan.flatMap(day => day.tasks)
    .filter(task => task.personalWork && pair.includes(task.chapterIds[0]) && !isLearningComplete(chapterStage(chapterById[task.chapterIds[0]], data, plan)))
    .reduce((sum, task) => sum + personalUnfinishedRanges(task, data.completed).reduce((span, range) => span + range.to - range.from, 0), 0);
  const neededAfterToday = Math.round(needed);
  const enough = minutesPerDay !== null && minutesPerDay >= 5 && neededAfterToday > 0;
  const projectedDays = enough ? Math.ceil(neededAfterToday / minutesPerDay!) : null;
  return { neededAfterToday, minutesPerDay, projectedFinish: projectedDays !== null ? addDays(today, projectedDays) : null, projectedDays, enough };
}

export type BrainPreflightKind = 'recurring' | 'mistakes' | 'mcq-misses' | 'revision-due';
export interface BrainPreflightRow {
  key: string;
  chapterId: string;
  kind: BrainPreflightKind;
  count: number;
  /** Earliest/latest due for revision-due rows; undefined otherwise. */
  dueDate?: string;
  route: 'weakness' | 'practice' | 'revision';
}
export function brainPreflight(data: AppData, plan: Day[], now: Date): BrainPreflightRow[] {
  if (!data.personalRoutine || data.routineSetupRequired) return [];
  const today = todayKey(now);
  const pair = brainCurrentPair(data, plan);
  const rows: BrainPreflightRow[] = [];
  if (pair.length) {
    for (const row of brainRevisionQueue(data, pair, now)) {
      if (row.comparison.stillMistaken > 0) rows.push({ key: `recurring:${row.chapterId}`, chapterId: row.chapterId, kind: 'recurring', count: row.comparison.stillMistaken, route: 'practice' });
      else if (row.misses > 0) rows.push({ key: `mcq-misses:${row.chapterId}`, chapterId: row.chapterId, kind: 'mcq-misses', count: row.misses, route: 'practice' });
      if (row.open > 0) rows.push({ key: `mistakes:${row.chapterId}`, chapterId: row.chapterId, kind: 'mistakes', count: row.open, route: 'weakness' });
    }
  }
  const selected = new Set(data.personalRoutine.chapterIds);
  const overdue = data.revisions.filter(item => item.dueDate <= today && !item.completedAt && selected.has(item.chapterId));
  const byChapter = new Map<string, { count: number; earliest: string }>();
  for (const item of overdue) {
    const entry = byChapter.get(item.chapterId) ?? { count: 0, earliest: item.dueDate };
    entry.count += 1; entry.earliest = entry.earliest < item.dueDate ? entry.earliest : item.dueDate;
    byChapter.set(item.chapterId, entry);
  }
  for (const [chapterId, entry] of byChapter) rows.push({ key: `revision-due:${chapterId}`, chapterId, kind: 'revision-due', count: entry.count, dueDate: entry.earliest, route: 'revision' });
  const weight = (row: BrainPreflightRow) => row.kind === 'recurring' ? 30 + row.count * 2 : row.kind === 'mistakes' ? 20 + Math.min(10, row.count) : row.kind === 'revision-due' ? 15 + row.count : 10 + row.count;
  return rows.sort((a, b) => weight(b) - weight(a) || a.chapterId.localeCompare(b.chapterId)).slice(0, 6);
}
