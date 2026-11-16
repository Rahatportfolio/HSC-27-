import { CHAPTERS, chapterById } from './data';
import type { SubjectId } from './data';
import { addDays, todayKey } from './planner';
import type { StudySession } from './types';

/**
 * Focus analytics: the timer already counted minutes, but never said whether the
 * minutes were *good* minutes. Everything here is derived from saved sessions only —
 * no invented numbers and no guess dressed up as a measurement.
 */

/** A single sitting is a gap of at most this much between two saved sessions. */
export const SITTING_GAP_MINUTES = 30;
/** A session shorter than this is counted, but flagged as too short to be deep work. */
export const SHORT_SESSION_MINUTES = 10;
/** Beyond this a single session stops being "focus" and becomes fatigue. */
export const LONG_SESSION_MINUTES = 150;
/** Continuous minutes before the app suggests a real break. */
export const BREAK_AFTER_MINUTES = 50;
/** A day counts for the streak only if it reaches this much measured time. */
export const STREAK_FLOOR_MINUTES = 30;
/** Bangla-style day boundaries: 05:00 and 18:00 Dhaka time. */
const MORNING_START_HOUR = 5;
const EVENING_START_HOUR = 18;

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface Sitting {
  date: string;
  from: string;
  to: string;
  minutes: number;
  sessions: number;
  subject: SubjectId;
}

export interface FocusDay {
  date: string;
  minutes: number;
  sessions: number;
  /** Longest unbroken run of sessions, in minutes. */
  longestSitting: number;
  /** Every session in the day counts toward the streak floor. */
  counted: boolean;
}

export interface FocusHourCell {
  /** Dhaka hour, 0–23. */
  hour: number;
  minutes: number;
  sessions: number;
}

export interface FocusSplit {
  subject: SubjectId;
  minutes: number;
  share: number;
}

export interface FocusQuality {
  minutes: number;
  sessions: number;
  averageSession: number;
  shortSessions: number;
  shortShare: number;
  longSessions: number;
  /** Sessions per active day — how scattered the habit is. */
  sessionsPerDay: number;
  /** Minutes in the best 7-day window minus the worst, as a consistency measure. */
  bestDay: number;
  worstDay: number;
  activeDays: number;
  days: number;
}

export interface FocusInsight {
  key: 'best-hour' | 'best-day' | 'scatter' | 'short' | 'long' | 'streak' | 'empty' | 'evening';
  tone: 'good' | 'warn' | 'info';
  titleBn: string;
  titleEn: string;
  detailBn: string;
  detailEn: string;
}

export interface FocusReport {
  from: string;
  to: string;
  days: FocusDay[];
  today: FocusDay;
  minutes: number;
  sessions: number;
  activeDays: number;
  /** Current run of days that reach STREAK_FLOOR_MINUTES, ending today or yesterday. */
  streak: number;
  longestStreak: number;
  bestHour: FocusHourCell | null;
  hours: FocusHourCell[];
  parts: Record<PartOfDay, number>;
  quality: FocusQuality;
  sittings: Sitting[];
  longestSitting: Sitting | null;
  /** Continuous minutes studied right now, from the last session backwards. */
  continuousMinutes: number;
  breakDue: boolean;
  subjects: FocusSplit[];
  insights: FocusInsight[];
  /** Honest one-liners for what the numbers cannot say. */
  caveats: string[];
}

const emptyDay = (date: string): FocusDay => ({ date, minutes: 0, sessions: 0, longestSitting: 0, counted: false });

/** Dhaka hour of an ISO instant, without pulling in a date library. */
export function dhakaHour(iso: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Dhaka' }).format(date));
}

export function partOfDay(hour: number): PartOfDay {
  if (hour >= MORNING_START_HOUR && hour < 12) return 'morning';
  if (hour >= 12 && hour < EVENING_START_HOUR) return 'afternoon';
  if (hour >= EVENING_START_HOUR && hour < 22) return 'evening';
  return 'night';
}

export const PART_LABEL: Record<PartOfDay, { bn: string; en: string }> = {
  morning: { bn: 'সকাল', en: 'Morning' },
  afternoon: { bn: 'দুপুর', en: 'Afternoon' },
  evening: { bn: 'সন্ধ্যা', en: 'Evening' },
  night: { bn: 'রাত', en: 'Night' },
};

function sortSessions(sessions: StudySession[]): StudySession[] {
  return [...sessions].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/**
 * Groups sessions into sittings. A sitting ends when the gap to the next session is
 * longer than SITTING_GAP_MINUTES, or when the calendar day changes.
 */
export function sittingsOf(sessions: StudySession[]): Sitting[] {
  const ordered = sortSessions(sessions);
  const result: Sitting[] = [];
  for (const session of ordered) {
    const previous = result[result.length - 1];
    const start = Date.parse(session.at);
    if (previous && previous.date === session.date) {
      const gap = (start - Date.parse(previous.to)) / 60000;
      if (gap <= SITTING_GAP_MINUTES) {
        previous.minutes += session.minutes;
        previous.sessions += 1;
        previous.to = new Date(start + session.minutes * 60000).toISOString();
        continue;
      }
    }
    result.push({
      date: session.date,
      from: session.at,
      to: new Date(start + session.minutes * 60000).toISOString(),
      minutes: session.minutes,
      sessions: 1,
      subject: session.subject,
    });
  }
  return result;
}

const clampMinutes = (value: number): number => Math.max(0, Math.min(1440, Math.round(value)));

/** Continuous minutes up to now, walking backwards through today's sessions. */
export function continuousMinutesToday(sessions: StudySession[], now: number, today: string): number {
  const ordered = sortSessions(sessions.filter(session => session.date === today));
  let total = 0;
  let cursor = now;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const session = ordered[index];
    const end = Date.parse(session.at) + session.minutes * 60000;
    const gap = (cursor - end) / 60000;
    if (gap > SITTING_GAP_MINUTES) break;
    total += session.minutes;
    cursor = Date.parse(session.at);
  }
  return clampMinutes(total);
}

export function focusReport(data: { studySessions: StudySession[] }, today = todayKey(), windowDays = 28, now = Date.now()): FocusReport {
  const days = Math.max(1, Math.min(180, Math.round(windowDays)));
  const from = addDays(today, -(days - 1));
  const inWindow = data.studySessions.filter(session => session.date >= from && session.date <= today);

  const byDate = new Map<string, StudySession[]>();
  for (const session of inWindow) {
    const list = byDate.get(session.date) ?? [];
    list.push(session);
    byDate.set(session.date, list);
  }

  const sittings = sittingsOf(inWindow);
  const sittingsByDate = new Map<string, Sitting[]>();
  for (const sitting of sittings) {
    const list = sittingsByDate.get(sitting.date) ?? [];
    list.push(sitting);
    sittingsByDate.set(sitting.date, list);
  }

  const dayList: FocusDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset);
    const sessions = byDate.get(date) ?? [];
    const minutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
    const daySittings = sittingsByDate.get(date) ?? [];
    dayList.push({
      date,
      minutes,
      sessions: sessions.length,
      longestSitting: daySittings.reduce((best, sitting) => Math.max(best, sitting.minutes), 0),
      counted: minutes >= STREAK_FLOOR_MINUTES,
    });
  }

  // Streak: a day only counts once it reaches the floor, because five spare minutes
  // is not a study day and counting it would make the number a lie.
  let streak = 0;
  for (let index = dayList.length - 1; index >= 0; index -= 1) {
    const day = dayList[index];
    const isToday = day.date === today;
    const isYesterday = day.date === addDays(today, -1);
    if (day.counted) { streak += 1; continue; }
    // Today may still be in progress, so an unfinished today does not break the run.
    if (isToday) continue;
    if (isYesterday && streak === 0) continue;
    break;
  }
  let longestStreak = 0;
  let run = 0;
  for (const day of dayList) {
    if (day.counted) { run += 1; longestStreak = Math.max(longestStreak, run); }
    else run = 0;
  }

  const hourBuckets: FocusHourCell[] = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0, sessions: 0 }));
  const parts: Record<PartOfDay, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const session of inWindow) {
    const hour = dhakaHour(session.at);
    hourBuckets[hour].minutes += session.minutes;
    hourBuckets[hour].sessions += 1;
    parts[partOfDay(hour)] += session.minutes;
  }
  const bestHour = [...hourBuckets].filter(cell => cell.minutes > 0).sort((a, b) => b.minutes - a.minutes || a.hour - b.hour)[0] ?? null;

  const minutes = inWindow.reduce((sum, session) => sum + session.minutes, 0);
  const sessionsCount = inWindow.length;
  const activeDays = dayList.filter(day => day.minutes > 0).length;
  const shortSessions = inWindow.filter(session => session.minutes < SHORT_SESSION_MINUTES).length;
  const longSessions = inWindow.filter(session => session.minutes >= LONG_SESSION_MINUTES).length;
  const dayMinutes = dayList.map(day => day.minutes);

  const subjectTotals = new Map<SubjectId, number>();
  for (const session of inWindow) subjectTotals.set(session.subject, (subjectTotals.get(session.subject) ?? 0) + session.minutes);
  const subjects: FocusSplit[] = [...subjectTotals.entries()]
    .map(([subject, subjectMinutes]) => ({ subject, minutes: subjectMinutes, share: minutes ? Math.round(subjectMinutes / minutes * 100) : 0 }))
    .sort((a, b) => b.minutes - a.minutes || a.subject.localeCompare(b.subject));

  const continuous = continuousMinutesToday(data.studySessions, now, today);
  const longestSitting = sittings.reduce<Sitting | null>((best, sitting) => (!best || sitting.minutes > best.minutes ? sitting : best), null);

  const quality: FocusQuality = {
    minutes,
    sessions: sessionsCount,
    averageSession: sessionsCount ? Math.round(minutes / sessionsCount) : 0,
    shortSessions,
    shortShare: sessionsCount ? Math.round(shortSessions / sessionsCount * 100) : 0,
    longSessions,
    sessionsPerDay: activeDays ? Math.round(sessionsCount / activeDays * 10) / 10 : 0,
    bestDay: dayMinutes.length ? Math.max(...dayMinutes) : 0,
    worstDay: dayMinutes.length ? Math.min(...dayMinutes) : 0,
    activeDays,
    days,
  };

  return {
    from,
    to: today,
    days: dayList,
    today: dayList[dayList.length - 1] ?? emptyDay(today),
    minutes,
    sessions: sessionsCount,
    activeDays,
    streak,
    longestStreak,
    bestHour,
    hours: hourBuckets,
    parts,
    quality,
    sittings: sittings.slice(-40),
    longestSitting,
    continuousMinutes: continuous,
    breakDue: continuous >= BREAK_AFTER_MINUTES,
    subjects,
    insights: focusInsights({ quality, bestHour, parts, streak, minutes }),
    caveats: focusCaveats(data.studySessions, inWindow, days),
  };
}

function focusInsights(input: { quality: FocusQuality; bestHour: FocusHourCell | null; parts: Record<PartOfDay, number>; streak: number; minutes: number }): FocusInsight[] {
  const { quality, bestHour, parts, streak, minutes } = input;
  const insights: FocusInsight[] = [];
  if (!minutes) {
    return [{
      key: 'empty', tone: 'info',
      titleBn: 'এখনো কোনো মাপা সময় নেই', titleEn: 'No measured time yet',
      detailBn: 'টাইমার চালালে এখানে তোমার আসল ছন্দ দেখা যাবে—কখন সবচেয়ে ভালো মন বসে, কতক্ষণ একটানা পারো।',
      detailEn: 'Start the timer and this page will show your real rhythm — your best hour and how long you can stay with one thing.',
    }];
  }
  if (bestHour) {
    insights.push({
      key: 'best-hour', tone: 'good',
      titleBn: `তোমার সবচেয়ে ভালো সময় ${bnHour(bestHour.hour)}টা`, titleEn: `Your strongest hour is ${formatHour(bestHour.hour)}`,
      detailBn: `এই ঘণ্টায় ${bestHour.minutes} মিনিট পড়া জমেছে। কঠিন অধ্যায় (ক্যাটাগরি A) এই সময়েই রাখো।`,
      detailEn: `${bestHour.minutes} minutes have landed in this hour. Put category-A chapters here.`,
    });
  }
  if (quality.shortShare >= 40 && quality.shortSessions >= 3) {
    insights.push({
      key: 'short', tone: 'warn',
      titleBn: 'ছোট ছোট সেশন বেশি', titleEn: 'Too many short starts',
      detailBn: `সেশনগুলোর ${quality.shortShare}% দশ মিনিটের কম। ঘন ঘন থেমে শুরু করলে গভীর মনোযোগ তৈরি হয় না—একবারে ২৫ মিনিট চেষ্টা করো।`,
      detailEn: `${quality.shortShare}% of sessions are under ten minutes. Try a full 25-minute block instead of starting over.`,
    });
  }
  if (quality.sessionsPerDay >= 6) {
    insights.push({
      key: 'scatter', tone: 'warn',
      titleBn: 'দিনটা ছড়িয়ে যাচ্ছে', titleEn: 'The day is getting scattered',
      detailBn: `সক্রিয় দিনে গড়ে ${quality.sessionsPerDay}টি সেশন। কম শুরু করে লম্বা ব্লকে পড়লে রিভিশন-বাধা কমবে।`,
      detailEn: `${quality.sessionsPerDay} sessions per active day. Fewer, longer blocks leave more room for revision.`,
    });
  }
  if (quality.longSessions > 0) {
    insights.push({
      key: 'long', tone: 'info',
      titleBn: 'লম্বা সেশন আছে', titleEn: 'Some very long sessions',
      detailBn: `${quality.longSessions}টি সেশন আড়াই ঘণ্টার বেশি। ভালো, তবু ৫০ মিনিট পর ১০ মিনিটের বিরতি মাথা সতেজ রাখে।`,
      detailEn: `${quality.longSessions} session(s) ran past two and a half hours. A 10-minute break every 50 minutes keeps it useful.`,
    });
  }
  const evening = parts.evening + parts.night;
  const morning = parts.morning;
  if (evening > 0 && morning > 0 && evening >= morning * 3) {
    insights.push({
      key: 'evening', tone: 'info',
      titleBn: 'পড়া প্রায় সবই সন্ধ্যা-রাতে', titleEn: 'Almost everything is at night',
      detailBn: 'রাতে পড়া ঠিক আছে, কিন্তু কঠিন অধ্যায় সকালে করলে মনে থাকে বেশি। সপ্তাহে অন্তত দুই দিন সকালে একটি A-অধ্যায় রাখো।',
      detailEn: 'Night study is fine, but a hard chapter sticks better in the morning. Put one A-chapter in the morning twice a week.',
    });
  }
  if (streak >= 3) {
    insights.push({
      key: 'streak', tone: 'good',
      titleBn: `${streak} দিনের ধারা`, titleEn: `${streak}-day run`,
      detailBn: `দিনে অন্তত ${STREAK_FLOOR_MINUTES} মিনিট টানা ${streak} দিন। নিয়মিত ছোট সেশন অনিয়মিত লম্বা পড়ার চেয়ে বেশি কাজে দেয়।`,
      detailEn: `At least ${STREAK_FLOOR_MINUTES} minutes a day for ${streak} days running.`,
    });
  }
  return insights.slice(0, 4);
}

/**
 * The numbers above come from what the student logged. These lines say what the
 * numbers therefore cannot claim, so the page never flatters a partial record.
 */
function focusCaveats(all: StudySession[], inWindow: StudySession[], days: number): string[] {
  const caveats: string[] = [];
  const unsaved = Math.max(0, all.length - inWindow.length);
  if (unsaved > 0) caveats.push(`${unsaved}টি সেশন এই ${days} দিনের বাইরে — হিসাব শুধু ভেতরের সেশন থেকে।`);
  caveats.push('সময় মাপা হয় টাইমার থেকে; মনোযোগের গুণ নয়। কতটা মনে আছে সেটা রিভিশন কার্ডই বলে।');
  return caveats;
}

const bnDigits = '০১২৩৪৫৬৭৮৯';
/** Bengali digits for the few labels built inside this module. */
function bn(value: string | number): string {
  return String(value).replace(/\d/g, digit => bnDigits[Number(digit)]);
}
export { bn as toBnDigits };

function bnHour(hour: number): string {
  return bn(String(hour).padStart(2, '0'));
}
function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/**
 * A short, honest next-action list for the focus page. It never invents a plan:
 * each line is tied to one number above.
 */
export function focusActions(report: FocusReport, weakChapterIds: string[]): { key: string; bn: string; en: string; minutes: number; chapterId?: string; subject?: SubjectId }[] {
  const actions: { key: string; bn: string; en: string; minutes: number; chapterId?: string; subject?: SubjectId }[] = [];
  const chapter = weakChapterIds.map(id => chapterById[id]).find(Boolean) ?? CHAPTERS.find(item => item.priority === 'A');
  if (report.breakDue) {
    actions.push({ key: 'break', bn: `${report.continuousMinutes} মিনিট একটানা—১০ মিনিটের বিরতি নাও`, en: `${report.continuousMinutes} minutes unbroken — take a 10-minute break`, minutes: 10 });
  }
  if (!report.today.minutes) {
    actions.push({
      key: 'start', bn: chapter ? `${chapter.title} — ২৫ মিনিট শুরু করো` : '২৫ মিনিটের একটি ব্লক শুরু করো',
      en: chapter ? `${chapter.title} — start a 25-minute block` : 'Start a 25-minute block', minutes: 25,
      chapterId: chapter?.id, subject: chapter?.subject,
    });
  }
  if (report.quality.shortShare >= 40 && report.quality.shortSessions >= 3) actions.push({ key: 'longer', bn: 'এরপর একবারে ২৫ মিনিট থামি না', en: 'Next block: 25 minutes without stopping', minutes: 25 });
  if (!actions.length) actions.push({ key: 'steady', bn: 'আজকের প্রথম ব্লকটাই ঠিক ছিল—একই ছন্দে পরেরটা', en: 'Today is going well — repeat the same rhythm', minutes: 25 });
  return actions.slice(0, 3);
}
