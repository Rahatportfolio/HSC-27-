import { describe, expect, it } from 'vitest';
import { buildPlan, freshData } from './planner';
import { foldICSLine, makeICS, makeMarkdown } from './exports';

describe('calendar and Markdown exports', () => {
  const plan = buildPlan(), data = freshData(), tasks = plan[0].tasks;
  it('emits Dhaka-time events with stable UIDs and alarms', () => {
    const ics = makeICS(tasks, data, new Date('2026-11-14T00:00:00Z'));
    expect(ics).toContain('TZID=Asia/Dhaka:20261114T063000');
    expect(ics).toContain('BEGIN:VALARM\r\nTRIGGER:-PT10M\r\nACTION:DISPLAY');
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(tasks.length);
    expect(ics).toContain(`UID:${tasks[0].id}@hsc27.prostuti.local`);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('folds Unicode lines at 75 octets without splitting code points', () => {
    const line = `DESCRIPTION:${'বাংলা পড়ার রুটিন '.repeat(30)}`;
    const folded = foldICSLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldICSLine('SUMMARY:a\\,b\\;c')).toBe('SUMMARY:a\\,b\\;c');
  });
  it('exports empty calendars as zero without creating a file and escapes Markdown metadata', () => {
    const completed = Object.fromEntries(plan.flatMap(d => d.tasks).map(t => [t.id, '2026-11-14T08:00:00Z']));
    expect(makeICS([], data)).not.toContain('BEGIN:VEVENT');
    const md = makeMarkdown(plan, { ...data, completed, settings: { ...data.settings, dailyHours: 6, name: 'A|B', board: 'X\nY' } });
    expect(md).toContain('৬ ঘণ্টা পড়ার মাঝে');
    expect(md).not.toContain('৮ ঘণ্টা পড়ার মাঝে');
    expect(md).toContain('A\\|B');
    expect(md).not.toContain('X\nY');
  });
  it('contains every date, chapter and model-test record in the Markdown plan', () => {
    const md = makeMarkdown(plan, data);
    for (const day of plan) expect(md).toContain(day.date);
    expect(md).toContain('ভেক্টর');
    expect(md).toContain('মডেল টেস্টের রেকর্ড');
    expect(md).toContain('১৮১');
    expect(md).toContain('[1](https://nctb.gov.bd/');
    data.completed[tasks[0].id] = '2026-11-14T08:00:00Z';
    expect(makeMarkdown(plan, data)).toContain('| [x] |');
  });
});
