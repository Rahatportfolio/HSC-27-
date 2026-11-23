import { useMemo, useRef, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { usePlanner } from '../context';
import { applyPersonalRoutine, newPersonalRoutine, personalScheduleDateError } from '../personalRoutine';
import type { PersonalRoutine } from '../personalRoutine';
import ChapterSelection from './ChapterSelection';
import { toMinutes, toTimeInput } from '../planner';
import { saveData } from '../storage';
import { t, weekdayName } from '../i18n';
import { applyScheduleSettings } from '../reschedule';
import PersonalRoutineSetup from './PersonalRoutineSetup';

interface Slot {
  id: string;
  /** Bengali label, e.g. "রাত ৮:০০–১০:০০" */
  label: string;
  labelEn: string;
  start: number;
  end: number;
}

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
  const [days, setDays] = useState<number[]>([]);
  const [selected, setSelected] = useState<Slot[]>([]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [hours, setHours] = useState('');
  const [session, setSession] = useState('');
  const [breakLength, setBreakLength] = useState('');
  const [startDate, setStartDate] = useState('');
  const [testDate, setTestDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reminders, setReminders] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [chapterDraft, setChapterDraft] = useState<PersonalRoutine>(() => ({ ...newPersonalRoutine('SELECTED'), categories: {}, manualWorkloads: true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(data); latest.current = data;
  const currentPlan = useRef(plan); currentPlan.current = plan;

  const conflict = useMemo(() => slotConflict(selected), [selected]);
  const dates = { ...data.settings, startDate, testExamDate: testDate, examDate: endDate };
  const canCommit = days.length > 0 && selected.length > 0 && hours !== '' && Math.round(Number(hours) * 60) >= 1 && Number(hours) <= 24
    && session !== '' && Number.isInteger(Number(session)) && Number(session) >= 15 && Number(session) <= 120
    && breakLength !== '' && Number.isInteger(Number(breakLength)) && Number(breakLength) >= 0 && Number(breakLength) <= 60
    && !personalScheduleDateError(dates) && !conflict && !busy && chapterDraft.chapterIds.length > 0;

  const toggleDay = (day: number) => setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day]);
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
        dailyLimitMinutes: Math.round(Number(hours) * 60),
        sessionMinutes: Number(session), breakMinutes: Number(breakLength),
        updatedAt: new Date().toISOString(),
      };
      const withDates = applyScheduleSettings(latest.current, { ...latest.current.settings, startDate, testExamDate: testDate, examDate: endDate });
      const applied = applyPersonalRoutine(withDates, routine, { plan: currentPlan.current, asOf: today });
      const nextData = { ...applied, settings: { ...applied.settings, reminderEnabled: reminders } };
      if (!saveData(nextData, true)) throw new Error(t('সেভ হয়নি—আগের তথ্য অক্ষত আছে। ফোনের স্টোরেজ যাচাই করো।', 'Not saved—your existing data is unchanged. Check the phone storage.'));
      setData(nextData);
      setSelectedDate(today >= nextData.settings.startDate && today < nextData.settings.examDate ? today : nextData.settings.startDate);
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
    <h1 className="quick-start-title">{t('নিজের মতো পড়ার সময় ঠিক করো', 'Set up study time your way')}</h1>
    <p className="quick-start-lead">{t('কখন পড়বে আর কোন অধ্যায় পড়বে বেছে নাও। শুধু নির্বাচিত অধ্যায় S → A → B ক্রমে সাজানো হবে।', 'Choose your study times and chapters. Only selected chapters are scheduled in S → A → B order.')}</p>

    <section className="qs-import" aria-label={t('ওয়েবসাইটের ব্যাকআপ আনো', 'Bring your website backup')}>
      <h2>{t('ওয়েবসাইটে আগের তথ্য আছে?', 'Already have data on the website?')}</h2>
      <p>{t('ওয়েবসাইট ও অ্যাপ আলাদা। ওয়েবসাইটের Settings থেকে Full backup export করে ফোনে রাখো, তারপর এখানে ইমপোর্ট করো। তথ্য নিজে থেকে সিঙ্ক হয় না।', 'The website and app store data separately. Export a full backup from website Settings to your phone, then import it here. They do not sync automatically.')}</p>
      <p>{t('ইমপোর্টের আগে ব্যাকআপ যাচাই ও তোমার নিশ্চিতি লাগবে। অ্যাপে নতুন তথ্য থাকলে তারও ব্যাকআপ রাখো।', 'The backup is checked and requires your confirmation. Back up any existing app data first.')}</p>
      <button type="button" className="button secondary" onClick={() => navigate('settings')}>{t('ওয়েবসাইটের ব্যাকআপ ইমপোর্ট করো', 'Import website backup')}</button>
    </section>

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
      <label className="form-label">{t('তোমার ঘণ্টা', 'Your hours')}<input type="number" min="0.02" max="24" step="any" value={hours} onChange={event => setHours(event.target.value)} /></label>
      <label className="form-label">{t('একটানা সেশন (মিনিট)', 'Maximum continuous session (minutes)')}<input type="number" min="15" max="120" value={session} onChange={event => setSession(event.target.value)} /></label>
      <label className="form-label">{t('সেশনের মাঝে বিরতি (মিনিট)', 'Break between sessions (minutes)')}<input type="number" min="0" max="60" value={breakLength} onChange={event => setBreakLength(event.target.value)} /></label>
      <p className="tiny-muted">{t('নিজে ঠিক করো; বিরতি না চাইলে ০ দাও।', 'Enter your own values; enter 0 if you do not want a break.')}</p>
    </fieldset>

    <fieldset className="qs-group"><legend>{t('নিজের পরিকল্পনার তারিখ', 'Your planning dates')}</legend>
      <label>{t('পরিকল্পনার শুরুর তারিখ', 'Plan start date')}<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>{t('ব্যক্তিগত টেস্ট লক্ষ্য', 'Personal test target')}<input type="date" value={testDate} onChange={event => setTestDate(event.target.value)} /></label>
      <label>{t('ব্যক্তিগত শেষ লক্ষ্য', 'Personal end target')}<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <p>{t('এগুলো তোমার লক্ষ্য, সরকারি পরীক্ষার তারিখ নয়।', 'These are your goals, not official exam dates.')}</p>
    </fieldset>
    <label className="check-line"><input type="checkbox" checked={reminders} onChange={event => setReminders(event.target.checked)} />{t('রিমাইন্ডার চাই (প্রয়োজনে পরে অনুমতি দিতে হবে)', 'Enable reminders (permission may be needed later)')}</label>
    <ChapterSelection routine={chapterDraft} onChange={setChapterDraft} />
    {!chapterDraft.chapterIds.length && <p className="personal-warning">{t('রুটিন বানাতে অন্তত একটি অধ্যায় বেছে নাও।', 'Choose at least one chapter to create the routine.')}</p>}
    <button type="button" className="button primary quick-start-cta" disabled={!canCommit} onClick={() => void commit()}>
      <Sparkles size={20} />{busy ? t('রুটিন বানানো হচ্ছে…', 'Building your routine…') : t('আমার বাছাই সেভ করো', 'Save my choices')}
    </button>
    {error && <p className="personal-warning" role="alert">{error}</p>}
    <p className="quick-start-note">{t('নিজের সময় ও অধ্যায় সেভ হবে। অধ্যায়ের ক্লাস, নোট ও অনুশীলনের সময় Settings-এ নিজে না দেওয়া পর্যন্ত কাজ বসবে না; কোনো সময় আন্দাজ করা হবে না।', 'Your availability and chapters are saved. No work is scheduled until you enter class, notes and practice durations in Settings; no duration is guessed.')}</p>
    <div className="quick-start-footer">
      <button type="button" className="text-button" onClick={() => setAdvanced(true)}>{t('সব আমি নিজে সাজিয়ে নিতে চাই →', 'I want to configure everything myself →')}</button>
    </div>
  </section>;
}
