import { CHAPTERS, CORE, PAPERS, chapterById, subjectById } from './data';
import type { Chapter, SubjectId } from './data';
import type { BoardQuestion, Carryover, ChapterMeta, CqEntry, FormulaEntry, PersonalNote, QuizAttempt, QuizQuestion, RevisionItem, SettingsExtras, StudySession, SubjectMarks, TestRecord, VideoLink } from './types';

export type PhaseId = 'learn' | 'revise' | 'exam';
export type TaskKind = 'learn' | 'practice' | 'revision' | 'exam' | 'correction' | 'language' | 'ict' | 'recall' | 'practical';
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
  /** Personal target for the HSC exam; not an official board date. */
  examDate: string;
}
export const DEFAULT_SETTINGS: Settings = {
  startDate: '2026-11-14', startTime: '06:30', dailyHours: 8, board: 'সিলেট', name: '',
  reminderEnabled: false, reminderLead: 10, syllabusChecked: false, calendarRevision: 0,
  theme: 'light', revisionEnabled: true, carryoverMode: 'manual', examDate: '2027-06-30',
  pomodoroFocus: 25, pomodoroBreak: 5, pomodoroLongBreak: 15,
};
export interface Task {
  id: string; date: string; dayIndex: number; phase: PhaseId; subject: SubjectId;
  kind: TaskKind; title: string; detail: string; chapterIds: string[];
  startMinute: number; endMinute: number; paperId?: string;
}
export interface Day { date: string; index: number; phase: PhaseId; tasks: Task[]; isCatchup: boolean }
export interface Phase { id: PhaseId; name: string; subtitle: string; start: string; end: string; days: number; color: string }
export interface ExamResult { score: number; total: number; at: string; mistakes: string }
export interface Mistake { id: string; subject: SubjectId; text: string; date: string; resolved: boolean }
export interface AppData {
  version: 2;
  settings: Settings;
  completed: Record<string, string>;
  confidence: Record<string, 'weak' | 'okay' | 'confident'>;
  notes: Record<string, string>;
  exams: Record<string, ExamResult>;
  mistakes: Mistake[];
  focus: { minutes: number; sessions: number };
  studySessions: StudySession[];
  revisions: RevisionItem[];
  chapterMeta: Record<string, ChapterMeta>;
  questions: QuizQuestion[];
  attempts: QuizAttempt[];
  cq: CqEntry[];
  tests: TestRecord[];
  libraryNotes: PersonalNote[];
  videos: VideoLink[];
  boardQuestions: BoardQuestion[];
  formulas: FormulaEntry[];
  formulaFavorites: string[];
  gpaMarks: SubjectMarks;
  carryovers: Carryover[];
  badges: string[];
}
export const freshData = (): AppData => ({
  version: 2, settings: { ...DEFAULT_SETTINGS }, completed: {}, confidence: {}, notes: {}, exams: {}, mistakes: [],
  focus: { minutes: 0, sessions: 0 }, studySessions: [], revisions: [], chapterMeta: {}, questions: [], attempts: [],
  cq: [], tests: [], libraryNotes: [], videos: [], boardQuestions: [], formulas: [], formulaFavorites: [], gpaMarks: {}, carryovers: [], badges: [],
});
export const STORAGE_KEY = 'hsc27-prostuti-v1';
export const TIMEZONE = 'Asia/Dhaka';

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
export function todayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}
export function dhakaMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value);
}
export const bn = (value: number | string): string => String(value).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[Number(d)]);
export function formatDate(date: string, style: 'long' | 'short' | 'weekday' | 'month' = 'short'): string {
  const options: Intl.DateTimeFormatOptions = style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'weekday' ? { weekday: 'long' } : style === 'month' ? { month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat('bn-BD', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24, m = Math.round(minutes % 60);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
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
export function getPhases(start: string): Phase[] {
  const a = addMonths(start, 3), b = addMonths(start, 5), c = addMonths(start, 6);
  return [
    { id: 'learn', name: 'সিলেবাস গড়ি', subtitle: 'বুঝে পড়া · অধ্যায় শেষ', start, end: addDays(a, -1), days: diffDays(start, a), color: '#54866a' },
    { id: 'revise', name: 'রিভিশন করি', subtitle: 'দুইবার ঝালাই · প্রশ্ন অনুশীলন', start: a, end: addDays(b, -1), days: diffDays(a, b), color: '#b28b50' },
    { id: 'exam', name: 'পরীক্ষায় ঝালিয়ে নিই', subtitle: '১৩টি মডেল টেস্ট · ভুল সংশোধন', start: b, end: addDays(c, -1), days: diffDays(b, c), color: '#8271a4' },
  ];
}
export const phaseName = (id: PhaseId): string => ({ learn: 'সিলেবাস', revise: 'রিভিশন', exam: 'মডেল টেস্ট' })[id];
interface Unit { chapter: Chapter; part: number; id: string }
function makeQueue(subject: SubjectId): Unit[] {
  return CHAPTERS.filter(c => c.subject === subject).sort((a, b) => a.priority.localeCompare(b.priority)).flatMap(chapter =>
    Array.from({ length: chapter.effort }, (_, i) => ({ chapter, part: i + 1, id: `${chapter.id}:part-${i + 1}` })));
}
function learnDetail(c: Chapter, part: number): string {
  if (c.subject === 'chemistry' && c.effort === 8) {
    const topics = ['নামকরণ, সমাণুতা ও functional group', 'হাইড্রোকার্বন ও নির্ধারিত বিক্রিয়া', 'অ্যারোমেটিক যৌগ ও বিক্রিয়া কৌশল', 'অ্যালকোহল, ফেনল ও ইথার', 'অ্যালডিহাইড, কিটোন ও কার্বক্সিলিক এসিড', 'অ্যামিন ও বইয়ের বাকি নির্ধারিত টপিক', 'রূপান্তর ও শনাক্তকরণ: নিজে লিখে অনুশীলন', 'সিলেটসহ বিগত বোর্ডের CQ, MCQ ও ভুল সংশোধন'];
    return `${topics[part - 1]}। পাঠ্যবইয়ের উদাহরণ আগে; শেষে না দেখে ২টি CQ ও ১৫টি MCQ।`;
  }
  if (part === 1) return `${c.focus}। পাঠ্যবই পড়ে বুঝো, solved example দেখো, তারপর নিজের ভাষায় এক পাতার নোট লেখো।`;
  if (part === c.effort) return `${c.focus}। বই বন্ধ করে মূল পয়েন্ট লেখো। সিলেটসহ বিগত বোর্ড থেকে ২টি CQ ও ২০টি MCQ সমাধান করে ভুল সংশোধন করো।`;
  return `${c.focus}। আগের অংশ ঝালাই করে উদাহরণ ও অনুশীলনী নিজে সমাধান করো। কঠিন অংশ ভুলের খাতায় লেখো।`;
}
const kindFor = (s: SubjectId): TaskKind => s === 'bangla' || s === 'english' ? 'language' : s === 'ict' ? 'ict' : 'learn';
const baseBreaks = [30, 15, 165, 30, 120];
function timedTasks(day: Omit<Day, 'tasks'>, entries: Omit<Task, 'date' | 'dayIndex' | 'phase' | 'startMinute' | 'endMinute'>[], settings: Settings, exam = false): Task[] {
  const target = settings.dailyHours * 60;
  const durations = exam ? [60, 180, 120, 60, 60] : [120, 120, 60, 90, 60, 30];
  const breaks = exam ? [150, 120, 30, 90] : baseBreaks;
  const scale = exam ? (target - 180) / 300 : target / 480;
  const adjusted = durations.map((d, i) => exam && i === 1 ? 180 : Math.round(d * scale));
  adjusted[adjusted.length - 1] += target - adjusted.reduce((n, d) => n + d, 0);
  let cursor = toMinutes(settings.startTime);
  return entries.map((entry, i) => {
    const startMinute = cursor;
    const duration = adjusted[i];
    cursor += duration;
    const task: Task = { ...entry, date: day.date, dayIndex: day.index, phase: day.phase, startMinute, endMinute: cursor };
    cursor += breaks[i] || 0;
    return task;
  });
}

export function buildPlan(settings: Settings = DEFAULT_SETTINGS): Day[] {
  const phases = getPhases(settings.startDate);
  const total = phases.reduce((n, p) => n + p.days, 0);
  const queues = Object.fromEntries([...CORE, 'bangla', 'english', 'ict'].map(s => [s, makeQueue(s as SubjectId)])) as Record<string, Unit[]>;
  const pointers: Record<string, number> = Object.fromEntries(Object.keys(queues).map(s => [s, 0]));
  const nextUnit = (subject: SubjectId): Unit | undefined => queues[subject][pointers[subject]++];
  const recent: string[] = [];
  const days: Day[] = [];
  const languageUnit = (subject: SubjectId, dayKey: string): Omit<Task, 'date' | 'dayIndex' | 'phase' | 'startMinute' | 'endMinute'> => {
    const u = nextUnit(subject);
    return u ? { id: u.id, subject, kind: 'language', title: u.chapter.title, detail: learnDetail(u.chapter, u.part), chapterIds: [u.chapter.id] }
      : { id: `language-${subject}-${dayKey}`, subject, kind: 'practice', title: `${subjectById[subject].name}: টাইমড অনুশীলন`, detail: subject === 'english' ? 'একটি reading section ও একটি writing task নিজে লেখো। ভুলের পুনরাবৃত্তি ঠেকাও।' : 'একটি সাহিত্য CQ ও একটি নির্মিতি লেখো। পাঠ্যবই থেকে ২০টি MCQ অনুশীলন করো।', chapterIds: [] };
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
  for (const round of ['1', '2']) for (const subject of CORE) {
    revisionQueues[round][subject] = revisionGroups(Number(round), subject);
    revisionPointers[round][subject] = 0;
  }
  const takeRevisionGroup = (round: string, subject: SubjectId): RevisionGroup | undefined => {
    const queue = revisionQueues[round][subject] || [];
    const index = revisionPointers[round][subject] || 0;
    revisionPointers[round][subject] = index + 1;
    return queue[index];
  };
  const phase2Days = phases[1].days;
  let coreSlot = 0;
  for (let i = 0; i < total; i++) {
    const date = addDays(settings.startDate, i);
    const phase = phases.find(p => date >= p.start && date <= p.end)!;
    const localDay = diffDays(phase.start, date) + 1;
    const isCatchup = phase.id === 'learn' && localDay % 7 === 0;
    const day: Day = { date, index: i + 1, phase: phase.id, tasks: [], isCatchup };
    const entries: Omit<Task, 'date' | 'dayIndex' | 'phase' | 'startMinute' | 'endMinute'>[] = [];
    const coreEntry = (b: number) => {
      if (isCatchup) {
        const ids = [...new Set(recent)].slice(-4);
        const subject = CORE[b % 4];
        return { id: `weekly-learn-${localDay}-b${b}`, subject, kind: 'practice' as const, title: b === 0 ? 'সাপ্তাহিক ব্যাকলগ মিটিয়ে নাও' : b === 1 ? 'এ সপ্তাহের অধ্যায়: না দেখে রিকল' : 'ছোট পরীক্ষা ও ভুল সংশোধন', detail: `${ids.slice(0, 2).map(id => chapterById[id]?.title).filter(Boolean).join(' + ') || 'এ সপ্তাহের নির্ধারিত অধ্যায়'}। আগে অসমাপ্ত কাজ শেষ করো; না থাকলে ২টি CQ, ২৫টি MCQ ও ব্যবহারিক খাতা ঝালাই করো।`, chapterIds: ids.slice(0, 2) };
      }
      const subject = CORE[coreSlot++ % CORE.length];
      const u = nextUnit(subject);
      if (!u) return { id: `core-practice-learn-${localDay}-b${b}`, subject, kind: 'practice' as const, title: `${subjectById[subject].name}: দুর্বলতা ও বোর্ড প্রশ্ন`, detail: 'ভুলের খাতার একটি টপিক বেছে নাও। ২টি CQ ও ২৫টি MCQ সমাধান করো; প্রতিটি ভুলের কারণ লেখো।', chapterIds: [] };
      recent.push(u.chapter.id);
      return { id: u.id, subject, kind: kindFor(subject), title: u.chapter.title, detail: `${u.chapter.effort > 1 ? `ধাপ ${bn(u.part)}/${bn(u.chapter.effort)} · ` : ''}${learnDetail(u.chapter, u.part)}${u.chapter.note ? ` ${u.chapter.note}` : ''}`, chapterIds: [u.chapter.id] };
    };
    const ictEntry = (): Omit<Task, 'date' | 'dayIndex' | 'phase' | 'startMinute' | 'endMinute'> => {
      const u = nextUnit('ict');
      return u ? { id: u.id, subject: 'ict', kind: 'ict', title: u.chapter.title, detail: learnDetail(u.chapter, u.part), chapterIds: [u.chapter.id] }
        : { id: `ict-practice-learn-${localDay}`, subject: 'ict', kind: 'practical', title: 'আইসিটি: হাতে-কলমে অনুশীলন', detail: 'দিন অনুযায়ী একটি HTML পাতা, C প্রোগ্রাম, গেট সার্কিট বা ডেটাবেজ query নিজে তৈরি করো। ব্যবহারিক খাতায় লেখো।', chapterIds: [] };
    };
    if (phase.id === 'learn') {
      entries.push(coreEntry(0), coreEntry(1), languageUnit(localDay % 2 === 0 ? 'bangla' : 'english', `learn-${localDay}`), coreEntry(3));
      entries.push(localDay % 2 === 1 ? ictEntry() : languageUnit(localDay % 2 === 0 ? 'english' : 'bangla', `learn-${localDay}`));
      entries.push({ id: `recall-learn-${localDay}`, subject: CORE[i % 4], kind: 'recall', title: 'আজকের ৩টি বিষয় মনে করো', detail: 'বই বন্ধ করে আজকের মূল ধারণা, সূত্র বা চিত্র লেখো। ১৫টি MCQ যাচাই করো; আগামীকালের বই গুছিয়ে রাখো।', chapterIds: [] });
    } else if (phase.id === 'revise') {
      const round = localDay <= Math.ceil(phase2Days / 2) ? '1' : '2';
      const revisionEntry = (b: number) => {
        const slot = coreSlot++ % CORE.length;
        const subject = CORE[slot];
        // Rotate subjects daily; if one queue is exhausted, borrow the next subject's remaining group.
        let group = takeRevisionGroup(round, subject);
        if (!group) for (let step = 1; step < CORE.length && !group; step++) group = takeRevisionGroup(round, CORE[(slot + step) % CORE.length]);
        if (group) {
          return { id: group.id, subject: group.subject, kind: 'revision' as const, title: `${group.chapters.map(c => c.title).join(' + ')}`, detail: `রিভিশন রাউন্ড ${bn(round)} · নোট থেকে মূল ধারণা ঝালাই করো। প্রতিটি অধ্যায়ের ২টি CQ ও ২০টি MCQ; দুর্বল অংশ চিহ্নিত করো।`, chapterIds: group.chapters.map(c => c.id) };
        }
        return { id: `revision-extra-${localDay}-b${b}`, subject, kind: 'practice' as const, title: 'দুর্বল অধ্যায়ে দ্বিতীয় সুযোগ', detail: 'ভুলের খাতা ও কম আত্মবিশ্বাসের অধ্যায় থেকে ২টি CQ এবং ২৫টি MCQ। নতুন টপিক নয়, নির্ভুলতায় মনোযোগ।', chapterIds: [] };
      };
      entries.push(revisionEntry(0), revisionEntry(1), languageUnit(localDay % 2 === 0 ? 'bangla' : 'english', `revise-${localDay}`), revisionEntry(3));
      entries.push(localDay % 2 === 1 ? { id: `ict-revision-${localDay}`, subject: 'ict', kind: 'ict', title: 'আইসিটি: গেট / HTML / C / ডেটাবেজ', detail: 'দিন অনুযায়ী একটি টপিকের ২টি সৃজনশীল ও ব্যবহারিক অনুশীলন। আগের ভুল নিজে সংশোধন করো।', chapterIds: [] } : languageUnit('english', `revise-${localDay}`));
      entries.push({ id: `revision-recall-${localDay}`, subject: CORE[i % 4], kind: 'recall', title: localDay % 7 === 0 ? 'সাপ্তাহিক মিনি টেস্ট' : 'রিকল ও ভুলের খাতা', detail: localDay % 7 === 0 ? '৪৫ মিনিটে একটি বিষয়ের MCQ সেট; বাকি সময়ে উত্তর বিশ্লেষণ। নম্বর ও ভুলের কারণ লেখো।' : 'আজকের রিভিশন থেকে ৫টি প্রশ্ন নিজেকে করো। না পারলে আগামীকালের ব্যাকলগে যোগ করো।', chapterIds: [] });
    } else {
      const mockIndex = Math.floor((localDay - 1) / 2);
      if (mockIndex < PAPERS.length) {
        const paper = PAPERS[mockIndex];
        if (localDay % 2 === 1) {
          entries.push(
            { id: `prep-${paper.id}`, subject: paper.subject, kind: 'recall', title: 'হালকা ঝালাই ও পরীক্ষার প্রস্তুতি', detail: 'শুধু নিজের সূত্রশিট ও ভুলের খাতা দেখো। কলম, ঘড়ি, উত্তরপত্র ও পানি গুছিয়ে রাখো।', chapterIds: [], paperId: paper.id },
            { id: `mock-${paper.id}`, subject: paper.subject, kind: 'exam', title: `${paper.name} · মডেল টেস্ট`, detail: `ঘড়ি ধরে ${bn(paper.maxScore === 75 ? 75 : 100)} নম্বরের পূর্ণ তত্ত্বীয় প্রশ্নপত্র সমাধান করো। ${paper.maxScore === 75 ? 'আইসিটি তত্ত্বীয়: ৭৫ নম্বর; ব্যবহারিক আলাদা।' : 'সময় ৩ ঘণ্টা; বই/সমাধান দেখা নয়।'} এটি ব্যক্তিগত মডেল টেস্ট, বোর্ড পরীক্ষা নয়।`, chapterIds: [], paperId: paper.id },
            { id: `correction-${paper.id}`, subject: paper.subject, kind: 'correction', title: 'নিজের খাতা মূল্যায়ন', detail: 'নম্বর মিলিয়ে Exams পেজে নম্বর ও ভুলগুলো লেখো। অসম্পূর্ণ উত্তর, ধারণাগত ভুল ও সময়ের সমস্যা আলাদা করো।', chapterIds: [], paperId: paper.id },
            { id: `mock-language-${paper.id}`, subject: i % 2 ? 'bangla' : 'english', kind: 'language', title: 'ভাষা বিষয়ে ছোট অনুশীলন', detail: 'একটি reading/সাহিত্য প্রশ্ন অথবা একটি writing task। মডেল টেস্টের চাপের মধ্যেও ভাষার অনুশীলন রাখো।', chapterIds: [] },
            { id: `mock-recall-${paper.id}`, subject: paper.subject, kind: 'recall', title: 'আজকের ভুলগুলো আর নয়', detail: 'ভুলের খাতার ৩টি পয়েন্ট পড়ো, একটি দুর্বল টপিকের ছোট অনুশীলন করো। পর্যাপ্ত ঘুমের জন্য আগে শেষ করো।', chapterIds: [], paperId: paper.id },
          );
          days.push({ ...day, tasks: timedTasks(day, entries, settings, true) });
          continue;
        }
        entries.push(
          { id: `analysis-${paper.id}`, subject: paper.subject, kind: 'correction', title: `${subjectById[paper.subject].name}: উত্তর বিশ্লেষণ`, detail: 'গতকালের মডেল টেস্টের প্রতিটি ভুল বোঝো। নম্বর না লিখে থাকলে এখন লেখো; ধারণাগত ভুল আলাদা করো।', chapterIds: [], paperId: paper.id },
          { id: `resolve-${paper.id}`, subject: paper.subject, kind: 'practice', title: 'ভুল প্রশ্ন আবার নিজে করো', detail: 'গতকালের ভুল CQ ও MCQ সমাধান দেখে নয়, নিজে আবার করো। প্রয়োজনে সংশ্লিষ্ট অধ্যায়ের নোট দেখো।', chapterIds: [], paperId: paper.id },
          languageUnit('english', `exam-${localDay}`),
          { id: `weak-${paper.id}`, subject: paper.subject, kind: 'practice', title: 'সবচেয়ে দুর্বল টপিকে ফোকাস', detail: 'মডেল টেস্টে সবচেয়ে কম নম্বর পাওয়া টপিকের ২টি প্রশ্ন করো। একই ভুল আর কতবার হলো লিখে রাখো।', chapterIds: [], paperId: paper.id },
          { id: `practical-exam-${localDay}`, subject: CORE[i % 4], kind: 'practical', title: 'ব্যবহারিক খাতা ও মৌখিক প্রস্তুতি', detail: 'একটি পরীক্ষণের নীতি, চিত্র/সার্কিট, পর্যবেক্ষণ টেবিল ও সতর্কতা লেখো। শিক্ষকের নির্ধারিত তালিকা অনুসরণ করো।', chapterIds: [] },
          { id: `exam-recall-${localDay}`, subject: paper.subject, kind: 'recall', title: 'আগামীকালের জন্য হালকা প্রস্তুতি', detail: 'সূত্রশিট ও ভুলের খাতা ছাড়া নতুন কিছু নয়। আগামীকালের প্রশ্নপত্র/সামগ্রী গুছিয়ে রাখো।', chapterIds: [] },
        );
      } else {
        const titles = ['সব বিষয়ের সূত্র ও ভুলের খাতা', 'বাংলা–ইংরেজি: শেষ ঝালাই', 'ব্যবহারিক খাতা ও পরীক্ষার সামগ্রী', 'হালকা রিকল, আগে ঘুম'];
        entries.push(
          { id: `final-${localDay}-a`, subject: 'physics', kind: 'recall', title: titles[localDay - 27] || titles[3], detail: 'কেবল পরিচিত নোট ও ভুলের খাতা। নতুন কঠিন টপিক শুরু নয়।', chapterIds: [] },
          { id: `final-${localDay}-b`, subject: 'chemistry', kind: 'recall', title: 'রসায়ন ও জীববিজ্ঞান: নিজের নোট', detail: 'বিক্রিয়া, চিত্র ও পার্থক্য চোখ বুলিয়ে নাও। যেগুলো আগেই পারো সেগুলোই আত্মবিশ্বাসের সঙ্গে ঝালাই করো।', chapterIds: [] },
          languageUnit('bangla', `final-${localDay}`),
          { id: `final-${localDay}-c`, subject: 'math', kind: 'recall', title: 'গণিত ও আইসিটি: ভুলগুলো দেখো', detail: 'সূত্রের শর্ত, একক, gate truth table ও C dry run—নিজের ভুলের খাতা থেকে ঝালাই করো।', chapterIds: [] },
          { id: `final-${localDay}-d`, subject: 'english', kind: 'language', title: 'ইংরেজি: ছোট লেখা ও vocabulary', detail: 'একটি ছোট writing task ও পরিচিত grammar ভুলগুলো দেখো। ভারী নতুন অনুশীলন নয়।', chapterIds: [] },
          { id: `final-${localDay}-e`, subject: 'ict', kind: 'recall', title: 'প্রবেশপত্র, কলম, ঘড়ি ও ঘুম', detail: 'বোর্ডের প্রকৃত সময়সূচি ও কেন্দ্র নির্দেশনা আলাদাভাবে যাচাই করো। প্রয়োজনীয় কাগজ গুছিয়ে পর্যাপ্ত ঘুমাও।', chapterIds: [] },
        );
      }
    }
    day.tasks = timedTasks(day, entries, settings);
    days.push(day);
  }
  return days;
}

export function chapterTasks(plan: Day[], chapterId: string): Task[] { return plan.flatMap(d => d.tasks).filter(t => t.chapterIds.includes(chapterId) && (t.kind === 'learn' || t.kind === 'language' || t.kind === 'ict') && t.id.includes(':part-')); }
export function isChapterDone(plan: Day[], id: string, completed: Record<string, string>): boolean { const tasks = chapterTasks(plan, id); return tasks.length > 0 && tasks.every(t => !!completed[t.id]); }
export function chapterFirstDate(plan: Day[], id: string): string | undefined { return chapterTasks(plan, id)[0]?.date; }
export function getStats(plan: Day[], data: AppData, today: string) {
  const all = plan.flatMap(d => d.tasks);
  const done = all.filter(t => data.completed[t.id]);
  const chapters = CHAPTERS.filter(c => isChapterDone(plan, c.id, data.completed));
  const activeDates = new Set(Object.values(data.completed).map(at => todayKey(new Date(at))));
  let streak = 0, cursor = activeDates.has(today) ? today : addDays(today, -1);
  while (activeDates.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const backlog = all.filter(t => taskStart(t).date < today && !data.completed[t.id]);
  const subjectProgress = Object.fromEntries(Object.keys(subjectById).map(s => {
    const chapters = CHAPTERS.filter(c => c.subject === s);
    return [s, { done: chapters.filter(c => isChapterDone(plan, c.id, data.completed)).length, total: chapters.length }];
  })) as Record<SubjectId, { done: number; total: number }>;
  return { total: all.length, done: done.length, chapters: chapters.length, totalChapters: CHAPTERS.length, streak, backlog, subjectProgress,
    plannedMinutes: done.reduce((n, t) => n + (t.endMinute - t.startMinute), 0), mocks: Object.keys(data.exams).length };
}
