import { describe, expect, it } from 'vitest';
import { freshData } from './planner';
import { backupAgeDays, backupFileName, backupJson, backupLabel, hasStudyData, needsBackup, weekReport } from './backup';

const session = (date: string, minutes: number, subject: 'physics' | 'math' = 'physics') =>
  ({ id: `s-${date}-${minutes}`, date, at: `${date}T09:00:00Z`, minutes, subject, mode: 'pomodoro' as const });

describe('weekly backup nudge', () => {
  it('stays quiet for a brand-new empty profile', () => {
    const data = freshData();
    expect(hasStudyData(data)).toBe(false);
    expect(needsBackup(data, '2026-11-14')).toBe(false);
  });

  it('asks once the profile has something worth losing', () => {
    const data = freshData();
    data.studySessions.push(session('2026-11-14', 30));
    expect(hasStudyData(data)).toBe(true);
    expect(needsBackup(data, '2026-11-14')).toBe(true);
  });

  it('treats a note, a mistake or a finished revision as data too', () => {
    const withNote = freshData(); withNote.notes['2026-11-14'] = 'আজ ভেক্টর পড়লাম';
    const withMistake = freshData(); withMistake.mistakes.push({ id: 'm1', subject: 'math', text: 'দিক ভুল', date: '2026-11-14', resolved: false });
    const withRevision = freshData();
    withRevision.revisions.push({ id: 'r1', chapterId: 'physics-1-2', subject: 'physics', dueDate: '2026-11-15', interval: 1, createdAt: '2026-11-14T09:00:00Z', completedAt: '2026-11-15T09:00:00Z' });
    expect(hasStudyData(withNote)).toBe(true);
    expect(hasStudyData(withMistake)).toBe(true);
    expect(hasStudyData(withRevision)).toBe(true);
  });

  it('names the file by date and never invents a backup age without storage', () => {
    expect(backupFileName('2026-11-14')).toBe('prostuti-backup-2026-11-14.json');
    expect(backupAgeDays('2026-11-14')).toBeNull();
    expect(backupLabel('2026-11-14')).toBe('এখনও ব্যাকআপ নেওয়া হয়নি');
  });

  it('serialises only real data', () => {
    const data = freshData();
    expect(JSON.parse(backupJson(data)).version).toBe(2);
  });
});

describe('weekly report', () => {
  it('sums the last seven days and reports accuracy', () => {
    const data = freshData();
    data.studySessions.push(session('2026-11-14', 60), session('2026-11-12', 30, 'math'), session('2026-10-01', 120));
    data.attempts.push(
      { id: 'a1', questionId: 'q1', subject: 'physics', chosen: 0, correct: true, date: '2026-11-14', at: '2026-11-14T09:00:00Z' },
      { id: 'a2', questionId: 'q2', subject: 'physics', chosen: 1, correct: false, date: '2026-11-13', at: '2026-11-13T09:00:00Z' },
    );
    data.cq.push({ id: 'c1', subject: 'physics', question: 'প্রশ্ন', marks: 6, total: 10, note: '', date: '2026-11-13', at: '2026-11-13T09:00:00Z' });
    const names: Record<string, string> = { physics: 'পদার্থবিজ্ঞান', math: 'উচ্চতর গণিত' };
    const report = weekReport(data, [], '2026-11-14', id => names[id] || id);
    expect(report.from).toBe('2026-11-08');
    expect(report.sessions).toBe(2);
    expect(report.minutes).toBe(90);
    expect(report.mcq).toBe(2);
    expect(report.accuracy).toBe(50);
    expect(report.cqAverage).toBe(60);
    expect(report.topSubject).toBe('পদার্থবিজ্ঞান');
    expect(report.lines[0]).toContain('সাপ্তাহিক রিপোর্ট');
    expect(report.lines.join('\n')).toContain('1.5 ঘণ্টা');
  });

  it('handles a week with nothing recorded', () => {
    const report = weekReport(freshData(), [], '2026-11-14');
    expect(report.sessions).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.topSubject).toBeNull();
    expect(report.lines.join('\n')).toContain('CQ: এই সপ্তাহে লেখা হয়নি');
  });
});
