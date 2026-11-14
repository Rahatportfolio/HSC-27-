import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import { parseBackup, sanitizeSettings } from './storage';

describe('validated local backups', () => {
  it('round-trips progress, notes, scores and settings', () => {
    const data = freshData();
    data.completed['physics-1-2:part-1'] = '2026-11-14T08:00:00Z';
    data.notes['2026-11-14'] = '<script>alert(1)</script>';
    data.exams['physics-1'] = { score: 72, total: 100, at: '2027-04-16T08:00:00Z', mistakes: 'একক ভুল' };
    data.mistakes.push({ id: 'm1', subject: 'physics', text: 'দিক ভুল', date: '2026-11-14', resolved: false });
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
  });
  it('rejects malformed JSON, wrong versions, invalid dates and impossible scores', () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    expect(() => parseBackup('{"version":2}')).toThrow('version 1');
    const data = freshData();
    expect(() => parseBackup(JSON.stringify({ ...data, settings: { ...data.settings, startDate: '2026-02-30' } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, exams: { 'physics-1': { score: 101, total: 100, at: '2027-04-16T08:00:00Z', mistakes: '' } } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, completed: { x: 'not-a-date' } }))).toThrow();
  });
  it('rejects impossible timestamps and unsafe prototype keys stay own properties', () => {
    const data = freshData();
    expect(() => parseBackup(JSON.stringify({ ...data, completed: { x: '2026-02-30T08:00:00Z' } }))).toThrow('অগ্রগতির তারিখ');
    expect(() => parseBackup(JSON.stringify({ ...data, exams: { 'physics-1': { score: 1, total: 100, at: '2026-02-30T08:00:00Z', mistakes: '' } } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, focus: { minutes: -1, sessions: 0 } }))).toThrow('ফোকাস');
    const parsed = parseBackup(JSON.stringify({ ...data, completed: JSON.parse('{"__proto__":"2026-11-14T08:00:00Z"}') }));
    expect(Object.prototype.hasOwnProperty.call(parsed.completed, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('normalizes settings and ignores unknown fields', () => {
    const settings = sanitizeSettings({ ...freshData().settings, dailyHours: '8', reminderLead: '15', unknown: 'x' });
    expect(settings.dailyHours).toBe(8); expect(settings.reminderLead).toBe(15); expect(settings).not.toHaveProperty('unknown');
    const parsed = parseBackup(JSON.stringify({ ...freshData(), injected: true }));
    expect(parsed).not.toHaveProperty('injected');
  });
});
