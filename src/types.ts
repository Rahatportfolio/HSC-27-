import type { SubjectId } from './data';

/** All additions are optional at the validation layer so old v1 backups keep working. */
export type ThemeMode = 'light' | 'dark' | 'system';
export type StudyMode = 'stopwatch' | 'countdown' | 'pomodoro';
export type PrepStatus = 'none' | 'practicing' | 'ready';
export type RevisionInterval = 1 | 3 | 7 | 14 | 30;
export type TestKind = 'chapter' | 'subject' | 'model';

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

export interface RevisionItem {
  id: string;
  chapterId: string;
  subject: SubjectId;
  dueDate: string;
  interval: RevisionInterval;
  createdAt: string;
  completedAt?: string;
  sourceTaskId?: string;
}

export interface ChapterMeta {
  note: string;
  weak: boolean;
  cq: PrepStatus;
  mcq: PrepStatus;
  updatedAt: string;
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
  subject: SubjectId;
  chapterId?: string;
  channel?: string;
  watched: boolean;
  favorite: boolean;
  createdAt: string;
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

export interface SubjectMarks {
  [subject: string]: number | null;
}

/** Fields shared by the v2 settings object. Kept here so storage and planner use one shape. */
export interface SettingsExtras {
  theme: ThemeMode;
  revisionEnabled: boolean;
  carryoverMode: 'manual' | 'auto';
  pomodoroFocus: number;
  pomodoroBreak: number;
  pomodoroLongBreak: number;
}
