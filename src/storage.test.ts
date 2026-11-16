import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import { parseBackup, sanitizeSettings } from './storage';

describe('validated local backups', () => {
  it('round-trips progress, notes, scores and settings', () => {
    const data = freshData();
    data.completed['physics-1-2:part-1'] = '2026-11-14T08:00:00Z';
    data.notes['2026-11-14'] = '<script>alert(1)</script>';
    data.exams['physics-1'] = { score: 72, total: 100, at: '2027-04-16T08:00:00Z', mistakes: 'একক ভুল' };
    data.mistakes.push({ id: 'm1', subject: 'physics', text: 'দিক ভুল', date: '2026-11-14', category: 'careless', retryStatus: 'pending', resolved: false });
    data.routineBlocks.push({ id: 'r1', weekday: 6, startMinute: 1200, minutes: 60, subject: 'math', title: 'কাস্টম গণিত', createdAt: '2026-11-01T00:00:00Z' });
    data.importantDates.push({ id: 'i1', date: '2027-01-15', title: 'মডেল টেস্ট', note: 'সকাল ১০টা', notify: true, createdAt: '2026-11-14T08:00:00Z' });
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it('rejects malformed JSON, wrong versions, invalid dates and impossible scores', () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    expect(() => parseBackup('{"version":3}')).toThrow('version 1 বা 2');
    expect(() => parseBackup('{"version":2}')).toThrow('Settings');
    const data = freshData();
    expect(() => parseBackup(JSON.stringify({ ...data, settings: { ...data.settings, startDate: '2026-02-30' } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, exams: { 'physics-1': { score: 101, total: 100, at: '2027-04-16T08:00:00Z', mistakes: '' } } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, completed: { x: 'not-a-date' } }))).toThrow();
  });
  it('keeps the reading size and the watched-class list, and rejects junk', () => {
    const data = freshData();
    data.settings.fontScale = 'lg';
    data.classWatched['https://www.youtube.com/watch?v=pc42PaR2OE8'] = '2026-11-14T09:00:00Z';
    const parsed = parseBackup(JSON.stringify(data));
    expect(parsed.settings.fontScale).toBe('lg');
    expect(Object.keys(parsed.classWatched)).toEqual(['https://www.youtube.com/watch?v=pc42PaR2OE8']);
    // A backup without the new fields still loads with the comfortable default.
    expect(parsed.settings.fontScale).toBe('lg');
    const legacy = JSON.parse(JSON.stringify(data));
    delete legacy.settings.fontScale;
    delete legacy.classWatched;
    expect(parseBackup(JSON.stringify(legacy)).settings.fontScale).toBe('md');
    expect(parseBackup(JSON.stringify(legacy)).classWatched).toEqual({});
    expect(() => parseBackup(JSON.stringify({ ...data, settings: { ...data.settings, fontScale: 'huge' } }))).toThrow('লেখার আকার');
    const longKey = { ['x'.repeat(600)]: '2026-11-14T09:00:00Z' };
    expect(() => parseBackup(JSON.stringify({ ...data, classWatched: longKey }))).toThrow('দেখা ক্লাস');
    expect(() => parseBackup(JSON.stringify({ ...data, classWatched: { url: 'not-a-date' } }))).toThrow('দেখা ক্লাস');
  });

  it('stores CQ sub-part marks only when they add up', () => {
    const data = freshData();
    data.cq.push({ id: 'c1', subject: 'physics', question: 'প্রশ্ন', marks: 6, total: 10, note: '', date: '2026-11-14', at: '2026-11-14T09:00:00Z', parts: { c1: 1, c2: 1, c3: 2, c4: 2 } });
    expect(parseBackup(JSON.stringify(data)).cq[0].parts).toEqual({ c1: 1, c2: 1, c3: 2, c4: 2 });
    const tooMany = JSON.parse(JSON.stringify(data));
    tooMany.cq[0].parts = { c1: 4, c2: 4, c3: 4, c4: 4 };
    expect(parseBackup(JSON.stringify(tooMany)).cq[0].parts).toBeUndefined();
    const junk = JSON.parse(JSON.stringify(data));
    junk.cq[0].parts = 'nope';
    expect(parseBackup(JSON.stringify(junk)).cq[0].parts).toBeUndefined();
  });

  it('rejects impossible timestamps and unsafe prototype keys stay own properties', () => {
    const data = freshData();
    expect(() => parseBackup(JSON.stringify({ ...data, completed: { x: '2026-02-30T08:00:00Z' } }))).toThrow('অগ্রগতির তারিখ');
    expect(() => parseBackup(JSON.stringify({ ...data, exams: { 'physics-1': { score: 1, total: 100, at: '2026-02-30T08:00:00Z', mistakes: '' } } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, focus: { minutes: -1, sessions: 0 } }))).toThrow('ফোকাস');
    expect(() => parseBackup(JSON.stringify({ ...data, routineBlocks: [{ id: 'r1', weekday: 9, startMinute: 0, minutes: 60, subject: 'math', title: '', createdAt: '2026-11-01T00:00:00Z' }] }))).toThrow('রুটিন');
    expect(() => parseBackup(JSON.stringify({ ...data, importantDates: [{ id: 'i1', date: '2026-02-30', title: 'x', note: '', notify: true, createdAt: '2026-11-14T08:00:00Z' }] }))).toThrow('তারিখ');
    const parsed = parseBackup(JSON.stringify({ ...data, completed: JSON.parse('{"__proto__":"2026-11-14T08:00:00Z"}') }));
    expect(Object.prototype.hasOwnProperty.call(parsed.completed, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('migrates a version 1 backup without losing progress', () => {
    const v1 = {
      version: 1,
      settings: {
        startDate: '2026-11-14', startTime: '06:30', dailyHours: 8, board: 'সিলেট', name: 'রাহাত',
        reminderEnabled: false, reminderLead: 10, syllabusChecked: false, calendarRevision: 0,
      },
      completed: { 'physics-1-2:part-1': '2026-11-14T08:00:00.000Z' },
      confidence: { 'physics-1-2': 'weak' },
      notes: { '2026-11-14': 'পুরোনো দিনের নোট' },
      exams: {},
      mistakes: [],
      focus: { minutes: 120, sessions: 4 },
    };
    const migrated = parseBackup(JSON.stringify(v1));
    expect(migrated.version).toBe(2);
    expect(migrated.completed['physics-1-2:part-1']).toBe('2026-11-14T08:00:00.000Z');
    expect(migrated.notes['2026-11-14']).toBe('পুরোনো দিনের নোট');
    expect(migrated.focus.minutes).toBe(120);
    expect(migrated.settings.theme).toBe('light');
    expect(migrated.settings.testExamDate).toBe('2027-01-01');
    expect(migrated.settings.examDate).toBe('2027-06-06');
    expect(migrated.settings.boostEnabled).toBe(true);
    expect(migrated.settings.boostStartDate).toBe('2026-12-01');
    expect(migrated.settings.boostDailyHours).toBe(16);
    expect(migrated.settings.pomodoroFocus).toBe(25);
    expect(migrated.studySessions).toEqual([]);
    expect(migrated.revisions).toEqual([]);
    expect(migrated.gpaMarks).toEqual({});
    expect(migrated.formulaFavorites).toEqual([]);
  });
  it('normalizes settings and ignores unknown fields', () => {
    const settings = sanitizeSettings({ ...freshData().settings, dailyHours: '8', reminderLead: '15', unknown: 'x' });
    expect(settings.dailyHours).toBe(8); expect(settings.reminderLead).toBe(15); expect(settings).not.toHaveProperty('unknown');
    const parsed = parseBackup(JSON.stringify({ ...freshData(), injected: true }));
    expect(parsed).not.toHaveProperty('injected');
  });
});

describe('personal tasks and legacy carryovers', () => {
  it('retains one-off task dates and repairs stale carried completion state', () => {
    const data = freshData();
    data.routineBlocks.push({ id: 'personal', date: '2026-11-14', weekday: 6, startMinute: 600, minutes: 30, subject: 'physics', title: 'My task', createdAt: '2026-11-14T00:00:00Z' });
    data.completed.task = '2026-11-14T00:00:00Z';
    data.carryovers.push({ id: 'carry', taskId: 'task', title: 'Task', subject: 'physics', minutes: 30, fromDate: '2026-11-14', date: '2026-11-15', createdAt: '2026-11-14T00:00:00Z' });
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.routineBlocks[0].date).toBe('2026-11-14');
    expect(restored.carryovers[0].completedAt).toBe(data.completed.task);
  });
});

describe('previously accepted user data', () => {
  it('loads long note tags and older large or fractional test records without losing the profile', () => {
    const data = freshData();
    data.libraryNotes.push({ id: 'note', title: 'Note', body: '', tags: ['x'.repeat(80)], pinned: false, createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z' });
    data.tests.push({ id: 'test', kind: 'model', title: 'Test', chapterIds: [], score: 1001, total: 1200, durationMin: 30.5, date: '2026-11-15', at: '2026-11-15T00:00:00.000Z', notes: '' });
    data.cq.push({ id: 'cq', subject: 'physics', question: 'CQ', marks: 1001, total: 1200, note: '', date: '2026-11-15', at: '2026-11-15T00:00:00.000Z' });
    const restored = parseBackup(JSON.stringify(data));
    expect(restored.libraryNotes[0].tags[0]).toHaveLength(80);
    expect(restored.tests[0].durationMin).toBe(30.5);
    expect(restored.cq[0].total).toBe(1200);
  });
});
