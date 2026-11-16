import { describe, expect, it } from "vitest";
import { freshData } from "./planner";
import { dailyPractice, weakChapters, weeklySubjects } from "./studyMetrics";
import { STARTER_QUESTIONS } from "./quiz-data";
import { emptyAdvanced } from "./advanced";
import { parseBackup } from "./storage";
describe("actual daily and weekly performance", () => {
  it("counts builtin quiz mistakes and detects repeated weak chapters", () => {
    const data = freshData();
    const q = STARTER_QUESTIONS[0];
    data.attempts = [1, 2, 3].map((n) => ({
      id: `a${n}`,
      questionId: q.id,
      subject: q.subject,
      correct: false,
      chosen: 1,
      date: "2026-11-15",
      at: "2026-11-15T00:00:00Z",
    }));
    expect(dailyPractice(data, "2026-11-15").mcq).toBe(3);
    expect(weakChapters(data).some((c) => c.id === q.chapterId)).toBe(true);
    expect(
      weeklySubjects(data, "2026-11-15").find((s) => s.id === q.subject)
        ?.accuracy,
    ).toBe(0);
    expect(
      weeklySubjects(data, "2026-11-15").find((s) => s.id === "ict")?.accuracy,
    ).toBeNull();
  });
  it("safely migrates and validates locked daily targets", () => {
    const d = freshData();
    d.advanced = {
      ...emptyAdvanced(),
      targets: { "2026-11-15": 90 },
      dailyGoals: {
        "2026-11-15": { mcq: 25, cq: 2, revision: 3, locked: true },
      },
    };
    expect(parseBackup(JSON.stringify(d)).advanced).toEqual(d.advanced);
    d.advanced.dailyGoals!["2026-11-15"].mcq = -1;
    expect(() => parseBackup(JSON.stringify(d))).toThrow();
  });
});
