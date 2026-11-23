import { CHAPTERS, chapterById, subjectById } from './data';
import { CHAPTER_SCHEDULE } from './chapterImportance';
import { applyRoutine, addDays, bn, diffDays, formatDurationBn, hasFullTaskAllocation, isValidDate } from './planner';
import type { AppData, Day, Settings, Task } from './planner';
import { CHAPTER_CLASSES } from './classLinks';
import { parseTaskRangeId } from './taskReferences';
import { t } from './i18n';
import { applyManualSchedule } from './scheduleEdit';
import { youtubeVideoId } from './youtubeDuration';
import { classDurationReference } from './classDurationReferences';

/** S is a personal shortlist WITHIN A, not a board category/question prediction. */
export const RECOMMENDED_S_IDS = CHAPTERS.filter(c => c.priority === 'A' && CHAPTER_SCHEDULE[c.id]?.star === 5).map(c => c.id);
export const WORK_STAGES = [
  { id: 'class', bn: 'অধ্যায়ের ক্লাস', en: 'Chapter class', media: true },
  { id: 'reading', bn: 'নিজে বই পড়া', en: 'Textbook reading', media: false },
  { id: 'notes', bn: 'নিজের নোট তৈরি', en: 'Note making', media: false },
  { id: 'mcqClass', bn: 'MCQ সলভিং ক্লাস', en: 'MCQ solving class', media: true },
  { id: 'mcqPractice', bn: 'নিজে MCQ অনুশীলন', en: 'Own MCQ practice', media: false },
  { id: 'cqClass', bn: 'CQ সলভিং ক্লাস', en: 'CQ solving class', media: true },
  { id: 'cqPractice', bn: 'নিজে CQ অনুশীলন', en: 'Own CQ practice', media: false },
  { id: 'revision', bn: 'অধ্যায়ের রিভিশন', en: 'Chapter revision', media: false },
] as const;
export type WorkStage = typeof WORK_STAGES[number]['id'];
/** Three student-facing sessions; legacy source records remain separate evidence. */
export const PERSONAL_SESSIONS: { id: string; bn: string; en: string; stages: WorkStage[] }[] = [
  { id: 'class', bn: '১. অধ্যায়ের YouTube ক্লাস', en: '1. Chapter YouTube class', stages: ['class'] },
  { id: 'notes', bn: '২. নিজের নোট তৈরি', en: '2. Make your own notes', stages: ['reading', 'notes'] },
  { id: 'practice', bn: '৩. CQ/MCQ সলভিং ও নিজে অনুশীলন', en: '3. CQ/MCQ solving and own practice', stages: ['mcqClass', 'mcqPractice', 'cqClass', 'cqPractice', 'revision'] },
];
export function personalSessionForStage(stage: WorkStage) {
  return PERSONAL_SESSIONS.find(session => session.stages.includes(stage))!;
}

export type DurationSource = 'unknown' | 'student' | 'youtube-player' | 'reference-metadata' | 'planned' | 'default24';
export interface WorkBudget {
  /** Source video minutes, NOT a fixed session length. Null is genuinely unknown. */
  minutes: number | null;
  source: DurationSource;
  url?: string;
  /** Actual player observation, or an unchanged legacy reference record. */
  observedAt?: string;
  /** When the student accepted saved reference metadata, NOT when a page was checked. */
  acceptedAt?: string;
  calculation?: { quantity: number; unitMinutes: number; difficulty: 'easy' | 'normal' | 'hard'; reviewedPercent?: number };
}
export type ChapterWorkload = Record<WorkStage, WorkBudget>;
export interface AvailabilityWindow { weekday: number; startMinute: number; endMinute: number }
export interface PersonalRoutine {
  version: 1;
  scope: 'S' | 'A' | 'B' | 'C' | 'ALL' | 'SELECTED';
  /** Explicit categories for exactly the selected A/B chapters. */
  categories?: Record<string, 'S' | 'A' | 'B'>;
  /** New explicit-setup plans never invent missing duration estimates. */
  manualWorkloads?: boolean;
  /** A later phase never backdates work into the completed S phase. */
  startsOn?: string;
  chapterIds: string[];
  windows: AvailabilityWindow[];
  /** Explicit unavailable intervals and optional daily NET-work cap. */
  exclusions?: AvailabilityWindow[];
  dailyLimitMinutes?: number;
  /** Frozen actual historical allocations, not mutable completion evidence. */
  history?: Task[];
  playbackSpeed: 1 | 1.25 | 1.5 | 2;
  /** Retains old phase-specific speeds when combining saved phases. */
  chapterSpeeds?: Record<string, 1 | 1.25 | 1.5 | 2>;
  sessionMinutes: number;
  breakMinutes: number;
  workloads: Record<string, ChapterWorkload>;
  updatedAt: string;
}
export interface PersonalWork {
  stage: WorkStage;
  sourceId: string;
  from: number;
  to: number;
  requiredSources: string[];
  chapterMinutes: number;
  pairDay: number;
  rawMinutes: number;
  /** The duration this tick was made against, when known. */
  evidenceMinutes?: number;
  durationSource: DurationSource;
  url?: string;
  mediaFromSec?: number;
  mediaToSec?: number;
}
export interface RoutineIssue {
  code: 'unknown-duration' | 'stale-evidence' | 'two-day-capacity' | 'deadline' | 'custom-outside' | 'overlap' | 'missing-allocation' | 'day-capacity' | 'no-work' | 'source-edit' | 'required-work' | 'unscheduled' | 'locked-work';
  chapterIds: string[];
  minutes: number;
  count?: number;
}
export interface PersonalProjection { plan: Day[]; issues: RoutineIssue[]; unknownChapters: string[]; plannedChapterIds: string[] }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isA = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(chapterById, id) && chapterById[id].priority === 'A';
const fail = (): never => { throw new Error(t('নিজের পড়ার সময়, S তালিকা ও ক্লাসের সময় সঠিকভাবে দাও।', 'Check your availability, S shortlist and class durations.')); };
export const isSChapter = (data: AppData, id: string): boolean => data.personalRoutine?.scope === 'SELECTED' ? data.personalRoutine.categories?.[id] === 'S' : !!(data.personalRoutine?.scope === 'S' ? data.personalRoutine : data.personalPhases?.S)?.chapterIds.includes(id);
export const personalRoutineForChapter = (data: AppData, id: string): PersonalRoutine | undefined => data.personalRoutine?.chapterIds.includes(id) ? data.personalRoutine : Object.values(data.personalPhases || {}).find(routine => routine.chapterIds.includes(id));

/** 20 hours (1,200 minutes) of study per chapter, used when the student has not
 * measured anything yet. It is an editable ESTIMATE, never a claim about a real
 * video length: the class share is what is left after the independent work below.
 * Distribution: class 480 · reading 240 · notes 120 · MCQ 120 · CQ 180 · revision 60.
 */
export const DEFAULT_CHAPTER_MINUTES = 1200;
const DEFAULT_INDEPENDENT: Record<Exclude<WorkStage, 'class' | 'mcqClass' | 'cqClass'>, number> = {
  reading: 240, notes: 120, mcqPractice: 120, cqPractice: 180, revision: 60,
};
export function defaultChapterStudyPlan(_chapterId: string): Record<WorkStage, number> {
  // Exactly 20 hours for every chapter, as the student asked, until they edit it.
  const total = DEFAULT_CHAPTER_MINUTES;
  const independent = WORK_STAGES.filter(stage => !stage.media).reduce((sum, stage) => sum + DEFAULT_INDEPENDENT[stage.id as keyof typeof DEFAULT_INDEPENDENT], 0);
  return { class: Math.max(120, total - independent), reading: DEFAULT_INDEPENDENT.reading, notes: DEFAULT_INDEPENDENT.notes,
    mcqClass: 0, cqClass: 0, mcqPractice: DEFAULT_INDEPENDENT.mcqPractice, cqPractice: DEFAULT_INDEPENDENT.cqPractice, revision: DEFAULT_INDEPENDENT.revision } as Record<WorkStage, number>;
}
/** A complete, honest estimate workload. Used as the starting value so a student
 * sees a real schedule immediately, and stays editable per stage/source later. */
export function estimatedChapterWorkload(chapterId: string): ChapterWorkload {
  const plan = defaultChapterStudyPlan(chapterId);
  const base = defaultChapterWorkload(chapterId);
  return Object.fromEntries(WORK_STAGES.map(stage => [stage.id, {
    ...base[stage.id],
    minutes: plan[stage.id],
    source: 'default24' as DurationSource,
  }])) as ChapterWorkload;
}
export function defaultChapterWorkload(chapterId: string): ChapterWorkload {
  const links = CHAPTER_CLASSES[chapterId];
  const first = (key: 'oneShot' | 'mcq' | 'cq') => {
    const stage = key === 'oneShot' ? 'class' : key === 'mcq' ? 'mcqClass' : 'cqClass';
    const suitable = links?.[key].filter(link => { const reference = classDurationReference(youtubeVideoId(link.url), chapterId, stage); return !reference || reference.suitability === 'chapter'; });
    return suitable?.find(link => link.kind === 'video')?.url || suitable?.find(link => link.kind === 'playlist')?.url;
  };
  return {
    class: { minutes: null, source: 'unknown', ...(first('oneShot') ? { url: first('oneShot') } : {}) },
    reading: { minutes: null, source: 'unknown' },
    notes: { minutes: null, source: 'unknown' },
    mcqClass: { minutes: null, source: 'unknown', ...(first('mcq') ? { url: first('mcq') } : {}) },
    mcqPractice: { minutes: null, source: 'unknown' },
    cqClass: { minutes: null, source: 'unknown', ...(first('cq') ? { url: first('cq') } : {}) },
    cqPractice: { minutes: null, source: 'unknown' },
    revision: { minutes: null, source: 'unknown' },
  };
}
/** S has no compulsory legacy revision/mock phase or boost-hours requirement. */
export function personalScheduleDateError(settings: Settings, routine?: Pick<PersonalRoutine, 'startsOn'>): string | null {
  if (![settings.startDate, settings.testExamDate, settings.examDate].every(isValidDate)) return t('পরিকল্পনার তারিখগুলো সঠিকভাবে বাছো।', 'Choose valid planning dates.');
  if (settings.startDate >= settings.testExamDate || settings.testExamDate >= settings.examDate) return t('শুরু, টেস্টের ব্যক্তিগত লক্ষ্য ও HSC-এর ব্যক্তিগত লক্ষ্য ক্রমানুসারে রাখো।', 'Keep the start, personal test target and personal HSC target in that order.');
  if (diffDays(settings.startDate, settings.examDate) > 730) return t('একটি প্রস্তুতি পরিকল্পনা সর্বোচ্চ ৭৩০ দিনের হতে পারে।', 'A preparation plan can span at most 730 days.');
  if (routine?.startsOn && routine.startsOn >= settings.examDate) return t('ধাপের শুরু শেষ ব্যক্তিগত লক্ষ্য তারিখের আগে রাখো। তারিখ বা ধাপের পরিকল্পনা মিলিয়ে নাও; আগের তথ্য অক্ষত আছে।', 'The phase start must be before your personal end target. Review the phase/planning dates; existing data is unchanged.');
  return null;
}
export function newPersonalRoutine(scope: PersonalRoutine['scope'] = 'S', excluded: string[] = []): PersonalRoutine {
  return { version: 1, scope, chapterIds: scope === 'SELECTED' ? [] : scope === 'S' ? [...RECOMMENDED_S_IDS] : CHAPTERS.filter(c => (scope === 'ALL' || c.priority === scope) && !excluded.includes(c.id)).map(c => c.id), windows: [], playbackSpeed: 1,
    sessionMinutes: 50, breakMinutes: 10, workloads: {}, updatedAt: new Date().toISOString() };
}
export function parsePersonalRoutine(raw: unknown): PersonalRoutine {
  if (!object(raw) || raw.version !== 1 || !['S', 'A', 'B', 'C', 'ALL', 'SELECTED'].includes(String(raw.scope)) || !Array.isArray(raw.chapterIds) ||
    !raw.chapterIds.length || raw.chapterIds.length > CHAPTERS.length || (raw.scope === 'ALL' && raw.chapterIds.length !== CHAPTERS.length) || !raw.chapterIds.every(id => typeof id === 'string' && Object.hasOwn(chapterById, id) && (raw.scope === 'ALL' || raw.scope === 'SELECTED' && ['A', 'B'].includes(chapterById[id].priority) || (raw.scope === 'S' ? isA(id) : chapterById[id].priority === raw.scope))) ||
    new Set(raw.chapterIds).size !== raw.chapterIds.length || !Array.isArray(raw.windows) || !raw.windows.length || raw.windows.length > 56 ||
    ![1, 1.25, 1.5, 2].includes(raw.playbackSpeed as number) || !integer(raw.sessionMinutes, 15, 120) || !integer(raw.breakMinutes, 0, 60) ||
    !object(raw.workloads) || Object.keys(raw.workloads).length > CHAPTERS.length || typeof raw.updatedAt !== 'string' ||
    raw.updatedAt.length > 40 || !Number.isFinite(Date.parse(raw.updatedAt))) return fail();
  if (raw.scope === 'SELECTED' && (!object(raw.categories) || Object.keys(raw.categories).length !== raw.chapterIds.length || (raw.chapterIds as string[]).some(id => !Object.hasOwn(raw.categories as object, id) || (chapterById[id].priority === 'A' ? !['S', 'A'].includes(String((raw.categories as Record<string, unknown>)[id])) : (raw.categories as Record<string, unknown>)[id] !== 'B')))) return fail();
  if (raw.categories !== undefined && raw.scope !== 'SELECTED') return fail();
  if (raw.manualWorkloads !== undefined && typeof raw.manualWorkloads !== 'boolean') return fail();
  if (raw.chapterSpeeds !== undefined && (!object(raw.chapterSpeeds) || Object.keys(raw.chapterSpeeds).length > CHAPTERS.length || Object.entries(raw.chapterSpeeds).some(([id, speed]) => !Object.hasOwn(chapterById, id) || ![1, 1.25, 1.5, 2].includes(speed as number)))) return fail();
  const windows = raw.windows.map(window => {
    if (!object(window) || !integer(window.weekday, 0, 6) || !integer(window.startMinute, 0, 1439) ||
      !integer(window.endMinute, 1, 1440) || window.endMinute - window.startMinute < 5) return fail();
    return { weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute };
  }).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let i = 1; i < windows.length; i++) if (windows[i].weekday === windows[i - 1].weekday && windows[i].startMinute < windows[i - 1].endMinute) return fail();
  const workloads: Record<string, ChapterWorkload> = {};
  for (const [id, value] of Object.entries(raw.workloads)) {
    if (!Object.hasOwn(chapterById, id) || !object(value)) return fail();
    const entries = WORK_STAGES.map(stage => {
      // Older six-stage profiles retain every old budget; new steps remain honestly unknown.
      const budget = value[stage.id] ?? (['notes', 'revision'].includes(stage.id) ? { minutes: null, source: 'unknown' } : undefined);
      if (!object(budget) || !['unknown', 'student', 'youtube-player', 'reference-metadata', 'planned', 'default24'].includes(budget.source as string) ||
        (budget.minutes !== null && (typeof budget.minutes !== 'number' || !Number.isFinite(budget.minutes) || budget.minutes < 0 || budget.minutes > 10080)) ||
        (budget.minutes === null) !== (budget.source === 'unknown') ||
        (stage.media && budget.source === 'planned') || (!stage.media && ['youtube-player', 'reference-metadata'].includes(budget.source as string))) return fail();
      if (budget.url !== undefined) {
        if (typeof budget.url !== 'string' || budget.url.length > 2000) return fail();
        let url: URL; try { url = new URL(budget.url); } catch { return fail(); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fail();
      }
      if (budget.observedAt !== undefined && (typeof budget.observedAt !== 'string' || budget.observedAt.length > 40 || !Number.isFinite(Date.parse(budget.observedAt)))) return fail();
      if (budget.acceptedAt !== undefined && (budget.source !== 'reference-metadata' || typeof budget.acceptedAt !== 'string' || budget.acceptedAt.length > 40 || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(budget.acceptedAt) || !isValidDate(budget.acceptedAt.slice(0, 10)) || !Number.isFinite(Date.parse(budget.acceptedAt)))) return fail();
      if (budget.source === 'youtube-player' && (!budget.url || !budget.observedAt)) return fail();
      // Old reference observations survive round-trip unchanged. New acceptance
      // records never invent a verified observation date for the saved page.
      if (budget.source === 'reference-metadata' && (!budget.url || !(budget.observedAt || budget.acceptedAt))) return fail();
      if (budget.calculation !== undefined && (!object(budget.calculation) || stage.media || budget.source !== 'planned' || !validWorkCalculation(budget.calculation) || budget.minutes !== independentWorkMinutes(stage.id, budget.calculation as unknown as WorkCalculation))) return fail();
      return [stage.id, { minutes: budget.minutes, source: budget.source,
        ...(budget.calculation ? { calculation: { ...(budget.calculation as WorkBudget['calculation']) } } : {}),
        ...(budget.url ? { url: budget.url } : {}), ...(budget.observedAt ? { observedAt: budget.observedAt } : {}), ...(budget.acceptedAt ? { acceptedAt: budget.acceptedAt } : {}) }];
    });
    workloads[id] = Object.fromEntries(entries) as ChapterWorkload;
  }
  // A routine must never be saved with an empty plan. Chapters the student never
  // configured receive the editable 20-hour estimate instead of unknown work.
  for (const id of raw.chapterIds as string[]) if (!workloads[id]) workloads[id] = raw.manualWorkloads ? defaultChapterWorkload(id) : estimatedChapterWorkload(id);
  // Older profiles were saved with every duration unknown (the plan then rendered
  // blank). Fill only chapters that are still entirely unknown, so a real
  // student/probe/player duration is never overwritten. Settings can edit later.
  for (const [id, work] of Object.entries(workloads)) {
    if (raw.manualWorkloads) continue;
    if (WORK_STAGES.some(stage => work[stage.id].minutes !== null)) continue;
    const estimate = estimatedChapterWorkload(id);
    const required = WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id));
    workloads[id] = required.every(stage => work[stage.id].source === 'unknown') ? estimate : work;
  }
  if (raw.startsOn !== undefined && (typeof raw.startsOn !== 'string' || !isValidDate(raw.startsOn))) return fail();
  const exclusions = raw.exclusions === undefined ? undefined : parseAvailabilityList(raw.exclusions);
  if (raw.dailyLimitMinutes !== undefined && !integer(raw.dailyLimitMinutes, 1, 1440)) return fail();
  const history = raw.history === undefined ? undefined : parsePersonalHistory(raw.history);
  return { version: 1, scope: raw.scope as PersonalRoutine['scope'], ...(raw.manualWorkloads !== undefined ? { manualWorkloads: raw.manualWorkloads as boolean } : {}), chapterIds: [...raw.chapterIds] as string[], windows,
    ...(raw.scope === 'SELECTED' ? { categories: { ...raw.categories as Record<string, 'S' | 'A' | 'B'> } } : {}),
    ...(raw.startsOn ? { startsOn: raw.startsOn as string } : {}), ...(exclusions ? { exclusions } : {}), ...(raw.dailyLimitMinutes !== undefined ? { dailyLimitMinutes: raw.dailyLimitMinutes as number } : {}), ...(history ? { history } : {}), playbackSpeed: raw.playbackSpeed as PersonalRoutine['playbackSpeed'],
    sessionMinutes: raw.sessionMinutes, breakMinutes: raw.breakMinutes, workloads, ...(raw.chapterSpeeds ? { chapterSpeeds: { ...raw.chapterSpeeds } as PersonalRoutine['chapterSpeeds'] } : {}), updatedAt: raw.updatedAt };
}
export type WorkCalculation = NonNullable<WorkBudget['calculation']>;
function validWorkCalculation(value: Record<string, unknown>): boolean {
  return typeof value.quantity === 'number' && Number.isFinite(value.quantity) && value.quantity > 0 && value.quantity <= 100000 &&
    typeof value.unitMinutes === 'number' && Number.isFinite(value.unitMinutes) && value.unitMinutes > 0 && value.unitMinutes <= 1440 &&
    ['easy', 'normal', 'hard'].includes(String(value.difficulty)) && (value.reviewedPercent === undefined || typeof value.reviewedPercent === 'number' && Number.isFinite(value.reviewedPercent) && value.reviewedPercent >= 0 && value.reviewedPercent <= 100);
}
/** An explicit, editable independent-work estimate; NEVER used for any video. */
export function independentWorkMinutes(stage: WorkStage, calculation: WorkCalculation): number {
  if (WORK_STAGES.find(item => item.id === stage)?.media || !validWorkCalculation(calculation as unknown as Record<string, unknown>)) return fail();
  const difficulty = { easy: .8, normal: 1, hard: 1.4 }[calculation.difficulty];
  const prior = stage === 'revision' ? 1 - (calculation.reviewedPercent || 0) / 200 : 1;
  const minutes = Math.ceil(calculation.quantity * calculation.unitMinutes * difficulty * prior);
  if (minutes > 10080) return fail();
  return minutes;
}
function parseAvailabilityList(raw: unknown): AvailabilityWindow[] {
  if (!Array.isArray(raw) || raw.length > 56) return fail();
  return raw.map(value => {
    if (!object(value) || !integer(value.weekday, 0, 6) || !integer(value.startMinute, 0, 1439) || !integer(value.endMinute, 1, 1440) || value.endMinute <= value.startMinute) return fail();
    return { weekday: value.weekday, startMinute: value.startMinute, endMinute: value.endMinute };
  });
}
function parsePersonalHistory(raw: unknown): Task[] {
  if (!Array.isArray(raw) || raw.length > 10000) return fail();
  const result = raw.map(value => {
    if (!object(value) || typeof value.id !== 'string' || value.id.length > 180 || typeof value.date !== 'string' || !isValidDate(value.date) ||
      !integer(value.startMinute, 0, 1439) || !integer(value.endMinute, 1, 1440) || value.endMinute <= value.startMinute ||
      !Array.isArray(value.chapterIds) || value.chapterIds.length !== 1 || typeof value.chapterIds[0] !== 'string' || !Object.hasOwn(chapterById, value.chapterIds[0]) || !object(value.personalWork)) return fail();
    const work = value.personalWork, range = parseTaskRangeId(value.id);
    if (!range || range.kind !== 'part' || !range.sourceId.startsWith('personal:') || range.sourceId !== work.sourceId || range.from !== work.from || range.to !== work.to ||
      !WORK_STAGES.some(stage => stage.id === work.stage) || !integer(value.sourceMinutes, 1, 10080) || range.to > value.sourceMinutes ||
      typeof work.rawMinutes !== 'number' || !Number.isFinite(work.rawMinutes) || work.rawMinutes <= 0 || work.rawMinutes > 10080 ||
      !integer(work.pairDay, 1, 730) || typeof work.chapterMinutes !== 'number' || !Number.isFinite(work.chapterMinutes) || work.chapterMinutes < 0 || work.chapterMinutes > 80640 ||
      (work.evidenceMinutes !== undefined && (typeof work.evidenceMinutes !== 'number' || !Number.isFinite(work.evidenceMinutes) || work.evidenceMinutes <= 0 || work.evidenceMinutes > 10080)) ||
      !['student', 'planned', 'youtube-player', 'reference-metadata', 'default24'].includes(String(work.durationSource)) || !Array.isArray(work.requiredSources) || work.requiredSources.length > 8 ||
      !work.requiredSources.every(id => typeof id === 'string' && id.length <= 180 && id.startsWith('personal:')) || (work.url !== undefined && (typeof work.url !== 'string' || !safeClassUrl(work.url)))) return fail();
    for (const key of ['mediaFromSec', 'mediaToSec'] as const) if (work[key] !== undefined && (typeof work[key] !== 'number' || !Number.isFinite(work[key]) || Number(work[key]) < 0 || Number(work[key]) > 604800)) return fail();
    if (!range.sourceId.startsWith(`personal:${value.chapterIds[0]}:${work.stage}:`) || !/:[a-f0-9]{32}$/.test(range.sourceId)) return fail();
    if (value.rescheduledFrom !== undefined && (typeof value.rescheduledFrom !== 'string' || !isValidDate(value.rescheduledFrom))) return fail();
    if (typeof value.title !== 'string' || value.title.length > 400 || typeof value.detail !== 'string' || value.detail.length > 5000) return fail();
    const c = chapterById[value.chapterIds[0]], stage = work.stage as WorkStage;
    if (value.dayIndex !== undefined && !integer(value.dayIndex, 1, 10000)) return fail();
    return { id: value.id, date: value.date, dayIndex: value.dayIndex as number || 1, phase: 'learn' as const, subject: c.subject, kind: stage === 'revision' ? 'revision' as const : WORK_STAGES.find(item => item.id === stage)!.media || ['reading', 'notes'].includes(stage) ? 'learn' as const : 'practice' as const,
      chapterIds: [c.id], startMinute: value.startMinute, endMinute: value.endMinute, title: value.title, detail: value.detail, ...(value.rescheduledFrom ? { rescheduledFrom: value.rescheduledFrom as string } : {}), originalTaskId: range.sourceId, sourceMinutes: value.sourceMinutes,
      personalWork: { stage, sourceId: range.sourceId, from: range.from, to: range.to, requiredSources: [...work.requiredSources] as string[], chapterMinutes: work.chapterMinutes, pairDay: work.pairDay, rawMinutes: work.rawMinutes, durationSource: work.durationSource as DurationSource,
        ...(work.url ? { url: work.url as string } : {}), ...(work.evidenceMinutes !== undefined ? { evidenceMinutes: work.evidenceMinutes as number } : {}), ...(work.mediaFromSec !== undefined ? { mediaFromSec: work.mediaFromSec as number } : {}), ...(work.mediaToSec !== undefined ? { mediaToSec: work.mediaToSec as number } : {}) } };
  });
  if (new Set(result.map(task => `${task.date}:${task.id}`)).size !== result.length) return fail();
  return result;
}
export const CHAPTER_PROGRESS_STEPS = [
  { id: 'video', bn: 'ভিডিও ক্লাস', en: 'Video classes', stages: ['class', 'mcqClass', 'cqClass'] },
  { id: 'reading', bn: 'বই পড়া', en: 'Textbook reading', stages: ['reading'] },
  { id: 'notes', bn: 'নোট তৈরি', en: 'Notes', stages: ['notes'] },
  { id: 'mcq', bn: 'MCQ অনুশীলন', en: 'MCQ practice', stages: ['mcqPractice'] },
  { id: 'cq', bn: 'CQ অনুশীলন', en: 'CQ practice', stages: ['cqPractice'] },
  { id: 'revision', bn: 'রিভিশন', en: 'Revision', stages: ['revision'] },
] as const;
export const personalChapterSpeed = (routine: PersonalRoutine, id: string) => routine.chapterSpeeds?.[id] ?? routine.playbackSpeed;
export function personalStageDone(routine: PersonalRoutine, id: string, stage: WorkStage, completed: Record<string, string>): boolean {
  const budget = workloadFor(routine, id)[stage];
  if (budget.minutes === null) return false;
  if (budget.minutes === 0) return ['mcqClass', 'cqClass'].includes(stage); // explicitly omitted optional solving VIDEO, not practice
  const sourceId = personalStageSourceId(routine, id, stage);
  return !!completed[sourceId] || budget.minutes > 0 && sourceCovered(sourceId, 0, Math.ceil(budget.minutes / (WORK_STAGES.find(item => item.id === stage)!.media ? personalChapterSpeed(routine, id) : 1)), completed);
}
export function personalChapterProgress(routine: PersonalRoutine, id: string, completed: Record<string, string>) {
  const steps = CHAPTER_PROGRESS_STEPS.map(step => ({ ...step, done: step.stages.every(stage => personalStageDone(routine, id, stage, completed)) }));
  const covered = steps.slice(0, 3).filter(step => step.done).length, ready = steps.filter(step => step.done).length;
  return { steps, coveragePercent: Math.round(covered / 3 * 100), readinessPercent: Math.round(ready / 6 * 100),
    fullyComplete: ready === steps.length && chapterWorkEstimate(routine, id).complete, completedSteps: ready };
}
/** Individual, explicit source-stage confirmation. No all-chapter override exists. */
export function setPersonalStageCompletion(data: AppData, id: string, stage: WorkStage, done: boolean, at = new Date().toISOString()): AppData {
  const routine = personalRoutineForChapter(data, id); if (!routine) return data;
  if (workloadFor(routine, id)[stage].minutes === null || workloadFor(routine, id)[stage].minutes === 0 && !['mcqClass', 'cqClass'].includes(stage)) throw new Error(t('আগে এই ধাপের প্রকৃত/পরিকল্পিত সময় দাও; অজানা কাজ সম্পন্ন ধরা যায় না।', 'Enter this stage’s actual/planned duration first; unknown work cannot be certified complete.'));
  const sourceId = personalStageSourceId(routine, id, stage), completed = { ...data.completed };
  if (done) { if (!personalStageDone(routine, id, stage, completed)) completed[sourceId] = at; }
  else for (const key of Object.keys(completed)) if (key === sourceId || parseTaskRangeId(key)?.sourceId === sourceId) delete completed[key];
  return resumeUnfinishedPersonalPhase({ ...data, completed });
}
export function workloadFor(routine: PersonalRoutine, id: string): ChapterWorkload {
  // In-memory v1 objects and stored six-stage profiles both acquire the new
  // required steps as UNKNOWN, without converting old checklists into evidence.
  const saved = routine.workloads[id];
  // A chapter whose every duration is still unknown is not "configured": it gets
  // the editable 20-hour default so the plan, progress and picker never render blank.
  if (!saved || WORK_STAGES.every(stage => !saved[stage.id] || saved[stage.id].minutes === null)) return routine.manualWorkloads ? { ...defaultChapterWorkload(id), ...saved } : estimatedChapterWorkload(id);
  return WORK_STAGES.every(stage => saved[stage.id]) ? saved : { ...defaultChapterWorkload(id), ...saved };
}
export function chapterWorkEstimate(routine: PersonalRoutine, id: string) {
  const workload = workloadFor(routine, id);
  const unknown = WORK_STAGES.filter(stage => workload[stage.id].minutes === null).map(stage => stage.id);
  const emptyRequired = WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id) && workload[stage.id].minutes === 0).map(stage => stage.id);
  const minutes = WORK_STAGES.reduce((sum, stage) => sum + Math.ceil((workload[stage.id].minutes || 0) / (stage.media ? personalChapterSpeed(routine, id) : 1)), 0);
  return { minutes, unknown, emptyRequired, complete: unknown.length === 0 && emptyRequired.length === 0 && minutes > 0 };
}
export function weeklyWindows(routine: PersonalRoutine, date: string): AvailabilityWindow[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  let windows = routine.windows.filter(window => window.weekday === weekday).map(window => ({ ...window }));
  for (const excluded of routine.exclusions || []) if (excluded.weekday === weekday) windows = windows.flatMap(window => {
    const a = Math.max(window.startMinute, excluded.startMinute), b = Math.min(window.endMinute, excluded.endMinute);
    return a >= b ? [window] : [...(window.startMinute < a ? [{ ...window, endMinute: a }] : []), ...(b < window.endMinute ? [{ ...window, startMinute: b }] : [])];
  });
  return windows;
}
export function personalCapacity(data: AppData, date: string): number {
  if (!data.personalRoutine) return 0;
  const start = data.dayOverrides[date]?.startMinute ?? 0;
  const available = weeklyWindows(data.personalRoutine, date).reduce((sum, window) => sum + Math.max(0, window.endMinute - Math.max(window.startMinute, start)), 0);
  return Math.max(0, Math.min(available, data.personalRoutine.dailyLimitMinutes ?? Infinity, data.advanced?.targets[date] ?? Infinity,
    data.dayOverrides[date]?.dailyHours !== undefined ? data.dayOverrides[date].dailyHours! * 60 : Infinity));
}
/** Stable 128-bit identity for this exact source/duration/speed, not its calendar slot. */
function fingerprint(value: string): string {
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (const character of value) hash = ((hash ^ BigInt(character.codePointAt(0)!)) * 0x1000000000000000000013bn) & ((1n << 128n) - 1n);
  return hash.toString(16).padStart(32, '0');
}
/** The identity of the actual work: source URL, calculation basis and playback speed.
 * The bookkeeping duration is deliberately NOT part of it. Correcting a duration
 * (240 -> 250) or re-rounding an estimate must not silently orphan every tick the
 * student already made against the same video/volume. Changed sources still get a
 * new identity, so old evidence can never certify different work.
 */
/** The identity of the actual source: URL, calculation basis and playback speed.
 * The bookkeeping duration is checked separately through `evidenceMinutes`.
 */
export function personalStageSourceId(routine: PersonalRoutine, id: string, stage: WorkStage): string {
  const budget = workloadFor(routine, id)[stage];
  // Identity is the source (URL, calculation basis, playback speed) plus its
  // bookkeeping duration. Changing either creates a new identity, so an old tick
  // can never silently certify longer/different work; `durationEvidenceMatches`
  // is what lets a typo-sized correction keep its evidence.
  return `personal:${id}:${stage}:${fingerprint(JSON.stringify([budget.url || '', budget.minutes, WORK_STAGES.find(item => item.id === stage)!.media ? personalChapterSpeed(routine, id) : 1, budget.calculation ? [budget.calculation.quantity, budget.calculation.unitMinutes, budget.calculation.difficulty, budget.calculation.reviewedPercent ?? 0] : []]))}`;
}
function requiredStageIds(routine: PersonalRoutine, id: string): WorkStage[] {
  const work = workloadFor(routine, id);
  return WORK_STAGES.filter(stage => !['mcqClass', 'cqClass'].includes(stage.id) || work[stage.id].minutes !== 0).map(stage => stage.id);
}
function requiredSourceIds(routine: PersonalRoutine, id: string): string[] { return requiredStageIds(routine, id).map(stage => personalStageSourceId(routine, id, stage)); }
function sourcesFor(routine: PersonalRoutine, id: string) {
  const workload = workloadFor(routine, id);
  return WORK_STAGES.flatMap(stage => {
    const budget = workload[stage.id];
    if (!budget.minutes) return [];
    const minutes = Math.ceil(budget.minutes / (stage.media ? personalChapterSpeed(routine, id) : 1));
    return [{ stage, budget, minutes, sourceId: personalStageSourceId(routine, id, stage.id) }];
  });
}
/** S is a personal shortlist within A, never an additional copy of a chapter. */
export function personalCategory(data: AppData, id: string): 'S' | 'A' | 'B' | 'C' {
  if (data.personalRoutine?.scope === 'SELECTED' && data.personalRoutine.categories?.[id]) return data.personalRoutine.categories[id];
  const shortlist = data.personalRoutine?.scope === 'S' ? data.personalRoutine.chapterIds : data.personalPhases?.S?.chapterIds ?? RECOMMENDED_S_IDS;
  if (shortlist.includes(id)) return 'S';
  return data.chapterMeta[id]?.priority || chapterById[id].priority;
}
export function activePersonalCategory(data: AppData): 'S' | 'A' | 'B' | 'C' | undefined {
  const routine = data.personalRoutine;
  return (routine?.scope === 'ALL' || routine?.scope === 'SELECTED') ? (['S', 'A', 'B', 'C'] as const).find(category => routine.chapterIds.some(id => personalCategory(data, id) === category && !personalChapterProgress(routine, id, data.completed).fullyComplete)) : undefined;
}
/** Pair within each category, preferring different subjects. */
export function personalChapterPairs(routine: PersonalRoutine, data?: AppData): string[][] {
  if (routine.scope === 'ALL' || routine.scope === 'SELECTED') {
    const categories = ['S', 'A', 'B', 'C'] as const;
    const category = (id: string) => routine.scope === 'SELECTED' ? routine.categories?.[id] : data ? personalCategory(data, id) : RECOMMENDED_S_IDS.includes(id) ? 'S' : chapterById[id].priority;
    return categories.flatMap(group => personalChapterPairs({ ...routine, scope: 'A', chapterIds: routine.chapterIds.filter(id => category(id) === group) }));
  }
  const books = new Map<string, string[]>();
  for (const id of routine.chapterIds) {
    const c = chapterById[id]; const key = `${c.subject}-${c.paper}`;
    books.set(key, [...(books.get(key) || []), id]);
  }
  const keys = [...books.keys()]; const pairs: string[][] = []; let cursor = 0;
  while (keys.some(key => books.get(key)!.length)) {
    const available = keys.filter(key => books.get(key)!.length);
    const first = keys.slice(cursor).concat(keys.slice(0, cursor)).find(key => available.includes(key))!;
    const firstId = books.get(first)!.shift()!;
    const second = available.find(key => key !== first && chapterById[books.get(key)![0]]?.subject !== chapterById[firstId].subject) || available.find(key => key !== first);
    const pair = [firstId]; if (second) pair.push(books.get(second)!.shift()!);
    pairs.push(pair); cursor = (keys.indexOf(second || first) + 1) % keys.length;
  }
  return pairs;
}
/** Free slots around actual reservations, including the student's session break.
 * Fixed appointments/pins keep their exact times; only newly allocated work is
 * kept clear on either side. Breaks consume wall time, never extra net capacity.
 */
export function personalFreeWindows(data: AppData, date: string, reserved: Task[]): [number, number][] {
  const start = data.dayOverrides[date]?.startMinute ?? 0, gap = data.personalRoutine!.breakMinutes;
  let free: [number, number][] = weeklyWindows(data.personalRoutine!, date).map(window => [Math.max(start, window.startMinute), window.endMinute]).filter(([s, e]) => e > s) as [number, number][];
  for (const task of reserved) free = free.flatMap(([s, e]) => {
    const a = Math.max(s, task.startMinute - gap), b = Math.min(e, task.endMinute + gap);
    return a >= b ? [[s, e] as [number, number]] : [...(s < a ? [[s, a] as [number, number]] : []), ...(b < e ? [[b, e] as [number, number]] : [])];
  });
  return free;
}
export function buildPersonalStudyProjection(data: AppData): PersonalProjection {
  const routine = data.personalRoutine;
  if (!routine || !isValidDate(data.settings.startDate) || !isValidDate(data.settings.examDate) || diffDays(data.settings.startDate, data.settings.examDate) > 730) return { plan: [], issues: [], unknownChapters: [], plannedChapterIds: [] };
  const plan: Day[] = Array.from({ length: Math.max(0, diffDays(data.settings.startDate, data.settings.examDate)) }, (_, index) => ({ date: addDays(data.settings.startDate, index), index: index + 1, phase: 'learn', isCatchup: false, personalRoutine: true, tasks: [] }));
  const reservations = new Map(applyManualSchedule(applyRoutine(plan, data.routineBlocks), data).map(day => [day.date, day.tasks]));
  const issues: RoutineIssue[] = [];
  const unknownChapters = routine.chapterIds.filter(id => chapterWorkEstimate(routine, id).unknown.length > 0);
  // Ticks made against an older URL / calculation / playback speed keep their
  // timestamps, but they can no longer certify the changed source. Say so out
  // loud instead of letting a finished chapter silently drop back to 83%.
  const staleChapters = routine.chapterIds.filter(id => WORK_STAGES.some(stage => stage.media &&
    workloadFor(routine, id)[stage.id].minutes && personalStageHasOrphanEvidence(data, id, stage.id)));
  const noWork = routine.chapterIds.filter(id => !chapterWorkEstimate(routine, id).unknown.length && !chapterWorkEstimate(routine, id).minutes);
  const missingRequired = routine.chapterIds.filter(id => chapterWorkEstimate(routine, id).emptyRequired.length > 0 && !noWork.includes(id));
  if (missingRequired.length) issues.push({ code: 'required-work', chapterIds: missingRequired, count: missingRequired.length, minutes: 0 });
  if (noWork.length) issues.push({ code: 'no-work', chapterIds: noWork, minutes: 0 });
  if (staleChapters.length) issues.push({ code: 'stale-evidence', chapterIds: staleChapters, minutes: 0, count: staleChapters.length });
  if (unknownChapters.length) issues.push({ code: 'unknown-duration', chapterIds: unknownChapters, minutes: 0, count: unknownChapters.length });
  const plannedChapterIds: string[] = [];
  let dayIndex = Math.max(0, diffDays(data.settings.startDate, routine.startsOn && routine.startsOn > data.settings.startDate ? routine.startsOn : data.settings.startDate));
  // A chapter whose durations are still unknown can never be scheduled or given
  // an invented finish date, but it must not blank out the whole plan either:
  // known work in the same category can still be projected. In ALL mode,
  // a later category must wait for unknown work in the previous category.
  let previousCategory: string | undefined;
  let categoryHasUnknown = false;
  for (const pair of personalChapterPairs(routine, data)) {
    const category = routine.scope === 'ALL' || routine.scope === 'SELECTED' ? personalCategory(data, pair[0]) : routine.scope;
    if (category !== previousCategory) {
      if (categoryHasUnknown) break;
      previousCategory = category;
    }
    if (pair.some(id => !chapterWorkEstimate(routine, id).complete)) categoryHasUnknown = true;
    const known = pair.filter(id => chapterWorkEstimate(routine, id).complete);
    if (!known.length) continue; // Nothing schedulable yet; the unknown-duration issue names it.
    const chapters = known.map(id => {
      const sources = sourcesFor(routine, id);
      // Keep source identities and their evidence intact, but schedule in the
      // student's three-session order, never alternating class and notes.
      const halves = PERSONAL_SESSIONS.flatMap(session => session.stages.flatMap(stage =>
        sources.filter(source => source.stage.id === stage).map(source => ({ source, from: 0, to: source.minutes }))));
      return { id, sources, requiredSources: requiredSourceIds(routine, id), halves, used: 0, total: chapterWorkEstimate(routine, id).minutes,
        firstHalf: chapterWorkEstimate(routine, id).minutes };
    });
    let pairDay = 0;
    while (dayIndex < plan.length && (pairDay < 2 || chapters.some(c => c.used < c.total))) {
      const day = plan[dayIndex++]; const windows = personalFreeWindows(data, day.date, reservations.get(day.date) || []);
      if (!windows.length || personalCapacity(data, day.date) <= 0) continue;
      pairDay++;
      let windowIndex = 0, cursor = windows[0][0], budget = Math.max(0, personalCapacity(data, day.date) - (reservations.get(day.date) || []).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0));
      if (!budget) { pairDay--; continue; }
      const quotas = chapters.map(c => Math.max(0, (pairDay === 1 ? c.firstHalf : c.total) - c.used));
      let turn = pairDay % chapters.length; // Rotate when a very short day can serve only one book.
      const servedThisRound = new Set<number>();
      const appendSegment = (chapterIndex: number) => {
        const chapter = chapters[chapterIndex];
        while (windowIndex < windows.length && cursor >= windows[windowIndex][1]) {
          windowIndex++; if (windows[windowIndex]) cursor = Math.max(cursor, windows[windowIndex][0]);
        }
        if (!quotas[chapterIndex] || !budget || windowIndex >= windows.length) return false;
        const [windowStart, windowEnd] = windows[windowIndex]; cursor = Math.max(cursor, windowStart);
        let offset = chapter.used; let fragment = chapter.halves[0];
        for (const candidate of chapter.halves) { fragment = candidate; if (offset < candidate.to - candidate.from) break; offset -= candidate.to - candidate.from; }
        const source = fragment.source;
        // Reserve a share for the OTHER book still waiting in this round, not
        // repeatedly for a book that already had its turn. Re-dividing every
        // remainder created 25+8+7-minute fragments instead of 25+25 with a break.
        if (!quotas.some((n, index) => n > 0 && !servedThisRound.has(index))) servedThisRound.clear();
        const pending = quotas.filter((n, index) => n > 0 && !servedThisRound.has(index)).length;
        const wall = windowEnd - cursor;
        const fairShare = pending > 1 && wall > routine.breakMinutes * (pending - 1)
          ? Math.max(1, Math.min(Math.ceil(budget / pending), Math.ceil((wall - routine.breakMinutes * (pending - 1)) / pending))) : wall;
        const minutes = Math.min(routine.sessionMinutes, wall, fairShare, quotas[chapterIndex], budget, fragment.to - fragment.from - offset);
        if (minutes <= 0) return false;
        const from = fragment.from + offset, to = from + minutes;
        const personalWork: PersonalWork = { stage: source.stage.id, sourceId: source.sourceId, from, to,
          requiredSources: chapter.requiredSources, chapterMinutes: chapter.total, pairDay,
          rawMinutes: source.budget.minutes!, durationSource: source.budget.source,
          ...(source.budget.url ? { url: source.budget.url } : {}),
          ...(source.stage.media ? { mediaFromSec: from / source.minutes * source.budget.minutes! * 60, mediaToSec: to / source.minutes * source.budget.minutes! * 60 } : {}) };
        const range = source.stage.media ? t(` · ক্লাসের উৎস ${bn(Math.floor(personalWork.mediaFromSec! / 60))}–${bn(Math.ceil(personalWork.mediaToSec! / 60))} মিনিট`, ` · source ${Math.floor(personalWork.mediaFromSec! / 60)}–${Math.ceil(personalWork.mediaToSec! / 60)} min`) : '';
        day.tasks.push({ id: `smart-part|${encodeURIComponent(source.sourceId)}|${from}|${to}`, originalTaskId: source.sourceId, sourceMinutes: source.minutes,
          date: day.date, dayIndex: day.index, phase: 'learn', subject: chapterById[chapter.id].subject,
          kind: source.stage.id === 'revision' ? 'revision' : source.stage.media || ['reading', 'notes'].includes(source.stage.id) ? 'learn' : 'practice',
          title: `${chapterById[chapter.id].title} · ${t(source.stage.bn, source.stage.en)}`,
          detail: `${routine.scope} ${t('ক্যাটাগরি', 'category')} · ${t('তিন সেশনের ধারাবাহিক কাজ', 'Work in three-session order')} · ${t('জোড়ার পড়ার দিন', 'Pair study day')} ${bn(pairDay)}${range}. ${source.stage.media ? t(`পুরো ক্লাসের উৎস ${formatDurationBn(source.budget.minutes!)}; এই সেশনটি শুধু উপরের অংশ, পুরো ক্লাস নয়।`, `Full source ${formatDurationBn(source.budget.minutes!)}; this session covers only the stated segment, not the whole class.`) : t('নিজে অনুশীলনের পরিকল্পিত সময়; ভিডিওর দৈর্ঘ্য নয়।', 'Planned independent work, not a video duration.')}`,
          chapterIds: [chapter.id], startMinute: cursor, endMinute: cursor + minutes, personalWork });
        cursor += minutes + routine.breakMinutes;
        chapter.used += minutes; quotas[chapterIndex] -= minutes; budget -= minutes;
        servedThisRound.add(chapterIndex);
        return true;
      };
      while (quotas.some(n => n > 0) && budget > 0 && windowIndex < windows.length) {
        turn = (turn + 1) % chapters.length;
        const index = quotas[turn] > 0 ? turn : quotas.findIndex(n => n > 0);
        if (!appendSegment(index)) break;
      }
      if (pairDay === 2 && chapters.some(c => c.used < c.total)) issues.push({ code: 'two-day-capacity', chapterIds: known, minutes: chapters.reduce((sum, c) => sum + c.total - c.used, 0) });
    }
    if (chapters.some(c => c.used < c.total)) {
      const remaining = chapters.reduce((sum, c) => sum + c.total - c.used, 0);
      issues.push({ code: 'deadline', chapterIds: known, minutes: remaining });
      if (plan.length) plan[plan.length - 1].deferredMinutes = remaining;
      break;
    }
    plannedChapterIds.push(...known);
  }
  // Every chapter now carries a budget, so a long pair usually needs extra days.
  // That is ONE fact about the schedule, not one warning per chapter pair.
  const spill = issues.filter(issue => issue.code === 'two-day-capacity');
  if (spill.length > 1) {
    // Keep every other issue in its original order; drop only the duplicates.
    const merged: RoutineIssue = { code: 'two-day-capacity', chapterIds: [...new Set(spill.flatMap(issue => issue.chapterIds))], minutes: spill.reduce((sum, issue) => sum + issue.minutes, 0), count: spill.length };
    const kept = issues.filter(issue => issue.code !== 'two-day-capacity');
    const at = issues.findIndex(issue => issue.code === 'two-day-capacity');
    kept.splice(kept.filter(issue => issues.indexOf(issue) < at).length, 0, merged);
    issues.splice(0, issues.length, ...kept);
  }
  return { plan, issues, unknownChapters, plannedChapterIds };
}
export function routineIssueText(issue: RoutineIssue): string {
  const names = issue.chapterIds.slice(0, 2).map(id => chapterById[id]?.title || id).join(' + ');
  if (issue.code === 'unknown-duration') return t(`${names}${issue.chapterIds.length > 2 ? ` +${bn(issue.chapterIds.length - 2)}` : ''} — এই নির্বাচিত অধ্যায়ের ক্লাস/কাজের সময় অজানা। প্রকৃত সময় না মেলা পর্যন্ত এদের শেষ তারিখ বানানো হবে না; বাকি অধ্যায়ের কাজ চলবে।`, `${names}${issue.chapterIds.length > 2 ? ` +${issue.chapterIds.length - 2}` : ''} — selected chapters with unknown class/work durations. No finish date is invented for them until the real minutes are entered; the other chapters keep their sessions.`);
  if (issue.code === 'stale-evidence') return t(`${names}: ভিডিও/গণনার উৎস বদলেছ, তাই আগের টিকগুলো নতুন উৎসের প্রমাণ হিসেবে গোনা হচ্ছে না (মুছে যায়নি)। নতুন উৎসটি দেখে/করে আবার টিক দাও।`, `${names}: the video/calculation source changed, so the earlier ticks no longer count as evidence for the new source (nothing was deleted). Study/practise the new source and tick it again.`);
  if (issue.code === 'two-day-capacity') return (issue.count || 0) > 1
    ? t(`${bn(issue.count!)}টি অধ্যায়-জোড়ার প্রতিটির প্রথম দুই পড়ার দিনের পর মোট ${formatDurationBn(issue.minutes)} কাজ বাকি থাকে। কাজ পরের দিনগুলোতে চলবে।`, `Across ${issue.count} chapter pairs, ${formatDurationBn(issue.minutes)} in total remains after each pair's first two study days. Work continues on later days.`)
    : t(`${names}: এই জোড়ার প্রথম দুই পড়ার দিনের পর ${formatDurationBn(issue.minutes)} কাজ বাকি থাকে। কাজ পরের দিনগুলোতে চলবে।`, `${names}: ${formatDurationBn(issue.minutes)} remains after this pair's first two study days. Work continues on later days.`);
  if (issue.code === 'deadline') return t(`${names}: লক্ষ্য তারিখ পর্যন্ত আরও ${formatDurationBn(issue.minutes)} কাজ রাখা যায়নি। পরের নির্বাচিত অধ্যায়গুলোও শেষ হয়েছে ধরে নিও না।`, `${names}: ${formatDurationBn(issue.minutes)} does not fit before the target. Later selected chapters are not assumed finished either.`);
  if (issue.code === 'locked-work') return t('লক করা অতীতের দিনের অসমাপ্ত অংশ সরানো হয়নি। আগের জোড়া শেষ করা বা দিন আনলক না করা পর্যন্ত পরের জোড়ায় এগোবে না।', 'Unfinished ranges on locked past dates were not moved. Complete that pair or unlock those dates before progressing to the next pair.');
  if (issue.code === 'required-work') return t('কিছু অধ্যায়ের বাধ্যতামূলক ধাপের সময় ০। ভিডিও, বই পড়া, নোট, MCQ/CQ অনুশীলন ও রিভিশন বাদ দিয়ে সম্পন্ন ধরা যাবে না; প্রতিটির কাজের পরিমাণ/সময় ঠিক করো।', 'Some required stages have a zero budget. Video, reading, notes, MCQ/CQ practice and revision cannot be skipped to certify completion; configure their workload/time.');
  if (issue.code === 'unscheduled') return t('কিছু সংরক্ষিত কাজ সময়ের বাইরে, সংঘর্ষে, অথবা আগের ক্যাটাগরি শেষ না হওয়ায় অপেক্ষায় আছে। তথ্য মুছেনি; ক্যালেন্ডারে দেখো।', 'Some saved appointments are outside availability, clash, or are waiting for an earlier category. They are retained; review them in the calendar.');
  if (issue.code === 'no-work') return t(`${names}: সব কাজ ০ দেওয়া আছে। অন্তত একটি কাজের আসল/পরিকল্পিত সময় দাও; শূন্য কাজকে অধ্যায় সম্পন্ন ধরা হয়নি।`, `${names}: every work budget is zero. Configure some actual/planned work; zero work never certifies a chapter.`);
  if (issue.code === 'missing-allocation') return t(`${bn(issue.count || 0)}টি নির্বাচিত অধ্যায়ের পুরো কাজ বর্তমান তালিকায় নেই। সরানো/মুছে দেওয়া অংশ দেখে নাও; আংশিক তারিখকে শেষ তারিখ ধরা হয়নি।`, `${issue.count || 0} selected chapters have work missing from the current schedule. Review removed/moved segments; a partial date is not a finish date.`);
  if (issue.code === 'day-capacity') return t('কিছু দিনের কাস্টম কাজসহ মোট বরাদ্দ তোমার দেওয়া সময়ের সীমা ছাড়িয়েছে। বাড়তি কাজ নিজে মিলিয়ে নাও।', 'On some days, custom work pushes allocation above your availability cap. Review those explicit tasks.');
  if (issue.code === 'source-edit') return t('সংরক্ষিত কোনো সেশনের অধ্যায়/ভিডিও-সময় বদল নির্বাচিত উৎসের সঙ্গে মেলে না। সেই পুরোনো সম্পাদনা রাখা আছে, কিন্তু ভিডিও ছোট করা বা অন্য অধ্যায় সম্পন্ন দেখাতে তা ব্যবহার করা হয়নি। Settings-এ উৎস/সময় ঠিক করো।', 'A saved chapter/video-duration edit does not match the selected source. The old edit is retained, but cannot shorten the video or certify another chapter. Edit the source/workload in Settings.');
  if (issue.code === 'overlap') return t('কাস্টম সেশনের সময় অন্য সেশনের সঙ্গে মিলছে। নিজের সময়গুলো মিলিয়ে নাও।', 'Custom sessions overlap. Review your explicit times.');
  return t('কিছু নিজের যোগ করা কাজ তোমার দেওয়া পড়ার সময়ের বাইরে আছে; সেগুলো নিজে সরাও।', 'Some custom tasks are outside your availability; move them explicitly.');
}
/** Checks the FINAL, manually edited schedule rather than the old all-114-chapter model. */
export function personalRoutineHealth(data: AppData, plan: Day[]) {
  const projection = buildPersonalStudyProjection(data);
  const issues: RoutineIssue[] = projection.issues.filter(issue => issue.code !== 'deadline' && (issue.code !== 'two-day-capacity' || issue.chapterIds.some(id => !isPersonalChapterDone(plan, id, data.completed, data.personalRoutine))));
  const tasks = plan.flatMap(day => day.tasks);
  if (plan.some(day => day.unscheduled?.some(task => !isPersonalTaskComplete(task, data.completed)))) issues.push({ code: 'unscheduled', chapterIds: [], minutes: 0 });
  const pending = tasks.filter(task => !isPersonalTaskComplete(task, data.completed)).sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
  if (plan[0]?.reflowFrom && pending.some(task => task.date < plan[0].reflowFrom! && data.lockedDates.includes(task.date))) issues.push({ code: 'locked-work', chapterIds: [], minutes: 0 });
  let through = -Infinity, overlaps = 0;
  for (const task of pending) { const start = Date.parse(`${task.date}T00:00:00Z`) / 60000 + task.startMinute; if (start < through) overlaps++; through = Math.max(through, start + task.endMinute - task.startMinute); }
  if (overlaps) issues.push({ code: 'overlap', chapterIds: [], minutes: 0 });
  if (data.personalRoutine && pending.some(task => !weeklyWindows(data.personalRoutine!, task.date).some(window => task.startMinute >= Math.max(window.startMinute, data.dayOverrides[task.date]?.startMinute ?? 0) && task.endMinute <= window.endMinute))) issues.push({ code: 'custom-outside', chapterIds: [], minutes: 0 });
  if (plan.some(day => day.tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0) > personalCapacity(data, day.date))) issues.push({ code: 'day-capacity', chapterIds: [], minutes: 0 });
  const missing = (data.personalRoutine?.chapterIds || []).filter(id => !hasFullPersonalAllocation(data, plan, id));
  const newlyMissing = missing.filter(id => chapterWorkEstimate(data.personalRoutine!, id).complete);
  if (newlyMissing.length) issues.push({ code: 'missing-allocation', chapterIds: newlyMissing, count: newlyMissing.length, minutes: 0 });
  const deferredMinutes = plan.reduce((sum, day) => sum + (day.deferredMinutes || 0), 0);
  if (deferredMinutes && newlyMissing.length) issues.push({ code: 'deadline', chapterIds: newlyMissing.slice(0, 2), minutes: deferredMinutes });
  if (tasks.some(task => task.personalWork && (data.taskEdits[task.id]?.chapterIds?.some(id => !task.chapterIds.includes(id)) ||
      (data.dayOverrides[task.date]?.taskMinutes?.[task.id] !== undefined && data.dayOverrides[task.date].taskMinutes![task.id] !== task.endMinute - task.startMinute)))) issues.push({ code: 'source-edit', chapterIds: [], minutes: 0 });
  // Taking more than two days is normal and is not an error. Keep this fact in
  // structured diagnostics, but reserve the global banner for actionable issues.
  return { issues, warnings: issues.filter(issue => issue.code !== 'two-day-capacity').map(routineIssueText), missingDurations: issues.some(issue => issue.code === 'unknown-duration'),
    syllabusEnd: !missing.length ? tasks.filter(task => task.personalWork).map(task => task.date).sort().at(-1) : undefined, clashingSessions: overlaps };
}
/** Timestamps for this chapter+stage that belong to a source no longer selected.
 * They are history, not evidence: the changed video/calculation must be studied
 * again, and the student has to be told instead of silently losing the tick.
 */
function personalStageHasOrphanEvidence(data: AppData, chapterId: string, stage: WorkStage): boolean {
  if (!data.personalRoutine) return false;
  // Timestamps stored under a source identity that is no longer selected: the
  // URL, calculation, playback speed or duration changed, so they are history,
  // not evidence for the current work.
  const current = personalStageSourceId(data.personalRoutine, chapterId, stage);
  const prefix = `personal:${chapterId}:${stage}:`;
  return Object.keys(data.completed).some(id => {
    const source = parseTaskRangeId(id)?.sourceId || id;
    return source.startsWith(prefix) && source !== current && id !== current;
  });
}
/** Stable source/range evidence can outlive every visible calendar partition. */
function sourceCovered(sourceId: string, from: number, to: number, completed: Record<string, string>, scheduled: Task[] = []): boolean {
  if (completed[sourceId]) return true;
  const ranges = [...Object.keys(completed), ...scheduled.filter(task => task.personalWork?.sourceId === sourceId).map(task => task.id)].flatMap(id => {
    const range = parseTaskRangeId(id); return range?.kind === 'part' && range.sourceId === sourceId ? [range] : [];
  }).sort((a, b) => a.from - b.from);
  let through = from;
  for (const range of ranges) {
    if (range.to <= through) continue;
    if (range.from > through) return false;
    through = Math.max(through, range.to); if (through >= to) return true;
  }
  return false;
}
export function hasFullPersonalAllocation(data: AppData, plan: Day[], chapterId: string): boolean {
  const routine = personalRoutineForChapter(data, chapterId);
  return !!routine && chapterWorkEstimate(routine, chapterId).complete && requiredStageIds(routine, chapterId).every(stage => { const budget = workloadFor(routine, chapterId)[stage]; return budget.minutes === 0 ? personalStageDone(routine, chapterId, stage, data.completed) : sourceCovered(personalStageSourceId(routine, chapterId, stage), 0, Math.ceil(budget.minutes! / (WORK_STAGES.find(item => item.id === stage)!.media ? personalChapterSpeed(routine, chapterId) : 1)), data.completed, plan.flatMap(day => day.tasks)); });
}
export function personalCompletionEvidence(data: AppData, chapterId: string): string[] {
  if (!data.personalRoutine) return [];
  const sources = new Set(requiredSourceIds(personalRoutineForChapter(data, chapterId) || data.personalRoutine, chapterId));
  return Object.entries(data.completed).filter(([id]) => sources.has(id) || sources.has(parseTaskRangeId(id)?.sourceId || '')).map(([, at]) => at);
}
/** Covers the visible range, not necessarily the whole video/chapter. Does not write evidence. */
/** `expectedMinutes` lets a caller reject a tick recorded against a different
 * class length. It is optional so every existing call site keeps its behaviour;
 * the projection passes the current budget when it has one.
 */
export function isPersonalTaskComplete(task: Pick<Task, 'id' | 'personalWork'>, completed: Record<string, string>): boolean {
  if (completed[task.id]) return true;
  const parsed = parseTaskRangeId(task.id);
  const work = task.personalWork || (parsed?.kind === 'part' && parsed.sourceId.startsWith('personal:') ? parsed : undefined);
  return !!work && sourceCovered(work.sourceId, work.from, work.to, completed);
}
export function personalUnfinishedRanges(task: Pick<Task, 'id' | 'personalWork'>, completed: Record<string, string>): { from: number; to: number }[] {
  const work = task.personalWork;
  if (!work || isPersonalTaskComplete(task, completed)) return [];
  const ranges = Object.keys(completed).flatMap(id => {
    const range = parseTaskRangeId(id);
    return range?.kind === 'part' && range.sourceId === work.sourceId && range.to > work.from && range.from < work.to ? [range] : [];
  }).sort((a, b) => a.from - b.from);
  const missing: { from: number; to: number }[] = [];
  let through = work.from;
  for (const range of ranges) {
    if (range.from > through) missing.push({ from: through, to: Math.min(range.from, work.to) });
    through = Math.max(through, Math.min(range.to, work.to));
  }
  if (through < work.to) missing.push({ from: through, to: work.to });
  return missing;
}
export function isPersonalChapterDone(plan: Day[], id: string, completed: Record<string, string>, routine?: PersonalRoutine): boolean {
  if (routine) return personalChapterProgress(routine, id, completed).fullyComplete;
  const tasks = plan.flatMap(day => day.tasks).filter(task => task.personalWork && task.chapterIds.includes(id));
  const sources = tasks[0]?.personalWork?.requiredSources;
  return !!sources?.length && sources.every(source => hasFullTaskAllocation(tasks, source, completed));
}
/** Explicit undo subtracts only the requested range, retaining other work/timestamps. */
export function undoPersonalRange(completed: Record<string, string>, task: Task): Record<string, string> {
  const work = task.personalWork; if (!work) return completed;
  const result = { ...completed };
  for (const [id, at] of Object.entries(completed)) {
    const parsed = parseTaskRangeId(id);
    const range = id === work.sourceId ? { sourceId: id, from: 0, to: task.sourceMinutes! } : parsed?.kind === 'part' ? parsed : null;
    if (!range || range.sourceId !== work.sourceId || range.to <= work.from || range.from >= work.to) continue;
    delete result[id];
    if (range.from < work.from) result[`smart-part|${encodeURIComponent(work.sourceId)}|${range.from}|${work.from}`] ||= at;
    if (range.to > work.to) result[`smart-part|${encodeURIComponent(work.sourceId)}|${work.to}|${range.to}`] ||= at;
  }
  return result;
}
/** Freeze covered source ranges at the slot where the student confirmed them.
 * This is allocation history only: `completed` remains the sole source evidence.
 */
export function personalHistorySnapshot(routine: PersonalRoutine, plan: Day[], completed: Record<string, string>): Task[] {
  const seen: Record<string, string> = {}, history: Task[] = [];
  const retainedHistory = new Set((routine.history || []).map(task => `${task.date}:${task.id}`));
  for (const task of [...(routine.history || []), ...plan.flatMap(day => [...day.tasks, ...(day.historyTasks || [])])]) {
    const work = task.personalWork;
    if (!work || (!routine.chapterIds.includes(task.chapterIds[0]) && !(routine.scope === 'SELECTED' && retainedHistory.has(`${task.date}:${task.id}`)))) continue;
    let from = work.from;
    const missing = personalUnfinishedRanges(task, completed);
    const covered: { from: number; to: number }[] = [];
    for (const gap of missing) { if (gap.from > from) covered.push({ from, to: gap.from }); from = gap.to; }
    if (from < work.to) covered.push({ from, to: work.to });
    for (const done of covered) for (const range of personalUnfinishedRanges({ id: '', personalWork: { ...work, ...done } }, seen)) {
      const id = `smart-part|${encodeURIComponent(work.sourceId)}|${range.from}|${range.to}`;
      seen[id] = 'history-only';
      const startMinute = Math.floor(task.startMinute + range.from - work.from);
      history.push({ ...task, id, startMinute, endMinute: startMinute + Math.ceil(range.to - range.from),
        personalWork: { ...work, ...range, ...(work.mediaFromSec !== undefined ? { mediaFromSec: range.from / task.sourceMinutes! * work.rawMinutes * 60, mediaToSec: range.to / task.sourceMinutes! * work.rawMinutes * 60 } : {}) } });
    }
  }
  return history;
}
export function retainPersonalHistory(data: AppData, plan: Day[]): AppData {
  if (!data.personalRoutine) return data;
  const history = personalHistorySnapshot(data.personalRoutine, plan, data.completed);
  return JSON.stringify(history) === JSON.stringify(data.personalRoutine.history || []) ? data : { ...data, personalRoutine: { ...data.personalRoutine, history } };
}
const PHASES = ['S', 'A', 'B', 'C'] as const;
export function nextPersonalRoutine(data: AppData, asOf: string): PersonalRoutine | undefined {
  const current = data.personalRoutine;
  if (!current || (current.scope === 'ALL' || current.scope === 'SELECTED') || !isValidDate(asOf) || asOf >= data.settings.examDate || current.chapterIds.some(id => !personalChapterProgress(current, id, data.completed).fullyComplete)) return undefined;
  const excluded = new Set([...(Object.values(data.personalPhases || {}).flatMap(routine => routine.chapterIds)), ...current.chapterIds]);
  for (const scope of PHASES.slice(PHASES.indexOf(current.scope) + 1)) {
    const retained = data.personalPhases?.[scope];
    const ids = retained?.chapterIds || CHAPTERS.filter(c => c.priority === scope && !excluded.has(c.id)).map(c => c.id);
    if (!ids.length) continue;
    // A retained phase already has a confirmed earliest start. Re-completing an
    // undone prerequisite must not backdate that phase or bypass it for B/C.
    const startsOn = [asOf, data.settings.startDate, retained?.startsOn || data.settings.startDate].sort().at(-1)!;
    if (startsOn >= data.settings.examDate) return undefined;
    return { ...(retained || newPersonalRoutine(scope, [...excluded])), chapterIds: [...ids], startsOn,
      windows: current.windows.map(window => ({ ...window })), exclusions: (current.exclusions || []).map(window => ({ ...window })),
      ...(current.dailyLimitMinutes !== undefined ? { dailyLimitMinutes: current.dailyLimitMinutes } : {}), playbackSpeed: current.playbackSpeed, sessionMinutes: current.sessionMinutes, breakMinutes: current.breakMinutes };
  }
  return undefined;
}
/** Undoing a previously finished prerequisite reopens it instead of prioritising A/B/C. */
export function resumeUnfinishedPersonalPhase(data: AppData): AppData {
  if (!data.personalRoutine || (data.personalRoutine.scope === 'ALL' || data.personalRoutine.scope === 'SELECTED')) return data;
  const earlier = PHASES.slice(0, PHASES.indexOf(data.personalRoutine.scope)).find(scope => {
    const routine = data.personalPhases?.[scope];
    return routine && routine.chapterIds.some(id => !personalChapterProgress(routine, id, data.completed).fullyComplete);
  });
  if (!earlier) return data;
  const personalPhases = { ...data.personalPhases, [data.personalRoutine.scope]: data.personalRoutine };
  const personalRoutine = personalPhases[earlier]!; delete personalPhases[earlier];
  return { ...data, personalRoutine, personalPhases };
}
/** An explicit new selection starts empty; source settings remain available if reselected. */
export function selectedChapterRoutineDraft(data: AppData): PersonalRoutine {
  const active = data.personalRoutine;
  if (!active) return { ...newPersonalRoutine('SELECTED'), categories: {} };
  if (active.scope === 'SELECTED') return structuredClone(active);
  const phases = [...Object.values(data.personalPhases || {}), active];
  const workloads = Object.assign({}, ...phases.map(phase => phase.workloads));
  const chapterSpeeds: NonNullable<PersonalRoutine['chapterSpeeds']> = { ...active.chapterSpeeds };
  for (const phase of phases) for (const id of phase.chapterIds) {
    workloads[id] = workloadFor(phase, id);
    chapterSpeeds[id] = personalChapterSpeed(phase, id);
  }
  return { ...structuredClone(active), scope: 'SELECTED', chapterIds: [], categories: {}, workloads, chapterSpeeds };
}
/** Combine old phases without losing source identities, historical allocations or notes. */
export function allChapterRoutineDraft(data: AppData, plan: Day[]): PersonalRoutine {
  const active = data.personalRoutine;
  if (!active) return newPersonalRoutine('ALL');
  if (active.scope === 'ALL') return structuredClone(active);
  const phases = [...Object.values(data.personalPhases || {}), active];
  const workloads = Object.assign({}, ...phases.map(phase => phase.workloads));
  const chapterSpeeds: NonNullable<PersonalRoutine['chapterSpeeds']> = {};
  for (const phase of phases) for (const id of phase.chapterIds) {
    workloads[id] = workloadFor(phase, id);
    chapterSpeeds[id] = personalChapterSpeed(phase, id);
  }
  const history = [...phases.flatMap(phase => phase.history || []), ...personalHistorySnapshot(active, plan, data.completed)];
  const uniqueHistory = [...new Map(history.map(task => [`${task.date}:${task.id}`, task])).values()];
  if (uniqueHistory.length > 10000) throw new Error(t('পুরোনো ইতিহাস অনেক বড়; আগে ব্যাকআপ নিয়ে Settings-এ রুটিন রাখো।', 'History is too large to combine safely; keep a backup and review Settings.'));
  const combined = { ...active }; delete combined.categories;
  return { ...combined, scope: 'ALL', chapterIds: CHAPTERS.map(chapter => chapter.id), workloads, chapterSpeeds, history: uniqueHistory, updatedAt: new Date().toISOString() };
}
export function applyAllChapterRoutine(data: AppData, plan: Day[]): AppData {
  const active = data.personalRoutine;
  if (!active || active.scope === 'ALL') return data;
  if (data.lockedDates.some(date => date >= data.settings.startDate && date < data.settings.examDate)) throw new Error(t('সব অধ্যায় যোগ করার আগে লক করা দিন আনলক করো।', 'Unlock plan dates before adding every chapter.'));
  const personalRoutine = parsePersonalRoutine(allChapterRoutineDraft(data, plan));
  const personalPhases = active.scope === 'SELECTED' ? { ...data.personalPhases } : { ...data.personalPhases, [active.scope]: structuredClone(active) };
  return { ...data, personalRoutine, personalPhases, settings: { ...data.settings, calendarRevision: data.settings.calendarRevision + 1 } };
}
export function applyPersonalRoutine(data: AppData, raw: unknown, options: { plan?: Day[]; asOf?: string } = {}): AppData {
  let routine = parsePersonalRoutine(raw);
  const dateError = personalScheduleDateError(data.settings, routine); if (dateError) throw new Error(dateError);
  if (data.lockedDates.some(date => date >= data.settings.startDate && date < data.settings.examDate)) throw new Error(t('পুরো রুটিন বদলানোর আগে লক করা দিনগুলো আনলক করো।', 'Unlock plan dates before changing the whole routine.'));
  let personalPhases = data.personalPhases;
  // Reopening S retains later phases. An edit must not give two retained phases
  // ownership of the same chapter: that snapshot would fail backup/reload
  // validation. Reject before changing history, progress or durable storage.
  const conflict = routine.scope === 'ALL' || routine.scope === 'SELECTED' ? undefined : Object.values(personalPhases || {}).find(phase => phase.scope !== routine.scope && phase.chapterIds.some(id => routine.chapterIds.includes(id)));
  if (conflict) throw new Error(t(`নির্বাচিত অধ্যায় সংরক্ষিত ${conflict.scope} ধাপে আছে। দুই ধাপে একই অধ্যায় রাখা যাবে না; আগের নির্বাচন অক্ষত আছে।`, `A selected chapter belongs to retained phase ${conflict.scope}. It cannot belong to both phases; your saved selection is unchanged.`));
  if (!data.personalRoutine && routine.scope !== 'S' && routine.scope !== 'ALL' && routine.scope !== 'SELECTED') throw new Error(t('আগে S ধাপ শুরু ও সম্পন্ন করো।', 'Start and complete S first.'));
  if (data.personalRoutine) {
    const history = personalHistorySnapshot(data.personalRoutine, options.plan || buildPersonalStudyProjection(data).plan, data.completed);
    if (routine.scope === data.personalRoutine.scope) routine = { ...routine, history };
    else if (routine.scope === 'SELECTED') {
      routine = { ...routine, history };
      if (['S', 'A', 'B', 'C'].includes(data.personalRoutine.scope)) personalPhases = { ...personalPhases, [data.personalRoutine.scope]: { ...data.personalRoutine, history } };
    } else {
      const allowed = nextPersonalRoutine(data, options.asOf || routine.startsOn || data.settings.startDate);
      if (!allowed || allowed.scope !== routine.scope || routine.chapterIds.some(id => !allowed.chapterIds.includes(id))) throw new Error(t('আগের ধাপের সব কাজ সম্পন্ন না হলে পরের A/B/C ধাপ চালু হবে না।', 'Complete all required work in the current phase before starting the next A/B/C phase.'));
      routine = { ...routine, startsOn: [routine.startsOn || allowed.startsOn!, allowed.startsOn!].sort().at(-1)! };
      personalPhases = { ...personalPhases, [data.personalRoutine.scope]: { ...data.personalRoutine, history } };
      if (routine.scope !== 'ALL' && routine.scope !== 'SELECTED' && personalPhases[routine.scope]) { personalPhases = { ...personalPhases }; delete personalPhases[routine.scope]; }
    }
  }
  return { ...data, personalRoutine: routine, ...(personalPhases ? { personalPhases } : {}), routineSetupRequired: false, settings: { ...data.settings, calendarRevision: data.settings.calendarRevision + 1 } };
}
export function safeClassUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  let url: URL; try { url = new URL(raw); } catch { return undefined; }
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
}
export function personalMediaUrl(work: Pick<PersonalWork, 'url' | 'mediaFromSec'>): string | undefined {
  const safe = safeClassUrl(work.url); if (!safe) return undefined;
  const url = new URL(safe);
  if (work.mediaFromSec !== undefined && youtubeVideoId(safe)) url.searchParams.set('t', `${Math.floor(work.mediaFromSec)}s`);
  return url.href;
}
export function personalBookLabel(id: string): string {
  const c = chapterById[id]; return `${subjectById[c.subject].name} · ${t('পত্র', 'Paper')} ${bn(c.paper)}`;
}
