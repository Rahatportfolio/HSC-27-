import { chapterById } from "./data";
import type { CqEntry } from "./types";
import type { AppData, Mistake } from "./planner";
import { addDays } from "./planner";
import type { QuizQuestion } from "./types";
import { LIMITS, newId, nowIso } from "./storage";
import { updateChapterMeta } from "./study";

// Keep imported long ids within the existing 180-character backup boundary.
function sourceId(prefix: string, id: string): string {
  if (prefix.length + id.length <= 180) return prefix + id;
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < id.length; i++) {
    a = Math.imul(a ^ id.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ id.charCodeAt(i);
  }
  return `${prefix}${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function queueMistakeRevision(
  data: AppData,
  chapterId: string | undefined,
  source: string,
  date: string,
): AppData {
  if (
    !chapterId ||
    !Object.hasOwn(chapterById, chapterId) ||
    !data.settings.revisionEnabled
  )
    return data;
  const subject = chapterById[chapterId].subject;
  const existing = data.revisions.find(
    (r) => r.sourceTaskId === source && !r.completedAt,
  );
  const dueDate = addDays(date, 1);
  if (existing)
    return {
      ...data,
      revisions: data.revisions.map((r) =>
        r.id === existing.id
          ? { ...r, dueDate: r.dueDate < dueDate ? r.dueDate : dueDate }
          : r,
      ),
    };
  if (data.revisions.length >= LIMITS.revisions) return data;
  // Chapter subject comes from the canonical syllabus, not arbitrary copied content.
  return {
    ...data,
    revisions: [
      ...data.revisions,
      {
        id: newId(),
        chapterId,
        subject,
        dueDate,
        interval: 1,
        createdAt: nowIso(),
        adjusted: true,
        sourceTaskId: source,
      },
    ],
  };
}
export function recordMcqAnswer(
  data: AppData,
  question: QuizQuestion,
  chosen: number | null,
  date: string,
): AppData {
  // A blank exam answer is a learning gap, not a fabricated option selection.
  const correct = chosen !== null && chosen === question.answer;
  const at = nowIso();
  const source = sourceId("auto-mcq:", question.id);
  let next: AppData = {
    ...data,
    attempts: chosen === null ? data.attempts : [
      ...data.attempts,
      {
        id: newId(),
        questionId: question.id,
        subject: question.subject,
        chosen,
        correct,
        date,
        at,
      },
    ].slice(-10000),
  };
  const existing = next.mistakes.find((m) => m.id === source);
  if (correct) {
    if (existing)
      next = {
        ...next,
        mistakes: next.mistakes.map((m) =>
          m.id === source ? { ...m, resolved: true, retryStatus: "mastered" } : m,
        ),
      };
    return next;
  }
  const mistake: Mistake = {
    ...existing,
    chapterId: question.chapterId,
    category: existing?.category ?? "conceptual",
    retryStatus: "pending",
    id: source,
    subject: question.subject,
    text: `${question.question} — সঠিক: ${question.options[question.answer]}${question.explanation ? ` · ${question.explanation}` : ""}`.slice(
      0,
      2000,
    ),
    date,
    resolved: false,
  };
  next = {
    ...next,
    mistakes: existing
      ? next.mistakes.map((m) => (m.id === source ? mistake : m))
      : next.mistakes.length < 1000
        ? [...next.mistakes, mistake]
        : next.mistakes,
  };
  const wrong = next.attempts.filter(
    (a) => a.questionId === question.id && !a.correct,
  ).length;
  if (question.chapterId && wrong >= 2)
    next = updateChapterMeta(next, question.chapterId, { weak: true });
  return queueMistakeRevision(next, question.chapterId, source, date);
}

export function recordCqEntry(data: AppData, entry: CqEntry): AppData {
  let next = { ...data, cq: [...data.cq, entry] };
  if (entry.marks / Math.max(1, entry.total) >= 0.5) return next;
  const source = sourceId("auto-cq:", entry.id);
  if (next.mistakes.length < 1000)
    next = {
      ...next,
      mistakes: [
        ...next.mistakes,
        {
          id: source,
          chapterId: entry.chapterId,
          category: "conceptual",
          retryStatus: "pending",
          subject: entry.subject,
          text: `CQ: ${entry.question} — ${entry.marks}/${entry.total}. ${entry.note}`.slice(
            0,
            2000,
          ),
          date: entry.date,
          resolved: false,
        },
      ],
    };
  if (entry.chapterId) {
    if (
      next.cq.filter(
        (c) =>
          c.chapterId === entry.chapterId &&
          c.marks / Math.max(1, c.total) < 0.5,
      ).length >= 2
    )
      next = updateChapterMeta(next, entry.chapterId, { weak: true });
    next = queueMistakeRevision(next, entry.chapterId, source, entry.date);
  }
  return next;
}
