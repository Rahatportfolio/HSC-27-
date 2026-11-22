import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { addDays } from './planner';
import { personalDataFixture, personalWorkload } from './test/personalRoutineFixture';
import { activePersonalCategory, applyPersonalRoutine, newPersonalRoutine, parsePersonalRoutine, personalCategory, personalChapterPairs, personalStageSourceId, selectedChapterRoutineDraft, WORK_STAGES } from './personalRoutine';
import { buildStudyPlan } from './studyPlan';
import { parseBackup } from './storage';
import { actionableReminderPlan } from './notifications';
import { setTaskCompletion } from './study';
import { applyChapterAction, mergedChapters } from './chapterStore';

const selected = ['physics-1-3', 'physics-1-2', 'physics-1-1'];
const categories = { 'physics-1-3': 'S', 'physics-1-2': 'A', 'physics-1-1': 'B' } as const;
const at = '2026-11-20T10:00:00.000Z';
function makeData() {
  const data = personalDataFixture();
  const full = newPersonalRoutine('ALL');
  full.windows = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
  full.dailyLimitMinutes = 600; full.breakMinutes = 0;
  full.workloads = Object.fromEntries(selected.map(id => [id, personalWorkload(15)]));
  data.personalRoutine = parsePersonalRoutine(full);
  data.settings.testExamDate = addDays(data.settings.startDate, 25);
  data.settings.examDate = addDays(data.settings.startDate, 50);
  return data;
}
function complete(data: ReturnType<typeof makeData>, id: string) {
  for (const stage of WORK_STAGES) if (data.personalRoutine!.workloads[id][stage.id].minutes) data.completed[personalStageSourceId(data.personalRoutine!, id, stage.id)] = at;
}

describe('explicitly selected chapters', () => {
  it('requires an exact S/A/B assignment and never accepts C or hidden extras', () => {
    const data = makeData(); const draft = selectedChapterRoutineDraft(data);
    expect(draft.chapterIds).toEqual([]);
    expect(() => parsePersonalRoutine(draft)).toThrow();
    const valid = { ...draft, chapterIds: selected, categories };
    expect(parsePersonalRoutine(valid).categories).toEqual(categories);
    expect(() => parsePersonalRoutine({ ...valid, categories: { ...categories, 'biology-2-12': 'B' } })).toThrow();
    expect(() => parsePersonalRoutine({ ...valid, chapterIds: [...selected, 'biology-2-12'], categories: { ...categories, 'biology-2-12': 'B' } })).toThrow();
    expect(() => parsePersonalRoutine({ ...valid, categories: { ...categories, 'physics-1-1': 'S' } })).toThrow();
  });
  it('changes an ALL plan only on explicit application and retains notes, evidence, workloads and backup', () => {
    const data = makeData(), old = data.personalRoutine!;
    const excluded = 'physics-1-4';
    const source = personalStageSourceId(old, excluded, 'class'); data.completed[source] = at;
    data.notes[data.settings.startDate] = 'Keep note';
    const oldPlan = buildStudyPlan(data, data.settings.startDate);
    const before = JSON.stringify(data);
    const draft = { ...selectedChapterRoutineDraft(data), chapterIds: selected, categories };
    expect(JSON.stringify(data)).toBe(before);
    const updated = applyPersonalRoutine(data, draft, { plan: oldPlan, asOf: data.settings.startDate });
    expect(updated.notes).toEqual(data.notes); expect(updated.completed).toEqual(data.completed);
    expect(updated.personalRoutine!.workloads[excluded]).toEqual(old.workloads[excluded]);
    expect(updated.personalRoutine!.chapterIds).toEqual(selected);
    const plan = buildStudyPlan(updated, data.settings.startDate);
    const allocated = plan.flatMap(day => day.tasks).filter(task => task.personalWork);
    expect(allocated.length).toBeGreaterThan(0);
    expect(allocated.every(task => selected.includes(task.chapterIds[0]))).toBe(true);
    expect(new Set(personalChapterPairs(updated.personalRoutine!, updated).flat())).toEqual(new Set(selected));
    const ranks = allocated.map(task => ['S', 'A', 'B'].indexOf(personalCategory(updated, task.chapterIds[0])));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(parseBackup(JSON.stringify(updated))).toEqual(updated);
    const oldHistory = (updated.personalRoutine!.history || []).filter(task => task.chapterIds[0] === excluded);
    expect(oldHistory.length).toBeGreaterThan(0);
    const afterTick = setTaskCompletion(updated, [allocated[0].id], true, plan);
    expect((afterTick.personalRoutine!.history || []).filter(task => task.chapterIds[0] === excluded)).toEqual(oldHistory);
    expect(parseBackup(JSON.stringify(afterTick)).completed[source]).toBe(at);
    expect(CHAPTERS.length).toBeGreaterThan(selected.length);
  });
  it('gates later categories, unlocks after completion, and reopens S after undo', () => {
    const data = makeData();
    data.personalRoutine = parsePersonalRoutine({ ...selectedChapterRoutineDraft(data), chapterIds: selected, categories });
    const start = data.settings.startDate, plan = buildStudyPlan(data, start);
    expect(activePersonalCategory(data)).toBe('S');
    expect(actionableReminderPlan(plan, data).flatMap(day => day.tasks).filter(task => task.personalWork).every(task => task.chapterIds[0] === selected[0])).toBe(true);
    complete(data, selected[0]); expect(activePersonalCategory(data)).toBe('A');
    complete(data, selected[1]); expect(activePersonalCategory(data)).toBe('B');
    delete data.completed[personalStageSourceId(data.personalRoutine!, selected[0], 'class')];
    expect(activePersonalCategory(data)).toBe('S');
    const today = addDays(start, 10);
    const pending = buildStudyPlan(data, today).find(day => day.date === today)?.tasks.filter(task => task.personalWork && !data.completed[task.id]) || [];
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every(task => task.chapterIds[0] === selected[0])).toBe(true);
  });
  it('preserves a selected routine and its categories when AI chapter actions are saved and restored', () => {
    const data = makeData();
    data.personalRoutine = parsePersonalRoutine({ ...selectedChapterRoutineDraft(data), chapterIds: selected, categories });
    data.notes[data.settings.startDate] = 'Keep this note';
    complete(data, selected[0]);
    const custom = { ...CHAPTERS[0], id: 'custom-physics-example', title: 'My extra chapter' };
    let updated = applyChapterAction(data, { type: 'add', chapter: custom });
    updated = applyChapterAction(updated, { type: 'setPriority', chapterId: selected[1], priority: 'C' });
    const restored = parseBackup(JSON.stringify(updated));
    expect(mergedChapters(restored).some(chapter => chapter.id === custom.id)).toBe(true);
    expect(restored.notes).toEqual(data.notes);
    expect(restored.completed).toEqual(data.completed);
    expect(restored.personalRoutine!.chapterIds).toEqual(selected);
    expect(restored.personalRoutine!.categories).toEqual(categories);
    expect(personalCategory(restored, selected[1])).toBe('A');
    expect(activePersonalCategory(restored)).toBe('A');
    expect(buildStudyPlan(restored, data.settings.startDate).flatMap(day => day.tasks).filter(task => task.personalWork).every(task => selected.includes(task.chapterIds[0]))).toBe(true);
  });

});
