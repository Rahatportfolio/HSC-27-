import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppData, Day } from './planner';
import type { Chapter } from './data';
import type { useFocusTimer } from './hooks';
export type View = 'today' | 'calendar' | 'syllabus' | 'exams' | 'progress' | 'reminders' | 'settings';
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
  timer: ReturnType<typeof useFocusTimer>;
}
export const PlannerContext = createContext<PlannerContextValue | null>(null);
export function usePlanner(): PlannerContextValue { const ctx = useContext(PlannerContext); if (!ctx) throw new Error('PlannerProvider missing'); return ctx; }
