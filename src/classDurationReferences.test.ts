import { expect, it } from 'vitest';
import { CLASS_DURATION_REFERENCES, CLASS_REFERENCE_PROVENANCE, classDurationReference, referenceDuration } from './classDurationReferences';

it('retains the inconsistent original record separately from a bounded new metadata recheck', () => {
  expect(CLASS_REFERENCE_PROVENANCE).toMatchObject({ previousSnapshotRecordedOn: '2026-11-18', previousSnapshotDateVerified: false, metadataRecheckedOn: '2026-11-16', playerVerified: false, fullContentVerified: false });
  expect(CLASS_DURATION_REFERENCES).toHaveLength(8);
  expect(CLASS_DURATION_REFERENCES.every(row => row.checkedOn === CLASS_REFERENCE_PROVENANCE.metadataRecheckedOn)).toBe(true);
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
