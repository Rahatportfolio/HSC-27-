import { describe, expect, it } from "vitest";
import { recordCqEntry, recordMcqAnswer } from "./mistakeRevision";
import { freshData } from "./planner";
import { STARTER_QUESTIONS } from "./quiz-data";
import { ensureRevisions } from "./revision";
import { parseBackup } from "./storage";
describe("automatic mistake review", () => {
  it("collects wrong MCQs without duplicates and preserves review cards before chapter completion", () => {
    const q = STARTER_QUESTIONS[0];
    let d = recordMcqAnswer(freshData(), q, (q.answer + 1) % 4, "2026-11-15");
    d = recordMcqAnswer(d, q, (q.answer + 1) % 4, "2026-11-15");
    expect(d.attempts).toHaveLength(2);
    expect(d.mistakes).toHaveLength(1);
    expect(d.revisions).toHaveLength(1);
    expect(d.chapterMeta[q.chapterId!].weak).toBe(true);
    expect(d.revisions[0].dueDate).toBe("2026-11-16");
    expect(ensureRevisions([], d).revisions).toHaveLength(1);
    expect(parseBackup(JSON.stringify(d)).mistakes).toEqual(d.mistakes);
    d = recordMcqAnswer(d, q, q.answer, "2026-11-15");
    expect(d.mistakes[0].resolved).toBe(true);
  });
  it("adds low-scoring CQ notes to review but never fabricates study completion", () => {
    const q = STARTER_QUESTIONS[0];
    const d = recordCqEntry(freshData(), {
      id: "cq",
      subject: q.subject,
      chapterId: q.chapterId,
      question: "CQ practice",
      marks: 2,
      total: 10,
      note: "Lost marks in application",
      date: "2026-11-15",
      at: "2026-11-15T00:00:00Z",
    });
    expect(d.mistakes[0].text).toContain("Lost marks");
    expect(d.revisions).toHaveLength(1);
    expect(d.completed).toEqual({});
  });
});
