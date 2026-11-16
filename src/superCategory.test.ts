import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { S_CHAPTERS, isSuperChapter } from './superCategory';
import { DEFAULT_SETTINGS, buildPlan, chapterTasks, effectiveDailyHours, freshData } from './planner';
import { parseBackup } from './storage';
import { aCategoryChecklist, testPrepStats } from './testPrep';
import { chapterPriority } from './learning';

describe('S is an independent, conservative pre-test shortlist', () => {
  it('keeps every original chemistry A chapter and only a compact subset elsewhere', () => {
    expect(S_CHAPTERS.filter(c => c.subject === 'chemistry')).toEqual(CHAPTERS.filter(c => c.subject === 'chemistry' && c.priority === 'A'));
    expect(S_CHAPTERS.filter(c => c.subject === 'physics')).toHaveLength(5);
    expect(S_CHAPTERS.filter(c => c.subject === 'physics').every(c => c.paper === 1)).toBe(true);
    expect(S_CHAPTERS.filter(c => c.subject === 'biology')).toHaveLength(6);
    expect(S_CHAPTERS.filter(c => c.subject === 'math')).toHaveLength(5);
    expect(S_CHAPTERS.filter(c => c.subject === 'bangla')).toHaveLength(5);
    expect(S_CHAPTERS.filter(c => c.subject === 'ict')).toHaveLength(4);
    expect(S_CHAPTERS.every(c => c.priority === 'A')).toBe(true);
    expect(new Set(S_CHAPTERS.map(c => c.id)).size).toBe(S_CHAPTERS.length);
  });
  it('does not reclassify A/B/C or replace personal priority', () => {
    const data = freshData();
    const c = S_CHAPTERS[0];
    data.chapterMeta[c.id] = { priority: 'B' } as typeof data.chapterMeta[string];
    expect(isSuperChapter(c)).toBe(true);
    expect(chapterPriority(c, data)).toBe('B');
    expect(c.priority).toBe('A');
  });
  it('uses a tentative January prep deadline for new users and retains explicit saved dates', () => {
    expect(DEFAULT_SETTINGS.testExamDate).toBe('2027-01-01');
    const data = freshData();
    data.settings.testExamDate = '2027-01-19';
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.settings.testExamDate).toBe('2027-01-19');
    expect(restored.settings.sCategoryMode).toBe(true);
    delete data.settings.sCategoryMode;
    data.settings.testExamDate = '2027-02-01';
    data.completed['physics-1-2:part-1'] = '2026-11-15T10:00:00Z';
    const legacy = parseBackup(JSON.stringify(data));
    expect(legacy.settings.sCategoryMode).toBe(false);
    expect(legacy.settings.testExamDate).toBe('2027-02-01');
    expect(legacy.completed).toEqual(data.completed);
  });
  it('rejects malformed mode flags on restore', () => {
    const raw = JSON.parse(JSON.stringify(freshData()));
    raw.settings.sCategoryMode = 'true';
    expect(() => parseBackup(JSON.stringify(raw))).toThrow();
  });
  it('finishes scheduled S study parts before January and preserves every chapter part afterwards', () => {
    const plan = buildPlan();
    for (const c of CHAPTERS) {
      const parts = chapterTasks(plan, c.id);
      expect(parts, c.id).toHaveLength(c.effort);
      expect(parts.every(t => isSuperChapter(c) ? t.date < DEFAULT_SETTINGS.testExamDate : t.date >= DEFAULT_SETTINGS.testExamDate), c.id).toBe(true);
    }
    const aLast = Math.max(...CHAPTERS.filter(c => c.priority === 'A').flatMap(c => chapterTasks(plan,c.id).map(t => t.dayIndex)));
    const bFirst = Math.min(...CHAPTERS.filter(c => c.priority === 'B').flatMap(c => chapterTasks(plan,c.id).map(t => t.dayIndex)));
    expect(aLast).toBeLessThan(bFirst);
    for (const d of plan) {
      expect(d.tasks.reduce((sum,t) => sum+t.endMinute-t.startMinute,0)).toBeLessThanOrEqual(effectiveDailyHours(DEFAULT_SETTINGS,d.date)*60);
      expect(new Set(d.tasks.map(t => t.subject)).size).toBeLessThanOrEqual(2);
    }
  });
  it('tracks S progress independently while retaining the A checklist', () => {
    const data = freshData();
    const plan = buildPlan();
    const s = S_CHAPTERS[0];
    expect(testPrepStats(data,plan,'2026-11-15','S').totalA).toBe(S_CHAPTERS.length);
    expect(aCategoryChecklist(data,plan,'S')).toHaveLength(S_CHAPTERS.length);
    expect(aCategoryChecklist(data,plan)).toHaveLength(CHAPTERS.filter(c => c.priority === 'A').length);
    for(const task of chapterTasks(plan,s.id)) data.completed[task.id] = '2026-11-15T10:00:00Z';
    expect(testPrepStats(data,plan,'2026-11-15','S').doneA).toBe(1);
    const missing = testPrepStats(freshData(),[],'2026-11-15','S');
    expect(missing.onPace).toBe(false);
  });
});
