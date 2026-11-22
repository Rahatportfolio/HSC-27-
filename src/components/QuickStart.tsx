import { useMemo, useRef, useState } from 'react';
import { Check, Plus, Sparkles, X } from 'lucide-react';
import { usePlanner } from '../context';
import { applyPersonalRoutine, newPersonalRoutine, DEFAULT_CHAPTER_MINUTES } from '../personalRoutine';
import type { PersonalRoutine } from '../personalRoutine';
import ChapterSelection from './ChapterSelection';
import { bn, formatDate, formatDurationBn, toMinutes, toTimeInput } from '../planner';
import { saveData } from '../storage';
import { isEnglish, t, weekdayName } from '../i18n';
import { isNativeApp, requestNativeNotifications } from '../native';
import PersonalRoutineSetup from './PersonalRoutineSetup';

interface Slot {
  id: string;
  /** Bengali label, e.g. "রাত ৮:০০–১০:০০" */
  label: string;
  labelEn: string;
  start: number;
  end: number;
}

const PRESET_SLOTS: Slot[] = [
  { id: 'dawn', label: 'সকাল ৬:০০–৭:৩০', labelEn: '6:00–7:30 AM', start: 6 * 60, end: 7 * 60 + 30 },
  { id: 'afternoon', label: 'বিকেল ৪:৩০–৬:০০', labelEn: '4:30–6:00 PM', start: 16 * 60 + 30, end: 18 * 60 },
  { id: 'evening', label: 'সন্ধ্যা ৭:০০–৮:৩০', labelEn: '7:00–8:30 PM', start: 19 * 60, end: 20 * 60 + 30 },
  { id: 'night', label: 'রাত ৮:০০–১০:০০', labelEn: '8:00–10:00 PM', start: 20 * 60, end: 22 * 60 },
  { id: 'late', label: 'রাত ৯:৩০–১১:৩০', labelEn: '9:30–11:30 PM', start: 21 * 60 + 30, end: 23 * 60 + 30 },
];

/** Every quick-start time template keeps the same shape so presets and custom slots mix freely. */
const HOUR_CHOICES = [2, 3, 4, 5, 6, 8];
/** Bangladesh school week: Saturday–Thursday, Friday off. */
const SCHOOL_WEEK = [6, 0, 1, 2, 3, 4];
const ALL_DAYS = [6, 0, 1, 2, 3, 4, 5];
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // শনি → শুক্র, the order a Bangladeshi student reads

function slotConflict(slots: Slot[]): boolean {
  const sorted = [...slots].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) return true;
  }
  return false;
}

export default function QuickStart() {
  const { data, plan, today, setData, setSelectedDate, navigate, notify } = usePlanner();
  const [days, setDays] = useState<number[]>(SCHOOL_WEEK);
  const [selected, setSelected] = useState<Slot[]>([PRESET_SLOTS[3]]); // রাত ৮:০০–১০:০০
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [hours, setHours] = useState(4);
  const [advanced, setAdvanced] = useState(false);
  const [chapterDraft, setChapterDraft] = useState<PersonalRoutine>(() => ({ ...newPersonalRoutine('SELECTED'), categories: {} }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(data); latest.current = data;
  const currentPlan = useRef(plan); currentPlan.current = plan;

  const conflict = useMemo(() => slotConflict(selected), [selected]);
  const canCommit = days.length > 0 && selected.length > 0 && hours >= 1 && hours <= 18 && !conflict && !busy && chapterDraft.chapterIds.length > 0;

  const toggleDay = (day: number) => setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day]);
  const toggleSlot = (slot: Slot) => setSelected(current => current.some(item => item.id === slot.id) ? current.filter(item => item.id !== slot.id) : [...current, slot]);
  const addCustomSlot = () => {
    if (!customStart || !customEnd) return;
    const start = toMinutes(customStart); const end = toMinutes(customEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 15) {
      setError(t('নিজের সময়টা অন্তত ১৫ মিনিটের রাখো (শুরুর পরে শেষের সময়)।', 'Keep your own slot at least 15 minutes long (end after start).'));
      return;
    }
    const id = `custom-${Date.now()}`;
    setSelected(current => [...current, { id, label: `${toTimeInput(start)}–${toTimeInput(end)}`, labelEn: `${toTimeInput(start)}–${toTimeInput(end)}`, start, end }]);
    setCustomStart(''); setCustomEnd(''); setError('');
  };

  const commit = async () => {
    if (!canCommit) return;
    setBusy(true); setError('');
    try {
      const windows = days.flatMap(weekday => selected.map(slot => ({ weekday, startMinute: slot.start, endMinute: slot.end })));
      const routine = {
        ...chapterDraft,
        windows,
        exclusions: [],
        dailyLimitMinutes: Math.round(hours * 60),
        updatedAt: new Date().toISOString(),
      };
      const applied = applyPersonalRoutine(latest.current, routine, { plan: currentPlan.current, asOf: today });
      // Turn on reminders so today's and tomorrow's classes arrive without any extra setup.
      const nextData = { ...applied, settings: { ...applied.settings, reminderEnabled: true } };
      if (!saveData(nextData, true)) throw new Error(t('সেভ হয়নি—আগের তথ্য অক্ষত আছে। ফোনের স্টোরেজ যাচাই করো।', 'Not saved—your existing data is unchanged. Check the phone storage.'));
      setData(nextData);
      setSelectedDate(today >= nextData.settings.startDate && today < nextData.settings.examDate ? today : nextData.settings.startDate);
      // Ask for notification permission at the natural moment on both shells.
      if (isNativeApp()) { try { await requestNativeNotifications(); } catch { /* the Reminders page can ask again later */ } }
      else if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* same */ } }
      navigate('today');
      notify(t('শুধু বাছাই করা অধ্যায়ের রুটিন তৈরি হয়েছে।', 'Your selected-chapter routine is ready.'), 'success');
    } catch (err) {
      setError((err as Error).message);
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (advanced) {
    return <div className="quick-start-advanced-wrap">
      <button type="button" className="text-button quick-start-back" onClick={() => setAdvanced(false)}>← {t('সহজ শুরুতে ফিরে যাও', 'Back to quick start')}</button>
      <PersonalRoutineSetup initialRoutine={chapterDraft} />
    </div>;
  }

  return <section className="card quick-start view" aria-label={t('সহজ শুরু — শুধু সময় দাও', 'Quick start — just tell us when you can study')}>
    <span className="eyebrow">QUICK START · {t('সময় ও অধ্যায় বাছো', 'CHOOSE TIME AND CHAPTERS')}</span>
    <h1 className="quick-start-title">{t('অ্যাপ খুলে পড়া শুরু করো — ফর্ম পূরণ নয়', 'Open the app and just start studying — no form to fill')}</h1>
    <p className="quick-start-lead">{t('কখন পড়বে আর কোন অধ্যায় পড়বে বেছে নাও। শুধু নির্বাচিত অধ্যায় S → A → B ক্রমে সাজানো হবে।', 'Choose your study times and chapters. Only selected chapters are scheduled in S → A → B order.')}</p>

    <fieldset className="qs-group">
      <legend><span className="qs-step">১</span>{t('কোন দিনগুলোতে পড়বে?', 'Which days can you study?')}</legend>
      <div className="qs-days" role="group" aria-label={t('পড়ার দিন বাছো', 'Choose study days')}>
        {DAY_ORDER.map(day => {
          const active = days.includes(day);
          return <button key={day} type="button" className={`qs-day ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => toggleDay(day)}>{weekdayName(day, true)}</button>;
        })}
      </div>
      <div className="qs-quick-actions">
        <button type="button" className="text-button" onClick={() => setDays(SCHOOL_WEEK)}>{t('শনি–বৃহস্পতি (শুক্রবার বন্ধ)', 'Sat–Thu (Friday off)')}</button>
        <button type="button" className="text-button" onClick={() => setDays(ALL_DAYS)}>{t('প্রতিদিন', 'Every day')}</button>
      </div>
    </fieldset>

    <fieldset className="qs-group">
      <legend><span className="qs-step">২</span>{t('কোন সময়গুলো তোমার?', 'Which time slots are yours?')}</legend>
      <div className="qs-slots" role="group" aria-label={t('সময়ের প্রিসেট বাছো', 'Pick time presets')}>
        {PRESET_SLOTS.map(slot => {
          const active = selected.some(item => item.id === slot.id);
          return <button key={slot.id} type="button" className={`qs-slot ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => toggleSlot(slot)}>{active && <Check size={13} />}{isEnglish() ? slot.labelEn : slot.label}</button>;
        })}
      </div>
      <div className="qs-custom-row">
        <label className="qs-custom-time">{t('শুরুর সময়', 'From')}<input type="time" aria-label={t('নিজের সময়ের শুরুর মুহূর্ত', 'Custom slot start time')} value={customStart} onChange={e => setCustomStart(e.target.value)} /></label>
        <label className="qs-custom-time">{t('শেষের সময়', 'To')}<input type="time" aria-label={t('নিজের সময়ের শেষ মুহূর্ত', 'Custom slot end time')} value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></label>
        <button type="button" className="button secondary small" onClick={addCustomSlot} disabled={!customStart || !customEnd}><Plus size={15} />{t('নিজের সময় যোগ করো', 'Add my time')}</button>
      </div>
      {selected.length > 0 && <div className="qs-selected" aria-live="polite">
        {selected.map(slot => <span className="qs-chip" key={slot.id}>{slot.label}<button type="button" aria-label={t('এই সময়টা বাদ দাও', 'Remove this slot')} onClick={() => setSelected(current => current.filter(item => item.id !== slot.id))}><X size={13} /></button></span>)}
        {conflict && <p className="personal-warning" role="alert">{t('দুইটি সময় একটার ওপর আরেকটা পড়ে গেছে। একটি বাদ দাও।', 'Two slots overlap. Remove one of them.')}</p>}
      </div>}
    </fieldset>

    <fieldset className="qs-group">
      <legend><span className="qs-step">৩</span>{t('দিনে মোট কত ঘণ্টা পড়বে?', 'How many study hours per day, net?')}</legend>
      <div className="qs-hours" role="group" aria-label={t('দৈনিক ঘণ্টার সংখ্যা বাছো', 'Choose daily hours')}>
        {HOUR_CHOICES.map(value => <button key={value} type="button" className={`qs-hour ${hours === value ? 'active' : ''}`} aria-pressed={hours === value} onClick={() => setHours(value)}>{bn(value)} {t('ঘণ্টা', 'hrs')}</button>)}
      </div>
      <p className="tiny-muted">{t('বিরতি ও ক্লাস ছাড়া শুধু নেট ঘণ্টার হিসাব। যেকোনো সময় বদলানো যায়।', 'Net hours only, excluding breaks. You can change this any time.')}</p>
    </fieldset>

    <ChapterSelection routine={chapterDraft} onChange={setChapterDraft} />
    {!chapterDraft.chapterIds.length && <p className="personal-warning">{t('রুটিন বানাতে অন্তত একটি অধ্যায় বেছে নাও।', 'Choose at least one chapter to create the routine.')}</p>}
    <button type="button" className="button primary quick-start-cta" disabled={!canCommit} onClick={() => void commit()}>
      <Sparkles size={20} />{busy ? t('রুটিন বানানো হচ্ছে…', 'Building your routine…') : t('এই সময় দিয়েই রুটিন বানাও — বাকিটা অ্যাপ করবে', 'Build my routine from this — the app does the rest')}
    </button>
    {error && <p className="personal-warning" role="alert">{error}</p>}
    <p className="quick-start-note"><strong>{t('অ্যাপ যা নিজেই করবে:', 'What the app does by itself:')}</strong> {t('শুধু বাছাই করা অধ্যায় থাকবে। প্রতিটিতে তিন সেশন—ক্লাস, নিজের নোট, সলভিং ও অনুশীলন। প্রতি অধ্যায়ে ≈২০ ঘণ্টা অনুমান; সময় ও শেষের তারিখ তোমার ফাঁকা সময়ের ওপর নির্ভর করবে.', 'includes only selected chapters in three sessions: class, own notes, and solving plus practice. Each chapter has ≈20 estimated hours; actual allocation and finish depend on your availability.')} {formatDurationBn(DEFAULT_CHAPTER_MINUTES)} {t('প্রতি অধ্যায়', 'per chapter')} · {bn(chapterDraft.chapterIds.length)} {t('টি অধ্যায়', 'chapters')} · {t('শুরু', 'Starts')} {formatDate(data.settings.startDate, 'long')} · {t('পরে Settings থেকে যেকোনো সময় বদলাতে পারবে।', 'change any of this later in Settings.')}</p>
    <div className="quick-start-footer">
      <button type="button" className="text-button" onClick={() => setAdvanced(true)}>{t('সব আমি নিজে সাজিয়ে নিতে চাই →', 'I want to configure everything myself →')}</button>
    </div>
  </section>;
}
