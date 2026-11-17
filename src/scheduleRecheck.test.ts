import { beforeEach, describe, expect, it } from 'vitest';
import { CHAPTERS } from './data';
import { emptyAdvanced } from './advanced';
import { buildPlan, freshData, hasFullTaskAllocation, shiftPlanStart } from './planner';
import type { Day, Task } from './planner';
import { integrateStudyPlan, remainingTaskMinutes } from './smartSchedule';
import { setTaskCompletion } from './study';
import { parseBackup } from './storage';
import { setLanguage } from './i18n';
import { parseTaskRangeId } from './taskReferences';
import { applyScheduleSettings } from './reschedule';

const date = '2026-11-20';
const at = '2026-11-20T08:00:00Z';
const setup = () => {
  const data = freshData();
  data.settings = { ...data.settings, dailyHours: 4, boostEnabled: false, adaptiveEnabled: false };
  data.advanced = { ...emptyAdvanced(), classes: [{
    id: 'video', title: 'Completed lecture', url: 'https://example.org/video.mp4', chapterId: CHAPTERS[0].id,
    teacher: 'T', duration: 120, position: 120, watched: 120, speed: 1, permitted: true, note: '',
  }] };
  return data;
};
const fixture = (minutes = 60): { plan: Day[]; source: Task; pending: Task } => {
  const day = buildPlan(setup().settings)[0];
  const source = { ...day.tasks[0], id: 'source', startMinute: 390, endMinute: 390 + minutes };
  const pending = { ...day.tasks[1], id: 'pending', startMinute: 390 + minutes, endMinute: 630 };
  return { plan: [{ ...day, tasks: [source, pending] }], source, pending };
};
const minutes = (plan: Day[]) => plan.flatMap(day => day.tasks).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);

beforeEach(() => setLanguage('en'));

describe('completed work remains lossless in the lecture projection', () => {
  it('parses only complete finite positive task ranges, including escaped source ids', () => {
    const sourceId = 'chapter|part:1%';
    expect(parseTaskRangeId(`smart-part|${encodeURIComponent(sourceId)}|0|75.5`)).toEqual({ kind: 'part', sourceId, from: 0, to: 75.5 });
    expect(parseTaskRangeId('smart-video|video|0|30000')).toEqual({ kind: 'video', sourceId: 'video', from: 0, to: 30000 });
    for (const id of ['', 'custom', 'other|source|0|30', 'smart-part|source|0|30|extra', 'smart-part||0|30', 'smart-part|source||30', 'smart-part|source|0| ', 'smart-part|source|NaN|30', 'smart-part|source|0|Infinity', 'smart-part|source|-1|30', 'smart-part|source|30|30', 'smart-part|source|31|30', 'smart-part|%|0|30'])
      expect(parseTaskRangeId(id), id).toBeNull();
  });

  it('does not promote a malformed split reference to full canonical completion', () => {
    const { source } = fixture();
    const malformed = { 'smart-part|source|0|60|extra': at };
    expect(hasFullTaskAllocation([source], source.id, malformed)).toBe(false);
    expect(hasFullTaskAllocation([source], source.id, { 'smart-part|source|0|60': at })).toBe(true);
  });

  it('preserves malformed legacy references verbatim while shifting valid custom split work', () => {
    const data = setup();
    data.routineBlocks = [{ id: 'one', date, weekday: 5, title: 'Own task', subject: 'physics', startMinute: 1200, minutes: 60, createdAt: at }];
    const source = `custom-${date}-one`;
    data.completed = { [`smart-part|${source}|0|30|extra`]: at, [`smart-part|${source}|0|30`]: at };
    const shifted = applyScheduleSettings(data, shiftPlanStart(data.settings, '2026-11-26'));
    expect(shifted.completed).toEqual({ [`smart-part|${source}|0|30|extra`]: at, 'smart-part|custom-2026-11-26-one|0|30': at });
    expect(data.completed).toEqual({ [`smart-part|${source}|0|30|extra`]: at, [`smart-part|${source}|0|30`]: at });
  });

  it('counts promoted split completion once, keeping the remaining work on the same day', () => {
    const { plan, source, pending } = fixture();
    const first = { ...source, id: 'smart-part|source|0|30', originalTaskId: source.id, sourceMinutes: 60, endMinute: 420 };
    const last = { ...source, id: 'smart-part|source|30|60', originalTaskId: source.id, sourceMinutes: 60, startMinute: 420 };
    const splitPlan = [{ ...plan[0], tasks: [first, last, pending] }];
    const done = setTaskCompletion(setup(), [first.id, last.id], true, splitPlan);
    expect(done.completed.source).toBeTruthy();
    Object.keys(done.completed).forEach(id => { done.completed[id] = at; });
    const before = JSON.stringify(done);
    const projected = integrateStudyPlan(plan, parseBackup(before), date);
    expect(minutes(projected)).toBe(240);
    expect(projected[0].tasks.filter(task => done.completed[task.id]).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)).toBe(60);
    expect(projected[0].tasks.find(task => task.id === pending.id)?.endMinute).toBe(630);
    expect(projected.flatMap(day => day.tasks).filter(task => task.id.startsWith('smart-part|source|'))).toEqual([]);
    expect(JSON.stringify(done)).toBe(before);
  });

  it('counts overlapping historical split ranges only once in daily capacity', () => {
    const { plan } = fixture(120);
    const data = setup();
    data.completed = { 'smart-part|source|0|90': at, 'smart-part|source|30|120': '2026-11-20T09:00:00Z' };
    const before = JSON.stringify(data.completed);
    const projected = integrateStudyPlan(plan, data, date);
    expect(minutes(projected)).toBe(240);
    expect(projected[0].tasks.filter(task => data.completed[task.id]).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0)).toBe(120);
    expect(projected[0].tasks.some(task => task.id === 'pending')).toBe(true);
    expect(JSON.stringify(data.completed)).toBe(before);
  });

  it('clips historical evidence to a source shortened by a later hours change', () => {
    const { plan } = fixture(120);
    const data = setup();
    data.completed = { 'smart-part|source|0|180': at };
    const projected = integrateStudyPlan(plan, data, date);
    expect(minutes(projected)).toBe(240);
    expect(projected[0].tasks.find(task => task.id === 'smart-part|source|0|180')?.endMinute).toBe(510);
    expect(projected[0].tasks.some(task => task.id === 'pending')).toBe(true);
    expect(data.completed).toEqual({ 'smart-part|source|0|180': at });
  });

  it('retains malformed legacy split keys without crashing or inventing completed minutes', () => {
    const { plan, source } = fixture();
    const data = setup();
    data.completed = Object.fromEntries([
      'smart-part|%|0|30', 'smart-part|source||30', 'smart-part|source|-30|30',
      'smart-part|source|0|Infinity', 'smart-part|source|0|30|extra',
    ].map(id => [id, at]));
    const restored = parseBackup(JSON.stringify(data));
    let projected: Day[] = [];
    expect(() => { projected = integrateStudyPlan(plan, restored, date); }).not.toThrow();
    expect(projected).toEqual(integrateStudyPlan(plan, setup(), date));
    expect(remainingTaskMinutes(source, restored)).toEqual([{ from: 0, to: 60 }]);
    expect(restored.completed).toEqual(data.completed);
  });

  it('rejects malformed generated task ticks while still allowing their legacy evidence to be undone', () => {
    const invalid = ['smart-video|%|0|30000', 'smart-video|video|NaN|30000', 'smart-video|video|0|Infinity', 'smart-video|video||30000', 'smart-video|video|0|30000|extra', 'smart-part|source|-30|30'];
    const data = setup();
    let checked = data;
    expect(() => { checked = setTaskCompletion(data, invalid, true); }).not.toThrow();
    expect(checked.completed).toEqual({});
    data.completed = Object.fromEntries(invalid.map(id => [id, at]));
    expect(setTaskCompletion(data, invalid, false).completed).toEqual({});
  });

  it('does not certify video content outside the actual class duration as watched', () => {
    const data = setup();
    const done = setTaskCompletion(data, ['smart-video|video|0|180000'], true);
    expect(done.completed).toEqual({});
    expect(setTaskCompletion(data, ['smart-video|video|0|120000'], true).completed['smart-video|video|0|120000']).toBeTruthy();
  });
});
