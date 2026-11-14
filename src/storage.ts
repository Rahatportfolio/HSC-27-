import { PAPERS, SUBJECTS } from './data';
import { isValidDate, STORAGE_KEY, todayKey } from './planner';
import type { AppData, Settings } from './planner';
import { freshData } from './planner';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 10000): v is string => typeof v === 'string' && v.length <= max;
const ISO_AT = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const validAt = (v: unknown): v is string => text(v, 40) && ISO_AT.test(v) && isValidDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
const subjectIds = new Set<string>(SUBJECTS.map(s => s.id));
const paperIds = new Set(PAPERS.map(p => p.id));
const confidenceLevels = new Set(['weak', 'okay', 'confident']);
/** Own-property assignment: backup keys such as "__proto__" must never mutate prototypes. */
const put = <T>(target: Record<string, T>, key: string, value: T): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};
export const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
export const MISTAKE_LIMIT = 1000;

export function sanitizeSettings(raw: unknown): Settings {
  if (!object(raw)) throw new Error('Settings অবজেক্ট পাওয়া যায়নি।');
  if (!text(raw.startDate, 10) || !isValidDate(raw.startDate) || raw.startDate > '2040-12-31') throw new Error('শুরুর তারিখ সঠিক নয়।');
  if (!text(raw.startTime, 5) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.startTime)) throw new Error('শুরুর সময় সঠিক নয়।');
  if (![6, 8, 10].includes(Number(raw.dailyHours))) throw new Error('দৈনিক পড়ার সময় ৬, ৮ বা ১০ ঘণ্টা হতে হবে।');
  if (![0, 5, 10, 15, 30].includes(Number(raw.reminderLead))) throw new Error('রিমাইন্ডারের সময় সঠিক নয়।');
  if (!text(raw.board, 60) || !text(raw.name, 60)) throw new Error('নাম বা বোর্ডের লেখা সঠিক নয়।');
  return { startDate: raw.startDate, startTime: raw.startTime, dailyHours: Number(raw.dailyHours), board: raw.board, name: raw.name,
    reminderEnabled: raw.reminderEnabled === true, reminderLead: Number(raw.reminderLead), syllabusChecked: raw.syllabusChecked === true,
    calendarRevision: Number.isSafeInteger(raw.calendarRevision) && Number(raw.calendarRevision) >= 0 && Number(raw.calendarRevision) < 1000000 ? Number(raw.calendarRevision) : 0 };
}
export function parseBackup(rawText: string): AppData {
  if (rawText.length > 2_000_000) throw new Error('ব্যাকআপটি ২ MB-এর কম হতে হবে।');
  let raw: unknown;
  try { raw = JSON.parse(rawText); } catch { throw new Error('এটি সঠিক JSON ব্যাকআপ নয়।'); }
  if (!object(raw) || raw.version !== 1) throw new Error('এই অ্যাপের version 1 ব্যাকআপ নির্বাচন করো।');
  const result = freshData();
  result.settings = sanitizeSettings(raw.settings);
  if (!object(raw.completed) || Object.keys(raw.completed).length > 10000) throw new Error('অগ্রগতির তথ্য সঠিক নয়।');
  for (const [id, at] of Object.entries(raw.completed)) {
    if (!text(id, 180) || !validAt(at)) throw new Error('অগ্রগতির তারিখ সঠিক নয়।');
    put(result.completed, id, at);
  }
  if (object(raw.confidence)) {
    if (Object.keys(raw.confidence).length > 10000) throw new Error('আত্মবিশ্বাসের তথ্য সঠিক নয়।');
    for (const [id, level] of Object.entries(raw.confidence)) {
      if (!text(id, 180) || !confidenceLevels.has(String(level))) throw new Error('আত্মবিশ্বাসের তথ্য সঠিক নয়।');
      put(result.confidence, id, level as 'weak' | 'okay' | 'confident');
    }
  }
  if (object(raw.notes)) {
    if (Object.keys(raw.notes).length > 10000) throw new Error('দিনের নোটের তথ্য সঠিক নয়।');
    for (const [date, note] of Object.entries(raw.notes)) {
      if (!isValidDate(date) || !text(note)) throw new Error('দিনের নোটের তথ্য সঠিক নয়।');
      put(result.notes, date, note);
    }
  }
  if (object(raw.exams)) for (const [id, exam] of Object.entries(raw.exams)) {
    if (!paperIds.has(id) || !object(exam)) throw new Error('মডেল টেস্টের তথ্য সঠিক নয়।');
    const paper = PAPERS.find(p => p.id === id)!;
    if (typeof exam.score !== 'number' || !Number.isFinite(exam.score) || exam.score < 0 || exam.score > paper.maxScore || exam.total !== paper.maxScore || !validAt(exam.at) || !text(exam.mistakes, 5000)) throw new Error('মডেল টেস্টের নম্বর বা তথ্য সঠিক নয়।');
    put(result.exams, id, { score: exam.score, total: exam.total, at: exam.at, mistakes: exam.mistakes });
  }
  if (Array.isArray(raw.mistakes)) {
    if (raw.mistakes.length > MISTAKE_LIMIT) throw new Error(`ভুলের খাতায় সর্বোচ্চ ${MISTAKE_LIMIT}টি নোট রাখা যায়।`);
    const ids = new Set<string>();
    for (const m of raw.mistakes) {
      if (!object(m) || !text(m.id, 180) || ids.has(m.id) || !subjectIds.has(String(m.subject)) || !text(m.text, 5000) || !m.text.trim() || !text(m.date, 10) || !isValidDate(m.date) || typeof m.resolved !== 'boolean') throw new Error('ভুলের খাতার তথ্য সঠিক নয়।');
      ids.add(m.id); result.mistakes.push({ id: m.id, subject: m.subject as AppData['mistakes'][number]['subject'], text: m.text, date: m.date, resolved: m.resolved });
    }
  }
  if (object(raw.focus)) {
    if (!Number.isSafeInteger(raw.focus.minutes) || Number(raw.focus.minutes) < 0 || !Number.isSafeInteger(raw.focus.sessions) || Number(raw.focus.sessions) < 0) throw new Error('ফোকাস টাইমারের তথ্য সঠিক নয়।');
    result.focus = { minutes: Number(raw.focus.minutes), sessions: Number(raw.focus.sessions) };
  }
  return result;
}
export function loadData(): { data: AppData; warning: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return { data: raw ? parseBackup(raw) : freshData(), warning: '' };
  } catch {
    if (raw) { try { localStorage.setItem(RECOVERY_KEY, raw); } catch { /* storage may be unavailable/full */ } }
    return { data: freshData(), warning: 'সেভ করা তথ্য পড়া যায়নি। সম্ভব হলে কাঁচা তথ্য রিকভারি ফাইল হিসেবে রাখা হয়েছে; Settings থেকে নামিয়ে রাখো।' };
  }
}
export function saveData(data: AppData): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch { return false; }
}
export const newId = (): string => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const nowIso = (): string => new Date().toISOString();
export const initialToday = (): string => todayKey();
