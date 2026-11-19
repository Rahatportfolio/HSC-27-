/** Bounded saved public-page metadata with an UNVERIFIED observation date.
 * These are NOT browser-player observations, not a complete catalogue audit,
 * and a duration/title is not proof of curriculum coverage or completion.
 * Keep history/source URLs unchanged; unusable suggestions are only excluded
 * from new S defaults. Students explicitly opt into any reference duration.
 */
export interface ClassDurationReference {
  videoId: string;
  title: string;
  seconds: number;
  /** Null until the contradictory recorded dates are independently resolved. */
  checkedOn: string | null;
  chapterId: string;
  stage: 'class' | 'mcqClass' | 'cqClass';
  suitability: 'chapter' | 'not-chapter' | 'not-this-chapter' | 'partial-not-cq';
  reasonBn?: string;
  reasonEn?: string;
}
/** Retain contradictory date labels, not a fabricated observation date.
 * The saved labels do not establish a reliable observation chronology.
 * A student's acceptance time is separate from any page observation.
 */
export const CLASS_REFERENCE_PROVENANCE = {
  previousSnapshotRecordedOn: '2026-11-18',
  previousSnapshotDateVerified: false,
  recordedMetadataRecheckOn: '2026-11-16',
  fetchTraceRecordedOn: '2026-11-19',
  metadataRecheckedOn: null,
  metadataRecheckDateVerified: false,
  chronologyStatus: 'inconsistent-unverified',
  method: 'Saved public title, displayed duration, description and available introduction/transcript excerpt; observation date unverified',
  playerVerified: false,
  fullContentVerified: false,
} as const;
export const CLASS_DURATION_REFERENCES: ClassDurationReference[] = [
  { videoId: '9oxhLHSATYM', title: 'Dynamics One Shot · Mashrur Bhai', seconds: 26734, checkedOn: null, chapterId: 'physics-1-3', stage: 'class', suitability: 'chapter' },
  { videoId: 'wtrodXS2cwU', title: 'গতিবিদ্যা · HSC One Shot MCQ · Udvash-Unmesh', seconds: 13133, checkedOn: null, chapterId: 'physics-1-3', stage: 'mcqClass', suitability: 'chapter' },
  { videoId: 'fV8WGJJwbNk', title: 'গতিবিদ্যা One Shot CQ · Udvash-Unmesh', seconds: 14526, checkedOn: null, chapterId: 'physics-1-3', stage: 'cqClass', suitability: 'chapter' },
  { videoId: 'YlIJOJCB0-E', title: 'মৌলের পর্যায়বৃত্ত ধর্ম ও রাসায়নিক বন্ধন · AloronXYZ', seconds: 28915, checkedOn: null, chapterId: 'chemistry-1-3', stage: 'class', suitability: 'chapter' },
  { videoId: '8_o3fuF_UFI', title: 'HSC 2024 রসায়ন অনুশীলনী MCQ প্রশ্নব্যাংক · UDVASH', seconds: 519, checkedOn: null, chapterId: 'chemistry-1-3', stage: 'mcqClass', suitability: 'not-chapter',
    reasonBn: 'এটি প্রশ্নব্যাংকের প্রচার/নমুনা ভিডিও, এই অধ্যায়ের পূর্ণ MCQ ক্লাস নয়। আলাদা ক্লাস বাছো।', reasonEn: 'This is a question-bank promotion/sample, not a full MCQ class for this chapter. Choose a different class.' },
  { videoId: 'uBprd6BVHLs', title: 'HSC 2025 Chemistry 1st Paper · Udvash Free Class', seconds: 8656, checkedOn: null, chapterId: 'chemistry-1-3', stage: 'mcqClass', suitability: 'not-this-chapter',
    reasonBn: 'এই ফ্রি ক্লাসে pH/বাফার দ্রবণ আলোচনা আছে; রাসায়নিক বন্ধন অধ্যায়ের পূর্ণ MCQ ক্লাস হিসেবে যাচাই হয়নি।', reasonEn: 'The free class discusses pH/buffers; it is not verified as a full MCQ class for chemical bonding.' },
  { videoId: 'ALtCbY2H5ds', title: 'HSC 2026 রসায়ন ১ম পত্র CQ · Likhon Vaiya', seconds: 6902, checkedOn: null, chapterId: 'chemistry-1-3', stage: 'cqClass', suitability: 'not-this-chapter',
    reasonBn: 'বর্ণনা/শুরুর আলোচনা অনুযায়ী এই পর্বে অধ্যায় ১/৪/৫; রাসায়নিক বন্ধনের CQ পরের পর্বে বলা হয়েছে। এই অধ্যায়ের ক্লাস নয়।', reasonEn: 'The description/introduction places chapters 1/4/5 in this part and chemical bonding in another part. Do not use this as this chapter’s CQ class.' },
  { videoId: 'FWFFNj8N0_Y', title: 'মৌলের পর্যাবৃত্ত ধর্ম ও রাসায়নিক বন্ধন · পর্ব ২ · MH Care', seconds: 3511, checkedOn: null, chapterId: 'chemistry-1-3', stage: 'cqClass', suitability: 'partial-not-cq',
    reasonBn: 'শুধু পর্ব ২; এটি সম্পূর্ণ অধ্যায়ের CQ সলভিং ক্লাস হিসেবে যাচাই হয়নি। প্রয়োজনীয় বাকি ক্লাস নিজে বাছো।', reasonEn: 'Only part two; not verified as a complete chapter CQ-solving class. Select the relevant lessons explicitly.' },
];
export const referenceUrl = (reference: ClassDurationReference): string => `https://www.youtube.com/watch?v=${reference.videoId}`;
export const referenceDuration = (reference: ClassDurationReference): string => {
  const hours = Math.floor(reference.seconds / 3600), minutes = Math.floor(reference.seconds % 3600 / 60), seconds = reference.seconds % 60;
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
/** Exact URL/video AND intended chapter/stage: never a playlist aggregate. */
export function classDurationReference(videoId: string | null, chapterId: string, stage: string) {
  return CLASS_DURATION_REFERENCES.find(reference => reference.videoId === videoId && reference.chapterId === chapterId && reference.stage === stage);
}
