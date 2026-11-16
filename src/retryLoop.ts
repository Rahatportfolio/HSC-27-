import { chapterById } from './data';
import type { AppData } from './planner';
import { addDays } from './planner';
import { LIMITS, nowIso } from './storage';
import type { ExamSession, RetryItem } from './types';

/**
 * The spaced re-injection loop for questions a student got wrong.
 *
 * A wrong answer (or a paper that timed out) queues the question on a
 * 1 → 3 → 7 → 14 → 30 day ladder. The question only comes back to a practice
 * paper when it is due, so an unlucky guess is not drilled five times in one
 * afternoon. Answering it correctly on a due retry clears it; getting it wrong
 * again restarts the ladder at day one.
 */

/** Re-exported from the revision module's ladder so the two systems never drift apart. */
export const RETRY_INTERVALS = [1, 3, 7, 14, 30] as const;

const parseSchedule = (value: string): number[] => value
  .split(',')
  .map(part => Number(part))
  .filter(step => Number.isFinite(step) && step > 0);
const formatSchedule = (steps: number[]): string => steps.join(',');

/**
 * The remaining ladder after a retry. `schedule` always holds the rungs still to come:
 * a correct answer drops the current rung, and an empty result means the question is
 * cleared; a wrong answer restarts at day one.
 */
export function nextRung(item: RetryItem, correct: boolean): string {
  const steps = parseSchedule(item.schedule);
  // A restart re-arms the whole ladder: day one is still to be cleared.
  if (!correct) return formatSchedule([...RETRY_INTERVALS]);
  if (!steps.length) return formatSchedule([...RETRY_INTERVALS]);
  return formatSchedule(steps.slice(1));
}

/**
 * Queues every wrong or unanswered question of a finished paper.
 * `source` is the paper title, so the student sees where the question came from.
 */
export function enqueueRetries(data: AppData, paper: {
  source: string;
  date: string;
  wrong: { id: string; subject: RetryItem['subject']; chapterId?: string }[];
  unanswered: { id: string; subject: RetryItem['subject']; chapterId?: string }[];
}): AppData {
  const at = nowIso();
  const ladder = formatSchedule([...RETRY_INTERVALS]);
  const due = addDays(paper.date, RETRY_INTERVALS[0]);
  const incoming = [...paper.wrong, ...paper.unanswered];
  if (!incoming.length) return data;
  const existing = new Map(data.retries.map(item => [item.id, item]));
  let list = data.retries.slice();
  let changed = false;
  for (const question of incoming) {
    const prev = existing.get(question.id);
    if (prev && !prev.cleared) {
      // Still owed. Keep its ladder progress and date: re-raising it must never reset the
      // rungs already cleared, nor pull a future retry back to today.
      if (prev.source !== paper.source || prev.subject !== question.subject || prev.chapterId !== question.chapterId) {
        list = list.map(item => item.id === prev.id
          ? { ...item, subject: question.subject, ...(question.chapterId ? { chapterId: question.chapterId } : {}), source: paper.source, lastAt: at }
          : item);
        changed = true;
      }
      continue;
    }
    if (prev && prev.cleared) {
      list = list.map(item => item.id === prev.id
        ? { ...item, subject: question.subject, ...(question.chapterId ? { chapterId: question.chapterId } : {}), source: paper.source, schedule: ladder, replayed: 0, cleared: false, date: due, lastAt: at }
        : item);
      changed = true;
      continue;
    }
    const item: RetryItem = {
      id: question.id,
      questionId: question.id,
      subject: question.subject,
      ...(question.chapterId ? { chapterId: question.chapterId } : {}),
      source: paper.source,
      schedule: ladder,
      replayed: 0,
      cleared: false,
      date: due,
      at,
      lastAt: at,
    };
    if (list.length < LIMITS.retries) {
      list.push(item);
      changed = true;
    }
  }
  return changed ? { ...data, retries: list } : data;
}

export interface RetryAnswer { questionId: string; correct: boolean }

/**
 * Applies the result of a retry paper: a correct answer clears the question,
 * a wrong one puts it back on the ladder starting tomorrow.
 */
export function applyRetryResults(data: AppData, answers: RetryAnswer[], date: string): AppData {
  if (!answers.length || !data.retries.length) return data;
  const at = nowIso();
  const byId = new Map(answers.map(answer => [answer.questionId, answer.correct]));
  let changed = false;
  const retries = data.retries.map(item => {
    const correct = byId.get(item.questionId);
    if (correct === undefined) return item;
    const rung = nextRung(item, correct);
    const steps = parseSchedule(rung);
    const replayed = correct ? Math.min(RETRY_INTERVALS.length, item.replayed + 1) : 0;
    changed = true;
    if (correct && !steps.length) return { ...item, cleared: true, replayed, schedule: rung, lastAt: at };
    return {
      ...item,
      cleared: false,
      replayed,
      schedule: rung,
      date: addDays(date, steps[0] ?? 1),
      lastAt: at,
    };
  });
  return changed ? { ...data, retries } : data;
}

export interface RetryBuckets {
  /** Cleared questions older than 30 days are trimmed on the next save. */
  due: RetryItem[];
  upcoming: RetryItem[];
  cleared: RetryItem[];
  pending: RetryItem[];
}

export function retryBuckets(data: AppData, today: string): RetryBuckets {
  const pending = data.retries.filter(item => !item.cleared);
  return {
    due: pending.filter(item => item.date <= today).sort((a, b) => a.date.localeCompare(b.date)),
    upcoming: pending.filter(item => item.date > today).sort((a, b) => a.date.localeCompare(b.date)),
    cleared: data.retries.filter(item => item.cleared),
    pending,
  };
}

/** Ids a practice or mock paper should ask today: due first, then the soonest. */
export function dueRetryIds(data: AppData, today: string, limit = 200): string[] {
  const { due, upcoming } = retryBuckets(data, today);
  return [...due, ...upcoming].slice(0, Math.max(0, limit)).map(item => item.questionId);
}

export interface RetryChapterRow { chapterId?: string; subject: RetryItem['subject']; due: number; total: number }

/** Which chapters keep coming back — the simulator's weakness signal, without a new chart. */
export function retryChapterRows(data: AppData, today: string): RetryChapterRow[] {
  const rows = new Map<string, RetryChapterRow>();
  for (const item of data.retries) {
    if (item.cleared) continue;
    const key = item.chapterId ? `c:${item.chapterId}` : `s:${item.subject}`;
    const row = rows.get(key) || {
      ...(item.chapterId ? { chapterId: item.chapterId } : {}),
      subject: item.subject,
      due: 0,
      total: 0,
    };
    row.total++;
    if (item.date <= today) row.due++;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.due - a.due || b.total - a.total);
}

/**
 * After a finished paper, the next few days of retries, in the words the UI needs.
 * Used by the exam result screen and by the revision centre.
 */
export function retryPlan(sessions: ExamSession[], today: string): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const wrong = session.total - session.score;
    if (!wrong) continue;
    const date = addDays(session.date, RETRY_INTERVALS[0]);
    const from = date > today ? date : today;
    counts.set(from, (counts.get(from) || 0) + wrong);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 14)
    .map(([date, count]) => ({ date, count }));
}

/** Cleared rows are kept for a month of history, then dropped so storage never grows forever. */
export function trimRetries(data: AppData, today: string): AppData {
  const keepFrom = addDays(today, -30);
  const retries = data.retries.filter(item => !item.cleared || item.lastAt.slice(0, 10) >= keepFrom);
  return retries.length === data.retries.length ? data : { ...data, retries };
}

/** Human label for a queued question, used in lists. */
export function retryLabel(item: RetryItem): string {
  return item.chapterId ? (chapterById[item.chapterId]?.title || item.subject) : item.subject;
}

/** How many rungs of the ladder are left after this item. */
export function retryRungLabel(item: RetryItem): string {
  return `${Math.min(item.replayed, RETRY_INTERVALS.length)}/${RETRY_INTERVALS.length}`;
}
