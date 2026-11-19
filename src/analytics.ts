import { CHAPTERS, SUBJECTS } from './data';
import type { SubjectId } from './data';
import type { AppData, Day, Task } from './planner';
import { addDays, dailyTargetMinutes, diffDays, todayKey } from './planner';
import { isPersonalChapterDone, personalRoutineForChapter } from './personalRoutine';
import { tasksFirstCompletedBetween } from './prediction';
import type { QuizAttempt, StudySession } from './types';
import { questionChapters } from './questionBankIndex';
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
  return completedTasksBetween(plan, data, date, date);
}
export function completedTasksBetween(plan: Day[], data: AppData, from: string, to: string): Task[] {
  return tasksFirstCompletedBetween(plan, data, from, to);
}
/** Six-group completion in the interval, including retained prerequisite phases.
 * A redundant recent tick cannot move old completed work into a newer week.
 */
export function chaptersCompletedBetween(plan: Day[], data: AppData, from: string, to: string): string[] {
  if (!data.personalRoutine) return CHAPTERS.filter(chapter => {
    const date = chapterCompletionDate(plan, chapter.id, data.completed);
    return !!date && date >= from && date <= to;
  }).map(chapter => chapter.id);
  const through: Record<string, string> = {}, before: Record<string, string> = {};
  for (const [id, at] of Object.entries(data.completed)) {
    if (!Number.isFinite(Date.parse(at))) continue;
    const date = dateOfIso(at); if (date > to) continue;
    through[id] = at; if (date < from) before[id] = at;
  }
  return CHAPTERS.filter(chapter => {
    const routine = personalRoutineForChapter(data, chapter.id);
    return routine && isPersonalChapterDone(plan, chapter.id, through, routine) && !isPersonalChapterDone(plan, chapter.id, before, routine);
  }).map(chapter => chapter.id);
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
export interface WeakChapter { chapterId: string; subject: SubjectId; score: number; reasons: string[] }
/** Confidence, self-flagged weakness, MCQ accuracy and low CQ marks all feed the weak-chapter list. */
export function weakChapters(_plan: Day[], data: AppData): WeakChapter[] {
  const questionChapter = questionChapters(data);
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
  const chaptersCompleted = chaptersCompletedBetween(plan, data, weekStart, throughToday);
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
    targetMinutes: data.personalRoutine ? Array.from({ length: elapsedDays }, (_, index) => addDays(weekStart, index))
      .filter(date => date >= data.settings.startDate && date >= (data.personalRoutine!.startsOn || data.settings.startDate) && date < data.settings.examDate)
      .reduce((sum, date) => sum + dailyTargetMinutes(data, date), 0) : data.settings.dailyHours * 60 * elapsedDays,
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
  const completedChapters = data.personalRoutine ? CHAPTERS.filter(chapter => {
    const routine = personalRoutineForChapter(data, chapter.id);
    return routine && isPersonalChapterDone(plan, chapter.id, data.completed, routine);
  }).length : CHAPTERS.filter(chapter => chapterCompletionDate(plan, chapter.id, data.completed)).length;
  const attempts = attemptStats(data.attempts);
  return [
    { id: 'first-day', title: 'প্রথম পদক্ষেপ', titleEn: 'First step', detail: 'প্রথম পড়ার দিন', detailEn: 'Your first study day', earned: streak > 0 || Object.keys(data.completed).length > 0 },
    { id: 'streak-7', title: 'সাত দিনের ছন্দ', titleEn: 'Seven-day rhythm', detail: '৭ দিন টানা পড়া', detailEn: '7 days studied in a row', earned: streak >= 7 },
    { id: 'streak-30', title: 'এক মাসের অভ্যাস', titleEn: 'A month of habit', detail: '৩০ দিন টানা পড়া', detailEn: '30 days studied in a row', earned: streak >= 30 },
    { id: 'hours-50', title: '৫০ ঘণ্টা', titleEn: '50 hours', detail: 'টাইমারে ৫০ ঘণ্টা', detailEn: '50 hours on the timer', earned: totalMinutes >= 3000 },
    { id: 'hours-200', title: '২০০ ঘণ্টা', titleEn: '200 hours', detail: 'টাইমারে ২০০ ঘণ্টা', detailEn: '200 hours on the timer', earned: totalMinutes >= 12000 },
    { id: 'chapter-10', title: '১০ অধ্যায়', titleEn: '10 chapters', detail: '১০টি অধ্যায় সম্পন্ন', detailEn: '10 chapters completed', earned: completedChapters >= 10 },
    { id: 'mcq-100', title: '১০০ MCQ', titleEn: '100 MCQs', detail: '১০০টি MCQ অনুশীলন', detailEn: '100 MCQs practised', earned: attempts.total >= 100 },
    { id: 'accuracy-80', title: 'নির্ভুলতা ৮০%', titleEn: '80% accuracy', detail: 'কমপক্ষে ৫০টি MCQ-তে ৮০%', detailEn: '80% across at least 50 MCQs', earned: attempts.total >= 50 && attempts.accuracy >= 80 },
    { id: 'test-5', title: '৫টি পরীক্ষা', titleEn: '5 tests', detail: '৫টি টেস্ট/মডেল টেস্ট', detailEn: '5 tests or model tests', earned: testCount >= 5 },
    { id: 'notes-20', title: 'নোট সংগ্রহের অভ্যাস', titleEn: 'Note-taking habit', detail: '২০টি ব্যক্তিগত নোট', detailEn: '20 personal notes', earned: data.libraryNotes.length >= 20 },
  ];
}
