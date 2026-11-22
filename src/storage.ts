import { parseAdvanced } from './advanced';
import { parsePersonalRoutine, resumeUnfinishedPersonalPhase } from './personalRoutine';
import { parseStudyBrain } from './studyBrain';
import { CHAPTERS, PAPERS, SUBJECTS, chapterById } from './data';
import { addDays, isValidDate, STORAGE_KEY, todayKey } from './planner';
import type { AppData, Settings } from './planner';
import { DEFAULT_SETTINGS, freshData } from './planner';
import type { CqParts, DayScheduleOverride, Flashcard, FlashcardCategory, MistakeCategory, MistakeRetry, PrepStatus, RecallRating, RevisionInterval, StudyMode, TestKind, VideoLink, ScannedNoteMeta, ExamMode, ExamCadence } from './types';
import { BUILTIN_QUESTION_IDS } from './questionBankIndex';
import { PDF_MATERIAL_IDS } from './pdfCatalog';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 10000): v is string => typeof v === 'string' && v.length <= max;
const nonEmpty = (v: unknown, max = 10000): v is string => text(v, max) && v.trim().length > 0;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const int = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const ISO_AT = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const validAt = (v: unknown): v is string => text(v, 40) && ISO_AT.test(v) && isValidDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
// Flashcard reviews store a Bangladesh calendar day. Older imports may carry a
// full timestamp instead; retain that evidence rather than replacing the profile.
const validReviewDate = (v: unknown): v is string => (text(v, 10) && isValidDate(v)) || validAt(v);
const subjectIds = new Set<string>(SUBJECTS.map(s => s.id));
const chapterIds = new Set<string>(CHAPTERS.map(c => c.id));
const paperIds = new Set<string>(PAPERS.map(p => p.id));
const confidenceLevels = new Set(['weak', 'okay', 'confident']);
const prepLevels = new Set<PrepStatus>(['none', 'practicing', 'ready']);
const studyModes = new Set<StudyMode>(['stopwatch', 'countdown', 'pomodoro']);
const intervals = new Set<RevisionInterval>([1, 3, 7, 14, 30]);
const recalls = new Set<string>(['weak', 'okay', 'good']);
const testKinds = new Set<TestKind>(['chapter', 'subject', 'model']);
const examModes = new Set<ExamMode>(['chapter', 'subject', 'full', 'mistakes', 'retry']);
const examCadences = new Set<ExamCadence>(['daily', 'weekly', 'monthly']);
const isSubject = (v: unknown): v is AppData['mistakes'][number]['subject'] => typeof v === 'string' && subjectIds.has(v);
const optionalChapter = (v: unknown): v is string | undefined => v === undefined || (typeof v === 'string' && chapterIds.has(v));
/** Own-property assignment: backup keys such as "__proto__" must never mutate prototypes. */
const put = <T>(target: Record<string, T>, key: string, value: T): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};
export const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
export const SAVED_AT_KEY = `${STORAGE_KEY}-saved-at`;
export const MISTAKE_LIMIT = 1000;
export const LIMITS = {
  sessions: 6000, revisions: 2500, questions: 2000, attempts: 10000, cq: 2000, tests: 1000, examSessions: 500, retries: 2000,
  libraryNotes: 1000, videos: 1000, boardQuestions: 2000, formulas: 1000, carryovers: 2000, badges: 100, routineBlocks: 500, importantDates: 200,
  classWatched: 1000,
  classBookmarks: 2000,
  flashcards: 5000,
  flashcardReviews: 20000,
  scannedNotes: 200,
  pdfs: 500, pdfBookmarks: 500, pdfRecent: 30, lockedDates: 1500, taskEdits: 4000, removedTasks: 4000,
};

const optionalAt = (v: unknown, message: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (!validAt(v)) throw new Error(message);
  return v;
};
const optionalText = (v: unknown, max: number, message: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (!text(v, max)) throw new Error(message);
  return v;
};
const listOf = <T>(raw: unknown, limit: number, label: string, parse: (item: unknown, index: number) => T): T[] => {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`${label}ের তালিকা সঠিক নয়।`);
  if (raw.length > limit) throw new Error(`${label} সর্বোচ্চ ${limit}টি রাখা যায়।`);
  return raw.map((item, index) => parse(item, index));
};
/** CQ sub-part marks (ক/খ/গ/ঘ). Absent, null or out-of-range values are simply dropped. */
const partsOf = (v: unknown, total: number): CqParts | undefined => {
  if (!object(v)) return undefined;
  const values = [v.c1, v.c2, v.c3, v.c4];
  if (!values.every(value => value === undefined || num(value, 0, total))) return undefined;
  const parts = { c1: Number(v.c1 ?? 0), c2: Number(v.c2 ?? 0), c3: Number(v.c3 ?? 0), c4: Number(v.c4 ?? 0) };
  return parts.c1 + parts.c2 + parts.c3 + parts.c4 > total ? undefined : parts;
};
const tagsOf = (v: unknown): string[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 10) throw new Error('নোটের ট্যাগ সঠিক নয়।');
  return v.map(tag => {
    if (!nonEmpty(tag, 200)) throw new Error('নোটের ট্যাগ সঠিক নয়।');
    return tag.trim();
  });
};

export function sanitizeSettings(raw: unknown): Settings {
  if (!object(raw)) throw new Error('Settings অবজেক্ট পাওয়া যায়নি।');
  const d = DEFAULT_SETTINGS;
  if (!text(raw.startDate, 10) || !isValidDate(raw.startDate) || raw.startDate > '2040-12-31') throw new Error('শুরুর তারিখ সঠিক নয়।');
  if (!text(raw.startTime, 5) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.startTime)) throw new Error('শুরুর সময় সঠিক নয়।');
  if (!int(Number(raw.dailyHours), 4, 18)) throw new Error('দৈনিক পড়ার সময় ৪ থেকে ১৮ ঘণ্টার মধ্যে হতে হবে।');
  const boostEnabled = raw.boostEnabled === undefined ? d.boostEnabled : raw.boostEnabled === true;
  const boostStartDate = raw.boostStartDate === undefined ? addDays(raw.startDate, 17) : raw.boostStartDate;
  if (!text(boostStartDate, 10) || !isValidDate(boostStartDate)) throw new Error('পরবর্তী ধাপের শুরুর তারিখ সঠিক নয়।');
  const boostDailyHours = raw.boostDailyHours === undefined ? d.boostDailyHours : Number(raw.boostDailyHours);
  if (!int(boostDailyHours, 4, 18)) throw new Error('পরবর্তী ধাপের পড়ার সময় ৪ থেকে ১৮ ঘণ্টার মধ্যে হতে হবে।');
  if (![0, 5, 10, 15, 30].includes(Number(raw.reminderLead))) throw new Error('রিমাইন্ডারের সময় সঠিক নয়।');
  // A blank board/name is not evidence of corruption: older drafts left them empty
  // and the app then showed an empty picker. Fall back to the safe defaults and
  // record it, instead of either keeping garbage or rejecting the whole profile.
  const board = typeof raw.board === 'string' && raw.board.trim() ? raw.board : d.board;
  const name = typeof raw.name === 'string' ? raw.name : d.name;
  if (!text(board, 60) || !text(name, 60)) throw new Error('নাম বা বোর্ডের লেখা সঠিক নয়।');
  const testExamDate = raw.testExamDate === undefined ? d.testExamDate : raw.testExamDate;
  if (!text(testExamDate, 10) || !isValidDate(testExamDate)) throw new Error('টেস্ট পরীক্ষার তারিখ সঠিক নয়।');
  const examDate = raw.examDate === undefined ? d.examDate : raw.examDate;
  if (!text(examDate, 10) || !isValidDate(examDate)) throw new Error('HSC পরীক্ষার লক্ষ্য তারিখ সঠিক নয়।');
  // Dates out of order are retained on purpose so an older profile stays
  // repairable in Settings, but they must never look like ordinary "no work":
  // the planner returns zero days for them and the warning banner names the
  // exact problem. `scheduleDateError` is the single owner of that message.
  const examDatePolicy = raw.examDatePolicy === undefined ? d.examDatePolicy : raw.examDatePolicy;
  if (examDatePolicy !== 'shift' && examDatePolicy !== 'fixed') throw new Error('পরীক্ষার তারিখ সরানোর নিয়ম সঠিক নয়।');
  const theme = raw.theme === undefined ? d.theme : raw.theme;
  if (!['light', 'dark', 'system'].includes(String(theme))) throw new Error('থিম সেটিংস সঠিক নয়।');
  const language = raw.language === undefined ? d.language : raw.language;
  if (!['bn', 'en'].includes(String(language))) throw new Error('ভাষার সেটিংস সঠিক নয়।');
  const carryoverMode = raw.carryoverMode === undefined ? d.carryoverMode : raw.carryoverMode;
  if (!['manual', 'auto'].includes(String(carryoverMode))) throw new Error('ব্যাকলগ সেটিংস সঠিক নয়।');
  const pomodoroFocus = raw.pomodoroFocus === undefined ? d.pomodoroFocus : Number(raw.pomodoroFocus);
  const pomodoroBreak = raw.pomodoroBreak === undefined ? d.pomodoroBreak : Number(raw.pomodoroBreak);
  const pomodoroLongBreak = raw.pomodoroLongBreak === undefined ? d.pomodoroLongBreak : Number(raw.pomodoroLongBreak);
  if (!int(pomodoroFocus, 5, 120) || !int(pomodoroBreak, 1, 60) || !int(pomodoroLongBreak, 5, 120)) throw new Error('পোমোডোরোর সময় সঠিক নয়।');
  const adaptiveEnabled = raw.adaptiveEnabled === undefined ? d.adaptiveEnabled : raw.adaptiveEnabled === true;
  const adaptiveBuffer = raw.adaptiveBuffer === undefined ? d.adaptiveBuffer : Number(raw.adaptiveBuffer);
  if (![0, 30, 60].includes(adaptiveBuffer)) throw new Error('অ্যাডাপ্টিভ প্ল্যানারের বাফার সঠিক নয়।');
  const fontScale = raw.fontScale === undefined ? d.fontScale : raw.fontScale;
  if (!['sm', 'md', 'lg'].includes(String(fontScale))) throw new Error('লেখার আকারের সেটিংস সঠিক নয়।');
  return {
    startDate: raw.startDate, startTime: raw.startTime, dailyHours: Number(raw.dailyHours),
    boostEnabled, boostStartDate, boostDailyHours, adaptiveEnabled, adaptiveBuffer,
    board, name,
    reminderEnabled: raw.reminderEnabled === true, reminderLead: Number(raw.reminderLead), syllabusChecked: raw.syllabusChecked === true,
    calendarRevision: int(raw.calendarRevision, 0, 999999) ? Number(raw.calendarRevision) : 0,
    testExamDate,
    examDate,
    examDatePolicy,
    theme: theme as Settings['theme'],
    language: language as Settings['language'],
    revisionEnabled: raw.revisionEnabled === undefined ? d.revisionEnabled : raw.revisionEnabled === true,
    carryoverMode: carryoverMode as Settings['carryoverMode'],
    pomodoroFocus, pomodoroBreak, pomodoroLongBreak,
    fontScale: fontScale as Settings['fontScale'],
  };
}

export function parseBackup(rawText: string): AppData {
  if (rawText.length > 8_000_000) throw new Error('ব্যাকআপটি ৮ MB-এর কম হতে হবে।');
  let raw: unknown;
  try { raw = JSON.parse(rawText); } catch { throw new Error('এটি সঠিক JSON ব্যাকআপ নয়।'); }
  if (!object(raw)) throw new Error('ব্যাকআপের মূল কাঠামো সঠিক নয়।');
  if (raw.version !== 1 && raw.version !== 2) throw new Error('এই অ্যাপের version 1 বা 2 ব্যাকআপ নির্বাচন করো।');
  const result = freshData();
  result.settings = sanitizeSettings(raw.settings);

  if (!object(raw.completed) || Object.keys(raw.completed).length > 10000) throw new Error('অগ্রগতির তথ্য সঠিক নয়।');
  for (const [id, at] of Object.entries(raw.completed)) {
    if (!text(id, 2048) || !validAt(at)) throw new Error('অগ্রগতির তারিখ সঠিক নয়।');
    put(result.completed, id, at);
  }
  if (raw.confidence !== undefined) {
    if (!object(raw.confidence) || Object.keys(raw.confidence).length > 10000) throw new Error('আত্মবিশ্বাসের তথ্য সঠিক নয়।');
    for (const [id, level] of Object.entries(raw.confidence)) {
      if (!text(id, 180) || !confidenceLevels.has(String(level))) throw new Error('আত্মবিশ্বাসের তথ্য সঠিক নয়।');
      put(result.confidence, id, level as 'weak' | 'okay' | 'confident');
    }
  }
  if (raw.notes !== undefined) {
    if (!object(raw.notes) || Object.keys(raw.notes).length > 10000) throw new Error('দিনের নোটের তথ্য সঠিক নয়।');
    for (const [date, note] of Object.entries(raw.notes)) {
      if (!isValidDate(date) || !text(note)) throw new Error('দিনের নোটের তথ্য সঠিক নয়।');
      put(result.notes, date, note);
    }
  }
  if (raw.exams !== undefined) {
    if (!object(raw.exams)) throw new Error('মডেল টেস্টের তথ্য সঠিক নয়।');
    for (const [id, exam] of Object.entries(raw.exams)) {
      if (!paperIds.has(id) || !object(exam)) throw new Error('মডেল টেস্টের তথ্য সঠিক নয়।');
      const paper = PAPERS.find(p => p.id === id)!;
      if (typeof exam.score !== 'number' || !Number.isFinite(exam.score) || exam.score < 0 || exam.score > paper.maxScore || exam.total !== paper.maxScore || !validAt(exam.at) || !text(exam.mistakes, 5000)) throw new Error('মডেল টেস্টের নম্বর বা তথ্য সঠিক নয়।');
      put(result.exams, id, { score: exam.score, total: exam.total, at: exam.at, mistakes: exam.mistakes });
    }
  }
  const mistakeCategories = new Set<MistakeCategory>(['conceptual', 'calculation', 'memory', 'misunderstood', 'careless']);
  const mistakeRetries = new Set<MistakeRetry>(['pending', 'retried', 'mastered']);
  result.mistakes = listOf(raw.mistakes, MISTAKE_LIMIT, 'ভুলের খাতা', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !nonEmpty(item.text, 5000) || !optionalChapter(item.chapterId) || !text(item.date, 10) || !isValidDate(item.date) || !bool(item.resolved)) throw new Error('ভুলের খাতার তথ্য সঠিক নয়।');
    if (item.chapterId && chapterById[item.chapterId].subject !== item.subject) throw new Error('ভুলের অধ্যায় ও বিষয় মিলছে না।');
    const category = mistakeCategories.has(item.category as MistakeCategory) ? (item.category as MistakeCategory) : 'careless';
    const retryStatus = mistakeRetries.has(item.retryStatus as MistakeRetry) ? (item.retryStatus as MistakeRetry) : 'pending';
    return { id: item.id, subject: item.subject, chapterId: item.chapterId, text: item.text, correctAnswer: optionalText(item.correctAnswer, 5000, 'সঠিক উত্তর সঠিক নয়।'), userAnswer: optionalText(item.userAnswer, 5000, 'আপনার উত্তর সঠিক নয়।'), date: item.date, category, retryStatus, resolved: item.resolved };
  });
  if (new Set(result.mistakes.map(m => m.id)).size !== result.mistakes.length) throw new Error('ভুলের খাতায় একই ID দুইবার আছে।');
  if (raw.focus !== undefined) {
    if (!object(raw.focus) || !int(raw.focus.minutes, 0, 10_000_000) || !int(raw.focus.sessions, 0, 1_000_000)) throw new Error('ফোকাস টাইমারের তথ্য সঠিক নয়।');
    result.focus = { minutes: Number(raw.focus.minutes), sessions: Number(raw.focus.sessions) };
  }

  result.studySessions = listOf(raw.studySessions, LIMITS.sessions, 'স্টাডি সেশন', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.at) || !int(item.minutes, 1, 720) || !optionalChapter(item.chapterId) || !studyModes.has(item.mode as StudyMode)) throw new Error('স্টাডি সেশনের তথ্য সঠিক নয়।');
    return { id: item.id, date: item.date, at: item.at, minutes: Number(item.minutes), subject: item.subject, chapterId: item.chapterId, mode: item.mode as StudyMode, label: optionalText(item.label, 120, 'সেশনের নাম সঠিক নয়।') };
  });

  result.revisions = listOf(raw.revisions, LIMITS.revisions, 'রিভিশন', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.chapterId, 180) || !chapterIds.has(item.chapterId) || !isSubject(item.subject) || !text(item.dueDate, 10) || !isValidDate(item.dueDate) || !validAt(item.createdAt) || !intervals.has(item.interval as RevisionInterval)) throw new Error('রিভিশনের তথ্য সঠিক নয়।');
    if (chapterById[item.chapterId].subject !== item.subject) throw new Error('রিভিশনের বিষয় ও অধ্যায় মিলছে না।');
    return { id: item.id, chapterId: item.chapterId, subject: item.subject, dueDate: item.dueDate, interval: item.interval as RevisionInterval, createdAt: item.createdAt, completedAt: optionalAt(item.completedAt, 'রিভিশনের তারিখ সঠিক নয়।'), sourceTaskId: optionalText(item.sourceTaskId, 180, 'রিভিশনের তথ্য সঠিক নয়।'), recall: recalls.has(String(item.recall)) ? item.recall as RecallRating : undefined, adjusted: item.adjusted === true ? true : undefined };
  });

  if (raw.chapterMeta !== undefined) {
    if (!object(raw.chapterMeta) || Object.keys(raw.chapterMeta).length > 1000) throw new Error('অধ্যায়ের তথ্য সঠিক নয়।');
    for (const [id, meta] of Object.entries(raw.chapterMeta)) {
      if (!chapterIds.has(id) || !object(meta)) throw new Error('অধ্যায়ের তথ্য সঠিক নয়।');
      const cq = meta.cq === undefined ? 'none' : meta.cq;
      const mcq = meta.mcq === undefined ? 'none' : meta.mcq;
      if (!prepLevels.has(cq as PrepStatus) || !prepLevels.has(mcq as PrepStatus) || !text(meta.note ?? '', 5000) || !bool(meta.weak ?? false) || (meta.updatedAt !== undefined && !validAt(meta.updatedAt))) throw new Error('অধ্যায়ের তথ্য সঠিক নয়।');
      const priority = meta.priority;
      const stage = meta.stage;
      if (priority !== undefined && !['A', 'B', 'C'].includes(String(priority))) throw new Error('অধ্যায়ের অগ্রাধিকার সঠিক নয়।');
      if (stage !== undefined && !['notStarted', 'inProgress', 'completed', 'revisionNeeded', 'fullyRevised'].includes(String(stage))) throw new Error('অধ্যায়ের অবস্থা সঠিক নয়।');
      let steps: import('./types').ChapterMeta['steps'];
      if (meta.steps !== undefined) {
        if (!object(meta.steps)) throw new Error('অধ্যায়ের ধাপ সঠিক নয়।');
        steps = {};
        for (const key of ['class', 'reading', 'cqPractice', 'mcqPractice', 'boardPractice', 'revision'] as const) {
          if (meta.steps[key] !== undefined && !bool(meta.steps[key])) throw new Error('অধ্যায়ের ধাপ সঠিক নয়।');
          if (meta.steps[key] !== undefined) steps[key] = meta.steps[key] as boolean;
        }
      }
      put(result.chapterMeta, id, { note: (meta.note as string) ?? '', weak: (meta.weak as boolean) ?? false, cq: cq as PrepStatus, mcq: mcq as PrepStatus, updatedAt: (meta.updatedAt as string) ?? new Date().toISOString(), ...(priority !== undefined ? { priority: priority as import('./data').Priority } : {}), ...(stage !== undefined ? { stage: stage as import('./types').ChapterStage } : {}), ...(steps ? { steps } : {}) });
    }
  }

  result.questions = listOf(raw.questions, LIMITS.questions, 'প্রশ্ন', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !nonEmpty(item.question, 2000) || !Array.isArray(item.options) || item.options.length !== 4 || item.options.some(o => !nonEmpty(o, 500)) || !int(item.answer, 0, 3) || !validAt(item.createdAt)) throw new Error('প্রশ্নের তথ্য সঠিক নয়।');
    if (item.chapterId && chapterById[item.chapterId].subject !== item.subject) throw new Error('প্রশ্নের বিষয় ও অধ্যায় মিলছে না।');
    return { id: item.id, subject: item.subject, chapterId: item.chapterId, question: item.question, options: item.options as string[], answer: Number(item.answer), explanation: optionalText(item.explanation, 2000, 'ব্যাখ্যা সঠিক নয়।'), source: optionalText(item.source, 200, 'সূত্র সঠিক নয়।'), createdAt: item.createdAt };
  });

  if (raw.activeExam !== undefined) {
    const exam = raw.activeExam;
    const known = new Set([...BUILTIN_QUESTION_IDS, ...result.questions.map(q => q.id)]);
    if (!object(exam) || !nonEmpty(exam.id, 180) || !nonEmpty(exam.title, 200) || !examModes.has(exam.mode as ExamMode) || (exam.subject !== undefined && !isSubject(exam.subject)) || (exam.cadence !== undefined && !examCadences.has(exam.cadence as ExamCadence)) || !Array.isArray(exam.questionIds) || exam.questionIds.length < 1 || exam.questionIds.length > 50 || exam.questionIds.some(id => !nonEmpty(id, 180) || !known.has(id)) || new Set(exam.questionIds).size !== exam.questionIds.length || !int(exam.index, 0, exam.questionIds.length - 1) || !int(exam.startedAt, 1, 8_640_000_000_000_000) || !int(exam.deadline, 1, 8_640_000_000_000_000) || Number(exam.deadline) - Number(exam.startedAt) !== Math.max(5, exam.questionIds.length) * 60_000 || !object(exam.answers) || Object.entries(exam.answers).some(([id, answer]) => !(exam.questionIds as unknown[]).includes(id) || !int(answer, 0, 3))) throw new Error('চলমান পরীক্ষার উত্তরপত্র সঠিক নয়।');
    const answers: Record<string, number> = {};
    for (const [id, answer] of Object.entries(exam.answers)) put(answers, id, Number(answer));
    result.activeExam = { id: exam.id, title: exam.title, mode: exam.mode as ExamMode, ...(exam.subject ? { subject: exam.subject as import('./data').SubjectId } : {}), questionIds: exam.questionIds as string[], answers, index: Number(exam.index), startedAt: Number(exam.startedAt), deadline: Number(exam.deadline), ...(exam.cadence ? { cadence: exam.cadence as ExamCadence } : {}) };
  }

  result.attempts = listOf(raw.attempts, LIMITS.attempts, 'উত্তরের রেকর্ড', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.questionId, 180) || !isSubject(item.subject) || !int(item.chosen, 0, 3) || !bool(item.correct) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.at)) throw new Error('উত্তরের রেকর্ড সঠিক নয়।');
    return { id: item.id, questionId: item.questionId, subject: item.subject, chosen: Number(item.chosen), correct: item.correct, date: item.date, at: item.at };
  });

  result.cq = listOf(raw.cq, LIMITS.cq, 'CQ অনুশীলন', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !nonEmpty(item.question, 5000) || !num(item.marks, 0, Number.MAX_VALUE) || !num(item.total, Number.MIN_VALUE, Number.MAX_VALUE) || Number(item.marks) > Number(item.total) || !text(item.note, 5000) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.at)) throw new Error('CQ অনুশীলনের তথ্য সঠিক নয়।');
    return { id: item.id, subject: item.subject, chapterId: item.chapterId, question: item.question, marks: Number(item.marks), total: Number(item.total), note: item.note, date: item.date, at: item.at, mistakeId: optionalText(item.mistakeId, 180, 'CQ তথ্য সঠিক নয়।'), parts: partsOf(item.parts, Number(item.total)) };
  });

  result.tests = listOf(raw.tests, LIMITS.tests, 'পরীক্ষা', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !testKinds.has(item.kind as TestKind) || !nonEmpty(item.title, 200) || (item.subject !== undefined && !isSubject(item.subject)) || !Array.isArray(item.chapterIds) || item.chapterIds.length > 40 || item.chapterIds.some(c => typeof c !== 'string' || !chapterIds.has(c)) || !num(item.score, 0, Number.MAX_VALUE) || !num(item.total, Number.MIN_VALUE, Number.MAX_VALUE) || Number(item.score) > Number(item.total) || !num(item.durationMin, 0, 1440) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.at) || !text(item.notes, 5000)) throw new Error('পরীক্ষার তথ্য সঠিক নয়।');
    return { id: item.id, kind: item.kind as TestKind, title: item.title, subject: item.subject, chapterIds: item.chapterIds as string[], score: Number(item.score), total: Number(item.total), durationMin: Number(item.durationMin), date: item.date, at: item.at, notes: item.notes };
  });

  result.retries = listOf(raw.retries, LIMITS.retries, 'পুনরায় পরীক্ষার তালিকা', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.questionId, 180) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !text(item.source, 200) || !nonEmpty(item.schedule, 40) || !/^(\d{1,3})(,\d{1,3}){0,4}$/.test(item.schedule) || item.schedule.split(',').some(step => [1, 3, 7, 14, 30].includes(Number(step)) === false) || !int(item.replayed, 0, 5) || !bool(item.cleared) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.at) || !validAt(item.lastAt)) throw new Error('পুনরায় পরীক্ষার তথ্য সঠিক নয়।');
    if (item.chapterId && chapterById[item.chapterId].subject !== item.subject) throw new Error('পুনরায় পরীক্ষার অধ্যায় ও বিষয় মিলছে না।');
    return { ...item, id: item.id, questionId: item.questionId, subject: item.subject, chapterId: item.chapterId, source: item.source, schedule: item.schedule, replayed: Number(item.replayed), cleared: item.cleared, date: item.date, at: item.at, lastAt: item.lastAt };
  });

  result.examSessions = listOf(raw.examSessions, LIMITS.examSessions, 'সিমুলেটেড পরীক্ষা', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !examModes.has(item.mode as ExamMode) || !nonEmpty(item.title, 200) || (item.subject !== undefined && !isSubject(item.subject)) || !Array.isArray(item.chapterIds) || item.chapterIds.length > 40 || item.chapterIds.some(c => typeof c !== 'string' || !chapterIds.has(c)) || !Array.isArray(item.questionIds) || item.questionIds.length < 1 || item.questionIds.length > 200 || item.questionIds.some(q => !nonEmpty(q, 180)) || !object(item.answers) || Object.keys(item.answers).length > 200 || !int(item.score, 0, 200) || !int(item.total, 1, 200) || Number(item.score) > Number(item.total) || !int(item.durationMin, 1, 1440) || !int(item.timeTakenSec, 0, 86400) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.at) || !Array.isArray(item.breakdown) || item.breakdown.length > 40) throw new Error('সিমুলেটেড পরীক্ষার তথ্য সঠিক নয়।');
    const answers: Record<string, number> = {};
    for (const [key, value] of Object.entries(item.answers)) {
      if (!nonEmpty(key, 180) || !int(value, 0, 3)) throw new Error('সিমুলেটেড পরীক্ষার উত্তর সঠিক নয়।');
      put(answers, key, Number(value));
    }
    const breakdown = item.breakdown.map(row => {
      if (!object(row) || !optionalChapter(row.chapterId) || !isSubject(row.subject) || !int(row.correct, 0, 200) || !int(row.total, 0, 200) || Number(row.correct) > Number(row.total)) throw new Error('সিমুলেটেড পরীক্ষার বিশ্লেষণ সঠিক নয়।');
      if (row.chapterId && chapterById[row.chapterId].subject !== row.subject) throw new Error('সিমুলেটেড পরীক্ষার অধ্যায় ও বিষয় মিলছে না।');
      return { ...(row.chapterId ? { chapterId: row.chapterId } : {}), subject: row.subject, correct: Number(row.correct), total: Number(row.total) };
    });
    if (item.cadence !== undefined && !examCadences.has(item.cadence as ExamCadence)) throw new Error('সিমুলেটেড পরীক্ষার ধরন সঠিক নয়।');
    return { id: item.id, mode: item.mode as ExamMode, title: item.title, ...(item.cadence !== undefined ? { cadence: item.cadence as ExamCadence } : {}), subject: item.subject as AppData['mistakes'][number]['subject'] | undefined, chapterIds: item.chapterIds as string[], questionIds: item.questionIds as string[], answers, score: Number(item.score), total: Number(item.total), durationMin: Number(item.durationMin), timeTakenSec: Number(item.timeTakenSec), date: item.date, at: item.at, breakdown };
  });

  result.libraryNotes = listOf(raw.libraryNotes, LIMITS.libraryNotes, 'নোট লাইব্রেরি', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.title, 200) || !text(item.body, 20000) || (item.subject !== undefined && !isSubject(item.subject)) || !optionalChapter(item.chapterId) || !bool(item.pinned) || !validAt(item.createdAt) || !validAt(item.updatedAt)) throw new Error('নোট লাইব্রেরির তথ্য সঠিক নয়।');
    return { id: item.id, title: item.title, body: item.body, subject: item.subject, chapterId: item.chapterId, tags: tagsOf(item.tags), pinned: item.pinned, createdAt: item.createdAt, updatedAt: item.updatedAt };
  });

  result.videos = listOf(raw.videos, LIMITS.videos, 'ভিডিও লাইব্রেরি', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.title, 300) || !nonEmpty(item.url, 2000) || !/^https?:\/\//i.test(item.url) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !bool(item.watched) || !bool(item.favorite) || !bool(item.downloaded) || !bool(item.completed) || !validAt(item.createdAt)) throw new Error('ভিডিও লাইব্রেরির তথ্য সঠিক নয়।');
    const playbackSpeeds = new Set([0.5, 0.75, 1, 1.25, 1.5, 2]);
    if ((item.durationSec !== undefined && !int(Number(item.durationSec), 0, 86400)) || (item.fileSizeBytes !== undefined && !int(Number(item.fileSizeBytes), 0, 2_000_000_000)) || (item.watchedPositionSec !== undefined && !int(Number(item.watchedPositionSec), 0, 86400)) || (item.watchedPercent !== undefined && !num(item.watchedPercent, 0, 100)) || !playbackSpeeds.has((item.playbackSpeed ?? 1) as number)) throw new Error('ভিডিও ট্র্যাকিং তথ্য সঠিক নয়।');
    if (item.sourceUrl !== undefined && (typeof item.sourceUrl !== 'string' || !/^https?:\/\//i.test(item.sourceUrl))) throw new Error('ভিডিও সোর্স লিংক সঠিক নয়।');
    return {
      id: item.id, title: item.title, url: item.url, subject: item.subject,
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      ...(item.chapterId !== undefined ? { chapterId: item.chapterId } : {}),
      ...(typeof item.channel === 'string' ? { channel: item.channel } : {}),
      watched: item.watched, favorite: item.favorite, downloaded: item.downloaded,
      ...(typeof item.localPath === 'string' ? { localPath: item.localPath } : {}),
      watchedPositionSec: Number(item.watchedPositionSec ?? 0),
      watchedPercent: Number(item.watchedPercent ?? 0),
      playbackSpeed: item.playbackSpeed ?? 1,
      completed: item.completed,
      ...(item.attachments ? { attachments: item.attachments } : {}),
      createdAt: item.createdAt,
    } as VideoLink;
  });

  result.boardQuestions = listOf(raw.boardQuestions, LIMITS.boardQuestions, 'বোর্ড প্রশ্ন', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.board, 60) || !int(item.year, 1990, 2041) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !['CQ', 'MCQ'].includes(String(item.type)) || !nonEmpty(item.text, 5000) || !num(item.marks, 0, 100) || !bool(item.bookmarked) || !validAt(item.createdAt)) throw new Error('বোর্ড প্রশ্নের তথ্য সঠিক নয়।');
    return { id: item.id, board: item.board, year: Number(item.year), subject: item.subject, chapterId: item.chapterId, type: item.type as 'CQ' | 'MCQ', text: item.text, marks: Number(item.marks), bookmarked: item.bookmarked, createdAt: item.createdAt };
  });

  result.formulas = listOf(raw.formulas, LIMITS.formulas, 'সূত্র', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !nonEmpty(item.title, 200) || !nonEmpty(item.body, 5000) || !optionalChapter(item.chapterId) || !bool(item.favorite) || !validAt(item.createdAt)) throw new Error('সূত্রের তথ্য সঠিক নয়।');
    return { id: item.id, subject: item.subject, title: item.title, body: item.body, chapterId: item.chapterId, favorite: item.favorite, createdAt: item.createdAt };
  });

  result.formulaFavorites = raw.formulaFavorites === undefined ? [] : listOf(raw.formulaFavorites, 1000, 'সূত্রের প্রিয় তালিকা', value => {
    if (!nonEmpty(value, 200)) throw new Error('সূত্রের প্রিয় তালিকা সঠিক নয়।');
    return value;
  });

  const flashcardCategories = new Set<FlashcardCategory>(['formula', 'definition', 'reaction', 'terminology', 'identity', 'vocabulary', 'other']);
  if (raw.flashcards !== undefined) {
    result.flashcards = listOf(raw.flashcards, LIMITS.flashcards, 'ফ্ল্যাশকার্ড', item => {
      if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !nonEmpty(item.front, 2000) || !nonEmpty(item.back, 5000) || !flashcardCategories.has(item.category as FlashcardCategory) || !int(Number(item.interval), 0, 365) || !text(item.dueDate, 10) || !isValidDate(item.dueDate) || (item.lastReviewed !== undefined && !validReviewDate(item.lastReviewed)) || !int(Number(item.repetitions), 0, 100000) || !num(item.easeFactor, 1.3, 10) || !validAt(item.createdAt)) throw new Error('ফ্ল্যাশকার্ডের তথ্য সঠিক নয়।');
      if (item.chapterId && chapterById[item.chapterId].subject !== item.subject) throw new Error('ফ্ল্যাশকার্ডের অধ্যায় ও বিষয় মিলছে না।');
      return { id: item.id, subject: item.subject, chapterId: item.chapterId, front: item.front, back: item.back, category: item.category as Flashcard['category'], interval: Number(item.interval), dueDate: item.dueDate, ...(item.lastReviewed ? { lastReviewed: item.lastReviewed } : {}), repetitions: Number(item.repetitions), easeFactor: Number(item.easeFactor), createdAt: item.createdAt };
    });
    if (new Set(result.flashcards.map(card => card.id)).size !== result.flashcards.length) throw new Error('ফ্ল্যাশকার্ড তালিকায় একই ID দুইবার আছে।');
  }
  if (raw.flashcardReviews !== undefined) {
    result.flashcards = result.flashcards; // reviews are summarized into the card state; the list is accepted for compatibility
    if (!Array.isArray(raw.flashcardReviews) || raw.flashcardReviews.length > LIMITS.flashcardReviews) throw new Error('ফ্ল্যাশকার্ড রিভিউর তথ্য সঠিক নয়।');
  }

  if (raw.gpaMarks !== undefined) {
    if (!object(raw.gpaMarks) || Object.keys(raw.gpaMarks).length > 7) throw new Error('GPA নম্বরের তথ্য সঠিক নয়।');
    for (const [id, value] of Object.entries(raw.gpaMarks)) {
      if (!subjectIds.has(id) || !(value === null || num(value, 0, 1000))) throw new Error('GPA নম্বরের তথ্য সঠিক নয়।');
      put(result.gpaMarks, id, value as number | null);
    }
  }

  result.carryovers = listOf(raw.carryovers, LIMITS.carryovers, 'ব্যাকলগ', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.taskId, 180) || !nonEmpty(item.title, 300) || !isSubject(item.subject) || !int(item.minutes, 1, 720) || !text(item.fromDate, 10) || !isValidDate(item.fromDate) || !text(item.date, 10) || !isValidDate(item.date) || !validAt(item.createdAt)) throw new Error('ব্যাকলগের তথ্য সঠিক নয়।');
    return { id: item.id, taskId: item.taskId, title: item.title, subject: item.subject, minutes: Number(item.minutes), fromDate: item.fromDate, date: item.date, createdAt: item.createdAt, completedAt: optionalAt(item.completedAt, 'ব্যাকলগের তারিখ সঠিক নয়।') };
  });

  // Repair backups written by earlier versions that let carried copies drift from the original.
  result.carryovers = result.carryovers.map(item => ({ ...item, completedAt: result.completed[item.taskId] || undefined }));

  result.routineBlocks = listOf(raw.routineBlocks, LIMITS.routineBlocks, 'কাস্টম রুটিন', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !int(item.weekday, 0, 6) || !int(item.startMinute, 0, 1439) || !int(item.minutes, 15, 480) || !isSubject(item.subject) || !text(item.title, 120) || !validAt(item.createdAt)) throw new Error('কাস্টম রুটিনের তথ্য সঠিক নয়।');
    if (item.date !== undefined && (typeof item.date !== 'string' || !isValidDate(item.date) || new Date(`${item.date}T00:00:00Z`).getUTCDay() !== item.weekday)) throw new Error('কাস্টম রুটিনের তারিখ সঠিক নয়।');
    return { id: item.id, ...(item.date !== undefined ? { date: item.date as string } : {}), weekday: Number(item.weekday), startMinute: Number(item.startMinute), minutes: Number(item.minutes), subject: item.subject, title: item.title.trim(), createdAt: item.createdAt };
  });
  if (new Set(result.routineBlocks.map(block => block.id)).size !== result.routineBlocks.length) throw new Error('কাস্টম রুটিনে একই ID দুইবার আছে।');

  result.importantDates = listOf(raw.importantDates, LIMITS.importantDates, 'গুরুত্বপূর্ণ তারিখ', item => {
    if (!object(item) || !nonEmpty(item.id, 180) || !text(item.date, 10) || !isValidDate(item.date) || !nonEmpty(item.title, 200) || !text(item.note, 2000) || !bool(item.notify) || !validAt(item.createdAt)) throw new Error('গুরুত্বপূর্ণ তারিখের তথ্য সঠিক নয়।');
    return { id: item.id, date: item.date, title: item.title, note: item.note, notify: item.notify, createdAt: item.createdAt };
  });
  if (new Set(result.importantDates.map(item => item.id)).size !== result.importantDates.length) throw new Error('গুরুত্বপূর্ণ তারিখে একই ID দুইবার আছে।');

  result.badges = raw.badges === undefined ? [] : listOf(raw.badges, LIMITS.badges, 'ব্যাজ', value => {
    if (!nonEmpty(value, 60)) throw new Error('ব্যাজের তথ্য সঠিক নয়।');
    return value;
  });
  if (raw.classWatched !== undefined) {
    if (!object(raw.classWatched) || Object.keys(raw.classWatched).length > LIMITS.classWatched) throw new Error('দেখা ক্লাসের তালিকা সঠিক নয়।');
    for (const [key, value] of Object.entries(raw.classWatched)) {
      if (!nonEmpty(key, 500) || !validAt(value)) throw new Error('দেখা ক্লাসের তালিকা সঠিক নয়।');
      put(result.classWatched, key, value);
    }
  }
  if (raw.dayOverrides !== undefined) {
    if (!object(raw.dayOverrides) || Object.keys(raw.dayOverrides).length > 1500) throw new Error('দিনের কাস্টম সময়ের তথ্য সঠিক নয়।');
    for (const [date, ov] of Object.entries(raw.dayOverrides)) {
      if (!isValidDate(date) || !object(ov)) throw new Error('দিনের কাস্টম সময়ের তথ্য সঠিক নয়।');
      const parsedOv: DayScheduleOverride = {};
      if (ov.startMinute !== undefined) {
        if (!int(Number(ov.startMinute), 0, 1439)) throw new Error('দিনের শুরুর সময় সঠিক নয়।');
        parsedOv.startMinute = Number(ov.startMinute);
      }
      if (ov.dailyHours !== undefined) {
        if (!int(Number(ov.dailyHours), 4, 18)) throw new Error('দিনের পড়ার ঘণ্টা সঠিক নয়।');
        parsedOv.dailyHours = Number(ov.dailyHours);
      }
      if (ov.taskMinutes !== undefined) {
        if (!object(ov.taskMinutes) || Object.keys(ov.taskMinutes).length > 50) throw new Error('সেশনের সময়ের তথ্য সঠিক নয়।');
        parsedOv.taskMinutes = {};
        for (const [tId, mins] of Object.entries(ov.taskMinutes)) {
          if (!nonEmpty(tId, 180) || !int(Number(mins), 15, 720)) throw new Error('সেশনের সময়ের তথ্য সঠিক নয়।');
          put(parsedOv.taskMinutes, tId, Number(mins));
        }
      }
      if (ov.taskStartMinutes !== undefined) {
        if (!object(ov.taskStartMinutes) || Object.keys(ov.taskStartMinutes).length > 50) throw new Error('সেশনের শুরুর সময়ের তথ্য সঠিক নয়।');
        parsedOv.taskStartMinutes = {};
        for (const [tId, sm] of Object.entries(ov.taskStartMinutes)) {
          if (!nonEmpty(tId, 180) || !int(Number(sm), 0, 2879)) throw new Error('সেশনের শুরুর সময়ের তথ্য সঠিক নয়।');
          put(parsedOv.taskStartMinutes, tId, Number(sm));
        }
      }
      put(result.dayOverrides, date, parsedOv);
    }
  }

  // --- Version-2.14 additions: every field is optional so older v1/v2 backups keep loading. ---
  if (raw.classBookmarks !== undefined) {
    if (!object(raw.classBookmarks) || Object.keys(raw.classBookmarks).length > LIMITS.classBookmarks) throw new Error('বুকমার্ক করা ক্লাসের তালিকা সঠিক নয়।');
    for (const [key, value] of Object.entries(raw.classBookmarks)) {
      if (!nonEmpty(key, 500) || !validAt(value)) throw new Error('বুকমার্ক করা ক্লাসের তালিকা সঠিক নয়।');
      put(result.classBookmarks, key, value);
    }
  }
  if (raw.pdfs !== undefined) {
    result.pdfs = listOf(raw.pdfs, LIMITS.pdfs, 'পিডিএফ', item => {
      if (!object(item) || !nonEmpty(item.id, 180) || !nonEmpty(item.title, 300)
        || (item.url !== undefined && (typeof item.url !== 'string' || item.url.length > 2000 || !/^https?:\/\//i.test(item.url)))
        || (item.local !== undefined && !bool(item.local))
        || (item.subject !== undefined && !isSubject(item.subject))
        || !optionalChapter(item.chapterId)
        || !PDF_MATERIAL_IDS.has(String(item.material))
        || (item.sizeBytes !== undefined && !int(Number(item.sizeBytes), 0, 2_000_000_000))
        || !validAt(item.createdAt)
        || (item.lastOpenedAt !== undefined && item.lastOpenedAt !== null && !validAt(item.lastOpenedAt))) throw new Error('পিডিএফের তথ্য সঠিক নয়।');
      if (item.local !== true && !item.url) throw new Error('পিডিএফের লিংক বা লোকাল ফাইল নেই।');
      return {
        ...Object.fromEntries(['teacher', 'className', 'classId', 'sourceUrl', 'fingerprint', 'linkStatus'].flatMap(key => {
          const value = item[key];
          if (value === undefined) return [];
          if (typeof value !== 'string' || value.length > 2000 || (key === 'linkStatus' && !['available','broken','unverified'].includes(value)) || (key === 'sourceUrl' && value && !/^https?:\/\//i.test(value))) throw new Error('Resource metadata invalid');
          return [[key, value]];
        })),
        id: item.id, title: item.title, ...(item.url ? { url: item.url as string } : {}),
        ...(item.local === true ? { local: true } : {}), ...(item.subject !== undefined ? { subject: item.subject as import('./types').PdfResource['subject'] } : {}),
        ...(item.chapterId !== undefined ? { chapterId: item.chapterId as string } : {}),
        material: item.material as import('./types').PdfResource['material'],
        ...(item.sizeBytes !== undefined ? { sizeBytes: Number(item.sizeBytes) } : {}),
        createdAt: item.createdAt, ...(item.lastOpenedAt ? { lastOpenedAt: item.lastOpenedAt as string } : {}),
      };
    });
    if (new Set(result.pdfs.map(item => item.id)).size !== result.pdfs.length) throw new Error('পিডিএফ তালিকায় একই ID দুইবার আছে।');
  }
  if (raw.pdfBookmarks !== undefined) {
    result.pdfBookmarks = listOf(raw.pdfBookmarks, LIMITS.pdfBookmarks, 'পিডিএফ বুকমার্ক', value => {
      if (!nonEmpty(value, 180)) throw new Error('পিডিএফ বুকমার্ক সঠিক নয়।');
      return value;
    });
  }
  if (raw.pdfRecent !== undefined) {
    result.pdfRecent = listOf(raw.pdfRecent, LIMITS.pdfRecent, 'সাম্প্রতিক পিডিএফ', item => {
      if (!object(item) || !nonEmpty(item.id, 180) || !validAt(item.at)) throw new Error('সাম্প্রতিক পিডিএফের তথ্য সঠিক নয়।');
      return { id: item.id, at: item.at };
    });
  }
  if (raw.lockedDates !== undefined) {
    result.lockedDates = listOf(raw.lockedDates, LIMITS.lockedDates, 'লক করা তারিখ', value => {
      if (typeof value !== 'string' || !isValidDate(value)) throw new Error('লক করা তারিখ সঠিক নয়।');
      return value;
    });
  }
  if (raw.taskEdits !== undefined) {
    if (!object(raw.taskEdits) || Object.keys(raw.taskEdits).length > LIMITS.taskEdits) throw new Error('সেশন সম্পাদনার তথ্য সঠিক নয়।');
    for (const [taskId, edit] of Object.entries(raw.taskEdits)) {
      if (!nonEmpty(taskId, 180) || !object(edit)) throw new Error('সেশন সম্পাদনার তথ্য সঠিক নয়।');
      const parsed: import('./types').TaskEdit = {};
      if (edit.date !== undefined) {
        if (typeof edit.date !== 'string' || !isValidDate(edit.date)) throw new Error('সেশনের তারিখ সঠিক নয়।');
        parsed.date = edit.date;
      }
      if (edit.subject !== undefined) {
        if (!isSubject(edit.subject)) throw new Error('সেশনের বিষয় সঠিক নয়।');
        parsed.subject = edit.subject as import('./types').TaskEdit['subject'];
      }
      if (edit.title !== undefined) {
        if (!text(edit.title, 300)) throw new Error('সেশনের শিরোনাম সঠিক নয়।');
        parsed.title = edit.title;
      }
      if (edit.chapterIds !== undefined) {
        if (!Array.isArray(edit.chapterIds) || edit.chapterIds.length > 10 || edit.chapterIds.some(id => typeof id !== 'string' || !chapterIds.has(id))) throw new Error('সেশনের অধ্যায় সঠিক নয়।');
        parsed.chapterIds = edit.chapterIds as string[];
      }
      put(result.taskEdits, taskId, parsed);
    }
  }
  if (raw.removedTasks !== undefined) {
    result.removedTasks = listOf(raw.removedTasks, LIMITS.removedTasks, 'মুছে ফেলা সেশন', value => {
      if (!nonEmpty(value, 180)) throw new Error('মুছে ফেলা সেশনের তালিকা সঠিক নয়।');
      return value;
    });
  }
  if (raw.scannedNotes !== undefined) {
    result.scannedNotes = listOf(raw.scannedNotes, LIMITS.scannedNotes, 'স্ক্যান করা নোট', item => {
      if (!object(item) || !nonEmpty(item.id, 180) || !isSubject(item.subject) || !optionalChapter(item.chapterId) || !nonEmpty(item.title, 300) || !text(item.createdAt, 40) || !validAt(item.createdAt) || !int(Number(item.pageCount), 1, 50) || !int(Number(item.sizeBytes), 0, 2_000_000_000) || !bool(item.pdfExported) || !Array.isArray(item.pageKeys) || item.pageKeys.length > 100 || item.pageKeys.some(key => !nonEmpty(key, 180) || !key.startsWith('scan:'))) throw new Error('স্ক্যান করা নোটের তথ্য সঠিক নয়।');
      return { id: item.id, subject: item.subject, ...(item.chapterId !== undefined ? { chapterId: item.chapterId } : {}), title: item.title, createdAt: item.createdAt, pageCount: Number(item.pageCount), sizeBytes: Number(item.sizeBytes), pdfExported: item.pdfExported, pageKeys: item.pageKeys as string[] } as ScannedNoteMeta;
    });
    if (new Set(result.scannedNotes.map(n => n.id)).size !== result.scannedNotes.length) throw new Error('স্ক্যান করা নোট তালিকায় একই ID দুইবার আছে।');
  }

  if (raw.advanced !== undefined) result.advanced = parseAdvanced(raw.advanced);
  if (raw.routineSetupRequired !== undefined) {
    if (typeof raw.routineSetupRequired !== 'boolean') throw new Error('Routine setup flag invalid');
    result.routineSetupRequired = raw.routineSetupRequired;
  }
  if (raw.personalRoutine !== undefined) result.personalRoutine = parsePersonalRoutine(raw.personalRoutine);
  if (raw.personalPhases !== undefined) {
    if (!object(raw.personalPhases) || Object.keys(raw.personalPhases).some(key => !['S', 'A', 'B', 'C'].includes(key))) throw new Error('Personal phases invalid');
    result.personalPhases = {};
    for (const scope of ['S', 'A', 'B', 'C'] as const) if (raw.personalPhases[scope] !== undefined) {
      const routine = parsePersonalRoutine(raw.personalPhases[scope]);
      if (routine.scope !== scope || result.personalRoutine?.scope === scope) throw new Error('Personal phase scope invalid');
      result.personalPhases[scope] = routine;
    }
    const selected = [result.personalRoutine?.scope === 'ALL' || result.personalRoutine?.scope === 'SELECTED' ? undefined : result.personalRoutine, ...Object.values(result.personalPhases)].flatMap(routine => routine?.chapterIds || []);
    if (new Set(selected).size !== selected.length) throw new Error('Personal phase chapters overlap');
  }
  if (result.personalRoutine && result.personalRoutine.scope !== 'S' && result.personalRoutine.scope !== 'ALL' && result.personalRoutine.scope !== 'SELECTED' && !result.personalPhases?.S) throw new Error('A later personal phase must retain its S prerequisite.');
  if (raw.studyBrain !== undefined) result.studyBrain = parseStudyBrain(raw.studyBrain);
  if (raw.customChapters !== undefined) {
    result.customChapters = listOf(raw.customChapters, 500, 'নিজের যোগ করা অধ্যায়', item => {
      if (!object(item) || !nonEmpty(item.id, 180) || !item.id.startsWith('custom-') || !isSubject(item.subject)
        || (item.paper !== 1 && item.paper !== 2) || !nonEmpty(item.number, 40) || !nonEmpty(item.title, 300)
        || !['A', 'B', 'C'].includes(String(item.priority)) || !num(item.effort, 1, 10)
        || !text(item.focus, 1000) || (item.note !== undefined && !text(item.note, 1000))) throw new Error('নিজের যোগ করা অধ্যায়ের তথ্য সঠিক নয়।');
      return {
        id: item.id, subject: item.subject as import('./data').SubjectId, paper: item.paper as 1 | 2,
        number: item.number, title: item.title, priority: item.priority as 'A' | 'B' | 'C',
        effort: Number(item.effort), focus: item.focus, ...(item.note !== undefined ? { note: item.note } : {}),
      };
    });
    if (new Set(result.customChapters.map(chapter => chapter.id)).size !== result.customChapters.length) throw new Error('নিজের যোগ করা অধ্যায়ে একই ID দুইবার আছে।');
  }
  if (raw.chapterOverrides !== undefined) {
    if (!object(raw.chapterOverrides) || Object.keys(raw.chapterOverrides).length > 1000) throw new Error('অধ্যায়ের পরিবর্তনের তথ্য সঠিক নয়।');
    const overrides: Record<string, import('./chapterStore').ChapterOverride> = {};
    for (const [id, override] of Object.entries(raw.chapterOverrides)) {
      if (!chapterIds.has(id) || !object(override)) throw new Error('অধ্যায়ের পরিবর্তনের তথ্য সঠিক নয়।');
      const parsed: import('./chapterStore').ChapterOverride = {};
      if (override.paper !== undefined) {
        if (override.paper !== 1 && override.paper !== 2) throw new Error('অধ্যায়ের পত্র সঠিক নয়।');
        parsed.paper = override.paper;
      }
      if (override.title !== undefined) {
        if (!nonEmpty(override.title, 300)) throw new Error('অধ্যায়ের নাম সঠিক নয়।');
        parsed.title = override.title;
      }
      if (override.priority !== undefined) {
        if (!['A', 'B', 'C'].includes(String(override.priority))) throw new Error('অধ্যায়ের অগ্রাধিকার সঠিক নয়।');
        parsed.priority = override.priority as 'A' | 'B' | 'C';
      }
      if (override.number !== undefined) {
        if (!nonEmpty(override.number, 40)) throw new Error('অধ্যায়ের নম্বর সঠিক নয়।');
        parsed.number = override.number;
      }
      put(overrides, id, parsed);
    }
    result.chapterOverrides = overrides;
  }
  return resumeUnfinishedPersonalPhase(result);
}

export function loadData(): { data: AppData; warning: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return { data: raw ? parseBackup(raw) : { ...freshData(), routineSetupRequired: true }, warning: '' };
  } catch {
    if (raw) { try { localStorage.setItem(RECOVERY_KEY, raw); } catch { /* storage may be unavailable/full */ } }
    return { data: { ...freshData(), routineSetupRequired: true }, warning: 'সেভ করা তথ্য পড়া যায়নি। সম্ভব হলে কাঁচা তথ্য রিকভারি ফাইল হিসেবে রাখা হয়েছে; Settings থেকে নামিয়ে রাখো।' };
  }
}
export function saveData(data: AppData, forceTimestamp = false): boolean {
  try {
    const payload = JSON.stringify(data);
    // Keep the previous timestamp when nothing changed, so a newer on-device SQLite snapshot can win on startup.
    if (!forceTimestamp && localStorage.getItem(STORAGE_KEY) === payload && localStorage.getItem(SAVED_AT_KEY)) return true;
    const previousStamp = localStorage.getItem(SAVED_AT_KEY);
    const previous = Date.parse(previousStamp || '');
    // Write the small freshness marker first: if it cannot be stored, never replace
    // the user's payload. Roll it back if the (atomic, single-key) payload write fails.
    const stamp = new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
    localStorage.setItem(SAVED_AT_KEY, stamp);
    try { localStorage.setItem(STORAGE_KEY, payload); }
    catch {
      if (previousStamp === null) localStorage.removeItem(SAVED_AT_KEY);
      else localStorage.setItem(SAVED_AT_KEY, previousStamp);
      return false;
    }
    return true;
  } catch { return false; }
}
export const newId = (): string => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const nowIso = (): string => new Date().toISOString();
export const initialToday = (): string => todayKey();
export { CHAPTERS as ALL_CHAPTERS };
