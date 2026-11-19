import { expect, it } from 'vitest';
import { parsePersonalRoutine, personalStageSourceId } from './personalRoutine';
import { parseBackup } from './storage';
import { personalDataFixture, PERSONAL_IDS } from './test/personalRoutineFixture';
import { makeMarkdown } from './exports';
import { CLASS_DURATION_REFERENCES, CLASS_REFERENCE_PROVENANCE, classDurationReference, referenceDuration } from './classDurationReferences';

it('retains contradictory recorded dates but never certifies a replacement observation date', () => {
  expect(CLASS_REFERENCE_PROVENANCE).toMatchObject({ previousSnapshotRecordedOn: '2026-11-18', previousSnapshotDateVerified: false, recordedMetadataRecheckOn: '2026-11-16', fetchTraceRecordedOn: '2026-11-19', metadataRecheckedOn: null, metadataRecheckDateVerified: false, chronologyStatus: 'inconsistent-unverified', playerVerified: false, fullContentVerified: false });
  expect(CLASS_DURATION_REFERENCES).toHaveLength(8);
  expect(CLASS_DURATION_REFERENCES.every(row => row.checkedOn === null)).toBe(true);
  expect(CLASS_DURATION_REFERENCES.map(referenceDuration)).toEqual(['7:25:34', '3:38:53', '4:02:06', '8:01:55', '08:39', '2:24:16', '1:55:02', '58:31']);
  expect(CLASS_DURATION_REFERENCES.filter(row => row.suitability === 'chapter')).toHaveLength(4);
  expect(CLASS_DURATION_REFERENCES.filter(row => row.suitability !== 'chapter').every(row => row.reasonBn && row.reasonEn)).toBe(true);
});
it('only suggests metadata for the exact source AND chapter AND kind, never a playlist or different chapter', () => {
  expect(classDurationReference('9oxhLHSATYM', 'physics-1-3', 'class')?.seconds).toBe(26734);
  expect(classDurationReference('9oxhLHSATYM', 'physics-1-3', 'mcqClass')).toBeUndefined();
  expect(classDurationReference('9oxhLHSATYM', 'physics-1-2', 'class')).toBeUndefined();
  expect(classDurationReference(null, 'physics-1-3', 'class')).toBeUndefined();
});

it('separates new reference acceptance from a page observation without changing source identities or old evidence', () => {
  const data = personalDataFixture(), id = PERSONAL_IDS[0], at = '2026-11-16T12:00:00.000Z';
  const classBudget = { minutes: 26734 / 60, source: 'reference-metadata' as const, url: 'https://www.youtube.com/watch?v=9oxhLHSATYM' };
  data.personalRoutine!.workloads[id].class = { ...classBudget, observedAt: '2026-11-16' };
  const source = personalStageSourceId(data.personalRoutine!, id, 'class');
  data.completed[source] = at; data.notes['2026-11-16'] = 'Real dated student history';
  expect(parseBackup(JSON.stringify(data))).toEqual(data); // Legacy reference timestamp is not rewritten.
  data.personalRoutine!.workloads[id].class = { ...classBudget, acceptedAt: at };
  expect(personalStageSourceId(data.personalRoutine!, id, 'class')).toBe(source);
  expect(parseBackup(JSON.stringify(data))).toEqual(data);
  expect(data.completed).toEqual({ [source]: at });
  const markdown = makeMarkdown([], data);
  expect(markdown).toContain('যাচাইয়ের তারিখ অনিশ্চিত');
  expect(markdown).not.toContain('যাচাই করা পৃষ্ঠার snapshot');
});
it.each(['not-a-date', '2026-02-31T12:00:00Z', '2026-11-16', '2026-11-16T12:00:00+00:90'])('rejects invalid acceptance instant %s without relaxing actual-player provenance', acceptedAt => {
  const data = personalDataFixture(), id = PERSONAL_IDS[0];
  data.personalRoutine!.workloads[id].class = { minutes: 240, source: 'reference-metadata', url: 'https://www.youtube.com/watch?v=9oxhLHSATYM', acceptedAt };
  expect(() => parsePersonalRoutine(data.personalRoutine)).toThrow();
});
it('requires a URL and distinct acceptance/observation evidence for reference and player sources', () => {
  const routine = personalDataFixture().personalRoutine!, id = PERSONAL_IDS[0], acceptedAt = '2026-11-16T12:00:00.000Z';
  routine.workloads[id].class = { minutes: 240, source: 'reference-metadata', acceptedAt };
  expect(() => parsePersonalRoutine(routine)).toThrow();
  routine.workloads[id].class.url = 'https://www.youtube.com/watch?v=9oxhLHSATYM';
  expect(parsePersonalRoutine(routine).workloads[id].class.acceptedAt).toBe(acceptedAt);
  routine.workloads[id].class.source = 'youtube-player';
  expect(() => parsePersonalRoutine(routine)).toThrow();
  routine.workloads[id].class.source = 'student';
  expect(() => parsePersonalRoutine(routine)).toThrow();
});
