import { CHAPTERS, SUBJECTS } from './data';
import type { SubjectId } from './data';
import type { AppData, Day, Task } from './planner';
import { addDays, diffDays, todayKey } from './planner';
import type { QuizAttempt, StudySession } from './types';
import { STARTER_QUESTIONS } from './quiz-data';
import { chapterCompletionDate } from './revision';

export const WEEKDAYS_SHORT = ['সো', 'মঙ্গল', 'বু', 'বৃহ', 'শু', 'শনি', 'রবি'];
export const dateOfIso = (iso: string): string => todayKey(new Date(iso));

export function startOfWeek(date: string): string {
  const day = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -day);
}
export function minutesOn(sessions: StudySession[], date: string): number {
  return sessions.reduce((sum, session) => sum + (session.date === date ? session.minutes : 0), 0);
}
export function minutesBetween(sessions: StudySession[], from: string, to: string): number {
  return sessions.reduce((sum, session) => sum + (session.date >= from && session.date <= to ? session.minutes : 0), 0);
}
export function subjectMinutes(sessions: StudySession[], from: string, to: string): Record<SubjectId, number> {
  const result = Object.fromEntries(SUBJECTS.map(subject => [subject.id, 0])) as Record<SubjectId, number>;
  for (const session of sessions) if (session.date >= from && session.date <= to) result[session.subject] += session.minutes;
  return result;
}
export interface DayPoint { date: string; minutes: number; tasks: number }
export function dailySeries(sessions: StudySession[], endDate: string, days: number): DayPoint[] {
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(endDate, index - (days - 1));
    return { date, minutes: minutesOn(sessions, date), tasks: 0 };
  });
}
export function completedTasksOn(plan: Day[], data: AppData, date: string): Task[] {
  return plan.flatMap(day => day.tasks).filter(task => data.completed[task.id] && dateOfIso(data.completed[task.id]) === date);
}
export function completedTasksBetween(plan: Day[], data: AppData, from: string, to: string): Task[] {
  return plan.flatMap(day => day.tasks).filter(task => {
    const at = data.completed[task.id];
    if (!at) return false;
    const date = dateOfIso(at);
    return date >= from && date <= to;
  });
}
export function studyDates(data: AppData): Set<string> {
  const dates = new Set([...data.studySessions.map(session => session.date),...data.attempts.map(a=>a.date),...(data.advanced?.activityDates||[])]);
  for (const at of Object.values(data.completed)) dates.add(dateOfIso(at));
  for (const entry of data.cq) dates.add(entry.date);
  for (const test of data.tests) dates.add(test.date);
  return dates;
}
export function currentStreak(data: AppData, today: string): number {
  const dates = studyDates(data);
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}
export function longestStreak(data: AppData): number {
  const sorted = [...studyDates(data)].sort();
  let best = 0, run = 0, previous = '';
  for (const date of sorted) {
    run = previous && diffDays(previous, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}
export interface AttemptStats { total: number; correct: number; accuracy: number }
export function attemptStats(attempts: QuizAttempt[], filter?: (attempt: QuizAttempt) => boolean): AttemptStats {
  const list = filter ? attempts.filter(filter) : attempts;
  const correct = list.filter(attempt => attempt.correct).length;
  return { total: list.length, correct, accuracy: list.length ? Math.round(correct / list.length * 100) : 0 };
}
export function subjectAccuracy(attempts: QuizAttempt[]): Record<SubjectId, AttemptStats> {
  return Object.fromEntries(SUBJECTS.map(subject => [subject.id, attemptStats(attempts, attempt => attempt.subject === subject.id)])) as Record<SubjectId, AttemptStats>;
}
export function allQuestions(data: AppData) {
  return [...STARTER_QUESTIONS, ...data.questions];
}
export interface WeakChapter { chapterId: string; subject: SubjectId; score: number; reasons: string[] }
/** Confidence, self-flagged weakness, MCQ accuracy and low CQ marks all feed the weak-chapter list. */
export function weakChapters(_plan: Day[], data: AppData): WeakChapter[] {
  const questionChapter = new Map(allQuestions(data).map(question => [question.id, question.chapterId]));
  const accuracy = new Map<string, { total: number; correct: number }>();
  for (const attempt of data.attempts) {
    const chapterId = questionChapter.get(attempt.questionId);
    if (!chapterId) continue;
    const entry = accuracy.get(chapterId) || { total: 0, correct: 0 };
    entry.total++;
    if (attempt.correct) entry.correct++;
    accuracy.set(chapterId, entry);
  }
  const cqMarks = new Map<string, { marks: number; total: number }>();
  for (const entry of data.cq) {
    if (!entry.chapterId) continue;
    const row = cqMarks.get(entry.chapterId) || { marks: 0, total: 0 };
    row.marks += entry.marks;
    row.total += entry.total;
    cqMarks.set(entry.chapterId, row);
  }
  const result: WeakChapter[] = [];
  for (const chapter of CHAPTERS) {
    const reasons: string[] = [];
    let score = 0;
    if (data.confidence[chapter.id] === 'weak') { reasons.push('নিজের মূল্যায়নে দুর্বল'); score += 4; }
    if (data.chapterMeta[chapter.id]?.weak) { reasons.push('দুর্বল হিসেবে চিহ্নিত'); score += 3; }
    const mcq = accuracy.get(chapter.id);
    if (mcq && mcq.total >= 3) {
      const rate = Math.round(mcq.correct / mcq.total * 100);
      if (rate < 50) { reasons.push(`MCQ নির্ভুলতা ${rate}%`); score += 4; }
      else if (rate < 70) { reasons.push(`MCQ নির্ভুলতা ${rate}%`); score += 2; }
    }
    const cq = cqMarks.get(chapter.id);
    if (cq && cq.total > 0) {
      const rate = Math.round(cq.marks / cq.total * 100);
      if (rate < 50) { reasons.push(`CQ নম্বর ${rate}%`); score += 3; }
      else if (rate < 65) { reasons.push(`CQ নম্বর ${rate}%`); score += 1; }
    }
    if (score > 0) result.push({ chapterId: chapter.id, subject: chapter.subject, score, reasons });
  }
  return result.sort((a, b) => b.score - a.score);
}
export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  minutes: number;
  targetMinutes: number;
  bySubject: Record<SubjectId, number>;
  tasksCompleted: number;
  tasksPlanned: number;
  chaptersCompleted: string[];
  tests: number;
  mcq: AttemptStats;
  daysStudied: number;
  streak: number;
  weakest: WeakChapter[];
  nextWeek: { date: string; tasks: Task[]; minutes: number }[];
}
export function weeklyReview(plan: Day[], data: AppData, today: string): WeeklyReview {
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const throughToday = today < weekEnd ? today : weekEnd;
  const sessions = data.studySessions.filter(session => session.date >= weekStart && session.date <= weekEnd);
  const completed = completedTasksBetween(plan, data, weekStart, throughToday);
  const planned = plan.flatMap(day => day.tasks).filter(task => task.date >= weekStart && task.date <= weekEnd);
  const chaptersCompleted = CHAPTERS.filter(chapter => {
    const date = chapterCompletionDate(plan, chapter.id, data.completed);
    return !!date && date >= weekStart && date <= weekEnd;
  }).map(chapter => chapter.id);
  const elapsedDays = diffDays(weekStart, throughToday) + 1;
  const dates = new Set(sessions.map(session => session.date));
  const nextWeek = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index + 1);
    const tasks = plan.find(day => day.date === date)?.tasks || [];
    return { date, tasks, minutes: tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) };
  });
  return {
    weekStart, weekEnd,
    minutes: minutesBetween(data.studySessions, weekStart, weekEnd),
    targetMinutes: data.settings.dailyHours * 60 * elapsedDays,
    bySubject: subjectMinutes(data.studySessions, weekStart, weekEnd),
    tasksCompleted: completed.length,
    tasksPlanned: planned.length,
    chaptersCompleted,
    tests: data.tests.filter(test => test.date >= weekStart && test.date <= weekEnd).length,
    mcq: attemptStats(data.attempts, attempt => attempt.date >= weekStart && attempt.date <= weekEnd),
    daysStudied: dates.size,
    streak: currentStreak(data, today),
    weakest: weakChapters(plan, data).slice(0, 3),
    nextWeek,
  };
}
export function badgeList(data: AppData, plan: Day[], today: string) {
  const streak = currentStreak(data, today);
  // `focus` is the lifetime aggregate (legacy sessions included), so it is the source of truth.
  const totalMinutes = data.focus.minutes;
  const testCount = Object.keys(data.exams).length + data.tests.length;
  const completedChapters = CHAPTERS.filter(chapter => chapterCompletionDate(plan, chapter.id, data.completed)).length;
  const attempts = attemptStats(data.attempts);
  return [
    { id: 'first-day', title: 'প্রথম পদক্ষেপ', detail: 'প্রথম পড়ার দিন', earned: streak > 0 || Object.keys(data.completed).length > 0 },
    { id: 'streak-7', title: 'সাত দিনের ছন্দ', detail: '৭ দিন টানা পড়া', earned: streak >= 7 },
    { id: 'streak-30', title: 'এক মাসের অভ্যাস', detail: '৩০ দিন টানা পড়া', earned: streak >= 30 },
    { id: 'hours-50', title: '৫০ ঘণ্টা', detail: 'টাইমারে ৫০ ঘণ্টা', earned: totalMinutes >= 3000 },
    { id: 'hours-200', title: '২০০ ঘণ্টা', detail: 'টাইমারে ২০০ ঘণ্টা', earned: totalMinutes >= 12000 },
    { id: 'chapter-10', title: '১০ অধ্যায়', detail: '১০টি অধ্যায় সম্পন্ন', earned: completedChapters >= 10 },
    { id: 'mcq-100', title: '১০০ MCQ', detail: '১০০টি MCQ অনুশীলন', earned: attempts.total >= 100 },
    { id: 'accuracy-80', title: 'নির্ভুলতা ৮০%', detail: 'কমপক্ষে ৫০টি MCQ-তে ৮০%', earned: attempts.total >= 50 && attempts.accuracy >= 80 },
    { id: 'test-5', title: '৫টি পরীক্ষা', detail: '৫টি টেস্ট/মডেল টেস্ট', earned: testCount >= 5 },
    { id: 'notes-20', title: 'নোট সংগ্রহের অভ্যাস', detail: '২০টি ব্যক্তিগত নোট', earned: data.libraryNotes.length >= 20 },
  ];
}
