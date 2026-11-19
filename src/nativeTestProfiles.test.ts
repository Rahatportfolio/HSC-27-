import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { nativeProfilePath, nativeTestProfiles } from '../scripts/generate-native-test-profiles';
import { PERSONAL_IDS } from './test/personalRoutineFixture';

it.each(['legacy', 'personal'])('ships the current canonical %s fixture only under androidTest assets', name => {
  const path = nativeProfilePath(name), expected = nativeTestProfiles()[name];
  expect(path.pathname).toContain('/android/app/src/androidTest/assets/');
  expect(readFileSync(path, 'utf8')).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  expect(expected.routineSetupRequired).toBe(false);
  expect(expected.settings.fontScale).toBe('lg');
  expect(expected.notes['2026-11-20']).toContain('Synthetic native test note');
});
it('keeps the legacy native-clock case explicit instead of bypassing availability onboarding in the app', () => {
  const data = nativeTestProfiles().legacy;
  expect(data.personalRoutine).toBeUndefined();
  expect(data.studyBrain).toBeUndefined();
  expect(data.completed).toEqual({});
});
it('also tests a genuine two-chapter S routine without silently enabling Brain or marking work done', () => {
  const data = nativeTestProfiles().personal;
  expect(data.personalRoutine?.scope).toBe('S');
  expect(data.personalRoutine?.chapterIds).toEqual(PERSONAL_IDS);
  expect(data.personalRoutine?.dailyLimitMinutes).toBe(270);
  expect(data.studyBrain).toBeUndefined();
  expect(data.completed).toEqual({});
});
