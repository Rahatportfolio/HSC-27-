import { CHAPTERS, chapterById } from './data';
import { questionChapters } from './questionBankIndex';
import { addDays, dhakaMinutes, isValidDate, todayKey } from './planner';
import type { AppData, Day, Task } from './planner';
import { chapterStage, isLearningComplete } from './learning';
import { chapterWorkEstimate, personalCapacity, personalChapterPairs, personalUnfinishedRanges, weeklyWindows } from './personalRoutine';
import type { BrainCheckIn, BrainCheckInDraft, BrainDifficulty, BrainFeedback, StudyBrainMemory } from './studyBrainTypes';

export const BRAIN_LIMITS = { checkIns: 60, feedback: 180, message: 240 } as const;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const chapter = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(chapterById, value);
const instant = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && isValidDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const invalid = (): never => { throw new Error('Study Brain memory is invalid. Keep the original backup and check its local-memory fields.'); };
export const newStudyBrain = (): StudyBrainMemory => ({ version: 1, enabled: true, focusMinutes: 25, checkIns: [], feedback: [] });

/** Optional extension: old backups stay unchanged, malformed new evidence fails closed. */
export function parseStudyBrain(raw: unknown): StudyBrainMemory {
  if (!object(raw) || raw.version !== 1 || typeof raw.enabled !== 'boolean' || !integer(raw.focusMinutes, 5, 90)
    || !Array.isArray(raw.checkIns) || raw.checkIns.length > BRAIN_LIMITS.checkIns || !Array.isArray(raw.feedback) || raw.feedback.length > BRAIN_LIMITS.feedback) return invalid();
  const checkIns: BrainCheckIn[] = raw.checkIns.map(item => {
    if (!object(item) || typeof item.date !== 'string' || !isValidDate(item.date) || !instant(item.at)
      || !['low', 'okay', 'fresh'].includes(String(item.energy)) || !['none', 'understanding', 'remembering', 'starting'].includes(String(item.obstacle))
      || (item.availableMinutes !== null && !integer(item.availableMinutes, 0, 720)) || (item.chapterId !== undefined && !chapter(item.chapterId))) return invalid();
    return { date: item.date, at: item.at, energy: item.energy as BrainCheckIn['energy'], obstacle: item.obstacle as BrainCheckIn['obstacle'],
      availableMinutes: item.availableMinutes as number | null, ...(item.chapterId ? { chapterId: item.chapterId } : {}) };
  });
  const feedback: BrainFeedback[] = raw.feedback.map(item => {
    if (!object(item) || typeof item.date !== 'string' || !isValidDate(item.date) || !instant(item.at) || !chapter(item.chapterId) || !['hard', 'okay', 'easy'].includes(String(item.difficulty))) return invalid();
    return { date: item.date, at: item.at, chapterId: item.chapterId, difficulty: item.difficulty as BrainDifficulty };
  });
  if (new Set(checkIns.map(item => item.date)).size !== checkIns.length || new Set(feedback.map(item => `${item.date}:${item.chapterId}`)).size !== feedback.length) return invalid();
  return { version: 1, enabled: raw.enabled, focusMinutes: raw.focusMinutes, checkIns, feedback };
}
export function saveBrainCheckIn(data: AppData, draft: BrainCheckInDraft, date: string, at: string): AppData {
  if (!data.studyBrain?.enabled) return data;
  const checkIns = [...data.studyBrain.checkIns.filter(item => item.date !== date).slice(-(BRAIN_LIMITS.checkIns - 1)), { ...draft, date, at }];
  return { ...data, studyBrain: parseStudyBrain({ ...data.studyBrain, checkIns }) };
}
export function saveBrainFeedback(data: AppData, chapterId: string, difficulty: BrainDifficulty, date: string, at: string): AppData {
  if (!data.studyBrain?.enabled || !data.personalRoutine?.chapterIds.includes(chapterId)) return data;
  const feedback = [...data.studyBrain.feedback.filter(item => item.date !== date || item.chapterId !== chapterId).slice(-(BRAIN_LIMITS.feedback - 1)), { chapterId, difficulty, date, at }];
  return { ...data, studyBrain: parseStudyBrain({ ...data.studyBrain, feedback }) };
}
export function forgetStudyBrain(data: AppData): AppData {
  const { studyBrain: _memory, ...rest } = data;
  return rest;
}
export function brainCurrentPair(data: AppData, plan: Day[]): string[] {
  return data.personalRoutine ? personalChapterPairs(data.personalRoutine).find(pair => pair.some(id => !isLearningComplete(chapterStage(chapterById[id], data, plan)))) || [] : [];
}
/** Uses logged durations only, not assumed video lengths, attendance or intelligence. */
export function brainStudyPattern(data: AppData, now: Date) {
  const today = todayKey(now), start = addDays(today, -13);
  const sessions = data.studySessions.filter(session => session.date >= start && session.date <= today && Date.parse(session.at) <= now.getTime()
    && session.chapterId && data.personalRoutine?.chapterIds.includes(session.chapterId));
  const days = new Set(sessions.map(session => session.date)).size;
  const lengths = sessions.map(session => session.minutes).sort((a, b) => a - b);
  const middle = Math.floor(lengths.length / 2);
  const median = lengths.length ? Math.round(lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2) : null;
  return { sessions: sessions.length, days, median, enough: sessions.length >= 3 && days >= 2 };
}
export interface BrainEvidence {
  weakFlag: boolean;
  mistakes: number;
  mcq: { answers: number; correct: number };
  feedback?: BrainFeedback;
}
export function brainChapterEvidence(data: AppData, chapterId: string, now: Date): BrainEvidence {
  const today = todayKey(now), start = addDays(today, -13);
  // Attempts carry question IDs, not chapters. Unknown/deleted question mappings are not guessed.
  const questions = questionChapters(data);
  const attempts = data.attempts.filter(attempt => attempt.date >= start && attempt.date <= today && Date.parse(attempt.at) <= now.getTime() && questions.get(attempt.questionId) === chapterId);
  const feedback = data.studyBrain?.feedback.filter(item => item.chapterId === chapterId && item.date >= start && item.date <= today && Date.parse(item.at) <= now.getTime()).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return { weakFlag: data.chapterMeta[chapterId]?.weak === true || data.confidence[chapterId] === 'weak',
    mistakes: data.mistakes.filter(item => item.chapterId === chapterId && !item.resolved && item.date <= today).length,
    mcq: { answers: attempts.length, correct: attempts.filter(attempt => attempt.correct).length }, feedback };
}
export type BrainStatus = 'off' | 'setup' | 'legacy' | 'rest' | 'complete' | 'duration' | 'missing' | 'review' | 'scheduled' | 'ready' | 'capacity' | 'conflict' | 'outside';
export interface BrainSuggestion {
  status: BrainStatus;
  pair: string[];
  pattern: ReturnType<typeof brainStudyPattern>;
  checkIn?: BrainCheckIn;
  task?: Task;
  chapterId?: string;
  evidence?: BrainEvidence;
  focusMinutes: number;
  range?: { from: number; to: number };
  /** Optional timer only. No schedule writes or completion action exists here. */
  timerTaskId?: string;
  canStart: boolean;
}
/** Read-only bounded reasoning. Never calls a legacy adaptive planner, remote service or storage. */
export function studyBrainSuggestion(data: AppData, plan: Day[], now: Date): BrainSuggestion {
  if (!data.studyBrain?.enabled) return { status: 'off', pair: [], pattern: { sessions: 0, days: 0, median: null, enough: false }, focusMinutes: 0, canStart: false };
  const today = todayKey(now), minute = dhakaMinutes(now), pair = brainCurrentPair(data, plan);
  const pattern = brainStudyPattern(data, now);
  const checkIn = data.studyBrain?.checkIns.find(item => item.date === today && Date.parse(item.at) <= now.getTime());
  const base: BrainSuggestion = { status: 'off', pair, pattern, checkIn, focusMinutes: 0, canStart: false };
  if (data.routineSetupRequired) return { ...base, status: 'setup' };
  if (!data.personalRoutine) return { ...base, status: 'legacy' };
  if (checkIn?.availableMinutes === 0) return { ...base, status: 'rest' };
  if (!pair.length) return { ...base, status: 'complete' };
  if (pair.some(id => !isLearningComplete(chapterStage(chapterById[id], data, plan)) && !chapterWorkEstimate(data.personalRoutine!, id).complete)) return { ...base, status: 'duration' };
  const pending = plan.flatMap(day => day.tasks).filter(task => task.personalWork && pair.includes(task.chapterIds[0])
    && !isLearningComplete(chapterStage(chapterById[task.chapterIds[0]], data, plan)) && personalUnfinishedRanges(task, data.completed).length)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute || a.id.localeCompare(b.id));
  if (!pending.length) return { ...base, status: 'missing' };
  // Only choose the earliest owed day, and the earliest outstanding segment in each book.
  // A preference may select the other book, never skip a day/stage or import a third chapter.
  const earliest = pending[0].date;
  const options = pair.flatMap(id => {
    const task = pending.find(item => item.date === earliest && item.chapterIds[0] === id);
    if (!task) return [];
    const evidence = brainChapterEvidence(data, id, now);
    const score = (checkIn?.chapterId === id ? 100 : 0) + (evidence.feedback?.difficulty === 'hard' ? 10 : 0) + (evidence.weakFlag ? 5 : 0)
      + Math.min(3, evidence.mistakes) + (evidence.mcq.answers >= 5 && evidence.mcq.correct / evidence.mcq.answers < .6 ? 4 : 0);
    return [{ task, evidence, score }];
  }).sort((a, b) => b.score - a.score || a.task.startMinute - b.task.startMinute);
  const { task, evidence } = options[0];
  const chapterId = task.chapterIds[0], remaining = personalUnfinishedRanges(task, data.completed)[0];
  let focusMinutes = Math.min(data.studyBrain.focusMinutes, data.personalRoutine.sessionMinutes, remaining.to - remaining.from);
  if (pattern.enough && pattern.median !== null) focusMinutes = Math.min(focusMinutes, Math.max(5, pattern.median));
  if (checkIn?.availableMinutes !== null && checkIn?.availableMinutes !== undefined) focusMinutes = Math.min(focusMinutes, checkIn.availableMinutes);
  if (checkIn?.energy === 'low' || evidence.feedback?.difficulty === 'hard' || checkIn?.obstacle === 'starting') focusMinutes = Math.min(focusMinutes, 15);
  const selected = { ...base, task, chapterId, evidence };
  if (earliest < today || (earliest === today && task.endMinute <= minute)) return { ...selected, status: 'review' };
  if (!weeklyWindows(data.personalRoutine, task.date).some(window => task.startMinute >= Math.max(window.startMinute, data.dayOverrides[task.date]?.startMinute ?? 0) && task.endMinute <= window.endMinute)) return { ...selected, status: 'outside' };
  const overlap = plan.find(day => day.date === earliest)?.tasks.some(other => other.id !== task.id && other.startMinute < task.endMinute && other.endMinute > task.startMinute);
  if (overlap) return { ...selected, status: 'conflict' };
  if (earliest === today) {
    const logged = data.studySessions.filter(session => session.date === today && Date.parse(session.at) <= now.getTime()).reduce((sum, session) => sum + session.minutes, 0);
    focusMinutes = Math.min(focusMinutes, Math.max(0, personalCapacity(data, today) - logged), Math.max(0, task.endMinute - Math.max(task.startMinute, minute)));
  }
  focusMinutes = Math.floor(focusMinutes);
  if (focusMinutes < 1) return { ...selected, status: 'capacity' };
  const range = { from: remaining.from, to: remaining.from + focusMinutes };
  const timerTaskId = `smart-part|${encodeURIComponent(task.personalWork!.sourceId)}|${range.from}|${range.to}`;
  const canStart = earliest === today && task.startMinute <= minute && task.endMinute > minute;
  return { ...selected, status: canStart ? 'ready' : 'scheduled', focusMinutes, range, timerTaskId, canStart };
}

export type BrainMessageResult = { kind: 'draft'; patch: Partial<BrainCheckInDraft>; outsidePair: boolean }
  | { kind: 'next' | 'memory' | 'help' | 'unsupported' | 'invalid-time' };
/** Deliberately small bilingual/Banglish intent parser, not a general chatbot.
 * Natural text only drafts fields. It is never executed or stored as an instruction.
 */
export function interpretBrainMessage(message: string, pair: string[]): BrainMessageResult {
  if (!message.trim() || message.length > BRAIN_LIMITS.message) return { kind: 'help' };
  const text = message.normalize('NFKC').toLowerCase().replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit))).trim();
  if (/(?:delete|erase|clear|uninstall|মুছ|মুছে|ডিলিট|complete|finished|watched|studied|পড়েছি|পড়েছি|শেষ করেছি|porechi|porsi|dekhechi)/u.test(text)) return { kind: 'unsupported' };
  if (/(?:remember about me|what.*know.*me|memory|আমার সম্পর্কে|মনে রেখেছ|mone (?:ache|rekhecho))/u.test(text)) return { kind: 'memory' };
  const patch: Partial<BrainCheckInDraft> = {};
  const noTime = /(?:পড়তে পারব না|পড়তে পারব না|আজ ছুটি|আজ বিশ্রাম|porte parbo na|aj (?:off|chuti)|no time|cannot study|can't study|rest today)/u.test(text);
  if (noTime) patch.availableMinutes = 0;
  // Do not turn negative, ambiguous or excessive numbers into a confident time promise.
  const times = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*(ঘণ্টা|ঘন্টা|ghonta|hours?|hrs?|h|মিনিট|মি\.?|minutes?|mins?|m)(?=\s|$|[,.!?।])/gu)];
  if (times.length) {
    const units = times.map(match => /^(?:ঘ|gh|h)/u.test(match[2]) ? 'hours' : 'minutes');
    const minutes = times.reduce((sum, match, index) => sum + Number(match[1]) * (units[index] === 'hours' ? 60 : 1), 0);
    if (noTime || new Set(units).size !== units.length || !Number.isInteger(minutes) || minutes < 0 || minutes > 720 || times.some(match => Number(match[1]) < 0)) return { kind: 'invalid-time' };
    patch.availableMinutes = minutes;
  }
  if (/(?:not tired|ক্লান্ত নই|klanto na)/u.test(text)) return { kind: 'help' };
  if (/(?:ক্লান্ত|klanto|tired|energy kom|ghum pacche)/u.test(text)) patch.energy = 'low';
  else if (/(?:চনমনে|fresh|energetic|bhalo lagche|ভালো লাগছে)/u.test(text)) patch.energy = 'fresh';
  else if (/(?:মোটামুটি|motamuti|normal|okay)/u.test(text)) patch.energy = 'okay';
  if (/(?:বুঝি না|বুঝতে পারছি না|bujhi na|bujhte parchi na|don't understand|do not understand)/u.test(text)) patch.obstacle = 'understanding';
  else if (/(?:মনে থাকে না|ভুলে যাই|mone thake na|vule jai|forget|can't remember)/u.test(text)) patch.obstacle = 'remembering';
  else if (/(?:শুরু করতে|মন বসে না|start korte|mon boshe na|can't start|cannot start)/u.test(text)) patch.obstacle = 'starting';
  const subjectNames: [string, RegExp][] = [
    ['physics', /(?:\bphysics\b|পদার্থ|podartho)/u], ['chemistry', /(?:\bchemistry\b|রসায়ন|রসায়ন|roshayon)/u],
    ['math', /(?:\bmath(?:s)?\b|গণিত|gonit)/u], ['biology', /(?:\bbiology\b|জীববিজ্ঞান|jibbiggan)/u],
    ['bangla', /(?:\bbangla\b|বাংলা)/u], ['english', /(?:\benglish\b|ইংরেজি)/u], ['ict', /(?:\bict\b|আইসিটি)/u],
  ];
  const subjects = subjectNames.filter(([, regex]) => regex.test(text)).map(([id]) => id);
  if (subjects.length > 1) return { kind: 'help' };
  const matching = pair.filter(id => chapterById[id]?.subject === subjects[0]);
  if (matching.length === 1) patch.chapterId = matching[0];
  const exactTitle = CHAPTERS.filter(item => pair.includes(item.id) && text.includes(item.title.toLowerCase()));
  if (exactTitle.length === 1) patch.chapterId = exactTitle[0].id;
  if (Object.keys(patch).length) return { kind: 'draft', patch, outsidePair: !!subjects.length && !matching.length };
  if (/(?:কি পড়ব|কী পড়ব|কি পড়ব|কী পড়ব|ki porbo|what.*(?:study|next)|next|পরের কাজ)/u.test(text)) return { kind: 'next' };
  return { kind: 'help' };
}
