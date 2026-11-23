import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { freshData } from './planner';
import type { AppData, Day, Task } from './planner';
import { emptyAdvanced } from './advanced';
import type { StudyClass } from './advanced';
import { timerMinutesForChapter, timerMinutesForTask } from './personalRoutine';
import type { PersonalRoutine, PersonalWork } from './personalRoutine';

const chapterId = CHAPTERS[0].id;
const setup = (): AppData => {
  const data = freshData();
  data.personalRoutine = {
    version: 1, scope: 'S', chapterIds: [chapterId], windows: [],
    playbackSpeed: 1, sessionMinutes: 50, breakMinutes: 10, workloads: {}, updatedAt: '2026-11-23',
  } as PersonalRoutine;
  return data;
};
const segment = (over: Partial<Task> = {}): Task => ({
  id: 'smart-part|test|1', date: '2026-11-23', dayIndex: 0, phase: 'learn',
  subject: CHAPTERS[0].subject, kind: 'learn', title: 'Chapter class', detail: '',
  chapterIds: [chapterId], startMinute: 7, endMinute: 27, ...over,
});
const work = (over: Partial<PersonalWork> = {}): PersonalWork => ({
  stage: 'class', sourceId: 'src', from: 0, to: 20, requiredSources: [],
  chapterMinutes: 480, pairDay: 1, rawMinutes: 480, durationSource: 'student', ...over,
});
const dayWith = (tasks: Task[]): Day => ({ date: '2026-11-23', index: 0, phase: 'learn', tasks, isCatchup: false });

describe('timerMinutesForTask', () => {
  it('gives a 20m pair-study slice of an 8h class the full 8h plus one break', () => {
    // Screenshot case: "Full video 8h; only this source segment" showed "Timer · 20m".
    expect(timerMinutesForTask(segment({ personalWork: work() }), setup())).toBe(490);
  });
  it('resolves smart video slices from the tracked class duration', () => {
    const data = setup();
    const item = { id: 'cls', title: 'class', url: 'https://example.org/c', chapterId, teacher: 't', duration: 8 * 3600, position: 0, watched: 0, speed: 1, permitted: true, note: '' } as StudyClass;
    data.advanced = { ...emptyAdvanced(), classes: [item] };
    expect(timerMinutesForTask(segment({ video: { classId: 'cls', from: 0, to: 1200 } }), data)).toBe(490);
  });
  it('keeps the scheduled length when there is no larger source', () => {
    expect(timerMinutesForTask(segment(), setup())).toBe(20);
  });
  it('keeps the scheduled length when the source is not longer than the segment', () => {
    expect(timerMinutesForTask(segment({ personalWork: work({ rawMinutes: 15 }) }), setup())).toBe(20);
  });
  it('never promises more than the 12h timer maximum', () => {
    expect(timerMinutesForTask(segment({ personalWork: work({ rawMinutes: 1000 }) }), setup())).toBe(720);
  });
});

describe('timerMinutesForChapter', () => {
  it('gives a 20h chapter the 12h maximum plus nothing more', () => {
    // Default estimate: exactly 20h + 10m break, clamped to the timer maximum.
    expect(timerMinutesForChapter(chapterId, setup(), [])).toBe(720);
  });
  it('uses scheduled task minutes for legacy chapters without a routine', () => {
    const data = freshData();
    const plan = [dayWith([segment({ id: 'a', startMinute: 0, endMinute: 30 }), segment({ id: 'b', startMinute: 30, endMinute: 75 })])];
    expect(timerMinutesForChapter(chapterId, data, plan)).toBe(75);
  });
  it('keeps the old 45m quick timer when nothing is scheduled', () => {
    expect(timerMinutesForChapter(chapterId, freshData(), [])).toBe(45);
  });
});
