import type { AppData, Day } from './planner';
import { addDays, diffDays, todayKey } from './planner';
import { downloadText } from './exports';
import { t } from './i18n';
import { chaptersCompletedBetween, completedTasksBetween } from './analytics';

/**
 * Manual backups only work if the student remembers them, so the app keeps a tiny
 * record of the last export and nudges once a week. Nothing leaves the device:
 * the share sheet is used only when the student taps "share".
 */
export const BACKUP_AT_KEY = 'hsc27-backup-at';
export const BACKUP_SNOOZE_KEY = 'hsc27-backup-snooze';
export const BACKUP_INTERVAL_DAYS = 7;
export const SNOOZE_DAYS = 3;

const storage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};
export const backupFileName = (today = todayKey()): string => `prostuti-backup-${today}.json`;
export const backupJson = (data: AppData): string => JSON.stringify(data, null, 2);

export function lastBackupAt(): string | null {
  const raw = storage()?.getItem(BACKUP_AT_KEY) || null;
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}
export function markBackup(at = new Date().toISOString()): string {
  try { storage()?.setItem(BACKUP_AT_KEY, at); storage()?.removeItem(BACKUP_SNOOZE_KEY); } catch { /* storage may be full */ }
  return at;
}
/** How many days ago the last export ran; null when the student never made one. */
export function backupAgeDays(today = todayKey()): number | null {
  const at = lastBackupAt();
  if (!at) return null;
  return Math.max(0, diffDays(at.slice(0, 10), today));
}
export function snoozeBackup(days = SNOOZE_DAYS, today = todayKey()): void {
  try { storage()?.setItem(BACKUP_SNOOZE_KEY, addDays(today, days)); } catch { /* ignore */ }
}
export function isBackupSnoozed(today = todayKey()): boolean {
  const until = storage()?.getItem(BACKUP_SNOOZE_KEY);
  return !!until && until > today;
}
/** Anything worth losing: progress, measured sessions, questions, scores or written notes. */
export function hasStudyData(data: AppData): boolean {
  return !!data.studyBrain?.checkIns.length || !!data.studyBrain?.feedback.length || !!data.advanced?.classes.length || !!Object.keys(data.advanced?.preparation || {}).length || data.pdfs.length > 0 || Object.keys(data.completed).length > 0 || data.studySessions.length > 0 || data.tests.length > 0
    || data.cq.length > 0 || data.mistakes.length > 0 || data.libraryNotes.length > 0
    || Object.values(data.notes).some(note => note.trim()) || data.revisions.some(item => !!item.completedAt)
    || data.questions.length > 0 || data.attempts.length > 0 || data.videos.length > 0
    || data.formulas.length > 0 || data.boardQuestions.length > 0 || data.routineBlocks.length > 0
    || data.importantDates.length > 0 || data.carryovers.length > 0 || data.formulaFavorites.length > 0
    || Object.keys(data.classWatched).length > 0 || Object.keys(data.exams).length > 0
    || Object.keys(data.gpaMarks).length > 0 || Object.keys(data.confidence).length > 0
    || Object.keys(data.chapterMeta).length > 0 || Object.keys(data.dayOverrides).length > 0
    || data.focus.minutes > 0 || data.focus.sessions > 0;
}
export function needsBackup(data: Parameters<typeof hasStudyData>[0], today = todayKey()): boolean {
  if (!hasStudyData(data) || isBackupSnoozed(today)) return false;
  const age = backupAgeDays(today);
  return age === null || age >= BACKUP_INTERVAL_DAYS;
}
/** Plain downloads still work everywhere, including the Android WebView. */
export function downloadBackup(data: AppData, today = todayKey()): string {
  const name = backupFileName(today);
  downloadText(backupJson(data), name, 'application/json;charset=utf-8');
  markBackup();
  return name;
}

export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled';
/**
 * Prefers the Android/system share sheet with a real .json file, then the clipboard,
 * then a plain download — so the button always ends in a saved copy.
 */
export async function shareBackup(data: AppData, today = todayKey()): Promise<ShareOutcome> {
  const json = backupJson(data);
  const name = backupFileName(today);
  const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav?.share && typeof File !== 'undefined') {
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'প্রস্তুতি ব্যাকআপ' });
        markBackup();
        return 'shared';
      }
    } catch (error) {
      // A cancelled share must not silently fall back to a download.
      if ((error as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (nav?.share && json.length < 40_000) {
    try { await nav.share({ title: 'প্রস্তুতি ব্যাকআপ', text: json }); markBackup(); return 'shared'; } catch (error) { if ((error as Error)?.name === 'AbortError') return 'cancelled'; /* fall through */ }
  }
  try {
    if (nav?.clipboard && json.length < 120_000) { await nav.clipboard.writeText(json); markBackup(); return 'copied'; }
  } catch { /* clipboard may be blocked */ }
  downloadBackup(data, today);
  return 'downloaded';
}

/** Bangla date label for the settings row. */
export function backupLabel(today = todayKey()): string {
  const age = backupAgeDays(today);
  if (age === null) return t('এখনও ব্যাকআপ নেওয়া হয়নি', 'No backup taken yet');
  if (age === 0) return 'আজ ব্যাকআপ নেওয়া হয়েছে';
  return `${new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(age)} দিন আগে ব্যাকআপ`;
}

export interface WeekReport {
  from: string; to: string;
  days: number; sessions: number; minutes: number;
  tasksDone: number; chaptersDone: number;
  mcq: number; accuracy: number;
  cq: number; cqAverage: number;
  revisions: number; tests: number; testAverage: number;
  topSubject: string | null; weakestSubject: string | null;
  lines: string[];
}
/** Numbers for the shareable weekly report; computed from the same data the views show. */
export function weekReport(data: AppData, plan: Day[], today = todayKey(), subjectName: (id: string) => string = id => id): WeekReport {
  const from = addDays(today, -6);
  const inWeek = (date: string) => date >= from && date <= today;
  const sessions = data.studySessions.filter(item => inWeek(item.date));
  const minutes = sessions.reduce((sum, item) => sum + item.minutes, 0);
  const perSubject = new Map<string, number>();
  for (const session of sessions) perSubject.set(session.subject, (perSubject.get(session.subject) || 0) + session.minutes);
  const ranked = [...perSubject.entries()].sort((a, b) => b[1] - a[1]);
  const tasksDone = data.personalRoutine ? completedTasksBetween(plan, data, from, today).length
    : Object.values(data.completed).filter(at => inWeek(at.slice(0, 10))).length;
  const attempts = data.attempts.filter(item => inWeek(item.date));
  const correct = attempts.filter(item => item.correct).length;
  const cq = data.cq.filter(item => inWeek(item.date));
  const tests = data.tests.filter(item => inWeek(item.date));
  const chaptersDone = data.personalRoutine ? chaptersCompletedBetween(plan, data, from, today).length
    : new Set(plan.flatMap(day => day.tasks)
      .filter(task => !!data.completed[task.id] && inWeek(data.completed[task.id].slice(0, 10)))
      .flatMap(task => task.chapterIds)).size;
  const report: WeekReport = {
    from, to: today, days: 7, sessions: sessions.length, minutes,
    tasksDone, chaptersDone,
    mcq: attempts.length, accuracy: attempts.length ? Math.round(correct / attempts.length * 100) : 0,
    cq: cq.length, cqAverage: cq.length ? Math.round(cq.reduce((sum, item) => sum + item.marks / item.total, 0) / cq.length * 100) : 0,
    revisions: data.revisions.filter(item => !!item.completedAt && inWeek(item.completedAt.slice(0, 10))).length,
    tests: tests.length, testAverage: tests.length ? Math.round(tests.reduce((sum, item) => sum + item.score / item.total, 0) / tests.length * 100) : 0,
    topSubject: ranked[0] ? subjectName(ranked[0][0]) : null,
    weakestSubject: ranked.length ? subjectName(ranked[ranked.length - 1][0]) : null,
    lines: [],
  };
  const hours = Math.round(minutes / 6) / 10;
  report.lines = [
    `প্রস্তুতি · সাপ্তাহিক রিপোর্ট (${from} → ${today})`,
    `পড়ার সময়: ${hours} ঘণ্টা · ${sessions.length} সেশন · ${tasksDone} কাজ শেষ`,
    `${data.personalRoutine ? 'ছয়টি কাজসহ সম্পন্ন অধ্যায়' : 'অধ্যায় এগিয়েছে'}: ${chaptersDone}টি · রিভিশন: ${report.revisions}টি`,
    `MCQ: ${attempts.length}টি · নির্ভুলতা ${report.accuracy}%`,
    cq.length ? `CQ: ${cq.length}টি · গড় ${report.cqAverage}%` : 'CQ: এই সপ্তাহে লেখা হয়নি',
    tests.length ? `টেস্ট: ${tests.length}টি · গড় ${report.testAverage}%` : 'টেস্ট: এই সপ্তাহে হয়নি',
    report.topSubject ? `সবচেয়ে বেশি সময়: ${report.topSubject}` : 'সবচেয়ে বেশি সময়: —',
    'লক্ষ্য: প্রতিদিন একটু, টানা এগিয়ে যাওয়া।',
  ];
  return report;
}
