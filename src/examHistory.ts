/** Saved-paper aggregation, independent of the optional question engines. */
import type { SubjectId } from './data';
import type { ExamSession } from './types';

export interface ExamChapterAccuracy { chapterId?: string; subject: SubjectId; correct: number; total: number; percent: number }

/** Aggregates every stored paper's chapter snapshot — the simulator's weakness detector. */
export function examChapterAccuracy(sessions: ExamSession[]): ExamChapterAccuracy[] {
  const rows = new Map<string, ExamChapterAccuracy>();
  for (const session of sessions) {
    for (const row of session.breakdown) {
      const key = row.chapterId ? `c:${row.chapterId}` : `s:${row.subject}`;
      const target = rows.get(key) || { ...(row.chapterId ? { chapterId: row.chapterId } : {}), subject: row.subject, correct: 0, total: 0, percent: 0 };
      target.correct += row.correct;
      target.total += row.total;
      rows.set(key, target);
    }
  }
  return [...rows.values()]
    .map(row => ({ ...row, percent: row.total ? Math.round(row.correct / row.total * 100) : 0 }))
    .filter(row => row.total > 0)
    .sort((a, b) => a.percent - b.percent || b.total - a.total);
}
