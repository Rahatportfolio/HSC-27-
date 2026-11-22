import { describe, expect, it } from 'vitest';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { PERSONAL_SESSIONS, personalStageDone, personalStageSourceId, personalUnfinishedRanges, personalSessionForStage, WORK_STAGES } from './personalRoutine';
import { buildStudyPlan } from './studyPlan';
import { addDays } from './planner';
import { parseBackup } from './storage';
import { buildTaskReminderNotification, reminderTasksForDay } from './notifications';
import { setLanguage } from './i18n';

const at = '2026-11-16T10:00:00.000Z';
describe('three-session compatibility', () => {
  it('assigns each saved source exactly once with no classes in notes', () => {
    expect(PERSONAL_SESSIONS).toHaveLength(3);
    expect(PERSONAL_SESSIONS.flatMap(session => session.stages).sort()).toEqual(WORK_STAGES.map(stage => stage.id).sort());
    expect(PERSONAL_SESSIONS[1].stages.every(stage => !WORK_STAGES.find(item => item.id === stage)!.media)).toBe(true);
    expect(personalSessionForStage('class').id).toBe('class');
    for (const stage of ['mcqClass', 'cqClass', 'mcqPractice', 'cqPractice'] as const) expect(personalSessionForStage(stage).id).toBe('practice');
  });
  it('reminds once per chapter session instead of every internal fragment', () => {
    const data = personalDataFixture(); data.personalRoutine!.sessionMinutes = 20;
    const plan = buildStudyPlan(data, data.settings.startDate), day = plan[0];
    const reminders = reminderTasksForDay(day.tasks);
    expect(day.tasks.length).toBeGreaterThan(2);
    expect(reminders).toHaveLength(2);
    expect(new Set(reminders.map(task => task.chapterIds[0])).size).toBe(2);
    setLanguage('en');
    expect(buildTaskReminderNotification(plan, data, reminders[0]).title).toContain('1. Chapter YouTube class');
    // Filtering for completion must not make every subsequent fragment a new reminder.
    data.completed[reminders[0].id] = at;
    expect(reminderTasksForDay(day.tasks).map(task => task.id)).toEqual(reminders.map(task => task.id));
  });
  it('retains old interleaved range evidence without certifying an unfinished class after reflow and backup', () => {
    const data = personalDataFixture([PERSONAL_IDS[0]]), id = PERSONAL_IDS[0], routine = data.personalRoutine!;
    const classId = personalStageSourceId(routine, id, 'class'), notesId = personalStageSourceId(routine, id, 'notes');
    const partial = `smart-part|${encodeURIComponent(classId)}|0|40`;
    data.completed[partial] = at; data.completed[notesId] = at;
    data.notes[data.settings.startDate] = 'Saved notes';
    const restored = parseBackup(JSON.stringify(data));
    const plan = buildStudyPlan(restored, addDays(restored.settings.startDate, 1));
    const current = plan.flatMap(day => day.tasks).filter(task => task.personalWork?.sourceId === classId);
    const outstanding = current.flatMap(task => personalUnfinishedRanges(task, restored.completed)).reduce((sum, range) => sum + range.to - range.from, 0);
    expect(outstanding).toBe(200);
    expect(personalStageDone(restored.personalRoutine!, id, 'class', restored.completed)).toBe(false);
    expect(personalStageDone(restored.personalRoutine!, id, 'notes', restored.completed)).toBe(true);
    expect(restored.completed).toEqual({ [partial]: at, [notesId]: at });
    expect(restored.notes[data.settings.startDate]).toBe('Saved notes');
  });
});
