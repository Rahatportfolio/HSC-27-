import { CHAPTERS, CORE, PAPERS, chapterById, subjectById } from './data';
import { isPersonalChapterDone, isPersonalTaskComplete, personalCapacity } from './personalRoutine';
import { isEnglish, t } from './i18n';
import { parseTaskRangeId } from './taskReferences';
import type { Chapter, SubjectId } from './data';
import type {
  BoardQuestion, Carryover, ChapterMeta, CqEntry, DayScheduleOverride, FormulaEntry,
  ImportantDate, PersonalNote, PdfResource, QuizAttempt, QuizQuestion, RevisionItem, RoutineBlock,
  SettingsExtras, StudySession, SubjectMarks, TaskEdit, TestRecord, VideoLink, Flashcard,
  ScannedNoteMeta, ExamSession, RetryItem, ActiveExam,
} from './types';

export type PhaseId = 'learn' | 'revise' | 'exam';
export type TaskKind = 'learn' | 'practice' | 'revision' | 'exam' | 'correction' | 'language' | 'ict' | 'recall' | 'practical' | 'custom';

export interface Settings extends SettingsExtras {
  startDate: string;
  startTime: string;
  dailyHours: number;
  board: string;
  name: string;
  reminderEnabled: boolean;
  reminderLead: number;
  syllabusChecked: boolean;
  calendarRevision: number;
  /** Personal planning target, not a verified college notice. */
  testExamDate: string;
  /** Personal planning target, not a verified board routine. */
  examDate: string;
  /** Move personal exam targets with the start, or keep externally set deadlines fixed. */
  examDatePolicy: 'shift' | 'fixed';
}

/** Asia/Dhaka is the planning timezone; declared early so fresh installs derive from it. */
export const TIMEZONE = 'Asia/Dhaka';
/** Today as YYYY-MM-DD in Asia/Dhaka. */
export function dhakaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
/** A fresh install starts its routine today, in Asia/Dhaka. */
const DEFAULT_START = dhakaToday();
/** …and steps into the boost seventeen days later. */
const DEFAULT_BOOST = new Date(new Date(`${DEFAULT_START}T00:00:00Z`).getTime() + 17 * 86400000).toISOString().slice(0, 10);
/** Defaults are personal planning targets; see EXAM_DATE_INFORMATION for verification limits. */
export const DEFAULT_SETTINGS: Settings = {
  startDate: DEFAULT_START,
  startTime: '06:30',
  dailyHours: 8,
  boostEnabled: true,
  boostStartDate: DEFAULT_BOOST,
  boostDailyHours: 16,
  adaptiveEnabled: true,
  adaptiveBuffer: 30,
  board: 'সিলেট',
  name: '',
  reminderEnabled: true,
  reminderLead: 10,
  syllabusChecked: false,
  calendarRevision: 0,
  theme: 'light',
  language: 'bn',
  revisionEnabled: true,
  carryoverMode: 'manual',
  testExamDate: '2027-02-01',
  examDate: '2027-06-06',
  examDatePolicy: 'shift',
  pomodoroFocus: 25,
  pomodoroBreak: 5,
  pomodoroLongBreak: 15,
  fontScale: 'md',
};

export interface Task {
  personalWork?: import('./personalRoutine').PersonalWork;
  /** Original scheduled date of unfinished work moved into an actual free slot. */
  rescheduledFrom?: string;
  video?: { classId: string; from: number; to: number };
  originalTaskId?: string;
  /** Full source duration for split allocations, so a visible fragment cannot imply full coverage. */
  sourceMinutes?: number;
  id: string;
  date: string;
  dayIndex: number;
  phase: PhaseId;
  subject: SubjectId;
  kind: TaskKind;
  title: string;
  detail: string;
  chapterIds: string[];
  startMinute: number;
  endMinute: number;
  paperId?: string;
}

export interface Day {
  /** Explicit scope marker survives empty/removed days, preventing legacy completion fallback. */
  personalRoutine?: true;
  deferredMinutes?: number;
  /** Retained explicit appointments that cannot safely fit in availability. */
  unscheduled?: Task[];
  /** Completed historical allocations retained separately when new windows no longer fit. */
  historyTasks?: Task[];
  /** Effective rolling-calendar anchor (projection metadata, never completion). */
  reflowFrom?: string;
  date: string;
  index: number;
  phase: PhaseId;
  tasks: Task[];
  isCatchup: boolean;
}

export interface Phase {
  id: PhaseId;
  name: string;
  subtitle: string;
  start: string;
  end: string;
  days: number;
  color: string;
}

export interface ExamResult { score: number; total: number; at: string; mistakes: string }
export type MistakeCategory = 'conceptual' | 'calculation' | 'memory' | 'misunderstood' | 'careless';
export type MistakeRetry = 'pending' | 'retried' | 'mastered';
export interface Mistake { id: string; subject: SubjectId; chapterId?: string; text: string; correctAnswer?: string; userAnswer?: string; date: string; category: MistakeCategory; retryStatus: MistakeRetry; resolved: boolean }

export interface AppData {
  /** Opt-in, on-device suggestions; never a second schedule or completion source. */
  studyBrain?: import('./studyBrainTypes').StudyBrainMemory;
  /** Explicitly configured S-only, availability- and duration-based routine. */
  personalRoutine?: import('./personalRoutine').PersonalRoutine;
  /** Finished, explicitly advanced phases retain workloads and historical source identities. */
  personalPhases?: Partial<Record<'S' | 'A' | 'B' | 'C', import('./personalRoutine').PersonalRoutine>>;
  /** Only genuinely new profiles ask before generating any routine. Old backups stay legacy until consent. */
  routineSetupRequired?: boolean;
  advanced?: import('./advanced').AdvancedData;
  version: 2;
  settings: Settings;
  completed: Record<string, string>;
  confidence: Record<string, 'weak' | 'okay' | 'confident'>;
  notes: Record<string, string>;
  exams: Record<string, ExamResult>;
  mistakes: Mistake[];
  flashcards: Flashcard[];
  focus: { minutes: number; sessions: number };
  studySessions: StudySession[];
  revisions: RevisionItem[];
  chapterMeta: Record<string, ChapterMeta>;
  questions: QuizQuestion[];
  attempts: QuizAttempt[];
  cq: CqEntry[];
  tests: TestRecord[];
  /** Auto-marked MCQ exams from the exam simulator (newest last). */
  examSessions: ExamSession[];
  /** One live paper, persisted with the same profile transaction as its answers. */
  activeExam?: ActiveExam;
  /** Questions that are owed another attempt, on a spaced ladder. */
  retries: RetryItem[];
  libraryNotes: PersonalNote[];
  videos: VideoLink[];
  boardQuestions: BoardQuestion[];
  formulas: FormulaEntry[];
  formulaFavorites: string[];
  gpaMarks: SubjectMarks;
  carryovers: Carryover[];
  badges: string[];
  routineBlocks: RoutineBlock[];
  importantDates: ImportantDate[];
  /** YouTube url (or Bangla lesson title) → ISO instant the student marked it watched. */
  classWatched: Record<string, string>;
  /** Date (YYYY-MM-DD) → custom start time / daily hours / task slot overrides with automatic time cascading. */
  dayOverrides: Record<string, DayScheduleOverride>;
  /** Class url (or lesson key) → ISO instant the student bookmarked it. */
  classBookmarks: Record<string, string>;
  /** PDFs the student added (links or device files) for the offline library. */
  pdfs: PdfResource[];
  /** Bookmarked PDF ids. */
  pdfBookmarks: string[];
  /** Recently opened PDFs, newest first (max 30). */
  pdfRecent: { id: string; at: string }[];
  /** Dates whose schedule is locked: regeneration and auto-rescheduling never touch them. */
  lockedDates: string[];
  /** Manual per-task edits (date move, subject/title/chapter change). */
  taskEdits: Record<string, TaskEdit>;
  /** Task ids the student deleted from the schedule. */
  removedTasks: string[];
  /** Scanned handwritten notes metadata (page images stored in IndexedDB). */
  scannedNotes: ScannedNoteMeta[];
}

export const freshData = (): AppData => ({
  version: 2,
  settings: { ...DEFAULT_SETTINGS },
  completed: {},
  confidence: {},
  notes: {},
  exams: {},
  mistakes: [],
  flashcards: [],
  focus: { minutes: 0, sessions: 0 },
  studySessions: [],
  revisions: [],
  chapterMeta: {},
  questions: [],
  attempts: [],
  cq: [],
  tests: [],
  examSessions: [],
  retries: [],
  libraryNotes: [],
  videos: [],
  boardQuestions: [],
  formulas: [],
  formulaFavorites: [],
  gpaMarks: {},
  carryovers: [],
  badges: [],
  routineBlocks: [],
  importantDates: [],
  classWatched: {},
  dayOverrides: {},
  classBookmarks: {},
  pdfs: [],
  pdfBookmarks: [],
  pdfRecent: [],
  lockedDates: [],
  taskEdits: {},
  removedTasks: [],
  scannedNotes: [],
});

/** Effective net daily study hours for a date, accounting for next-month boost and per-day custom override. */
export function dailyTargetMinutes(data: Pick<AppData,'settings'|'dayOverrides'|'advanced'|'personalRoutine'>,date:string):number {
  if (data.personalRoutine) return personalCapacity(data as AppData, date);
  return data.advanced?.targets[date] ?? effectiveDailyHours(data.settings,date,data.dayOverrides?.[date])*60;
}

export function effectiveDailyHours(settings: Settings, date: string, override?: DayScheduleOverride): number {
  if (override?.dailyHours !== undefined && Number.isFinite(override.dailyHours)) {
    return Math.max(4, Math.min(18, Math.round(override.dailyHours)));
  }
  if (settings.boostEnabled && date >= settings.boostStartDate) {
    return Math.max(4, Math.min(18, Math.round(settings.boostDailyHours)));
  }
  return Math.max(4, Math.min(18, Math.round(settings.dailyHours)));
}

/** Cascades task start/end times whenever the day's start time, total hours, or any individual slot is adjusted. */
export function cascadeDayTasks(tasks: Task[], override: DayScheduleOverride | undefined, defaultStartMinute: number): Task[] {
  if (!tasks.length) return tasks;
  if (!override) return tasks;
  const hasAny =
    override.startMinute !== undefined ||
    override.dailyHours !== undefined ||
    (override.taskMinutes && Object.keys(override.taskMinutes).length > 0) ||
    (override.taskStartMinutes && Object.keys(override.taskStartMinutes).length > 0);
  if (!hasAny) return tasks;

  const origDurations = tasks.map(t => Math.max(15, t.endMinute - t.startMinute));
  const origTotal = origDurations.reduce((n, d) => n + d, 0) || 480;
  const targetTotal = override.dailyHours !== undefined ? Math.max(240, Math.min(1080, Math.round(override.dailyHours * 60))) : origTotal;
  const scale = targetTotal / origTotal;

  // Scale non-overridden durations cleanly when dailyHours is customized
  const scaledDurations = origDurations.map((d, idx) => {
    const customMin = override.taskMinutes?.[tasks[idx].id];
    if (customMin !== undefined && Number.isFinite(customMin)) return Math.max(15, Math.min(720, Math.round(customMin)));
    if (tasks[idx].kind === 'exam') return 180;
    if (override.dailyHours === undefined) return d;
    return Math.max(15, Math.round((d * scale) / 5) * 5);
  });

  // If dailyHours was set and no manual taskMinutes exist, reconcile rounding diff on last non-exam task
  if (override.dailyHours !== undefined && (!override.taskMinutes || Object.keys(override.taskMinutes).length === 0)) {
    const diff = targetTotal - scaledDurations.reduce((n, d) => n + d, 0);
    const lastIdx = scaledDurations.length - 1;
    if (lastIdx >= 0 && tasks[lastIdx].kind !== 'exam') {
      scaledDurations[lastIdx] = Math.max(15, scaledDurations[lastIdx] + diff);
    }
  }

  const totalHoursApprox = scaledDurations.reduce((n, d) => n + d, 0) / 60;
  const gapScale = totalHoursApprox >= 16 ? 0.45 : totalHoursApprox >= 12 ? 0.7 : 1;

  let cursor = override.startMinute !== undefined ? Math.max(0, Math.min(1439, Math.round(override.startMinute))) : defaultStartMinute;
  return tasks.map((task, idx) => {
    const origGap = idx === 0 ? 0 : Math.max(0, tasks[idx].startMinute - tasks[idx - 1].endMinute);
    const gap = idx === 0 ? 0 : Math.max(5, Math.round((origGap * gapScale) / 5) * 5);
    const customStart = override.taskStartMinutes?.[task.id];
    const startMinute = customStart !== undefined && Number.isFinite(customStart)
      ? Math.max(idx === 0 ? 0 : cursor, Math.min(2879, Math.round(customStart)))
      : (idx === 0 ? cursor : cursor + gap);
    const duration = scaledDurations[idx];
    const endMinute = startMinute + duration;
    cursor = endMinute;
    return { ...task, startMinute, endMinute };
  });
}

/** Applies per-day time/duration overrides on top of the generated plan with full cascading shifts. */
export function applyDayOverrides(plan: Day[], overrides: Record<string, DayScheduleOverride> | undefined, settings: Settings): Day[] {
  if (!overrides || !Object.keys(overrides).length) return plan;
  const defaultStart = toMinutes(settings.startTime);
  return plan.map(day => {
    const ov = overrides[day.date];
    if (!ov) return day;
    const baseFirstStart = day.tasks[0]?.startMinute ?? defaultStart;
    return { ...day, tasks: cascadeDayTasks(day.tasks, ov, baseFirstStart) };
  });
}

/** Adds the user's recurring weekly blocks on top of the deterministic chapter plan. */
export function applyRoutine(plan: Day[], blocks: RoutineBlock[]): Day[] {
  if (!blocks.length) return plan;
  const byWeekday = new Map<number, RoutineBlock[]>();
  for (const block of blocks) {
    const list = byWeekday.get(block.weekday) || [];
    list.push(block);
    byWeekday.set(block.weekday, list);
  }
  return plan.map(day => {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    const entries = byWeekday.get(weekday)?.filter(block => (block.date ? block.date === day.date : day.date >= todayKey(new Date(block.createdAt))));
    if (!entries?.length) return day;
    const extra: Task[] = entries.map(block => ({
      id: `custom-${day.date}-${block.id}`,
      date: day.date,
      dayIndex: day.index,
      phase: day.phase,
      subject: block.subject,
      kind: 'custom',
      title: block.title.trim() || `${subjectById[block.subject].name}: কাস্টম সেশন`,
      detail: block.date ? 'নিজের দৈনিক কাজ।' : 'কাস্টম সাপ্তাহিক রুটিন · নিজের সময়সূচি থেকে যোগ হয়েছে।',
      chapterIds: [],
      startMinute: block.startMinute,
      endMinute: block.startMinute + block.minutes,
    }));
    return { ...day, tasks: [...day.tasks, ...extra].sort((a, b) => a.startMinute - b.startMinute) };
  });
}

export const STORAGE_KEY = 'hsc27-prostuti-v1';

const DAY_MS = 86400000;
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value && value >= '2020-01-01' && value <= '2041-12-31';
}
export function addDays(date: string, count: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + count * DAY_MS).toISOString().slice(0, 10);
}
export function addMonths(date: string, count: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + count);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS); }
export function todayKey(now = new Date()): string { return dhakaToday(now); }
export function dhakaMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value);
}
export const bn = (value: number | string): string => isEnglish() ? String(value) : String(value).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
export function formatDate(date: string, style: 'long' | 'short' | 'weekday' | 'month' = 'short'): string {
  const options: Intl.DateTimeFormatOptions = style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'weekday' ? { weekday: 'long' } : style === 'month' ? { month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(isEnglish() ? 'en-GB' : 'bn-BD', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24, m = Math.round(minutes % 60);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export function toTimeInput(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function formatDurationBn(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (isEnglish()) {
    if (h && rem) return `${h}h ${rem}m`;
    return h ? `${h}h` : `${rem}m`;
  }
  if (h && rem) return `${bn(h)} ঘণ্টা ${bn(rem)} মি.`;
  return h ? `${bn(h)} ঘণ্টা` : `${bn(rem)} মিনিট`;
}
/** Sessions may cross midnight when the user chooses a late start time. */
export function dayOffset(minutes: number): number { return Math.max(0, Math.floor(minutes / 1440)); }
export function formatDayOffset(minutes: number): string { const d = dayOffset(minutes); return d ? ` (+${bn(d)} দিন)` : ''; }
export function taskStart(task: Pick<Task, 'date' | 'startMinute'>): { date: string; minute: number } {
  return { date: addDays(task.date, dayOffset(task.startMinute)), minute: task.startMinute % 1440 };
}
export function isTaskCurrent(task: Pick<Task, 'date' | 'startMinute' | 'endMinute'>, today: string, minute: number): boolean {
  const nowMs = Date.parse(`${today}T00:00:00Z`) + minute * 60000;
  const startMs = Date.parse(`${task.date}T00:00:00Z`) + task.startMinute * 60000;
  return nowMs >= startMs && nowMs < startMs + (task.endMinute - task.startMinute) * 60000;
}
export const toMinutes = (time: string): number => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const percent = (done: number, total: number): number => total ? Math.round(done / total * 100) : 0;

/** Shift linked personal targets by calendar days, never by milliseconds in a device timezone.
 * Fixed exam deadlines are deliberately NOT moved. The caller must validate before saving.
 */
export function shiftPlanStart(settings: Settings, startDate: string): Settings {
  if (!isValidDate(settings.startDate) || !isValidDate(startDate)) throw new Error(t('সঠিক শুরুর তারিখ বাছো।', 'Pick a valid start date.'));
  const delta = diffDays(settings.startDate, startDate);
  const shift = (date: string) => isValidDate(date) ? addDays(date, delta) : date;
  return {
    ...settings, startDate,
    boostStartDate: shift(settings.boostStartDate),
    ...(settings.examDatePolicy === 'shift' ? {
      testExamDate: shift(settings.testExamDate),
      examDate: shift(settings.examDate),
    } : {}),
  };
}

/** A late start may spill into the following date. Reserve that final night before an exam. */
function studyEndExclusive(settings: Settings, deadline = settings.examDate, learning = false): string {
  const last = addDays(deadline, -1);
  const hours = Math.max(effectiveDailyHours(settings, last), effectiveDailyHours(settings, addDays(last, -1)));
  const short = hours >= 16 ? 10 : 15;
  const meal = hours >= 16 ? 25 : hours >= 12 ? 40 : 60;
  // Final-phase days have four entries (two short breaks and one meal break).
  const spill = Math.floor((toMinutes(settings.startTime) + hours * 60 + (learning ? 4 : 2) * short + meal - 1) / 1440);
  return addDays(deadline, -Math.max(0, spill));
}

/** Kept separate from backup parsing: an old inconsistent profile must be repairable, not erased. */
export function scheduleDateError(settings: Settings): string | null {
  if (![settings.startDate, settings.testExamDate, settings.examDate, settings.boostStartDate].every(isValidDate)) {
    return t('পরিকল্পনার সব তারিখ সঠিকভাবে বাছো।', 'Choose valid dates for the whole plan.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.startTime) || ![settings.dailyHours, settings.boostDailyHours].every(h => Number.isInteger(h) && h >= 4 && h <= 18)) return t('পড়ার সময় ও দৈনিক ঘণ্টা সঠিকভাবে বাছো।', 'Choose valid study times and daily hours.');
  if (settings.startDate >= studyEndExclusive(settings, settings.testExamDate, true)) return t('টেস্ট পরীক্ষার লক্ষ্য শুরুর তারিখের পরে হতে হবে।', 'The test target must be after the start date.');
  if (settings.testExamDate >= settings.examDate) return t('বোর্ড পরীক্ষার লক্ষ্য টেস্টের পরে হতে হবে।', 'The board target must be after the test target.');
  if (diffDays(settings.startDate, settings.examDate) > 730) return t('একটি প্রস্তুতি পরিকল্পনা সর্বোচ্চ ৭৩০ দিনের হতে পারে।', 'A preparation plan can span at most 730 days.');
  if (diffDays(settings.testExamDate, studyEndExclusive(settings)) < 2) return t('টেস্টের পরে রিভিশন ও মডেল টেস্টের জন্য অন্তত ২টি পড়ার দিন রাখো।', 'Leave at least two study days after the test target for revision and mocks.');
  if (settings.boostEnabled && (settings.boostStartDate < settings.startDate || settings.boostStartDate >= settings.examDate)) {
    return t('বাড়তি পড়ার তারিখ রুটিনের শুরু থেকে বোর্ড লক্ষ্য তারিখের আগের মধ্যে রাখো।', 'Keep the boost date within the plan, before the board target.');
  }
  return null;
}

/** A single source of truth for the planner, phase journey, calendar and exports.
 * Learn through the eve of the test target; reserve up to 30 days for mocks, and
 * spend the intervening dates revising. No phase extends beyond the board target.
 */
export function getPhases(settings: Settings = DEFAULT_SETTINGS): Phase[] {
  if (scheduleDateError(settings)) return [];
  const start = settings.startDate;
  const a = studyEndExclusive(settings, settings.testExamDate, true);
  const c = studyEndExclusive(settings);
  const b = addDays(c, -Math.min(30, diffDays(a, c) - 1));
  return [
    { id: 'learn', name: t('সিলেবাস ও টেস্ট প্রস্তুতি', 'Syllabus & test preparation'), subtitle: t('দিনে সর্বোচ্চ ২টি বিষয় · সময়ের ঘাটতি হলে সতর্কবার্তা দেখো', 'Up to 2 subjects/day · check any capacity warning'), start, end: addDays(a, -1), days: diffDays(start, a), color: '#236149' },
    { id: 'revise', name: t('রিভিশন ও প্রশ্ন সমাধান', 'Revision & question practice'), subtitle: t('দুই রাউন্ডের জন্য বরাদ্দ সময়', 'Time allocated for two revision rounds'), start: a, end: addDays(b, -1), days: diffDays(a, b), color: '#9a6722' },
    { id: 'exam', name: t('মডেল টেস্ট ও চূড়ান্ত প্রস্তুতি', 'Model tests & final preparation'), subtitle: t('১৩ পত্রের লক্ষ্য · সময় কম হলে সতর্কবার্তা দেখো', 'Target: 13 papers · check any capacity warning'), start: b, end: addDays(c, -1), days: diffDays(b, c), color: '#5a4b82' },
  ];
}

/** No official HSC 2027 / college-test notice could be verified on this date.
 * A teachers.gov.bd blog is not an education-board circular. Never promote it to one.
 */
export const EXAM_DATE_INFORMATION = {
  checkedOn: '2026-11-16',
  nctb: 'https://nctb.gov.bd/pages/notices/',
  board: 'https://sylhetboard.gov.bd/',
  dhaka: 'https://dhakaeducationboard.gov.bd/index.php/site/product/hsccorner',
} as const;

export const phaseName = (id: PhaseId): string => isEnglish()
  ? ({ learn: 'Syllabus', revise: 'Revision', exam: 'Model tests' })[id]
  : ({ learn: 'সিলেবাস', revise: 'রিভিশন', exam: 'মডেল টেস্ট' })[id];

const ALL_SUBJECTS: SubjectId[] = ['physics', 'chemistry', 'biology', 'math', 'bangla', 'english', 'ict'];
const kindFor = (s: SubjectId): TaskKind => s === 'bangla' || s === 'english' ? 'language' : s === 'ict' ? 'ict' : 'learn';

function learnDetail(c: Chapter, part: number, totalPartsToday: number): string {
  if (c.subject === 'chemistry' && c.effort === 8) {
    const topics = [
      'নামকরণ, সমাণুতা ও কার্যকরী মূলক (ক্লাস ও নোট)',
      'হাইড্রোকার্বন ও মৌলিক বিক্রিয়া অনুশীলন',
      'অ্যারোমেটিক যৌগ ও বিক্রিয়া কৌশল',
      'অ্যালকোহল, ফেনল ও ইথারের বোর্ড প্রশ্ন',
      'অ্যালডিহাইড, কিটোন ও কার্বক্সিলিক এসিড',
      'অ্যামিন ও পাঠ্যবইয়ের বাকি অংশ',
      'রূপান্তর ও শনাক্তকরণ না দেখে লিখে অনুশীলন',
      'বিগত বোর্ডের বাছাইকৃত CQ ও MCQ সমাধান',
    ];
    return isEnglish() ? `${topics[part - 1]}. Then solve 2 CQs and 15 MCQs without looking.` : `${topics[part - 1]}। শেষে না দেখে ২টি CQ ও ১৫টি MCQ সমাধান করো।`;
  }
  if (part === 1) {
    return isEnglish() ? `${c.focus}. Watch the one-shot class first, then write the formulas and definitions from the main book into your own notes.` : `${c.focus}। আগে ওয়ান শট ক্লাস দেখে নাও, এরপর মূল বই থেকে সূত্র ও সংজ্ঞা নিজের খাতায় গুছিয়ে লেখো।`;
  }
  if (part === c.effort) {
    return isEnglish() ? `${c.focus}. After the solving class, do at least 3 board CQs and 25 MCQs against the clock.` : `${c.focus}। সলভিং ক্লাস দেখে বিগত বোর্ডের অন্তত ৩টি CQ ও ২৫টি MCQ ঘড়ি ধরে সমাধান করো।`;
  }
  return isEnglish() ? `${c.focus}. Work through the textbook examples, numericals and diagrams by hand (a ${totalPartsToday}-step session).` : `${c.focus}। পাঠ্যবইয়ের উদাহরণ, গাণিতিক সমস্যা ও চিত্র হাতে-কলমে অনুশীলন করো (${bn(totalPartsToday)} ধাপের সেশন)।`;
}

type RawEntry = Omit<Task, 'date' | 'dayIndex' | 'phase' | 'startMinute' | 'endMinute'> & { weight?: number };

/**
 * Schedules a day's tasks cleanly across 2 subjects (or Model Test day) so total study minutes = exact daily target,
 * with realistic short breaks inside a subject and a meal/rest break between Subject 1 and Subject 2.
 */
function timedTwoSubjectDay(day: Omit<Day, 'tasks'>, entries: RawEntry[], settings: Settings, exam = false): Task[] {
  const hours = effectiveDailyHours(settings, day.date);
  const target = hours * 60;

  let durations: number[];
  if (exam) {
    const examCount = entries.filter(e => e.kind === 'exam').length;
    const rem = Math.max(60, target - examCount * 180);
    const nonExamWeights = entries.map(e => (e.kind === 'exam' ? 0 : (e.weight ?? 1)));
    const wSum = nonExamWeights.reduce((n, w) => n + w, 0) || 1;
    durations = entries.map((e, idx) => (e.kind === 'exam' ? 180 : Math.max(20, Math.round(((rem * nonExamWeights[idx]) / wSum) / 5) * 5)));
    const diff = target - durations.reduce((n, d) => n + d, 0);
    const adjustIdx = entries.findIndex(e => e.kind !== 'exam');
    if (adjustIdx >= 0) durations[adjustIdx] += diff;
  } else {
    // Group weights by subject so Subject 1 gets exactly 50% of the day and Subject 2 gets 50%
    const subjectsInOrder = [...new Set(entries.map(e => e.subject))];
    if (subjectsInOrder.length === 2) {
      const halfA = Math.round(target / 2);
      const halfB = target - halfA;
      durations = new Array(entries.length).fill(0);
      subjectsInOrder.forEach((sub, sIdx) => {
        const subTarget = sIdx === 0 ? halfA : halfB;
        const indices = entries.map((e, i) => (e.subject === sub ? i : -1)).filter(i => i >= 0);
        const wSum = indices.reduce((n, i) => n + (entries[i].weight ?? 1), 0) || 1;
        let used = 0;
        indices.forEach((entryIdx, k) => {
          if (k === indices.length - 1) {
            durations[entryIdx] = Math.max(15, subTarget - used);
          } else {
            const d = Math.max(15, Math.round(((subTarget * (entries[entryIdx].weight ?? 1)) / wSum) / 5) * 5);
            durations[entryIdx] = d;
            used += d;
          }
        });
      });
    } else {
      const wSum = entries.reduce((n, e) => n + (e.weight ?? 1), 0) || 1;
      durations = entries.map(e => Math.max(15, Math.round(((target * (e.weight ?? 1)) / wSum) / 5) * 5));
      durations[durations.length - 1] += target - durations.reduce((n, d) => n + d, 0);
    }
  }

  // Realistic breaks that scale gently when studying 16-18 hours/day so sessions stay practical
  const shortBreak = hours >= 16 ? 10 : 15;
  const mealBreak = hours >= 16 ? 25 : hours >= 12 ? 40 : 60;

  let cursor = toMinutes(settings.startTime);
  return entries.map((raw, i) => {
    const { weight: _w, ...entry } = raw;
    const startMinute = cursor;
    const endMinute = startMinute + durations[i];
    cursor = endMinute;
    if (i < entries.length - 1) {
      const nextSub = entries[i + 1].subject;
      cursor += nextSub !== entry.subject ? mealBreak : shortBreak;
    }
    return { ...entry, date: day.date, dayIndex: day.index, phase: day.phase, startMinute, endMinute };
  });
}

export function buildPlan(settings: Settings = DEFAULT_SETTINGS): Day[] {
  const phases = getPhases(settings);
  if (!phases.length) return [];
  const total = phases.reduce((n, p) => n + p.days, 0);

  // Per-subject chapter queues ordered Priority A -> Priority B -> textbook order
  const chapterQueues: Record<SubjectId, Chapter[]> = Object.fromEntries(
    ALL_SUBJECTS.map(s => [
      s,
      CHAPTERS.filter(c => c.subject === s).sort((a, b) => a.priority.localeCompare(b.priority) || a.paper - b.paper),
    ]),
  ) as Record<SubjectId, Chapter[]>;
  const chapterPtr: Record<SubjectId, { chIdx: number; partIdx: number }> = Object.fromEntries(
    ALL_SUBJECTS.map(s => [s, { chIdx: 0, partIdx: 0 }]),
  ) as Record<SubjectId, { chIdx: number; partIdx: number }>;

  const hasRemaining = (s: SubjectId) => chapterPtr[s].chIdx < chapterQueues[s].length;
  const remainingCount = (s: SubjectId) => chapterQueues[s].length - chapterPtr[s].chIdx;

  // Build 1-chapter-per-subject entries for a chosen subject on a learn day
  const takeSubjectChapterEntries = (s: SubjectId, dayKey: string): RawEntry[] => {
    const ptr = chapterPtr[s];
    const ch = chapterQueues[s][ptr.chIdx];
    if (!ch) {
      return [
        {
          id: `testprep-theory-${s}-${dayKey}`,
          subject: s,
          kind: kindFor(s),
          title: `${subjectById[s].name}: টেস্ট পরীক্ষা রিভিশন`,
          detail: 'নির্ধারিত টেস্ট লক্ষ্যের জন্য গুরুত্বপূর্ণ অধ্যায়ের সূত্র, নোট ও সংজ্ঞা দ্রুত ঝালাই করো।',
          chapterIds: [],
        },
        {
          id: `testprep-cqmcq-${s}-${dayKey}`,
          subject: s,
          kind: 'practice',
          title: `${subjectById[s].name}: বোর্ড CQ ও MCQ সলভ`,
          detail: 'ঘড়ি ধরে ৩টি বোর্ড CQ ও ৩০টি MCQ সমাধান করে ভুলের খাতায় নোট করো।',
          chapterIds: [],
        },
      ];
    }

    // Complete standard chapters (effort <= 3) in 1 dedicated subject slot; split huge chapters (effort >= 4) into 2 parts/day
    const takeCount = ch.effort <= 3 ? ch.effort - ptr.partIdx : Math.min(2, ch.effort - ptr.partIdx);
    const out: RawEntry[] = [];
    for (let k = 0; k < takeCount; k++) {
      const partNum = ptr.partIdx + k + 1;
      const stepLabel = takeCount === 1
        ? 'ওয়ান শট ক্লাস ও মূল বই'
        : k === 0
          ? 'ক্লাস ও মূল ধারণা নোট'
          : k === takeCount - 1
            ? 'CQ ও MCQ সমাধান'
            : 'উদাহরণ ও গাণিতিক অনুশীলন';
      out.push({
        id: `${ch.id}:part-${partNum}`,
        subject: s,
        kind: kindFor(s),
        title: `${ch.title} · ${stepLabel}`,
        detail: `${ch.effort > 1 ? `ধাপ ${bn(partNum)}/${bn(ch.effort)} · ` : ''}${learnDetail(ch, partNum, takeCount)}${ch.note ? ` ${ch.note}` : ''}`,
        chapterIds: [ch.id],
      });
    }
    // If a light chapter had only 1 effort part, pair it with CQ+MCQ practice of THAT SAME CHAPTER so the subject still has 2 clean study blocks
    if (out.length === 1) {
      out.push({
        id: `chap-practice-${ch.id}-${dayKey}`,
        subject: s,
        kind: 'practice',
        title: `${ch.title} · CQ ও MCQ অনুশীলন`,
        detail: `${ch.focus}। সলভিং ক্লাস দেখে বিগত বোর্ডের ২টি CQ ও ২৫টি MCQ সমাধান করো।`,
        chapterIds: [ch.id],
      });
    }

    ptr.partIdx += takeCount;
    recentChapters.push(ch.id);
    if (ptr.partIdx >= ch.effort) {
      ptr.chIdx += 1;
      ptr.partIdx = 0;
    }
    return out;
  };

  type RevisionGroup = { id: string; subject: SubjectId; chapters: Chapter[] };
  const revisionGroups = (round: number, subject: SubjectId): RevisionGroup[] => {
    const chapters = CHAPTERS.filter(c => c.subject === subject).sort((a, b) => a.paper - b.paper || Number(a.number) - Number(b.number));
    const groups: Chapter[][] = [];
    for (const c of chapters) {
      const last = groups[groups.length - 1];
      if (c.effort < 4 && last && last.length < 2 && last[0].paper === c.paper && last.reduce((n, x) => n + x.effort, 0) + c.effort <= 5) last.push(c);
      else groups.push([c]);
    }
    return groups.map((g, i) => ({ id: `revision-${round}-${subject}-${i}`, subject, chapters: g }));
  };
  const revisionQueues: Record<string, Record<string, RevisionGroup[]>> = { '1': {}, '2': {} };
  const revisionPointers: Record<string, Record<string, number>> = { '1': {}, '2': {} };
  for (const round of ['1', '2']) {
    for (const subject of CORE) {
      revisionQueues[round][subject] = revisionGroups(Number(round), subject);
      revisionPointers[round][subject] = 0;
    }
  }
  const takeRevisionGroup = (round: string, subject: SubjectId): RevisionGroup | undefined => {
    const queue = revisionQueues[round][subject] || [];
    const index = revisionPointers[round][subject] || 0;
    if (index >= queue.length) return undefined;
    revisionPointers[round][subject] = index + 1;
    return queue[index];
  };

  const recentChapters: string[] = [];
  let prevDaySubjects: SubjectId[] = [];
  let revSlot = 0;
  let testPrepSlot = 0;
  const phase2Days = phases[1].days;
  const days: Day[] = [];

  for (let i = 0; i < total; i++) {
    const date = addDays(settings.startDate, i);
    const phase = phases.find(p => date >= p.start && date <= p.end)!;
    const localDay = diffDays(phase.start, date) + 1;
    const anyChaptersLeft = ALL_SUBJECTS.some(hasRemaining);
    const isCatchup = phase.id === 'learn' && localDay % 7 === 0;
    const day: Day = { date, index: i + 1, phase: phase.id, tasks: [], isCatchup };
    const entries: RawEntry[] = [];

    if (phase.id === 'learn') {
      if (isCatchup) {
        // Weekly catch-up & revision day — strictly 2 subjects!
        const s1 = ALL_SUBJECTS[(localDay * 2) % ALL_SUBJECTS.length];
        const s2 = ALL_SUBJECTS[(localDay * 2 + 3) % ALL_SUBJECTS.length];
        const recentFor = (s: SubjectId) => [...new Set(recentChapters)].filter(id => chapterById[id]?.subject === s).slice(-1);
        [s1, s2].forEach((sub, idx) => {
          const cIds = recentFor(sub);
          const cTitle = cIds[0] ? chapterById[cIds[0]]?.title : 'এ সপ্তাহের অধ্যায়';
          entries.push(
            {
              id: `weekly-learn-${localDay}-s${idx}-a`,
              subject: sub,
              kind: 'practice',
              title: `${subjectById[sub].name}: সাপ্তাহিক ব্যাকলগ ও নোট ঝালাই`,
              detail: `${cTitle} — অসমাপ্ত পড়া থাকলে আগে শেষ করো, নতুবা মূল সূত্র ও নোট না দেখে লেখো।`,
              chapterIds: cIds,
            },
            {
              id: `weekly-learn-${localDay}-s${idx}-b`,
              subject: sub,
              kind: 'recall',
              title: `${subjectById[sub].name}: সাপ্তাহিক CQ ও MCQ যাচাই`,
              detail: `২টি বোর্ড CQ ও ২৫টি MCQ ঘড়ি ধরে সমাধান করো এবং ভুলের খাতা আপডেট করো।`,
              chapterIds: cIds,
            },
          );
        });
        prevDaySubjects = [s1, s2];
      } else if (anyChaptersLeft) {
        const active = ALL_SUBJECTS.filter(hasRemaining);
        const ranked = [...active].sort((a, b) => {
          // Slight penalty if studied yesterday so consecutive days feel fresh. Capacity is checked separately, never promised.
          const scoreA = remainingCount(a) - (prevDaySubjects.includes(a) && active.length > 2 ? 1.5 : 0);
          const scoreB = remainingCount(b) - (prevDaySubjects.includes(b) && active.length > 2 ? 1.5 : 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return ((ALL_SUBJECTS.indexOf(a) + localDay) % 7) - ((ALL_SUBJECTS.indexOf(b) + localDay) % 7);
        });
        const chosen = ranked.slice(0, 2);
        for (const sub of chosen) {
          entries.push(...takeSubjectChapterEntries(sub, `learn-${localDay}`));
        }
        prevDaySubjects = chosen;
      } else {
        // All chapter queues are finished. Use the remaining learning days for test preparation.
        const s1 = ALL_SUBJECTS[testPrepSlot++ % ALL_SUBJECTS.length];
        const s2 = ALL_SUBJECTS[testPrepSlot++ % ALL_SUBJECTS.length];
        for (const sub of [s1, s2]) {
          entries.push(...takeSubjectChapterEntries(sub, `learn-${localDay}`));
        }
        prevDaySubjects = [s1, s2];
      }
    } else if (phase.id === 'revise') {
      const round = localDay <= Math.ceil(phase2Days / 2) ? '1' : '2';
      const chosenSubs: SubjectId[] = [];
      for (let pick = 0; pick < 2; pick++) {
        let group: RevisionGroup | undefined;
        for (let step = 0; step < CORE.length; step++) {
          const candidate = CORE[(revSlot + step) % CORE.length];
          if (chosenSubs.includes(candidate)) continue;
          group = takeRevisionGroup(round, candidate);
          if (group) {
            revSlot = (CORE.indexOf(candidate) + 1) % CORE.length;
            break;
          }
        }
        if (group) {
          chosenSubs.push(group.subject);
          const chIds = group.chapters.map(c => c.id);
          const chTitles = group.chapters.map(c => c.title).join(' + ');
          entries.push(
            {
              id: group.id,
              subject: group.subject,
              kind: 'revision',
              title: `${chTitles} · রিভিশন`,
              detail: `রিভিশন রাউন্ড ${bn(round)} · নোট ও ওয়ান শট স্লাইড থেকে মূল ধারণা ও সূত্র ঝালাই করো।`,
              chapterIds: chIds,
            },
            {
              id: `${group.id}-practice`,
              subject: group.subject,
              kind: 'practice',
              title: `${chTitles} · CQ ও MCQ অনুশীলন`,
              detail: `প্রতিটি অধ্যায় থেকে ২টি বোর্ড CQ ও ২৫টি MCQ ঘড়ি ধরে সমাধান করো।`,
              chapterIds: chIds,
            },
          );
        } else {
          const langPool: SubjectId[] = ['bangla', 'english', 'ict', ...CORE];
          const fallbackSub = langPool.find(s => !chosenSubs.includes(s)) || CORE[pick];
          chosenSubs.push(fallbackSub);
          entries.push(
            {
              id: `revision-extra-${localDay}-s${pick}-a`,
              subject: fallbackSub,
              kind: kindFor(fallbackSub),
              title: `${subjectById[fallbackSub].name}: পূর্ণ রিভিশন ও নোট ঝালাই`,
              detail: 'ভুলের খাতা ও গুরুত্বপূর্ণ টপিকগুলো না দেখে রিকল করো।',
              chapterIds: [],
            },
            {
              id: `revision-extra-${localDay}-s${pick}-b`,
              subject: fallbackSub,
              kind: 'practice',
              title: `${subjectById[fallbackSub].name}: টাইমড বোর্ড প্রশ্ন সলভ`,
              detail: '৩টি CQ ও ৩০টি MCQ সমাধান করে দুর্বল অংশ চিহ্নিত করো।',
              chapterIds: [],
            },
          );
        }
      }
    } else {
      const mockIndex = Math.floor((localDay - 1) / 2);
      if (mockIndex < PAPERS.length) {
        const paper = PAPERS[mockIndex];
        const companionSub: SubjectId = paper.subject === 'english' ? 'bangla' : 'english';
        if (localDay % 2 === 1) {
          // Model Test Day — strictly 2 subjects (Exam Paper Subject + Light Companion Subject)
          entries.push(
            {
              id: `prep-${paper.id}`,
              subject: paper.subject,
              kind: 'recall',
              title: `${paper.name}: পরীক্ষার পূর্ব প্রস্তুতি`,
              detail: 'শুধু নিজের সূত্রশিট ও ভুলের খাতা দেখো। কলম, ঘড়ি ও উত্তরপত্র গুছিয়ে নাও।',
              chapterIds: [],
              paperId: paper.id,
              weight: 1,
            },
            {
              id: `mock-${paper.id}`,
              subject: paper.subject,
              kind: 'exam',
              title: `${paper.name} · পূর্ণ মডেল টেস্ট`,
              detail: `ঘড়ি ধরে ${bn(paper.maxScore === 75 ? 75 : 100)} নম্বরের পূর্ণ প্রশ্নপত্র ৩ ঘণ্টায় সমাধান করো।`,
              chapterIds: [],
              paperId: paper.id,
            },
            {
              id: `correction-${paper.id}`,
              subject: paper.subject,
              kind: 'correction',
              title: `${paper.name}: খাতা মূল্যায়ন ও ভুল চিহ্নিতকরণ`,
              detail: 'নম্বর মিলিয়ে পরীক্ষা পেজে নম্বর ও ভুলগুলো লিখে রাখো।',
              chapterIds: [],
              paperId: paper.id,
              weight: 1.4,
            },
            {
              id: `mock-companion-${paper.id}`,
              subject: companionSub,
              kind: 'language',
              title: `${subjectById[companionSub].name}: হালকা রিভিশন ও অনুশীলন`,
              detail: 'মডেল টেস্টের পর চাপমুক্ত থেকে একটি ছোট রাইটিং/সাহিত্য বা ব্যাকরণ টপিক ঝালাই করো।',
              chapterIds: [],
              weight: 1.2,
            },
          );
          day.tasks = timedTwoSubjectDay(day, entries, settings, true);
          days.push(day);
          continue;
        }
        const secondSub: SubjectId = CORE[mockIndex % CORE.length] === paper.subject ? 'ict' : CORE[mockIndex % CORE.length];
        entries.push(
          {
            id: `analysis-${paper.id}`,
            subject: paper.subject,
            kind: 'correction',
            title: `${paper.name}: উত্তর বিশ্লেষণ ও ভুল সংশোধন`,
            detail: 'গতকালের মডেল টেস্টের প্রতিটি ভুল বুঝে নোট করো।',
            chapterIds: [],
            paperId: paper.id,
          },
          {
            id: `resolve-${paper.id}`,
            subject: paper.subject,
            kind: 'practice',
            title: `${paper.name}: দুর্বল টপিকের প্রশ্ন পুনরায় সমাধান`,
            detail: 'সমাধান না দেখে গতকালের ভুল CQ ও MCQ নিজে আবার সমাধান করো।',
            chapterIds: [],
            paperId: paper.id,
          },
          {
            id: `nextprep-${paper.id}-a`,
            subject: secondSub,
            kind: kindFor(secondSub),
            title: `${subjectById[secondSub].name}: সূত্র ও মূল ধারণা ঝালাই`,
            detail: 'পরবর্তী মডেল টেস্টের জন্য মূল অধ্যায়ের নোট ও সূত্রশিট রিভিশন দাও।',
            chapterIds: [],
          },
          {
            id: `nextprep-${paper.id}-b`,
            subject: secondSub,
            kind: 'practice',
            title: `${subjectById[secondSub].name}: বোর্ড প্রশ্ন ও ব্যবহারিক প্রস্তুতি`,
            detail: '২টি বোর্ড CQ ও ২৫টি MCQ অনুশীলন করো।',
            chapterIds: [],
          },
        );
      } else {
        const pairIdx = (localDay - 27) * 2;
        const s1 = ALL_SUBJECTS[pairIdx % ALL_SUBJECTS.length];
        const s2 = ALL_SUBJECTS[(pairIdx + 1) % ALL_SUBJECTS.length];
        entries.push(
          { id: `final-${localDay}-a1`, subject: s1, kind: 'recall', title: `${subjectById[s1].name}: শেষ মুহূর্তের সূত্র ও ভুলের খাতা`, detail: 'কেবল পরিচিত নোট ও ভুলের খাতা চোখ বুলিয়ে নাও। নতুন টপিক নয়।', chapterIds: [] },
          { id: `final-${localDay}-a2`, subject: s1, kind: 'practice', title: `${subjectById[s1].name}: হালকা বোর্ড প্রশ্ন ঝালাই`, detail: 'বাছাইকৃত গুরুত্বপূর্ণ প্রশ্নগুলো রিভিউ করো।', chapterIds: [] },
          { id: `final-${localDay}-b1`, subject: s2, kind: 'recall', title: `${subjectById[s2].name}: মূল নোট ও সংজ্ঞা রিভিশন`, detail: 'আত্মবিশ্বাসের সঙ্গে মূল পয়েন্টগুলো মনে করো ও পর্যাপ্ত ঘুমাও।', chapterIds: [] },
          { id: `final-${localDay}-b2`, subject: s2, kind: 'recall', title: `${subjectById[s2].name}: পরীক্ষার সামগ্রী ও চূড়ান্ত প্রস্তুতি`, detail: 'প্রবেশপত্র, কলম, ক্যালকুলেটর ও ঘড়ি গুছিয়ে রাখো।', chapterIds: [] },
        );
      }
    }

    day.tasks = timedTwoSubjectDay(day, entries, settings, false);
    days.push(day);
  }
  return days;
}

export function chapterTasks(plan: Day[], chapterId: string): Task[] {
  return plan.flatMap(d => d.tasks).filter(t => t.chapterIds.includes(chapterId) && (t.personalWork || ((t.kind === 'learn' || t.kind === 'language' || t.kind === 'ict') && t.id.includes(':part-'))));
}
/** Initial learning and its accompanying chapter practice form one completion unit. */
export function chapterStudyTasks(plan: Day[], chapterId: string): Task[] {
  return plan.flatMap(d => d.tasks).filter(task => task.chapterIds.includes(chapterId) &&
    (task.personalWork || ((task.kind === 'learn' || task.kind === 'language' || task.kind === 'ict') && (task.originalTaskId || task.id).includes(':part-')) ||
     (task.kind === 'practice' && (task.originalTaskId || task.id).startsWith(`chap-practice-${chapterId}-`))));
}
/** Does the allocation cover an entire source task, not merely one visible fragment?
 * With `completed`, only real completion evidence counts; old split ranges still count
 * when a date shift puts their historical day outside the newly generated range.
 */
export function hasFullTaskAllocation(tasks: Task[], id: string, completed?: Record<string, string>, includeScheduled = false): boolean {
  if (completed?.[id]) return true;
  const matching = tasks.filter(task => (task.originalTaskId || task.id) === id);
  const total = Math.max(0, ...matching.map(task => task.sourceMinutes ||
    (!task.id.startsWith('smart-part|') ? task.endMinute - task.startMinute : 0)));
  const ranges: [number, number][] = [];
  const addRange = (key: string) => {
    if (!key.startsWith('smart-part|')) return;
    const range = parseTaskRangeId(key);
    if (range?.kind === 'part' && range.sourceId === id) ranges.push([range.from, range.to]);
  };
  for (const task of matching) {
    if (completed && !includeScheduled && !completed[task.id]) continue;
    if (!task.id.startsWith('smart-part|')) return true;
    addRange(task.id);
  }
  if (completed) Object.keys(completed).forEach(addRange);
  // A fragment without its source size cannot prove that the final part was allocated.
  if (!total) return false;
  let through = 0;
  for (const [from, to] of ranges.sort((a, b) => a[0] - b[0])) {
    if (from > through + 0.01) return false;
    through = Math.max(through, to);
  }
  return through >= total - 0.01;
}

/** Complete canonical parts remain evidence even when a shorter new plan cannot schedule them.
 * Conversely, ticking only the visible subset can never complete an unallocated part.
 */
export function isChapterDone(plan: Day[], id: string, completed: Record<string, string>): boolean {
  if (plan.some(day => day.personalRoutine || day.tasks.some(task => task.personalWork))) return isPersonalChapterDone(plan, id, completed);
  const chapter = chapterById[id];
  if (!chapter) return false;
  const tasks = chapterStudyTasks(plan, id);
  const allParts = Array.from({ length: chapter.effort }, (_, part) => `${id}:part-${part + 1}`)
    .every(part => hasFullTaskAllocation(tasks, part, completed));
  const practice = [...new Set([...tasks.map(task => task.originalTaskId || task.id), ...Object.keys(completed)]
    .filter(key => key.startsWith(`chap-practice-${id}-`)))];
  const requiresPractice = chapter.effort === 1 || (chapter.effort >= 4 && chapter.effort % 2 === 1);
  const practiceDone = practice.every(key => hasFullTaskAllocation(tasks, key, completed)) &&
    (!requiresPractice || practice.length > 0);
  return allParts && practiceDone;
}
export function chapterFirstDate(plan: Day[], id: string): string | undefined {
  return chapterTasks(plan, id)[0]?.date;
}
export function chapterLastDate(plan: Day[], id: string): string | undefined {
  const tasks = chapterTasks(plan, id);
  return tasks[tasks.length - 1]?.date;
}
export function isDayComplete(day: Day | undefined, completed: Record<string, string>): boolean {
  return !!day && day.tasks.length > 0 && day.tasks.every(task => isPersonalTaskComplete(task, completed));
}
/** Finds the very next day after `afterDate` that still has unfinished study tasks (auto-advance when today finishes early!). */
export function getNextUnfinishedDay(plan: Day[], afterDate: string, completed: Record<string, string>): Day | undefined {
  return plan.find(d => d.date > afterDate && d.tasks.some(task => !isPersonalTaskComplete(task, completed)));
}
/** Returns unfinished tasks from days strictly before `beforeDate` so previous unfinished study appears alongside today's 2 chapters. */
export function getUnfinishedPastTasks(plan: Day[], beforeDate: string, completed: Record<string, string>): Task[] {
  return plan
    .filter(d => d.date < beforeDate)
    .flatMap(d => d.tasks)
    .filter(t => taskStart(t).date < beforeDate && !isPersonalTaskComplete(t, completed));
}

export function getStats(plan: Day[], data: AppData, today: string) {
  const all = plan.flatMap(d => d.tasks);
  const done = all.filter(task => isPersonalTaskComplete(task, data.completed));
  const scope = data.personalRoutine ? CHAPTERS.filter(c => data.personalRoutine!.chapterIds.includes(c.id)) : CHAPTERS;
  const complete = (id: string) => data.personalRoutine ? isPersonalChapterDone(plan, id, data.completed, data.personalRoutine) : isChapterDone(plan, id, data.completed);
  const chapters = scope.filter(c => complete(c.id));
  const activeDates = new Set([...Object.values(data.completed).map(at => todayKey(new Date(at))),...data.studySessions.map(s=>s.date),...data.attempts.map(a=>a.date),...data.cq.map(c=>c.date),...(data.advanced?.activityDates||[])]);
  let streak = 0, cursor = activeDates.has(today) ? today : addDays(today, -1);
  while (activeDates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const backlog = all.filter(t => taskStart(t).date < today && !isPersonalTaskComplete(t, data.completed));
  const subjectProgress = Object.fromEntries(Object.keys(subjectById).map(s => {
    const chs = scope.filter(c => c.subject === s);
    return [s, { done: chs.filter(c => complete(c.id)).length, total: chs.length }];
  })) as Record<SubjectId, { done: number; total: number }>;
  return {
    total: all.length,
    done: done.length,
    chapters: chapters.length,
    totalChapters: scope.length,
    streak,
    backlog,
    subjectProgress,
    plannedMinutes: done.reduce((n, t) => n + (t.endMinute - t.startMinute), 0),
    mocks: Object.keys(data.exams).length,
  };
}
