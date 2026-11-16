import type { Priority, SubjectId } from './data';
import type { Language } from './i18n';

/** All additions are optional at the validation layer so old v1 backups keep working. */
export type ThemeMode = 'light' | 'dark' | 'system';
export type StudyMode = 'stopwatch' | 'countdown' | 'pomodoro';
export type PrepStatus = 'none' | 'practicing' | 'ready';
export type RevisionInterval = 1 | 3 | 7 | 14 | 30;
export type TestKind = 'chapter' | 'subject' | 'model';
/** Which pool the exam simulator draws its questions from. */
export type ExamMode = 'chapter' | 'subject' | 'full' | 'mistakes';
/** One chapter's share of a simulated paper, stored so analysis survives question edits. */
export interface ExamBreakdownRow { chapterId?: string; subject: SubjectId; correct: number; total: number }
/** A completed, auto-marked MCQ exam. `score`/`total` are correct answers over asked questions. */
export interface ExamSession {
  id: string;
  mode: ExamMode;
  title: string;
  subject?: SubjectId;
  chapterIds: string[];
  questionIds: string[];
  /** questionId → chosen option index. Unanswered questions are simply absent. */
  answers: Record<string, number>;
  score: number;
  total: number;
  durationMin: number;
  timeTakenSec: number;
  date: string;
  at: string;
  breakdown: ExamBreakdownRow[];
}
/** Reading size for the whole interface: small, comfortable (default) or large. */
export type FontScale = 'sm' | 'md' | 'lg';
/** CQ self-marking: ক (knowledge), খ (comprehension), গ (application), ঘ (higher order). */
export interface CqParts { c1: number; c2: number; c3: number; c4: number }

export interface StudySession {
  id: string;
  /** Dhaka calendar date, YYYY-MM-DD. */
  date: string;
  /** ISO instant when the session was saved. */
  at: string;
  minutes: number;
  subject: SubjectId;
  chapterId?: string;
  mode: StudyMode;
  label?: string;
}

export type RecallRating = 'weak' | 'okay' | 'good';
export interface RevisionItem {
  id: string;
  chapterId: string;
  subject: SubjectId;
  dueDate: string;
  interval: RevisionInterval;
  createdAt: string;
  completedAt?: string;
  sourceTaskId?: string;
  /** How well the chapter was recalled when this card was completed. */
  recall?: RecallRating;
  /** True when the recall rating moved this date, so the automatic scheduler must not reset it. */
  adjusted?: boolean;
}

export type ChapterStage = 'notStarted' | 'inProgress' | 'completed' | 'revisionNeeded' | 'fullyRevised';
export type ChapterStep = 'class' | 'reading' | 'cqPractice' | 'mcqPractice' | 'boardPractice' | 'revision';
export interface ChapterMeta {
  note: string;
  weak: boolean;
  cq: PrepStatus;
  mcq: PrepStatus;
  updatedAt: string;
  priority?: Priority;
  stage?: ChapterStage;
  steps?: Partial<Record<ChapterStep, boolean>>;
}

export interface QuizQuestion {
  id: string;
  subject: SubjectId;
  chapterId?: string;
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
  source?: string;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  questionId: string;
  subject: SubjectId;
  chosen: number;
  correct: boolean;
  date: string;
  at: string;
}

export interface CqEntry {
  id: string;
  subject: SubjectId;
  chapterId?: string;
  question: string;
  marks: number;
  total: number;
  note: string;
  date: string;
  at: string;
  /** Chapters whose confidence should be marked weak after a low score. */
  mistakeId?: string;
  /** Optional sub-part breakdown, so the app can point at the weakest skill. */
  parts?: CqParts;
}

export interface TestRecord {
  id: string;
  kind: TestKind;
  title: string;
  subject?: SubjectId;
  chapterIds: string[];
  score: number;
  total: number;
  durationMin: number;
  date: string;
  at: string;
  notes: string;
}

export interface PersonalNote {
  id: string;
  title: string;
  body: string;
  subject?: SubjectId;
  chapterId?: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VideoLink {
  id: string;
  title: string;
  url: string;
  /** Direct http(s) link to a permitted downloadable or user-imported video. */
  sourceUrl?: string;
  subject: SubjectId;
  chapterId?: string;
  channel?: string;
  watched: boolean;
  favorite: boolean;
  createdAt: string;
  /** Video length in seconds (unknown until inspected). */
  durationSec?: number;
  /** File size in bytes for downloaded/imported local copies. */
  fileSizeBytes?: number;
  /** True when a playable copy is stored on the device (Capacitor Filesystem / IndexedDB). */
  downloaded: boolean;
  /** Local file path for native copies. */
  localPath?: string;
  /** Last watched position in seconds for resume. */
  watchedPositionSec: number;
  /** Watched percentage 0..100 derived from position and duration. */
  watchedPercent: number;
  /** Preferred playback speed: 0.5, 0.75, 1, 1.25, 1.5, 2. */
  playbackSpeed: 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
  /** Marked fully watched / completed by the student. */
  completed: boolean;
  /** PDFs and notes attached to this class. */
  attachments?: { pdfIds: string[]; noteIds: string[] };
}

/** Spaced-repetition flashcard. One card = one question/answer pair for a chapter. */
export type MistakeCategory = 'conceptual' | 'calculation' | 'memory' | 'misunderstood' | 'careless';
export type MistakeRetry = 'pending' | 'retried' | 'mastered';
export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';
export type FlashcardCategory =
  | 'formula' | 'definition' | 'reaction' | 'terminology' | 'identity' | 'vocabulary' | 'other';

export interface Flashcard {
  id: string;
  subject: SubjectId;
  chapterId?: string;
  front: string;
  back: string;
  category: FlashcardCategory;
  /** Days to wait before the next due date (1, 3, 7, 14, 30 ladder with adaptation). */
  interval: number;
  dueDate: string;
  lastReviewed?: string;
  /** Consecutive successful reviews. */
  repetitions: number;
  /** SM-2 ease factor, floor 1.3. */
  easeFactor: number;
  createdAt: string;
}

export interface FlashcardReview {
  id: string;
  flashcardId: string;
  rating: FlashcardRating;
  date: string;
  at: string;
  responseTimeSec?: number;
}

/** Metadata for a handwritten-note scan saved offline. Page images live in IndexedDB. */
export interface ScannedNoteMeta {
  id: string;
  title: string;
  subject: SubjectId;
  chapterId?: string;
  createdAt: string;
  pageCount: number;
  sizeBytes: number;
  pdfExported: boolean;
  pageKeys: string[];
}

export interface BoardQuestion {
  id: string;
  board: string;
  year: number;
  subject: SubjectId;
  chapterId?: string;
  type: 'CQ' | 'MCQ';
  text: string;
  marks: number;
  bookmarked: boolean;
  createdAt: string;
}

export interface FormulaEntry {
  id: string;
  subject: SubjectId;
  title: string;
  body: string;
  chapterId?: string;
  favorite: boolean;
  createdAt: string;
}

export interface Carryover {
  id: string;
  taskId: string;
  title: string;
  subject: SubjectId;
  minutes: number;
  fromDate: string;
  /** The day this carryover is planned for. */
  date: string;
  createdAt: string;
  completedAt?: string;
}

export interface RoutineBlock {
  id: string;
  /** Optional one-off date; absent for recurring weekly blocks. */
  date?: string;
  /** JavaScript weekday: 0 = Sunday … 6 = Saturday. */
  weekday: number;
  startMinute: number;
  minutes: number;
  subject: SubjectId;
  title: string;
  createdAt: string;
}

export interface ImportantDate {
  id: string;
  date: string;
  title: string;
  note: string;
  notify: boolean;
  createdAt: string;
}

export interface SubjectMarks {
  [subject: string]: number | null;
}

/** Per-day custom schedule override: changing start time, daily hours, or any task slot cascades subsequent times automatically. */
export interface DayScheduleOverride {
  /** Custom start minute of day (0..1439), e.g. 600 for 10:00 AM. */
  startMinute?: number;
  /** Custom net study hours (4..18) for this specific date. */
  dailyHours?: number;
  /** Custom duration in minutes per taskId; subsequent tasks cascade automatically. */
  taskMinutes?: Record<string, number>;
  /** Custom start minute (0..2879) per taskId; subsequent tasks cascade automatically. */
  taskStartMinutes?: Record<string, number>;
}

/** PDF / study-material kinds offered by the PDF Library. */
export type PdfMaterialType =
  | 'notes' | 'lectureSheet' | 'cqSolutions' | 'mcqSolutions' | 'boardQuestions'
  | 'formulaSheet' | 'suggestions' | 'revisionSheet' | 'practical' | 'other';

/**
 * A PDF the student added themselves (direct link or a file stored on the device).
 * The app never fabricates PDF links: material slots without a verified source stay
 * marked "not added yet" in the catalog instead of becoming fake entries here.
 */
export interface PdfResource {
  teacher?: string;
  className?: string;
  classId?: string;
  sourceUrl?: string;
  fingerprint?: string;
  linkStatus?: 'available' | 'broken' | 'unverified';
  id: string;
  title: string;
  /** Direct http(s) link to a permitted PDF. Absent for locally stored files. */
  url?: string;
  /** True when the bytes are stored in the device file store (IndexedDB). */
  local?: boolean;
  subject?: SubjectId;
  chapterId?: string;
  material: PdfMaterialType;
  sizeBytes?: number;
  createdAt: string;
  lastOpenedAt?: string;
}

/** Manual per-task schedule edit applied on top of the generated plan. */
export interface TaskEdit {
  /** Move the task to another date (YYYY-MM-DD). */
  date?: string;
  subject?: SubjectId;
  title?: string;
  chapterIds?: string[];
}

/** Fields shared by the v2 settings object. Kept here so storage and planner use one shape. */
export interface SettingsExtras {
  theme: ThemeMode;
  language: Language;
  revisionEnabled: boolean;
  carryoverMode: 'manual' | 'auto';
  pomodoroFocus: number;
  pomodoroBreak: number;
  pomodoroLongBreak: number;
  fontScale: FontScale;
  /** Next-month / Phase-2 study-hour boost (e.g. 8h in Nov -> 16-18h from Dec). */
  boostEnabled: boolean;
  boostStartDate: string;
  boostDailyHours: number;
}
