import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from './i18n';
import { MOTIVATION_LINES, motivationFor, motivationText } from './motivation';

beforeEach(() => setLanguage('bn'));

describe('daily motivation', () => {
  it('returns the same line for the same date', () => {
    expect(motivationFor('2026-11-14')).toEqual(motivationFor('2026-11-14'));
  });

  it('rotates through the list on consecutive days', () => {
    expect(motivationFor('2026-11-14')).not.toEqual(motivationFor('2026-11-15'));
    expect(motivationFor('2026-11-14')).toEqual(motivationFor('2026-12-12'));
  });

  it('always returns a non-empty bilingual line', () => {
    for (let i = 0; i < MOTIVATION_LINES.length; i += 1) {
      const line = MOTIVATION_LINES[i];
      expect(line.bn.trim().length).toBeGreaterThan(5);
      expect(line.en.trim().length).toBeGreaterThan(5);
      expect(line.en).not.toBe(line.bn);
    }
  });

  it('follows the active interface language', () => {
    expect(motivationText('2026-11-14')).toBe(motivationFor('2026-11-14').bn);
    setLanguage('en');
    expect(motivationText('2026-11-14')).toBe(motivationFor('2026-11-14').en);
  });

  it('falls back safely for an invalid date', () => {
    expect(motivationFor('not-a-date')).toEqual(MOTIVATION_LINES[0]);
  });
});
