import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { buildPlan, chapterStudyTasks, freshData } from './planner';
import { chapterPriority, chapterStage, learningDashboard, learningProgress } from './learning';
import { updateChapterMeta } from './study';
import { parseBackup } from './storage';

describe('personal chapter progress', () => {
  it('preserves legacy task-derived progress and supports explicit overrides', () => {
    let data = freshData();
    const plan = buildPlan(data.settings);
    const chapter = CHAPTERS.find(c => chapterStudyTasks(plan, c.id).length > 0)!;
    const tasks = chapterStudyTasks(plan, chapter.id);
    expect(chapterStage(chapter, data, plan)).toBe('notStarted');
    data.completed[tasks[0].id] = '2026-11-15T00:00:00.000Z';
    expect(chapterStage(chapter, data, plan)).toBe(tasks.length === 1 ? 'completed' : 'inProgress');
    for (const task of tasks) data.completed[task.id] = '2026-11-15T00:00:00.000Z';
    expect(chapterStage(chapter, data, plan)).toBe('completed');
    data = updateChapterMeta(data, chapter.id, { stage: 'revisionNeeded', priority: 'C', steps: { class: true, revision: false } });
    expect(chapterPriority(chapter, data)).toBe('C');
    expect(chapterStage(chapter, data, plan)).toBe('revisionNeeded');
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.chapterMeta[chapter.id]).toEqual(data.chapterMeta[chapter.id]);
    expect(learningProgress([chapter], restored, plan)).toEqual({ total: 1, completed: 1, inProgress: 0, remaining: 0, percent: 100 });
    restored.chapterMeta[chapter.id].stage = 'notStarted';
    expect(chapterStage(chapter, restored, plan)).toBe('notStarted');
  });
  it('counts in-progress separately, handles empty groups and tracks category changes', () => {
    const plan = buildPlan();
    let data = freshData();
    const chapter = CHAPTERS[0];
    data = updateChapterMeta(data, chapter.id, { priority: 'C', steps: { class: true } });
    expect(chapterStage(chapter, data, plan)).toBe('inProgress');
    expect(learningProgress([], data, plan).percent).toBe(0);
    const summary = learningDashboard(data, plan);
    expect(summary.overall.total).toBe(CHAPTERS.length);
    expect(summary.overall.completed).toBe(0);
    expect(summary.overall.inProgress).toBe(1);
    expect(summary.category.C.total).toBe(CHAPTERS.filter(c => (c.id === chapter.id ? 'C' : c.priority) === 'C').length);
  });
  it('rejects malformed new fields instead of silently losing data', () => {
    const data = freshData();
    const meta = { note: '', weak: false, cq: 'none', mcq: 'none', updatedAt: '2026-11-15T00:00:00Z' };
    for (const bad of [{ priority: 'D' }, { stage: 'unknown' }, { steps: { class: 'yes' } }]) {
      expect(() => parseBackup(JSON.stringify({ ...data, chapterMeta: { [CHAPTERS[0].id]: { ...meta, ...bad } } }))).toThrow();
    }
  });
});
