/** Optional screens are loaded only when visited. Home, onboarding, recovery
 * backup and the shell stay synchronous. The service worker precaches every
 * built route for first-use offline navigation; it never caches student data.
 */
import { Component, lazy } from 'react';
import type { ComponentType, ErrorInfo, ReactNode } from 'react';
import type { View } from './context';
import { t } from './i18n';
import TodayView from './views/Today';

const loaders = {
  calendar: () => import('./views/Calendar'),
  syllabus: () => import('./views/Syllabus'),
  settings: () => import('./views/Settings'),
  brain: () => import('./views/StudyBrain'),
  studySystem: () => import('./views/StudySystem'),
  videos: () => import('./views/Videos'),
  pdfs: () => import('./views/Pdfs'),
  testprep: () => import('./views/TestPrep'),
  revision: () => import('./views/Revision'),
  timer: () => import('./views/Timer'),
  practice: () => import('./views/Practice'),
  examsim: () => import('./views/ExamSim'),
  weakness: () => import('./views/Weakness'),
  heatmap: () => import('./views/Heatmap'),
  backlog: () => import('./views/Backlog'),
  audit: () => import('./views/Audit'),
  exams: () => import('./views/Exams'),
  analytics: () => import('./views/Analytics'),
  library: () => import('./views/Library'),
  reminders: () => import('./views/Reminders'),
  flashcards: () => import('./views/Flashcards'),
  storage: () => import('./views/Storage'),
  scanner: () => import('./views/NotesScanner'),
} satisfies Partial<Record<View, () => Promise<{ default: ComponentType }>>>;
type OptionalView = keyof typeof loaders;
const pending = new Map<OptionalView, Promise<{ default: ComponentType }>>();
function load(view: OptionalView) {
  let promise = pending.get(view);
  if (!promise) { promise = loaders[view](); pending.set(view, promise); }
  return promise;
}
/** May be called for an explicitly focused/pointed-at navigation item, never
 * an idle preload of every feature or a silent navigation/storage mutation. */
export function preloadView(view: View): void {
  if (Object.hasOwn(loaders, view)) void load(view as OptionalView).catch(() => { /* Error UI owns an actual failed navigation. */ });
}
const lazyView = (view: OptionalView) => lazy(() => load(view));
export const routeViews: Record<View, ComponentType> = {
  today: TodayView, calendar: lazyView('calendar'), syllabus: lazyView('syllabus'), settings: lazyView('settings'),
  brain: lazyView('brain'), studySystem: lazyView('studySystem'), videos: lazyView('videos'), pdfs: lazyView('pdfs'),
  testprep: lazyView('testprep'), revision: lazyView('revision'), timer: lazyView('timer'), practice: lazyView('practice'),
  examsim: lazyView('examsim'), weakness: lazyView('weakness'), heatmap: lazyView('heatmap'), backlog: lazyView('backlog'),
  audit: lazyView('audit'), exams: lazyView('exams'), analytics: lazyView('analytics'), library: lazyView('library'),
  reminders: lazyView('reminders'), flashcards: lazyView('flashcards'), storage: lazyView('storage'), scanner: lazyView('scanner'),
};
export function RouteLoading({ title }: { title: string }) {
  return <section className="card route-loading" role="status" aria-busy="true" aria-live="polite"><h1>{title}</h1><p>{t('পাতাটি খুলছি… তোমার রুটিন ও তথ্য অপরিবর্তিত আছে।', 'Opening this page… your routine and data are unchanged.')}</p></section>;
}
interface BoundaryProps { children: ReactNode; onHome: () => void; onSettings: () => void; onBackup: () => void }
/** A stale/missing optional asset must not blank the app or reset the profile. */
export class RouteBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* No student data/error payload is uploaded or persisted. */ }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="view card route-error" role="alert"><h1>{t('পাতাটি লোড করা যায়নি', 'This page could not load')}</h1><p>{t('অ্যাপের একটি ফাইল পাওয়া যায়নি বা খুলতে সমস্যা হয়েছে। তোমার সেভ করা তথ্য মুছে যায়নি। আবার খোলো, অথবা Settings থেকে ব্যাকআপ রাখো।', 'An app file could not be opened. Your saved data has not been erased. Reopen the app, or keep a backup from Settings.')}</p><div className="form-actions"><button type="button" className="button secondary" onClick={this.props.onHome}>{t('হোমে ফিরে যাও', 'Back to home')}</button><button type="button" className="button secondary" onClick={this.props.onSettings}>{t('সেটিংস ও ব্যাকআপ', 'Settings & backup')}</button><button type="button" className="button secondary" onClick={this.props.onBackup}>{t('JSON ব্যাকআপ রাখো', 'Keep a JSON backup')}</button><button type="button" className="button primary" onClick={() => window.location.reload()}>{t('আবার খোলো', 'Reopen app')}</button></div><p>{t('JSON-এ রুটিন, নোট ও অগ্রগতি থাকবে; স্ক্যান/ভিডিওর আসল bytes থাকে না। মূল অ্যাপ বা ডেটা মুছো না।', 'JSON retains routine, notes and progress, not original scan/video bytes. Do not uninstall or clear app data.')}</p></section>;
  }
}
