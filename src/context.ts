import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppData, Day } from './planner';
import type { Chapter, SubjectId } from './data';
import type { PresetTimerInput, useStudyTimer } from './hooks';
import type { NewSession } from './study';
import type { FontScale, ThemeMode } from './types';

export type View = 'studySystem' | 'today' | 'calendar' | 'syllabus' | 'videos' | 'pdfs' | 'testprep' | 'revision' | 'timer' | 'practice' | 'examsim' | 'weakness' | 'heatmap' | 'backlog' | 'exams' | 'analytics' | 'library' | 'reminders' | 'settings' | 'flashcards' | 'storage' | 'scanner';
export interface ConfirmRequest { title: string; message: string; label?: string; danger?: boolean; action: () => void }
export interface PlannerContextValue {
  data: AppData; setData: Dispatch<SetStateAction<AppData>>; plan: Day[]; today: string; now: Date;
  view: View; navigate: (view: View, date?: string) => void;
  selectedDate: string; setSelectedDate: (date: string) => void;
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
  toggleTask: (id: string) => void;
  openChapter: (chapter: Chapter) => void;
  openExam: (paperId: string) => void;
  openMistake: (subject?: string, text?: string) => void;
  confirm: (request: ConfirmRequest) => void;
  exportICS: (range: 'day' | 'week' | 'all', date?: string) => void;
  storageOk: boolean;
  timer: ReturnType<typeof useStudyTimer>;
  logSession: (session: NewSession) => void;
  startTimer: (subject: SubjectId, chapterId?: string) => void;
  startPresetTimer?: (preset: PresetTimerInput) => void;
  sendStudyStatusNotification?: (date?: string) => Promise<boolean>;
  setTheme: (theme: ThemeMode) => void;
  setFontScale: (scale: FontScale) => void;
  /** True while the screen wake lock is held for a running session. */
  screenAwake: boolean;
  /** True while Android foreground timer service is active. */
  serviceRunning?: boolean;
}
export const PlannerContext = createContext<PlannerContextValue | null>(null);
/** Same context, but null when a component is rendered outside the app shell (e.g. unit tests). */
export function useOptionalPlanner(): PlannerContextValue | null { return useContext(PlannerContext); }
export function usePlanner(): PlannerContextValue { const ctx = useContext(PlannerContext); if (!ctx) throw new Error('PlannerProvider missing'); return ctx; }
