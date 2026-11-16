import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, freshData } from './planner';
import { parseBackup } from './storage';
import { gpaTargetLabel } from './gpa';
import { setLanguage } from './i18n';

it('uses twelve-hour boost only as a default, preserving explicit saved hours', () => {
  expect(DEFAULT_SETTINGS.boostDailyHours).toBe(12);
  const data = freshData();
  data.settings.boostDailyHours = 16;
  expect(parseBackup(JSON.stringify(data)).settings.boostDailyHours).toBe(16);
});
it('translates GPA labels without changing result semantics', () => {
  try {
    setLanguage('en');
    expect(gpaTargetLabel(5, false)).toBe('GPA 5.00 — excellent');
    expect(gpaTargetLabel(null, false)).toBe('Add marks to see GPA');
    setLanguage('bn');
    expect(gpaTargetLabel(null, false)).toBe('নম্বর যোগ করলে GPA দেখা যাবে');
  } finally { setLanguage('bn'); }
});
