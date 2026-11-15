import { SOURCES, SUBJECTS, chapterById } from './data';
import type { SubjectId } from './data';
import type { AppData } from './planner';
import type { PdfMaterialType } from './types';

/**
 * PDF & study-material catalog.
 *
 * Honesty rules:
 *  - The app never fabricates PDF URLs. A material slot without a verified source is
 *    reported as "not added yet" — never as a fake download button.
 *  - Slots that already work inside the app (notes, formulas, board questions, the
 *    427-question bank) point at the built-in feature instead of an external file.
 *  - Students can attach their own verified PDF link (or a device file) to any slot;
 *    the structured slot list makes future updates a data change, not a code change.
 */

export const PDF_MATERIALS: { id: PdfMaterialType; bn: string; en: string }[] = [
  { id: 'notes', bn: 'অধ্যায় নোট', en: 'Chapter notes' },
  { id: 'lectureSheet', bn: 'লেকচার শিট', en: 'Lecture sheet' },
  { id: 'cqSolutions', bn: 'CQ সমাধান', en: 'CQ solutions' },
  { id: 'mcqSolutions', bn: 'MCQ সমাধান', en: 'MCQ solutions' },
  { id: 'boardQuestions', bn: 'বোর্ড প্রশ্ন সংগ্রহ', en: 'Board question collection' },
  { id: 'formulaSheet', bn: 'সূত্রপত্র', en: 'Formula sheet' },
  { id: 'suggestions', bn: 'সংক্ষিপ্ত সাজেশন', en: 'Short suggestions' },
  { id: 'revisionSheet', bn: 'রিভিশন শিট', en: 'Revision sheet' },
  { id: 'practical', bn: 'প্র্যাকটিক্যাল উপকরণ', en: 'Practical material' },
  { id: 'other', bn: 'অন্যান্য', en: 'Other' },
];

export const PDF_MATERIAL_LABEL = (id: PdfMaterialType, en = false): string =>
  PDF_MATERIALS.find(item => item.id === id)?.[en ? 'en' : 'bn'] || id;

export const PDF_MATERIAL_IDS = new Set<string>(PDF_MATERIALS.map(item => item.id));

/** Subjects that carry study-material slots (all seven HSC 2027 science-group papers). */
export const PDF_SLOT_SUBJECTS: SubjectId[] = SUBJECTS.map(subject => subject.id);

export type SlotStatus = 'inApp' | 'notAdded' | 'linked';

export interface MaterialSlot {
  key: string;
  subject: SubjectId;
  material: PdfMaterialType;
  /**
   * `inApp`   — the material already lives inside the app (notes/formulas/questions).
   * `notAdded`— no verified PDF yet; shown honestly as unavailable.
   * `linked`  — the student attached their own verified PDF link.
   */
  status: SlotStatus;
  /** In-app destination for `inApp` slots. */
  inAppTarget?: 'library' | 'practice' | 'formula';
  /** Student-linked PDF ids for `linked` slots. */
  linkedPdfIds: string[];
}

/** Which material kinds already exist as working in-app features. */
const IN_APP: Partial<Record<PdfMaterialType, SlotStatus>> = {
  notes: 'inApp',
  cqSolutions: 'inApp',
  mcqSolutions: 'inApp',
  boardQuestions: 'inApp',
  formulaSheet: 'inApp',
};

const IN_APP_TARGET: Partial<Record<PdfMaterialType, MaterialSlot['inAppTarget']>> = {
  notes: 'library',
  cqSolutions: 'practice',
  mcqSolutions: 'practice',
  boardQuestions: 'library',
  formulaSheet: 'formula',
};

export function materialSlots(data: Pick<AppData, 'pdfs'>): MaterialSlot[] {
  const slots: MaterialSlot[] = [];
  for (const subject of PDF_SLOT_SUBJECTS) {
    for (const material of PDF_MATERIALS) {
      if (material.id === 'other') continue;
      const linked = data.pdfs
        .filter(pdf => pdf.subject === subject && pdf.material === material.id)
        .map(pdf => pdf.id);
      const inApp = IN_APP[material.id];
      slots.push({
        key: `${subject}:${material.id}`,
        subject,
        material: material.id,
        status: linked.length ? 'linked' : inApp === 'inApp' ? 'inApp' : 'notAdded',
        ...(inApp === 'inApp' ? { inAppTarget: IN_APP_TARGET[material.id] } : {}),
        linkedPdfIds: linked,
      });
    }
  }
  return slots;
}

/** Official NCTB pages already verified in `data.ts` — the only external PDF/textbook sources we link. */
export const OFFICIAL_SOURCES = SOURCES;

/** Format bytes for the storage/download UI (Bangla digits are applied by the caller via bn()). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : Math.round(value * 10) / 10} ${units[index]}`;
}

/** Total size of the student's stored PDFs (metadata-level; file bytes live in the device store). */
export function totalPdfBytes(data: Pick<AppData, 'pdfs'>): number {
  return data.pdfs.reduce((sum, pdf) => sum + (pdf.sizeBytes || 0), 0);
}

export interface DownloadState { status: 'idle' | 'downloading' | 'done' | 'error'; progress: number }

/** Chapter lookup helper for the "organise by subject & chapter" grouping. */
export function pdfChapterTitle(chapterId?: string): string | undefined {
  return chapterId ? chapterById[chapterId]?.title : undefined;
}
