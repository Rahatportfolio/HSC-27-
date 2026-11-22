import { clearFiles } from '../files';
import { clearScanImages } from '../storage-manager';
import { SCANNED_NOTES_META_KEY } from '../scanner';
import FullBackup from '../components/FullBackup';
import { PersonalRoutineSettings } from '../components/PersonalRoutineSetup';
import { personalRoutineHealth } from '../personalRoutine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, CheckCircle2, Database, Download, ExternalLink, FileText, Info, Languages, Monitor, Moon, Palette, RotateCcw, Save, Share2, ShieldCheck, Sun, Timer, Play, ArrowUpRight, Type } from 'lucide-react';
import { usePlanner } from '../context';
import { SOURCES, syllabusNote, chapterById, subjectById } from '../data';
import { bn, DEFAULT_SETTINGS, EXAM_DATE_INFORMATION, formatDate, freshData, getPhases, isValidDate, shiftPlanStart, todayKey } from '../planner';
import { planHealth } from '../planHealth';
import { buildStudyPlan } from '../studyPlan';
import { applyScheduleSettings, scheduleChanged } from '../reschedule';
import { version } from '../../package.json';
import type { Settings } from '../planner';
import { downloadCsv, downloadText, makeMarkdown } from '../exports';
import { parseBackup, RECOVERY_KEY, sanitizeSettings, saveData } from '../storage';
import { clearDatabase } from '../db';
import { cancelTimerAlarm, stopStudyTimerService } from '../native';
import { CHANNELS } from '../classLinks';
import { backupAgeDays, backupLabel, downloadBackup, shareBackup } from '../backup';
import { PageHeading } from '../components';
import { t, weekdayName } from '../i18n';

const BOARDS = ['সিলেট', 'ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'কুমিল্লা', 'যশোর', 'বরিশাল', 'দিনাজপুর', 'ময়মনসিংহ', 'মাদ্রাসা', 'কারিগরি'];
export default function SettingsView() {
  const { data, setData, plan, today, notify, confirm, setSelectedDate, setTheme, setFontScale, timer } = usePlanner();
  const [draft, setDraft] = useState<Settings>(data.settings);
  const [dirty, setDirty] = useState(false);
  // A user can edit before a pending passive sync effect runs. Track that
  // synchronously, so the old settings cannot overwrite the new draft.
  const dirtyRef = useRef(false);
  const markDirty = (value: boolean) => { dirtyRef.current = value; setDirty(value); };
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(() => { try { return localStorage.getItem(RECOVERY_KEY); } catch { return null; } });
  const fileRef = useRef<HTMLInputElement>(null);
  const startAnchor = useRef(data.settings.startDate);
  const latestData = useRef(data);
  latestData.current = data;
  useEffect(() => {
    if (!dirty && !dirtyRef.current) {
      startAnchor.current = data.settings.startDate;
      setDraft(current => dirtyRef.current ? current : data.settings);
    }
  }, [data.settings, dirty]);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => { markDirty(true); setDraft(current => ({ ...current, [key]: value })); };
  const changeStart = (value: string) => {
    markDirty(true);
    if (!isValidDate(value)) { setDraft(current => ({ ...current, startDate: value })); return; }
    const previous = startAnchor.current;
    setDraft(current => shiftPlanStart({ ...current, startDate: previous }, value));
    startAnchor.current = value;
  };
  const preview = useMemo(() => {
    try {
      const settings = sanitizeSettings(draft);
      const next = applyScheduleSettings(data, settings);
      return { phases: next.personalRoutine || next.routineSetupRequired ? [] : getPhases(settings), health: next.routineSetupRequired ? null : next.personalRoutine ? personalRoutineHealth(next, buildStudyPlan(next, today)) : planHealth(buildStudyPlan(next, today), settings, next.completed), error: '' };
    } catch (err) { return { phases: [], health: null, error: (err as Error).message }; }
  }, [draft, data, today]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    let settings: Settings;
    try {
      settings = sanitizeSettings(draft);
      applyScheduleSettings(data, settings); // Validate the entire transaction before confirmation.
    } catch (err) { notify((err as Error).message, 'error'); return; }
    const changed = scheduleChanged(data.settings, settings);
    const apply = () => {
      try {
        setData(applyScheduleSettings(latestData.current, settings));
        markDirty(false);
        startAnchor.current = settings.startDate;
        if (changed) setSelectedDate(settings.startDate);
        notify(changed ? t('রুটিন ও ব্যক্তিগত সময়সূচি আপডেট হয়েছে। ক্যালেন্ডার আবার ইমপোর্ট করো।', 'Routine and personal schedule updated. Re-import your calendar.') : t('সেটিংস সেভ হয়েছে।', 'Settings saved.'));
      } catch (err) { notify((err as Error).message, 'error'); }
    };
    if (changed) confirm({
      title: t('রুটিনের তারিখ/সময় বদলাবে?', 'Update routine dates and times?'),
      message: t('সংযুক্ত ব্যক্তিগত লক্ষ্য ও দিনের কাস্টম সময়সূচি মিলিয়ে নেওয়া হবে। সম্পন্ন কাজের আসল সময়, দিনের নোট, নম্বর, রিভিশন কার্ড ও গুরুত্বপূর্ণ ক্যালেন্ডার তারিখ সরবে না। নতুন .ics ফাইল নাও; পুরোনো ইমপোর্ট নিজে থেকে বদলায় না।', 'Linked personal targets and day customisations will be updated. Actual completion times, daily notes, marks, recall cards and important calendar dates do not move. Export a new .ics file; an old import cannot update itself.') + (preview.health?.warnings.length ? `\n${preview.health.warnings.join(' ')}` : ''),
      label: t('রুটিন আপডেট করো', 'Update routine'), action: apply,
    }); else apply();
  };
  const exportRoutine = () => {
    if (!data.routineBlocks.length) { notify(t('কোনো কাস্টম রুটিন ব্লক নেই।', 'There is no custom routine block.'), 'info'); return; }
    const weekdays = [0, 1, 2, 3, 4, 5, 6].map(day => weekdayName(day));
    downloadCsv([['দিন', 'শুরু', 'মিনিট', 'বিষয়', 'নাম'], ...data.routineBlocks.map(block => [weekdays[block.weekday], `${String(Math.floor(block.startMinute / 60)).padStart(2, '0')}:${String(block.startMinute % 60).padStart(2, '0')}`, block.minutes, subjectById[block.subject].name, block.title])], `prostuti-routine-${todayKey()}.csv`);
    notify(t('কাস্টম রুটিনের CSV ডাউনলোড হয়েছে।', 'Custom routine CSV downloaded.'));
  };
  const exportImportantDates = () => {
    if (!data.importantDates.length) { notify(t('কোনো গুরুত্বপূর্ণ তারিখ নেই।', 'There is no important date.'), 'info'); return; }
    downloadCsv([['তারিখ', 'নাম', 'নোট', 'রিমাইন্ডার'], ...data.importantDates.slice().sort((a, b) => a.date.localeCompare(b.date)).map(item => [item.date, item.title, item.note, item.notify ? 'হ্যাঁ' : 'না'])], `prostuti-dates-${todayKey()}.csv`);
    notify(t('গুরুত্বপূর্ণ তারিখের CSV ডাউনলোড হয়েছে।', 'Important dates CSV downloaded.'));
  };
  const backup = () => { try { const name = downloadBackup(data); notify(t(`${name} ডাউনলোড শুরু হয়েছে। ফাইলটি নিরাপদ জায়গায় রাখো।`, `${name} download started. Keep the file somewhere safe.`)); } catch { notify(t('ব্যাকআপ ডাউনলোড করা যায়নি। আবার চেষ্টা করো; অ্যাপের ডেটা মুছো না।', 'Backup could not be downloaded. Try again; do not clear app data.'), 'error'); } };
  const share = async () => { try { const outcome = await shareBackup(data); if (outcome === 'cancelled') return; notify(outcome === 'shared' ? 'ব্যাকআপ শেয়ার শিটে পাঠানো হয়েছে।' : outcome === 'copied' ? 'ব্যাকআপ JSON ক্লিপবোর্ডে কপি হয়েছে।' : 'ব্যাকআপ ফাইল ডাউনলোড হয়েছে।'); } catch { notify(t('শেয়ার করা যায়নি। ব্যাকআপ রাখো বোতাম ব্যবহার করো।', 'Sharing failed. Use the “Keep backup” button.'), 'error'); } };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error('ব্যাকআপটি ৮ MB-এর কম হতে হবে।');
      const parsed = parseBackup(await file.text());
      delete parsed.activeExam; // Restoring replaces history, never resumes a different live exam.
      confirm({ title: 'ব্যাকআপ ফিরিয়ে আনবে?', message: 'বর্তমান অগ্রগতি, নোট, সেশন, MCQ, পরীক্ষা ও সেটিংস এই ব্যাকআপের তথ্য দিয়ে বদলে যাবে। চালু স্টাডি ও পরীক্ষার ঘড়ি রিসেট হবে। প্রয়োজন হলে আগে বর্তমান তথ্যের ব্যাকআপ রাখো।', label: 'ব্যাকআপ ইমপোর্ট করো', action: () => {
        if (!saveData(parsed, true)) {
          notify(t('ব্যাকআপ সেভ করা যায়নি। আগের তথ্য ও ঘড়ি অপরিবর্তিত আছে। স্টোরেজের অনুমতি ও খালি জায়গা যাচাই করো।', 'Backup could not be saved. Your existing data and clocks are unchanged. Check storage permission and free space.'), 'error');
          return;
        }
        timer.reset();
        try { localStorage.removeItem('hsc27-exam-clock-v1'); } catch { /* storage unavailable */ }
        markDirty(false); setDraft(parsed.settings); startAnchor.current = parsed.settings.startDate;
        setData(parsed); setSelectedDate(parsed.settings.startDate);
        notify(t('ব্যাকআপ ফিরিয়ে আনা হয়েছে।', 'Backup restored.'));
      } });
    } catch (err) { notify((err as Error).message, 'error'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const exportSessions = () => {
    if (!data.studySessions.length) { notify(t('এখনও কোনো টাইমার/ম্যানুয়াল সেশন নেই।', 'No timer or manual session yet.'), 'info'); return; }
    downloadCsv([['তারিখ', 'বিষয়', 'অধ্যায়', 'মিনিট', 'ধরন', 'লেবেল'], ...data.studySessions.map(session => [session.date, subjectById[session.subject].name, session.chapterId ? chapterById[session.chapterId]?.title || '' : '', session.minutes, session.mode, session.label || ''])], `prostuti-study-${todayKey()}.csv`);
    notify(t('স্টাডি সেশনের CSV ডাউনলোড হয়েছে।', 'Study sessions CSV downloaded.'), 'success');
  };
  const exportTests = () => {
    if (!data.tests.length) { notify(t('এখনও নিজের টেস্টের রেকর্ড নেই।', 'No test record of your own yet.'), 'info'); return; }
    downloadCsv([['তারিখ', 'ধরন', 'শিরোনাম', 'বিষয়', 'নম্বর', 'পূর্ণমান', 'মিনিট', 'নোট'], ...data.tests.map(test => [test.date, test.kind, test.title, test.subject ? subjectById[test.subject].name : '', test.score, test.total, test.durationMin, test.notes])], `prostuti-tests-${todayKey()}.csv`);
    notify(t('টেস্টের CSV ডাউনলোড হয়েছে।', 'Tests CSV downloaded.'), 'success');
  };
  const exportAttempts = () => {
    if (!data.attempts.length) { notify(t('এখনও কোনো MCQ উত্তর নেই।', 'No MCQ answer yet.'), 'info'); return; }
    downloadCsv([['তারিখ', 'প্রশ্ন ID', 'বিষয়', 'সঠিক?', 'বাছা উত্তর'], ...data.attempts.map(attempt => [attempt.date, attempt.questionId, subjectById[attempt.subject].name, attempt.correct ? 'হ্যাঁ' : 'না', attempt.chosen + 1])], `prostuti-mcq-${todayKey()}.csv`);
    notify(t('MCQ রেকর্ডের CSV ডাউনলোড হয়েছে।', 'MCQ records CSV downloaded.'), 'success');
  };
  return <div className="view settings-view"><FullBackup onRestored={settings => { markDirty(false); setDraft(settings); startAnchor.current = settings.startDate; }}/>
    <PageHeading eyebrow="MAKE IT YOURS" title="তোমার পড়া, তোমার ছন্দে।" titleEn="Your study, your rhythm." description="শুরুর তারিখ, লক্ষ্য, থিম, রিভিশন আর ডেটা—সব এক জায়গায়। সব পরিবর্তন এই ডিভাইসেই থাকে।" descriptionEn="Start date, targets, theme, revision and data — all local to this device." />
    <PersonalRoutineSettings />
    <form className="card settings-form" onSubmit={save}>
      <div className="card-heading"><h2>{t("পরিকল্পনা ও পরিচয়", "Plan & identity")}</h2><span className="local-badge"><ShieldCheck size={14} />{t("শুধু এই ডিভাইসে", "This device only")}</span></div>
      {draft.startDate !== DEFAULT_SETTINGS.startDate && <section className="routine-start-shortcut" aria-label={t('শুরুর তারিখের শর্টকাট', 'Start date shortcut')}>
        <p>{t('শুরুর তারিখ বদলাতে Reset করার দরকার নেই। এই বোতাম শুধু পূর্বরূপ বদলাবে; তারিখগুলো দেখে সেভ ও নিশ্চিত করো।', 'No reset is needed to change the start date. This only updates the preview; review the dates, then Save and confirm.')}</p>
        <button type="button" className="button secondary small" onClick={() => changeStart(DEFAULT_SETTINGS.startDate)}>{t(`${formatDate(DEFAULT_SETTINGS.startDate, 'long')} থেকে শুরু`, `Use ${formatDate(DEFAULT_SETTINGS.startDate, 'long')}`)}</button>
      </section>}
      <div className="form-grid">
        <label>{t("তোমার নাম", "Your name")}<span className="optional">{t("(ইচ্ছামতো)", "(custom)")}</span><input value={draft.name} maxLength={60} placeholder={t("কী নামে ডাকব?", "What should I call you?")} onChange={e => update('name', e.target.value)} /></label>
        <label>{t("শিক্ষা বোর্ড", "Education board")}<select value={draft.board} onChange={e => update('board', e.target.value)}>{!BOARDS.includes(draft.board) && <option value={draft.board}>{draft.board}</option>}{BOARDS.map(board => <option key={board}>{board}</option>)}</select></label>
        <label>{t("রুটিন শুরুর তারিখ", "Routine start date")}<input type="date" required min="2020-01-01" max="2040-12-31" value={draft.startDate} onChange={e => changeStart(e.target.value)} /><small>{t("শুরুর তারিখ বদলালে সংযুক্ত লক্ষ্য ও রুটিন মিলবে; নিচে সময়ের ঘাটতি যাচাই করো", "Linked targets and the routine follow this date; check capacity below")}</small></label>
        <label>{t('পরীক্ষার লক্ষ্য তারিখ সরানোর নিয়ম', 'Exam target date policy')}<select value={draft.examDatePolicy} onChange={e => update('examDatePolicy', e.target.value as Settings['examDatePolicy'])}><option value="shift">{t('ব্যক্তিগত লক্ষ্য শুরুর সঙ্গে সরবে', 'Move personal targets with the start')}</option><option value="fixed">{t('কলেজ/বোর্ডের তারিখ স্থির থাকবে', 'Keep college/board deadlines fixed')}</option></select><small>{t('নিশ্চিত পরীক্ষার তারিখ পেলে স্থির রাখো। রুটিন বদলানোয় আসল পরীক্ষা পেছায় না।', 'Keep a confirmed exam date fixed. Moving your routine cannot postpone a real exam.')}</small></label>
        {!data.personalRoutine && !data.routineSetupRequired && <><label>{t("প্রথম সেশনের সময়", "First session time")}<input type="time" required value={draft.startTime} onChange={e => update('startTime', e.target.value)} /><small>{t("বাংলাদেশ সময় · সাধারণ সেশনগুলো মিলবে; নিজের নির্দিষ্ট দিন/সেশনের সময় অগ্রাধিকার পাবে", "Bangladesh time · default slots follow; explicit day/task times keep priority")}</small></label>
        <label>{t("বাড়তি পর্যায়ের আগে দৈনিক পড়ার লক্ষ্য", "Daily study target (before boost)")}<select value={draft.dailyHours} onChange={e => update('dailyHours', Number(e.target.value))}>{Array.from({ length: 15 }, (_, idx) => idx + 4).map(h => <option key={h} value={h}>{t(`${h} ঘণ্টা`, `${h} hours`)}</option>)}</select><small>{t("নিজের সামর্থ্য অনুযায়ী ৪ থেকে ১৮ ঘণ্টা বেছে নাও", "Pick anywhere from 4 to 18 hours/day")}</small></label>
        <label>{t("নির্ধারিত দিন থেকে বাড়তি পড়া", "Scheduled study boost")}<select value={draft.boostEnabled ? 'on' : 'off'} onChange={e => update('boostEnabled', e.target.value === 'on')}><option value="on">{t("চালু (নির্ধারিত বাড়তি পড়ার তারিখ থেকে)", "Enabled (from the boost date)")}</option><option value="off">{t("বন্ধ (সব সময় একই লক্ষ্য)", "Disabled (flat daily hours)")}</option></select><small>{t("নির্ধারিত তারিখ থেকে দৈনিক পড়ার লক্ষ্য স্বয়ংক্রিয়ভাবে বদলাবে", "Automatically changes daily study hours from the boost date")}</small></label>
        {draft.boostEnabled && <>
          <label>{t("বাড়তি পড়া শুরুর তারিখ", "Boost start date")}<input type="date" required min="2020-01-01" max="2041-12-31" value={draft.boostStartDate} onChange={e => update('boostStartDate', e.target.value)} /><small>{t("শুরুর তারিখ যত দিন সরবে, এই তারিখও তত দিন সরবে", "Moves by the same number of days as the start date")}</small></label>
          <label>{t("বাড়তি পর্যায়ে দৈনিক পড়া", "Boosted daily study hours")}<select value={draft.boostDailyHours} onChange={e => update('boostDailyHours', Number(e.target.value))}>{Array.from({ length: 15 }, (_, idx) => idx + 4).map(h => <option key={h} value={h}>{t(`${h} ঘণ্টা`, `${h} hours`)}</option>)}</select><small>{t("বিরতি, খাবার ও পর্যাপ্ত ঘুমের সময় রাখো। বেশি ঘণ্টা প্রস্তুতির নিশ্চয়তা নয়।", "Allow time for breaks, meals and adequate sleep. More hours do not guarantee readiness.")}</small></label>
        </>}
        </>}
        <label>{t("টেস্ট পরীক্ষার লক্ষ্য তারিখ", "Test exam target date")}<input type="date" required min="2020-01-01" max="2041-12-31" value={draft.testExamDate} onChange={e => update('testExamDate', e.target.value)} /><small>{t("ব্যক্তিগত লক্ষ্য, নিশ্চিত কলেজ নোটিশ নয়। কলেজের তারিখ পেলে বসাও।", "Personal target, not a verified college notice. Enter your college date when known.")}</small></label>
        <label>{t("HSC ’২৭ পরীক্ষার লক্ষ্য তারিখ", "HSC '27 exam target date")}<input type="date" required min="2020-01-01" max="2041-12-31" value={draft.examDate} onChange={e => update('examDate', e.target.value)} /><small>{t("ব্যক্তিগত লক্ষ্য, নিশ্চিত সরকারি রুটিন নয়। বোর্ডের নোটিশ পেলে বসাও।", "Personal target, not a verified official routine. Enter the date from a board notice.")}</small></label>
        <div className="fixed-setting"><span>{t("বিষয় ও লক্ষ্য", "Subjects & targets")}</span><strong>{t("বিজ্ঞান · উচ্চতর গণিত ৪র্থ বিষয়", "Science · Higher Math as 4th subject")}</strong><small>{t("A+ / GPA 5.00 / Golden — লক্ষ্য, নিশ্চয়তা নয়", "A+ / GPA 5.00 / Golden — a goal, not a guarantee")}</small></div>
      </div>
      <section className="schedule-preview" aria-label={t('তারিখ পরিবর্তনের পূর্বরূপ', 'Date change preview')}>
        <h3>{t('সেভের আগে পুরো তারিখ মিলিয়ে দেখো', 'Review the whole timeline before saving')}</h3>
        <p>{t('এগুলো ব্যক্তিগত প্রস্তুতির লক্ষ্য, সরকারি পরীক্ষার রুটিন নয়। সরকারি HSC ২০২৭ ও কলেজের টেস্টের নির্দিষ্ট নোটিশ নিশ্চিত করা যায়নি।', 'These are personal preparation targets, not an official exam routine. Specific HSC 2027 and college-test notices could not be verified.')} {t('যাচাইয়ের চেষ্টা', 'Verification attempted')}: {formatDate(EXAM_DATE_INFORMATION.checkedOn, 'long')}.</p>
        <p className="schedule-source-links"><a href={EXAM_DATE_INFORMATION.nctb} target="_blank" rel="noreferrer">NCTB</a><a href={EXAM_DATE_INFORMATION.board} target="_blank" rel="noreferrer">{t('সিলেট শিক্ষা বোর্ড', 'Sylhet Education Board')}</a><a href={EXAM_DATE_INFORMATION.dhaka} target="_blank" rel="noreferrer">{t('ঢাকা বোর্ড HSC নোটিশ', 'Dhaka Board HSC notices')}</a></p>
        <p>{t('পরিকল্পিত কাস্টম দিনগুলো শুরুর সঙ্গে সরবে। নিজের নির্দিষ্ট সেশনের সময়, সাপ্তাহিক ক্লাস ও আসল ইতিহাস অক্ষত থাকবে; সময়ের সংঘর্ষ হলে নিচে সতর্কতা দেখো। পুরোনো সেভ করা প্রোফাইলের তারিখ নিজে থেকে বদলানো হয় না।', 'Planned custom days move with the start. Explicit session times, weekly classes and real history stay intact; check any time-conflict warnings below. Existing saved profiles are not silently given new dates.')}</p>
        {!data.personalRoutine && <ul>{preview.phases.map(phase => <li key={phase.id}><strong>{phase.name}</strong>: {formatDate(phase.start, 'long')} – {formatDate(phase.end, 'long')} · {bn(phase.days)} {t('দিন', 'days')}</li>)}</ul>}
        {data.personalRoutine && <p>{data.personalRoutine.scope} · {data.personalRoutine.scope === 'ALL' ? t('সব অধ্যায়ের পরিকল্পনা; তোমার সময়ের সীমা ও লক্ষ্য তারিখ অনুযায়ী বরাদ্দ হবে।', 'All chapters are planned within your availability and target date.') : t('বর্তমান নির্বাচিত সিলেবাস ধাপ। সময় উপরের availability থেকে আসবে; ৮/১৬ ঘণ্টা বা ১৩টি মডেল টেস্ট চাপানো হবে না। পরের A/B/C ধাপের আগে S-এর সব প্রয়োজনীয় কাজ শেষ হতে হবে।', 'Current selected syllabus phase. Availability above determines time; no 8/16-hour target or 13 mocks are imposed. S’s required work must be complete before later A/B/C phases.')}</p>}
        {preview.error && <p role="alert">{preview.error}</p>}
        {preview.health?.warnings.map(warning => <p className="schedule-capacity-warning" role="alert" key={warning}>{warning}</p>)}
        {!data.personalRoutine && !data.routineSetupRequired && preview.health && !preview.health.warnings.length && <p>{t('এই বরাদ্দে সব অধ্যায়ের ধাপ, দুই রাউন্ড বিজ্ঞান রিভিশন ও ১৩টি মডেল টেস্ট রাখা গেছে। এটি পড়া শেষ হওয়ার নিশ্চয়তা নয়।', 'All chapter parts, two science revision rounds and 13 mock papers fit in this allocation. This does not guarantee completion.')}</p>}
      </section>
      <div className="settings-subsection"><h3><Timer size={18} />{t("পড়ার অভ্যাস", "Study habits")}</h3><div className="form-grid">
        <label>{t("রিভিশন কার্ড", "Revision cards")}<select value={draft.revisionEnabled ? 'on' : 'off'} onChange={e => update('revisionEnabled', e.target.value === 'on')}><option value="on">{t("অটো তৈরি হবে", "generated automatically")}</option><option value="off">{t("বন্ধ", "Off")}</option></select><small>{t("অধ্যায় শেষ হলে ১/৩/৭/১৪/৩০ দিনের কার্ড", "Cards at 1/3/7/14/30 days after a chapter")}</small></label>
        {!data.personalRoutine && !data.routineSetupRequired && <><label>{t("অ্যাডাপ্টিভ প্ল্যানার", "Adaptive planner")}<select value={draft.adaptiveEnabled ? 'on' : 'off'} onChange={e => update('adaptiveEnabled', e.target.value === 'on')}><option value="on">{t("চালু (দুর্বল অধ্যায় আগে)", "Enabled (weak chapters first)")}</option><option value="off">{t("বন্ধ (নির্ধারিত রুটিন অটুট)", "Disabled (routine untouched)")}</option></select><small>{t("দুর্বল অধ্যায়ের জন্য পরের ৩ দিনের রুটিন নিজে থেকে সাজানো হবে; কখনোই ৮ ঘণ্টার বেশি নয়।", "Reshuffles the next three days towards weak chapters, never above eight hours a day.")}</small></label>
        <label>{t("অ্যাডাপ্টিভ বাফার", "Adaptive buffer")}<select value={String(draft.adaptiveBuffer)} onChange={e => update('adaptiveBuffer', Number(e.target.value))}><option value="0">{t("কোনো বাড়তি সময় নয়", "No extra time")}</option><option value="30">{t("সর্বোচ্চ ৩০ মিনিট বাড়তি", "Up to 30 extra minutes")}</option><option value="60">{t("সর্বোচ্চ ৬০ মিনিট বাড়তি", "Up to 60 extra minutes")}</option></select><small>{t("আগে থেকেই ৮ ঘণ্টা থাকলে বাফার কাজ করবে না; সীমা কখনোই ভাঙবে না।", "A buffer cannot exceed the eight-hour ceiling; the cap always wins.")}</small></label>
        </>}
        {!data.personalRoutine && !data.routineSetupRequired && <label>{t("ব্যাকলগ ক্যারিওভার", "Backlog carry-over")}<select value={draft.carryoverMode} onChange={e => update('carryoverMode', e.target.value as Settings['carryoverMode'])}><option value="manual">{t("নিজে বেছে নেব", "I'll pick")}</option><option value="auto">{t("প্রতিদিন অটো (সর্বোচ্চ ৬টি)", "Automatic daily (max 6)")}</option></select><small>{t("মিস হওয়া সাম্প্রতিক সেশন আজকের তালিকায়", "Missed recent sessions in today's list")}</small></label>}
        <label>{t("পোমোডোরো ফোকাস (মিনিট)", "Pomodoro focus (min)")}<input type="number" min={5} max={120} value={draft.pomodoroFocus} onChange={e => update('pomodoroFocus', Number(e.target.value))} /></label>
        <label>{t("ছোট বিরতি (মিনিট)", "Short break (min)")}<input type="number" min={1} max={60} value={draft.pomodoroBreak} onChange={e => update('pomodoroBreak', Number(e.target.value))} /></label>
        <label>{t("লম্বা বিরতি (মিনিট)", "Long break (min)")}<input type="number" min={5} max={120} value={draft.pomodoroLongBreak} onChange={e => update('pomodoroLongBreak', Number(e.target.value))} /></label>
      </div></div>
      <div className="settings-subsection"><h3><Palette size={18} />{t("চেহারা", "Appearance")}</h3><div className="theme-picker">{(['light', 'dark', 'system'] as const).map(theme => <button type="button" key={theme} className={draft.theme === theme ? 'active' : ''} onClick={() => { update('theme', theme); setTheme(theme); }}>{theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}<span>{theme === 'light' ? t('হালকা','Light') : theme === 'dark' ? t('গাঢ়','Dark') : t('সিস্টেম','System')}</span></button>)}</div><p className="tiny-muted">{t("থিম সঙ্গে সঙ্গে বদলে যায়।", "The theme switches instantly.")}</p>
        <div className="font-picker-row"><div className="font-picker-label"><Type size={17} /><span><strong>{t("লেখার আকার", "Text size")}</strong><small>{t("ছোট ফোনে বড় লেখা দরকার হলে বাড়াও। সঙ্গে সঙ্গে বদলে যাবে।", "Bump this up if text is hard to read on a small phone. It applies instantly.")}</small></span></div><div className="font-picker">{(['sm', 'md', 'lg'] as const).map(scale => <button type="button" key={scale} className={draft.fontScale === scale ? 'active' : ''} aria-pressed={draft.fontScale === scale} onClick={() => { update('fontScale', scale); setFontScale(scale); }}><span className={`font-sample ${scale}`}>{t("অআ", "Aa")}</span><small>{scale === 'sm' ? t('ছোট', 'Small') : scale === 'md' ? t('স্বাভাবিক', 'Normal') : t('বড়', 'Large')}</small></button>)}</div></div><div className="settings-subsection language-section"><h3><Languages size={18} />{t("ভাষা / Language", "Language / ভাষা")}</h3><div className="language-picker">{(['bn', 'en'] as const).map(language => <button type="button" key={language} className={draft.language === language ? 'active' : ''} onClick={() => update('language', language)}><strong>{language === 'bn' ? 'বাংলা' : 'English'}</strong><small>{language === 'bn' ? t('সম্পূর্ণ ইন্টারফেস', 'Full interface') : 'Shell, dates & headings'}</small></button>)}</div><p className="tiny-muted">{t('ইংরেজি মোডে প্রতিটি বোতাম, লেবেল, ট্যাব, টুলটিপ, তারিখ ও সংখ্যা ইংরেজি হয়; অধ্যায়ের নাম ও দীর্ঘ পড়ার ব্যাখ্যা বাংলা থাকে। সেভ করলে সঙ্গে সঙ্গে প্রয়োগ হবে।', 'In English mode every button, label, tab, tooltip, date and number is English; chapter names and long study explanations stay Bengali. Saving applies it immediately.')}</p></div></div>
      <div className="syllabus-check"><label><input type="checkbox" checked={draft.syllabusChecked} onChange={e => update('syllabusChecked', e.target.checked)} /><span><strong>{t('আমি নিজের বই ও পরীক্ষার পাঠ্যসূচির সঙ্গে অধ্যায়গুলো মিলিয়েছি।', 'I have matched these chapters against my own books and exam syllabus.')}</strong><small>{t('টিক দিলে সিলেবাস যাচাইয়ের রিমাইন্ডার ব্যানারটি লুকাবে। অধ্যায়ের তালিকা বদলাবে না।', 'Ticking this hides the syllabus verification banner. The chapter list does not change.')}</small></span></label><p>{syllabusNote()}</p></div>
      <div className="form-actions"><span>{t("তারিখ বদলালে অগ্রগতি মুছে যায় না।", "Changing the date doesn't erase progress.")}</span><button className="button primary" type="submit"><Save size={17} />{t("সেভ করো", "Save")}</button></div>
    </form>
    <section className="card data-settings">
      <div className="card-heading"><div><h2><Database size={20} />{t("তোমার তথ্য, তোমার কাছে", "Your data, in your hands")}</h2><p>{t('কোনো অ্যাকাউন্ট, সার্ভার বা ক্লাউড নেই। সব তথ্য এই ডিভাইসের স্থানীয় স্টোরেজে থাকে।', 'No account, server or cloud. All data stays in this device’s local storage.')}</p></div><span className="local-badge"><CheckCircle2 size={14} />{t("অফলাইন", "Offline")}</span></div>
      {recoveryRaw && <div className="notice-box"><ShieldCheck size={18} /><p><strong>{t("আগের সেভ করা তথ্য পড়া যায়নি।", "The saved data could not be read.")}</strong>{t(' সম্ভব হলে কাঁচা তথ্য রিকভারি ফাইল হিসেবে রাখা হয়েছে। নামিয়ে রাখো; পরে চাইলে ইমপোর্ট করে দেখতে পারো।', ' Where possible the raw data was kept as a recovery file. Download and keep it; you can try importing it later.')}</p><button className="button secondary small" onClick={() => { downloadText(recoveryRaw, `prostuti-recovery-${todayKey()}.json`, 'application/json;charset=utf-8'); notify(t('রিকভারি ফাইল ডাউনলোড হয়েছে।', 'Recovery file downloaded.')); }}>{t("রিকভারি ফাইল", "Recovery file")}</button><button className="text-button" onClick={() => { try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ } setRecoveryRaw(null); }}>{t("সরাও", "Remove")}</button></div>}
      <div className="data-actions"><div><span className="large-icon green"><ArrowDownToLine size={23} /></span><h3>{t("JSON ব্যাকআপ", "JSON backup")}</h3><p>{t('অগ্রগতি, লিখিত নোট, সেশন, MCQ, পরীক্ষা ও সেটিংস। স্ক্যানের ছবি ও offline PDF/ভিডিওর bytes থাকে না; এগুলোর জন্য Full backup বা আলাদা PDF রাখো।', 'Progress, text notes, sessions, MCQ, exams and settings. Scanned images and offline PDF/video bytes are not included; use full backup or separate PDFs.')}</p><p className={`backup-status ${backupAgeDays() === null || backupAgeDays()! >= 7 ? 'stale' : ''}`}>{backupLabel()}</p><div className="data-action-buttons"><button className="button secondary" onClick={backup}><Download size={16} />{t("ব্যাকআপ রাখো", "Keep a backup")}</button><button className="button ghost small" onClick={() => void share()}><Share2 size={15} />{t("শেয়ার / কপি", "Share / copy")}</button></div></div><div><span className="large-icon blue"><ArrowUpFromLine size={23} /></span><h3>{t("ব্যাকআপ ইমপোর্ট", "Import backup")}</h3><p>{t("v1 বা v2 ব্যাকআপ ফিরিয়ে আনো। পুরোনো v1 ফাইলও চলবে।", "Restore a v1 or v2 backup. Old v1 files work too.")}</p><input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label={t("ব্যাকআপ ফাইল", "Backup file")} onChange={e => void importFile(e.target.files?.[0])} /><button className="button secondary" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} />{t("ফাইল নির্বাচন", "Choose file")}</button></div><div><span className="large-icon peach"><FileText size={23} /></span><h3>{t("Markdown পরিকল্পনা", "Markdown plan")}</h3><p>{t("তারিখসহ পুরো রুটিন, অগ্রগতি, নম্বর ও ভুলের খাতা।", "Full routine with dates, progress, marks and the mistake book.")}</p><button className="button secondary" onClick={() => { downloadText(makeMarkdown(plan, data), `HSC-27-plan-${todayKey()}.md`, 'text/markdown;charset=utf-8'); notify(t('Markdown পরিকল্পনা ডাউনলোড হয়েছে।', 'Markdown plan downloaded.')); }}><FileText size={16} />{t(".md ডাউনলোড", "Download .md")}</button></div><div><span className="large-icon lavender"><CalendarDays size={23} /></span><h3>{t("রুটিন ও তারিখ CSV", "Routine & dates CSV")}</h3><p>{t('কাস্টম সাপ্তাহিক ব্লক ও গুরুত্বপূর্ণ তারিখের আলাদা শিট।', 'A separate sheet for custom weekly blocks and important dates.')}</p><div className="data-action-buttons"><button className="button secondary" onClick={exportRoutine}><Download size={16} />{t("রুটিন", "Routine")}</button><button className="button secondary" onClick={exportImportantDates}><Download size={16} />{t("তারিখ", "Date")}</button></div></div></div>
      <div className="csv-row"><div><strong>{t("CSV ডেটা", "CSV data")}</strong><p>{t("স্প্রেডশিটে বিশ্লেষণের জন্য আলাদা ফাইল।", "A separate file for spreadsheet analysis.")}</p></div><button className="button ghost small" onClick={exportSessions}>{t("স্টাডি সেশন", "Study session")}</button><button className="button ghost small" onClick={exportTests}>{t("টেস্ট", "Test")}</button><button className="button ghost small" onClick={exportAttempts}>{t("MCQ উত্তর", "MCQ answers")}</button></div>
      <div className="reset-row"><div><strong>{t("নতুন করে শুরু করতে চাও?", "Want to start over?")}</strong><p>{t('সব অগ্রগতি, নোট, সেশন, নম্বর ও সেটিংস মুছে যাবে। আগে ব্যাকআপ রাখো।', 'All progress, notes, sessions, marks and settings will be erased. Take a backup first.')}</p></div><button className="button danger-outline" onClick={() => confirm({ title: 'সব তথ্য মুছে নতুন শুরু করবে?', message: 'এই ব্রাউজারের সব অগ্রগতি, দিনের নোট, স্টাডি সেশন, MCQ উত্তর, পরীক্ষার নম্বর, ভুলের খাতা, লাইব্রেরি ও সেটিংস মুছে যাবে। ব্যাকআপ না থাকলে ফিরে পাওয়া যাবে না। ক্যালেন্ডারের ইভেন্ট আলাদাভাবে মুছতে হবে।', label: 'সব মুছে নতুন শুরু', danger: true, action: () => { void (async () => { const fresh = { ...freshData(), routineSetupRequired: true }; if (!saveData(fresh, true)) { notify(t('তথ্য রিসেট করা যায়নি। স্টোরেজের অনুমতি ও খালি জায়গা যাচাই করো।', 'The reset failed. Check storage permission and free space.'), 'error'); return; } timer.reset(); markDirty(false); setDraft(fresh.settings); startAnchor.current = fresh.settings.startDate; setData(fresh); setSelectedDate(fresh.settings.startDate); // A failed cleanup must not skip the other stores or leave the old timer running.
        void stopStudyTimerService(); void cancelTimerAlarm();
        let mediaCleared = true;
        try { await clearFiles(); } catch { mediaCleared = false; }
        let scansCleared = false;
        try { scansCleared = await clearScanImages(); } catch { /* report below */ }
        const databaseCleared = await Promise.race([clearDatabase(), new Promise<false>(resolve => setTimeout(() => resolve(false), 3000))]);
        try { ['hsc27-focus-timer-v1', 'hsc27-focus-done-v1', 'hsc27-notified-v1', 'hsc27-study-timer-v2', 'hsc27-timer-claimed-v2', 'hsc27-revision-notified-v2', 'hsc27-exam-clock-v1', RECOVERY_KEY, SCANNED_NOTES_META_KEY].forEach(key => localStorage.removeItem(key)); } catch { /* storage unavailable */ }
        if (!mediaCleared || !scansCleared || !databaseCleared) {
          notify(t('অগ্রগতি রিসেট হয়েছে, কিন্তু স্ক্যান/মিডিয়া বা ডাটাবেসের কিছু তথ্য মুছতে পারিনি। স্টোরেজ ঠিক করে আবার রিসেট করো।', 'Progress was reset, but some scan images, media or database data could not be cleared. Fix storage and reset again.'), 'error');
          return;
        }
        window.location.reload(); })(); } })}><RotateCcw size={16} />{t("রিসেট করো", "Reset")}</button></div>
    </section>
    <section className="card channels-card">
      <div className="card-heading"><div><h2><Play size={20} />{t("ক্লাস কোথায় পাবে", "Where to find classes")}</h2><p>{t("প্রতিটি অধ্যায়ে এই শিক্ষকদের ক্লাসের লিংক বসানো আছে — সিলেবাস থেকে অধ্যায় খুললেই পাবে।", "Every chapter carries these teachers' class links — open a chapter from the syllabus.")}</p></div><span className="local-badge">YOUTUBE</span></div>
      <div className="channel-grid">{CHANNELS.map(channel => <a key={channel.handle} className="channel-row" href={channel.url} target="_blank" rel="noreferrer"><strong>{channel.name}</strong><span>{channel.note}</span><ArrowUpRight size={14} /></a>)}</div>
    </section>
    <section className="card sources-card"><h2>{t("সিলেবাস ও পরীক্ষার তথ্য যাচাই", "Verify syllabus & exam info")}</h2><p>{t('অ্যাপের তালিকা সহায়ক পরিকল্পনা। তোমার পরীক্ষার বছরের সরকারি নোটিশ ও পাঠ্যবইই চূড়ান্ত।', 'The app’s list is a planning aid. The official notice and textbook for your exam year are final.')}</p>{SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><div><strong>{source.name}</strong><span>{source.note}</span></div><ExternalLink size={17} /></a>)}<div className="inline-note"><CheckCircle2 size={16} /><p>{t('কোনো অধ্যায় থেকে প্রশ্ন আসা ১০০% নিশ্চিত নয়। এই অ্যাপ ফলাফলের নিশ্চয়তা দেয় না।', 'No chapter is guaranteed to appear. This app does not promise any result.')}</p></div></section>
    <section className="card about-card"><div className="card-heading"><div><h2><Info size={20} />{t("অ্যাপের তথ্য", "About the app")}</h2><p>{t(`প্রস্তুতি · HSC 27 Study Planner · সংস্করণ ${bn(version)}`, `Prostuti · HSC 27 Study Planner · version ${version}`)}</p></div><span className="version-badge">OFFLINE FIRST</span></div><div className="about-grid"><div><strong>{t("কী কাজ করে", "What works")}</strong><p>{t('রুটিন, টাইমার, রিভিশন, MCQ/CQ, টেস্ট, GPA, নোট, ভিডিও লিংক, সূত্র, বোর্ড প্রশ্ন, ব্যাকআপ—সব অফলাইনে। YouTube ভিডিও দেখতে ইন্টারনেট লাগবে।', 'Routine, timer, revision, MCQ/CQ, tests, GPA, notes, video links, formulas, board questions and backup — all offline. Watching YouTube videos needs internet.')}</p></div><div><strong>{t("কী নেই", "What's missing")}</strong><p>{t('লগইন, ক্লাউড সিঙ্ক, অনলাইন অ্যাকাউন্ট, পেইড API, AI সার্ভার বা সোশ্যাল ফিচার নেই। অগ্রগতি নিতে JSON, আর স্ক্যানের ছবি ও offline মিডিয়ার জন্য নতুন Full backup বা আলাদা PDF রাখো।', 'No login, cloud sync, online account, paid API, AI server or social features. Use JSON for progress and a new full backup or separate PDFs for scanned images and offline media.')}</p></div><div><strong>{t("আপডেট", "Update")}</strong><p>{t('একই স্বাক্ষর ও একই অ্যাপ আইডির APK আপডেটে ডেটা সাধারণত থাকে। ভিন্ন স্বাক্ষরে ইনস্টল না হলে ব্যাকআপ যাচাই না করে পুরোনো অ্যাপ মুছো না। JSON-এ ছবি বা offline মিডিয়া থাকে না; স্ক্যানের আলাদা PDF এবং সমর্থিত নতুন Full backup-ও রাখো।', 'An APK update with the same signature and app id normally keeps data. If another signature prevents installation, do not uninstall before verifying backups. JSON excludes image/media bytes; also keep scanned PDFs and a supported new full backup.')}</p></div><div><strong>{t("ভাষা / Language", "Language / ভাষা")}</strong><p>{t('ইংরেজি মোডে অনেক নেভিগেশন ও নিয়ন্ত্রণ ইংরেজিতে দেখা যায়। কিছু লেবেল, বার্তা ও পড়ার কনটেন্ট এখনও বাংলায় থাকে।', 'English mode translates navigation and most controls. Some labels, messages and study content still show in Bengali.')}</p></div></div></section>
  </div>;
}
