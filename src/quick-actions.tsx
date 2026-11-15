import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Command, Moon, Play, RotateCcw, Search, Settings as SettingsIcon, Sun, Timer, Zap } from 'lucide-react';
import { Modal } from './components';
import { usePlanner } from './context';
import { t } from './i18n';
import { bn } from './planner';
import { revisionDueCount } from './revision';

/**
 * The always-there “get me somewhere” button. On phones it floats just above the
 * bottom tab bar; on desktop it sits in the bottom-right corner. `?` opens it too,
 * so a keyboard-only student never has to hunt through the sidebar.
 *
 * The sheet keeps its own history entry so the Android back gesture closes it, and
 * runs the chosen action only after that entry is popped — otherwise closing the
 * sheet would undo the navigation it just started.
 */
export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const pushed = useRef(false);
  const sheetState = useRef<unknown>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  const show = useCallback(() => {
    setOpen(true);
    if (pushed.current) return;
    try { history.pushState({ quickActions: true }, ''); sheetState.current = history.state; pushed.current = true; }
    catch { pushed.current = false; }
  }, []);

  const dismiss = useCallback((after?: () => void) => {
    if (!pushed.current) { setOpen(false); after?.(); return; }
    pendingAction.current = after ?? null;
    history.back();
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      // A few WebViews emit a popstate from pushState() itself; the entry is still ours.
      if (sheetState.current !== null && history.state === sheetState.current) return;
      pushed.current = false;
      setOpen(false);
      const action = pendingAction.current; pendingAction.current = null;
      action?.();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      if (open) dismiss(); else show();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, open, show]);

  return <>
    <button className="quick-fab" onClick={show} aria-label={t('দ্রুত কাজ', 'Quick actions')} aria-haspopup="dialog" aria-expanded={open} title={t('দ্রুত কাজ (?)', 'Quick actions (?)')}>
      <Zap size={21} strokeWidth={1.9} aria-hidden="true" />
      <span>{t('দ্রুত কাজ', 'Quick actions')}</span>
    </button>
    {open && <QuickActionsSheet onDismiss={dismiss} />}
  </>;
}

function QuickActionsSheet({ onDismiss }: { onDismiss: (after?: () => void) => void }) {
  const { data, plan, today, timer, navigate, setTheme, openSearch } = usePlanner();
  const due = revisionDueCount(data, today);
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const todayTasks = plan.find(day => day.date === today)?.tasks || [];
  const todayDone = todayTasks.filter(task => data.completed[task.id]).length;
  const run = (action: () => void) => onDismiss(action);
  const timing = timer.running ? t('চলছে · বিরতি নাও', 'Running · take a pause') : `${bn(data.settings.pomodoroFocus)} ${t('মিনিট ফোকাস', 'min focus')}`;
  return <Modal title={t('দ্রুত কাজ', 'Quick actions')} onClose={() => onDismiss()}>
    <p className="quick-sheet-lead">{t('পড়ার মাঝপথে হাতের কাছে যা দরকার।', 'Everything you reach for mid-study, one tap away.')}</p>
    <div className="quick-sheet">
      <button className="quick-action primary" data-autofocus onClick={() => run(() => { if (!timer.running) timer.start(); navigate('timer'); })}>
        <span className="quick-action-icon"><Play size={18} fill="currentColor" /></span>
        <span className="quick-action-copy"><strong>{timer.running ? t('টাইমার দেখো', 'Show the timer') : t('ফোকাস শুরু', 'Start focus')}</strong><small>{timing}</small></span>
        <ArrowRight size={16} className="quick-action-arrow" />
      </button>
      <button className="quick-action" onClick={() => run(openSearch)}>
        <span className="quick-action-icon"><Search size={18} /></span>
        <span className="quick-action-copy"><strong>{t('সব কিছু খুঁজো', 'Search everything')}</strong><small>{t('অধ্যায়, নোট, রুটিন, সূত্র', 'Chapters, notes, routine, formulas')}</small></span>
        <kbd className="quick-kbd"><Command size={10} />K</kbd>
      </button>
      <button className="quick-action" onClick={() => run(() => navigate('today'))}>
        <span className="quick-action-icon"><Timer size={18} /></span>
        <span className="quick-action-copy"><strong>{t('আজকের রুটিন', 'Today’s routine')}</strong><small>{bn(todayDone)}/{bn(todayTasks.length)} {t('কাজ শেষ', 'tasks done')}</small></span>
        <ArrowRight size={16} className="quick-action-arrow" />
      </button>
      <button className="quick-action" onClick={() => run(() => navigate('revision'))}>
        <span className="quick-action-icon amber"><RotateCcw size={18} /></span>
        <span className="quick-action-copy"><strong>{t('স্মার্ট রিভিশন', 'Smart revision')}</strong><small>{due > 0 ? `${bn(due)} ${t('টি কার্ড দরকার', 'cards due')}` : t('আপাতত সব ঝালাই', 'all caught up')}</small></span>
        {due > 0 && <span className="quick-count">{bn(due)}</span>}
      </button>
      <button className="quick-action" onClick={() => run(() => setTheme(dark ? 'light' : 'dark'))}>
        <span className="quick-action-icon violet">{dark ? <Sun size={18} /> : <Moon size={18} />}</span>
        <span className="quick-action-copy"><strong>{dark ? t('উজ্জ্বল থিম', 'Light theme') : t('গাঢ় থিম', 'Dark theme')}</strong><small>{t('চোখের আরাম মতো', 'Whatever suits your eyes')}</small></span>
      </button>
      <button className="quick-action" onClick={() => run(() => navigate('settings'))}>
        <span className="quick-action-icon slate"><SettingsIcon size={18} /></span>
        <span className="quick-action-copy"><strong>{t('সেটিংস ও ব্যাকআপ', 'Settings & backup')}</strong><small>{t('ব্যাকআপ, ভাষা, সাইজ', 'Backup, language, size')}</small></span>
        <ArrowRight size={16} className="quick-action-arrow" />
      </button>
    </div>
    <p className="quick-sheet-foot">{t('টিপস: কীবোর্ডে ? চাপলেই এই শিট, Ctrl/⌘ + K চাপলে সরাসরি সার্চ।', 'Tip: press ? for this sheet, Ctrl/⌘ + K for search.')}</p>
  </Modal>;
}
