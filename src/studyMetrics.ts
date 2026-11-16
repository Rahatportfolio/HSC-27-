import { SUBJECTS, CHAPTERS } from "./data";
import { addDays, todayKey } from "./planner";
import type { AppData } from "./planner";
import { STARTER_QUESTIONS } from "./quiz-data";

export function dailyPractice(data: AppData, date: string) {
  return {
    mcq: data.attempts.filter((a) => a.date === date).length,
    cq: data.cq.filter((c) => c.date === date).length,
    revision: data.revisions.filter(
      (r) => r.completedAt && todayKey(new Date(r.completedAt)) === date,
    ).length,
  };
}
export function weeklySubjects(data: AppData, today: string) {
  const start = addDays(today, -6),
    previous = addDays(today, -13);
  return SUBJECTS.map((subject) => {
    const current = data.attempts.filter(
      (a) => a.subject === subject.id && a.date >= start && a.date <= today,
    );
    const old = data.attempts.filter(
      (a) => a.subject === subject.id && a.date >= previous && a.date < start,
    );
    const percent = (list: typeof current) =>
      list.length
        ? Math.round((list.filter((a) => a.correct).length / list.length) * 100)
        : null;
    const score = percent(current),
      before = percent(old);
    const minutes = data.studySessions
      .filter(
        (s) => s.subject === subject.id && s.date >= start && s.date <= today,
      )
      .reduce((n, s) => n + s.minutes, 0);
    const tests = data.tests.filter(
      (t) => t.subject === subject.id && t.date >= start && t.date <= today,
    );
    const testScore = tests.length
      ? Math.round(
          (tests.reduce((n, t) => n + t.score / Math.max(1, t.total), 0) /
            tests.length) *
            100,
        )
      : null;
    return {
      ...subject,
      minutes,
      attempts: current.length,
      accuracy: score,
      change: score !== null && before !== null ? score - before : null,
      testScore,
    };
  });
}
export function weakChapters(data: AppData) {
  const questions = new Map(
    [...STARTER_QUESTIONS, ...data.questions].map((q) => [q.id, q]),
  );
  return CHAPTERS.map((c) => {
    const answers = data.attempts
      .filter((a) => questions.get(a.questionId)?.chapterId === c.id)
      .slice(-20);
    const wrong = answers.filter((a) => !a.correct).length;
    const cq = data.cq.filter((q) => q.chapterId === c.id).slice(-5);
    const lowCq = cq.filter((q) => q.marks / Math.max(1, q.total) < 0.5).length;
    const weak =
      (wrong >= 2 && wrong / answers.length >= 0.4) ||
      lowCq >= 2 ||
      !!data.chapterMeta[c.id]?.weak ||
      data.confidence[c.id] === "weak";
    return { ...c, wrong, attempts: answers.length, lowCq, weak };
  })
    .filter((c) => c.weak)
    .sort((a, b) => b.wrong + b.lowCq - (a.wrong + a.lowCq));
}
