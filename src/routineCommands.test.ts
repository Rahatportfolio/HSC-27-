import { describe, expect, it } from 'vitest';
import { parseRoutineCommand, applyRoutineCommand } from './routineCommands';
import { personalDataFixture } from './test/personalRoutineFixture';
import { buildStudyPlan } from './studyPlan';
import { parseBackup } from './storage';

describe('local confirmed routine commands', () => {
  it('recognizes explicit Bangla, Banglish and English duration changes without accepting unrelated or destructive text', () => {
    expect(parseRoutineCommand('দৈনিক পড়ার সময় ৩ ঘণ্টা করো')).toEqual({ type: 'daily-limit', minutes: 180 });
    expect(parseRoutineCommand('set session to 45 minutes')).toEqual({ type: 'session', minutes: 45 });
    expect(parseRoutineCommand('বিরতি ০ মিনিট রাখো')).toEqual({ type: 'break', minutes: 0 });
    expect(parseRoutineCommand('daily time 1.5 hours koro')).toEqual({ type: 'daily-limit', minutes: 90 });
    expect(parseRoutineCommand('daily study time 3 hours?')).toBeUndefined();
    expect(parseRoutineCommand('reset and set daily 3 hours')).toBeUndefined();
    expect(parseRoutineCommand("don't set daily to 3 hours")).toBeUndefined();
    expect(parseRoutineCommand('set daily 2 hours 30 minutes')).toBeUndefined();
    expect(parseRoutineCommand('set session to 1000 minutes')).toBeUndefined();
    expect(parseRoutineCommand('set daily to 1.02 hours')).toBeUndefined();
  });
  it('retains notes, progress and other routine values, rejects locked changes and round-trips backup', () => {
    const data = personalDataFixture(); data.notes[data.settings.startDate] = 'keep me';
    data.completed['test-evidence'] = '2026-11-20T12:00:00.000Z';
    const plan = buildStudyPlan(data, data.settings.startDate);
    const result = applyRoutineCommand(data, { type: 'daily-limit', minutes: 180 }, plan, data.settings.startDate);
    expect(result.personalRoutine!.dailyLimitMinutes).toBe(180);
    expect(result.notes).toEqual(data.notes); expect(result.completed).toEqual(data.completed);
    expect(result.personalRoutine!.chapterIds).toEqual(data.personalRoutine!.chapterIds);
    expect(parseBackup(JSON.stringify(result)).personalRoutine!.dailyLimitMinutes).toBe(180);
    expect(() => applyRoutineCommand({ ...data, lockedDates: [data.settings.startDate] }, { type: 'break', minutes: 4 }, plan, data.settings.startDate)).toThrow();
    expect(data.personalRoutine!.dailyLimitMinutes).not.toBe(180);
  });
});
