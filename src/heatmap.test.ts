import { describe, expect, it } from 'vitest';
import { HEAT_LABEL, chapterHeat, heatLevel, syllabusHeat, untouchedChapters } from './heatmap';
import { buildPlan, freshData, todayKey } from './planner';
import type { AppData } from './planner';
import { CHAPTERS, chapterById } from './data';
import type { WeaknessRow } from './weakness';

const start = todayKey();
const data = freshData();
const plan = buildPlan({ ...data.settings, startDate: start });

/** Finish every task of one chapter that the plan contains. */
function completeChapter(base: AppData, chapterId: string): AppData {
  const completed = { ...base.completed };
  for (const day of plan) for (const task of day.tasks) if (task.chapterIds.includes(chapterId)) completed[task.id] = '2026-01-01T00:00:00.000Z';
  return { ...base, completed };
}

const weakRow = (chapterId: string, score = 9): WeaknessRow => {
  const chapter = chapterById[chapterId];
  return {
    chapterId, subject: chapter.subject, chapter, priority: chapter.priority, score,
    signals: [{ label: 'MCQ ৩০%', labelEn: 'MCQ 30%', weight: 4 }],
    stagePercent: 20, action: 'practice', actionLabel: 'MCQ', actionLabelEn: 'MCQ', dueRetries: 0,
  };
};

describe('colour scale', () => {
  it('maps readiness to five bands and never paints untouched work green', () => {
    expect(heatLevel(0, false)).toBe(0);
    expect(heatLevel(100, false)).toBe(0); // an untouched chapter can never be "ready"
    expect(heatLevel(10, true)).toBe(0);
    expect(heatLevel(30, true)).toBe(1);
    expect(heatLevel(55, true)).toBe(2);
    expect(heatLevel(72, true)).toBe(3);
    expect(heatLevel(90, true)).toBe(4);
    expect(Object.keys(HEAT_LABEL)).toHaveLength(5);
  });
});

describe('a single chapter cell', () => {
  it('is cold and honest about a chapter with no progress at all', () => {
    const cell = chapterHeat(data, plan, 'physics-1-2', []);
    expect(cell.level).toBe(0);
    expect(cell.readiness).toBe(0);
    expect(cell.planned).toBeGreaterThan(0);
    expect(cell.reason).toContain('বাকি');
  });

  it('warms up when the planned sessions are genuinely finished', () => {
    const done = completeChapter(data, 'physics-1-2');
    const cell = chapterHeat(done, plan, 'physics-1-2', []);
    const before = chapterHeat(data, plan, 'physics-1-2', []);
    expect(cell.readiness).toBeGreaterThan(before.readiness);
    expect(cell.done).toBe(cell.planned);
    expect(cell.pending).toBe(0);
  });

  it('refuses to call a finished-but-untested chapter exam-ready', () => {
    const done = completeChapter(data, 'physics-1-2');
    const cell = chapterHeat(done, plan, 'physics-1-2', []);
    expect(cell.readiness).toBeLessThanOrEqual(65);
    expect(cell.level).toBeLessThanOrEqual(2);
    expect(cell.attempts).toBe(0);
  });

  it('caps a strictly weak chapter at 35% however much is ticked off', () => {
    const done = completeChapter(data, 'physics-1-2');
    const cell = chapterHeat(done, plan, 'physics-1-2', [weakRow('physics-1-2', 9)]);
    expect(cell.readiness).toBeLessThanOrEqual(35);
    expect(cell.level).toBeLessThanOrEqual(1);
    expect(cell.reason).toContain('দুর্বলতা');
  });

  it('uses a softer cap for a mild weakness', () => {
    const done = completeChapter(data, 'physics-1-2');
    const cell = chapterHeat(done, plan, 'physics-1-2', [weakRow('physics-1-2', 6)]);
    expect(cell.readiness).toBeLessThanOrEqual(60);
  });

  it('counts MCQ attempts and CQ entries as evidence of work', () => {
    const withAttempts: AppData = {
      ...data,
      questions: [
        { id: 'q1', subject: 'physics', chapterId: 'physics-1-2', question: 'x?', options: ['a', 'b', 'c', 'd'], answer: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      attempts: [
        { id: 'a1', questionId: 'q1', subject: 'physics', chosen: 0, correct: true, at: '2026-01-01T00:00:00.000Z', date: '2026-01-01' },
        { id: 'a2', questionId: 'q1', subject: 'physics', chosen: 1, correct: false, at: '2026-01-02T00:00:00.000Z', date: '2026-01-02' },
      ],
    } as AppData;
    const cell = chapterHeat(withAttempts, plan, 'physics-1-2', []);
    expect(cell.attempts).toBe(2);
  });
});

describe('the whole map', () => {
  const heat = syllabusHeat(data, plan);

  it('covers every chapter exactly once, split by subject', () => {
    const ids = heat.rows.flatMap(row => row.cells.map(cell => cell.chapterId));
    expect(ids).toHaveLength(CHAPTERS.length);
    expect(new Set(ids).size).toBe(CHAPTERS.length);
    expect(heat.rows.map(row => row.subject)).toEqual(['physics', 'chemistry', 'biology', 'math', 'bangla', 'english', 'ict']);
  });

  it('starts at zero for a fresh profile instead of pretending progress', () => {
    expect(heat.overall).toBe(0);
    expect(heat.counts[0]).toBe(CHAPTERS.length);
    expect(untouchedChapters(heat)).toHaveLength(CHAPTERS.length);
  });

  it('suggests focus chapters that are priority-A first', () => {
    expect(heat.focus.length).toBeGreaterThan(0);
    expect(heat.focus.length).toBeLessThanOrEqual(5);
    expect(heat.focus.every(cell => cell.chapter.priority === 'A')).toBe(true);
  });

  it('reports no "slipping" chapters until work has actually started', () => {
    expect(heat.slipped).toEqual([]);
  });

  it('reports slipping chapters when work started but no test backs it up', () => {
    const done = completeChapter(data, 'physics-1-2');
    const after = syllabusHeat(done, plan);
    expect(after.slipped.map(cell => cell.chapterId)).toContain('physics-1-2');
    expect(after.overall).toBeGreaterThan(0);
  });

  it('respects the look-ahead horizon when counting upcoming work', () => {
    const week = chapterHeat(data, plan, 'physics-1-2', [], { horizonDays: 7 });
    const month = chapterHeat(data, plan, 'physics-1-2', [], { horizonDays: 30 });
    expect(month.pending).toBeGreaterThanOrEqual(week.pending);
  });
});
