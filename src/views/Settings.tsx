import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, CheckCircle2, Database, Download, ExternalLink, FileText, Info, Languages, Monitor, Moon, Palette, RotateCcw, Save, Share2, ShieldCheck, Sun, Timer, Play, ArrowUpRight, Type } from 'lucide-react';
import { usePlanner } from '../context';
import { SOURCES, SYLLABUS_NOTE, chapterById, subjectById } from '../data';
import { freshData, todayKey } from '../planner';
import type { Settings } from '../planner';
import { downloadCsv, downloadText, makeMarkdown } from '../exports';
import { parseBackup, RECOVERY_KEY, sanitizeSettings, saveData } from '../storage';
import { clearDatabase } from '../db';
import { cancelTimerAlarm, stopStudyTimerService } from '../native';
import { CHANNELS } from '../classLinks';
import { backupAgeDays, backupLabel, downloadBackup, shareBackup } from '../backup';
import { PageHeading } from '../components';
import { t } from '../i18n';

const BOARDS = ['সিলেট', 'ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'কুমিল্লা', 'যশোর', 'বরিশাল', 'দিনাজপুর', 'ময়মনসিংহ', 'মাদ্রাসা', 'কারিগরি'];
export default function SettingsView() {
  const { data, setData, plan, notify, confirm, setSelectedDate, setTheme, setFontScale, timer } = usePlanner();
  const [draft, setDraft] = useState<Settings>(data.settings);
  const [dirty, setDirty] = useState(false);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(() => { try { return localStorage.getItem(RECOVERY_KEY); } catch { return null; } });
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!dirty) setDraft(data.settings); }, [data.settings, dirty]);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => { setDirty(true); setDraft(current => ({ ...current, [key]: value })); };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    let settings: Settings;
    try { settings = sanitizeSettings(draft); } catch (err) { notify((err as Error).message, 'error'); return; }
    const scheduleChanged = (['startDate', 'startTime', 'dailyHours', 'boostEnabled', 'boostStartDate', 'boostDailyHours'] as const).some(key => settings[key] !== data.settings[key]);
    const apply = () => {
      setData(d => ({ ...d, settings: { ...settings, calendarRevision: d.settings.calendarRevision + (scheduleChanged ? 1 : 0) } }));
      setDirty(false);
      if (scheduleChanged) setSelectedDate(settings.startDate);
      notify(scheduleChanged ? 'রুটিন আপডেট হয়েছে। অগ্রগতি রাখা হয়েছে; ক্যালেন্ডার আবার ইমপোর্ট করো।' : 'সেটিংস সেভ হয়েছে।');
    };
    if (scheduleChanged) confirm({ title: 'রুটিনের সময় বদলাবে?', message: 'নতুন শুরুর তারিখ/সময় অনুযায়ী সব সেশন আবার সাজানো হবে। কাজের অগ্রগতি মুছবে না, তবে দিনের নোট নিজের তারিখেই থাকবে। আগে ইমপোর্ট করা ক্যালেন্ডার আপডেট করতে নতুন .ics ফাইল নাও।', label: 'রুটিন আপডেট করো', action: apply }); else apply();
  };
  const exportRoutine = () => {
    if (!data.routineBlocks.length) { notify('কোনো কাস্টম রুটিন ব্লক নেই।', 'info'); return; }
    const weekdays = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
    downloadCsv([['দিন', 'শুরু', 'মিনিট', 'বিষয়', 'নাম'], ...data.routineBlocks.map(block => [weekdays[block.weekday], `${String(Math.floor(block.startMinute / 60)).padStart(2, '0')}:${String(block.startMinute % 60).padStart(2, '0')}`, block.minutes, subjectById[block.subject].name, block.title])], `prostuti-routine-${todayKey()}.csv`);
    notify('কাস্টম রুটিনের CSV ডাউনলোড হয়েছে।');
  };
  const exportImportantDates = () => {
    if (!data.importantDates.length) { notify('কোনো গুরুত্বপূর্ণ তারিখ নেই।', 'info'); return; }
    downloadCsv([['তারিখ', 'নাম', 'নোট', 'রিমাইন্ডার'], ...data.importantDates.slice().sort((a, b) => a.date.localeCompare(b.date)).map(item => [item.date, item.title, item.note, item.notify ? 'হ্যাঁ' : 'না'])], `prostuti-dates-${todayKey()}.csv`);
    notify('গুরুত্বপূর্ণ তারিখের CSV ডাউনলোড হয়েছে।');
  };
  const backup = () => { const name = downloadBackup(data); notify(`${name} সেভ হয়েছে। নিরাপদ জায়গায় রাখো।`); };
  const share = async () => { try { const outcome = await shareBackup(data); if (outcome === 'cancelled') return; notify(outcome === 'shared' ? 'ব্যাকআপ শেয়ার শিটে পাঠানো হয়েছে।' : outcome === 'copied' ? 'ব্যাকআপ JSON ক্লিপবোর্ডে কপি হয়েছে।' : 'ব্যাকআপ ফাইল ডাউনলোড হয়েছে।'); } catch { notify('শেয়ার করা যায়নি। ব্যাকআপ রাখো বোতাম ব্যবহার করো।', 'error'); } };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error('ব্যাকআপটি ৮ MB-এর কম হতে হবে।');
      const parsed = parseBackup(await file.text());
      confirm({ title: 'ব্যাকআপ ফিরিয়ে আনবে?', message: 'বর্তমান অগ্রগতি, নোট, সেশন, MCQ, পরীক্ষা ও সেটিংস এই ব্যাকআপের তথ্য দিয়ে বদলে যাবে। চালু স্টাডি ও পরীক্ষার ঘড়ি রিসেট হবে। প্রয়োজন হলে আগে বর্তমান তথ্যের ব্যাকআপ রাখো।', label: 'ব্যাকআপ ইমপোর্ট করো', action: () => { timer.reset(); try { localStorage.removeItem('hsc27-exam-clock-v1'); } catch { /* storage unavailable */ } setDirty(false); setData(parsed); setSelectedDate(parsed.settings.startDate); notify('ব্যাকআপ ফিরিয়ে আনা হয়েছে।'); } });
    } catch (err) { notify((err as Error).message, 'error'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const exportSessions = () => {
    if (!data.studySessions.length) { notify('এখনও কোনো টাইমার/ম্যানুয়াল সেশন নেই।', 'info'); return; }
    downloadCsv([['তারিখ', 'বিষয়', 'অধ্যায়', 'মিনিট', 'ধরন', 'লেবেল'], ...data.studySessions.map(session => [session.date, subjectById[session.subject].name, session.chapterId ? chapterById[session.chapterId]?.title || '' : '', session.minutes, session.mode, session.label || ''])], `prostuti-study-${todayKey()}.csv`);
    notify('স্টাডি সেশনের CSV ডাউনলোড হয়েছে।', 'success');
  };
  const exportTests = () => {
    if (!data.tests.length) { notify('এখনও নিজের টেস্টের রেকর্ড নেই।', 'info'); return; }
    downloadCsv([['তারিখ', 'ধরন', 'শিরোনাম', 'বিষয়', 'নম্বর', 'পূর্ণমান', 'মিনিট', 'নোট'], ...data.tests.map(test => [test.date, test.kind, test.title, test.subject ? subjectById[test.subject].name : '', test.score, test.total, test.durationMin, test.notes])], `prostuti-tests-${todayKey()}.csv`);
    notify('টেস্টের CSV ডাউনলোড হয়েছে।', 'success');
  };
  const exportAttempts = () => {
    if (!data.attempts.length) { notify('এখনও কোনো MCQ উত্তর নেই।', 'info'); return; }
    downloadCsv([['তারিখ', 'প্রশ্ন ID', 'বিষয়', 'সঠিক?', 'বাছা উত্তর'], ...data.attempts.map(attempt => [attempt.date, attempt.questionId, subjectById[attempt.subject].name, attempt.correct ? 'হ্যাঁ' : 'না', attempt.chosen + 1])], `prostuti-mcq-${todayKey()}.csv`);
    notify('MCQ রেকর্ডের CSV ডাউনলোড হয়েছে।', 'success');
  };
  return <div className="view settings-view">
    <PageHeading eyebrow="MAKE IT YOURS" title="তোমার পড়া, তোমার ছন্দে।" titleEn="Your study, your rhythm." description="শুরুর তারিখ, লক্ষ্য, থিম, রিভিশন আর ডেটা—সব এক জায়গায়। সব পরিবর্তন এই ডিভাইসেই থাকে।" descriptionEn="Start date, targets, theme, revision and data — all local to this device." />
    <form className="card settings-form" onSubmit={save}>
      <div className="card-heading"><h2>{t("পরিকল্পনা ও পরিচয়", "Plan & identity")}</h2><span className="local-badge"><ShieldCheck size={14} />{t("শুধু এই ডিভাইসে", "This device only")}</span></div>
      <div className="form-grid">
        <label>{t("তোমার নাম", "Your name")}<span className="optional">{t("(ইচ্ছামতো)", "(custom)")}</span><input value={draft.name} maxLength={60} placeholder={t("কী নামে ডাকব?", "What should I call you?")} onChange={e => update('name', e.target.value)} /></label>
        <label>{t("শিক্ষা বোর্ড", "Education board")}<select value={draft.board} onChange={e => update('board', e.target.value)}>{!BOARDS.includes(draft.board) && <option value={draft.board}>{draft.board}</option>}{BOARDS.map(board => <option key={board}>{board}</option>)}</select></label>
        <label>{t("রুটিন শুরুর তারিখ", "Routine start date")}<input type="date" required min="2020-01-01" max="2040-12-31" value={draft.startDate} onChange={e => update('startDate', e.target.value)} /><small>{t("দিনে ২টি বিষয় · ফেব্রুয়ারি টেস্টের আগেই পূর্ণ সিলেবাস শেষ", "2 subjects/day · full syllabus done before Feb Test Exam")}</small></label>
        <label>{t("প্রথম সেশনের সময়", "First session time")}<input type="time" required value={draft.startTime} onChange={e => update('startTime', e.target.value)} /><small>{t("বাংলাদেশ সময় · বদলালে পরের সব সেশন স্বয়ংক্রিয়ভাবে মিলিয়ে নেবে", "Bangladesh time · changing auto-cascades all slots")}</small></label>
        <label>{t("দৈনিক পড়ার লক্ষ্য (বর্তমান মাস)", "Daily study target (current phase)")}<select value={draft.dailyHours} onChange={e => update('dailyHours', Number(e.target.value))}>{Array.from({ length: 15 }, (_, idx) => idx + 4).map(h => <option key={h} value={h}>{t(`${h} ঘণ্টা${h === 8 ? ' · প্রস্তাবিত' : ''}`, `${h} hours${h === 8 ? ' · current month' : ''}`)}</option>)}</select><small>{t("নিজের সামর্থ্য অনুযায়ী ৪ থেকে ১৮ ঘণ্টা বেছে নাও", "Pick anywhere from 4 to 18 hours/day")}</small></label>
        <label>{t("পরের মাস থেকে বাড়তি পড়া", "Next-month study boost")}<select value={draft.boostEnabled ? 'on' : 'off'} onChange={e => update('boostEnabled', e.target.value === 'on')}><option value="on">{t("চালু (ডিসেম্বর থেকে ১৬–১৮ ঘণ্টা)", "Enabled (16–18h from next month)")}</option><option value="off">{t("বন্ধ (সব সময় একই লক্ষ্য)", "Disabled (flat daily hours)")}</option></select><small>{t("নির্ধারিত তারিখ থেকে দৈনিক পড়ার লক্ষ্য স্বয়ংক্রিয়ভাবে বাড়বে", "Automatically scales up daily study hours from boost date")}</small></label>
        {draft.boostEnabled && <>
          <label>{t("বাড়তি পড়া শুরুর তারিখ", "Boost start date")}<input type="date" required min="2026-01-01" max="2041-12-31" value={draft.boostStartDate} onChange={e => update('boostStartDate', e.target.value)} /><small>{t("যেমন ১ ডিসেম্বর ২০২৬ থেকে বাড়তি রুটিন শুরু", "e.g. start boosted hours from 1 Dec 2026")}</small></label>
          <label>{t("বাড়তি পর্যায়ে দৈনিক পড়া", "Boosted daily study hours")}<select value={draft.boostDailyHours} onChange={e => update('boostDailyHours', Number(e.target.value))}>{Array.from({ length: 15 }, (_, idx) => idx + 4).map(h => <option key={h} value={h}>{t(`${h} ঘণ্টা${h >= 16 ? ' · পূর্ণ প্রস্তুতি' : ''}`, `${h} hours${h >= 16 ? ' · full boost' : ''}`)}</option>)}</select><small>{t("১৬, ১৭ বা ১৮ ঘণ্টা (চাইলে যেকোনো সময় কমানো-বাড়ানো যাবে)", "16, 17, or 18 hours (adjustable anytime)")}</small></label>
        </>}
        <label>{t("টেস্ট পরীক্ষার লক্ষ্য তারিখ", "Test exam target date")}<input type="date" required min="2026-01-01" max="2041-12-31" value={draft.testExamDate} onChange={e => update('testExamDate', e.target.value)} /><small>{t("ফেব্রুয়ারি ২০২৭ কলেজের টেস্ট পরীক্ষা (নিজের কলেজের তারিখ বসাতে পারো)", "February 2027 college test exam (adjust to your college schedule)")}</small></label>
        <label>{t("HSC ’২৭ পরীক্ষার লক্ষ্য তারিখ", "HSC '27 exam target date")}<input type="date" required min="2026-01-01" max="2041-12-31" value={draft.examDate} onChange={e => update('examDate', e.target.value)} /><small>{t("ঈদুল আজহার পর সম্ভাব্য বোর্ড তারিখ (৬ জুন ২০২৭)", "Expected post-Eid-ul-Adha board date (6 June 2027)")}</small></label>
        <div className="fixed-setting"><span>{t("বিষয় ও লক্ষ্য", "Subjects & targets")}</span><strong>{t("বিজ্ঞান · উচ্চতর গণিত ৪র্থ বিষয়", "Science · Higher Math as 4th subject")}</strong><small>{t("A+ / GPA 5.00 / Golden — লক্ষ্য, নিশ্চয়তা নয়", "A+ / GPA 5.00 / Golden — a goal, not a guarantee")}</small></div>
      </div>
      <div className="settings-subsection"><h3><Timer size={18} />{t("পড়ার অভ্যাস", "Study habits")}</h3><div className="form-grid">
        <label>{t("রিভিশন কার্ড", "Revision cards")}<select value={draft.revisionEnabled ? 'on' : 'off'} onChange={e => update('revisionEnabled', e.target.value === 'on')}><option value="on">{t("অটো তৈরি হবে", "generated automatically")}</option><option value="off">{t("বন্ধ", "Off")}</option></select><small>{t("অধ্যায় শেষ হলে ১/৩/৭/১৪/৩০ দিনের কার্ড", "Cards at 1/3/7/14/30 days after a chapter")}</small></label>
        <label>{t("ব্যাকলগ ক্যারিওভার", "Backlog carry-over")}<select value={draft.carryoverMode} onChange={e => update('carryoverMode', e.target.value as Settings['carryoverMode'])}><option value="manual">{t("নিজে বেছে নেব", "I'll pick")}</option><option value="auto">{t("প্রতিদিন অটো (সর্বোচ্চ ৬টি)", "Automatic daily (max 6)")}</option></select><small>{t("মিস হওয়া সাম্প্রতিক সেশন আজকের তালিকায়", "Missed recent sessions in today's list")}</small></label>
        <label>{t("পোমোডোরো ফোকাস (মিনিট)", "Pomodoro focus (min)")}<input type="number" min={5} max={120} value={draft.pomodoroFocus} onChange={e => update('pomodoroFocus', Number(e.target.value))} /></label>
        <label>{t("ছোট বিরতি (মিনিট)", "Short break (min)")}<input type="number" min={1} max={60} value={draft.pomodoroBreak} onChange={e => update('pomodoroBreak', Number(e.target.value))} /></label>
        <label>{t("লম্বা বিরতি (মিনিট)", "Long break (min)")}<input type="number" min={5} max={120} value={draft.pomodoroLongBreak} onChange={e => update('pomodoroLongBreak', Number(e.target.value))} /></label>
      </div></div>
      <div className="settings-subsection"><h3><Palette size={18} />{t("চেহারা", "Appearance")}</h3><div className="theme-picker">{(['light', 'dark', 'system'] as const).map(theme => <button type="button" key={theme} className={draft.theme === theme ? 'active' : ''} onClick={() => { update('theme', theme); setTheme(theme); }}>{theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}<span>{theme === 'light' ? 'হালকা' : theme === 'dark' ? 'গাঢ়' : 'সিস্টেম'}</span></button>)}</div><p className="tiny-muted">{t("থিম সঙ্গে সঙ্গে বদলে যায়।", "The theme switches instantly.")}</p>
        <div className="font-picker-row"><div className="font-picker-label"><Type size={17} /><span><strong>{t("লেখার আকার", "Text size")}</strong><small>{t("ছোট ফোনে বড় লেখা দরকার হলে বাড়াও। সঙ্গে সঙ্গে বদলে যাবে।", "Bump this up if text is hard to read on a small phone. It applies instantly.")}</small></span></div><div className="font-picker">{(['sm', 'md', 'lg'] as const).map(scale => <button type="button" key={scale} className={draft.fontScale === scale ? 'active' : ''} aria-pressed={draft.fontScale === scale} onClick={() => { update('fontScale', scale); setFontScale(scale); }}><span className={`font-sample ${scale}`}>{t("অআ", "Aa")}</span><small>{scale === 'sm' ? 'ছোট' : scale === 'md' ? 'স্বাভাবিক' : 'বড়'}</small></button>)}</div></div><div className="settings-subsection language-section"><h3><Languages size={18} />{t("ভাষা / Language", "Language / ভাষা")}</h3><div className="language-picker">{(['bn', 'en'] as const).map(language => <button type="button" key={language} className={draft.language === language ? 'active' : ''} onClick={() => update('language', language)}><strong>{language === 'bn' ? 'বাংলা' : 'English'}</strong><small>{language === 'bn' ? 'সম্পূর্ণ ইন্টারফেস' : 'Shell, dates & headings'}</small></button>)}</div><p className="tiny-muted">ইংরেজি মোডে প্রতিটি বোতাম, লেবেল, ট্যাব, টুলটিপ, তারিখ ও সংখ্যা ইংরেজি হয়; অধ্যায়ের নাম ও দীর্ঘ পড়ার ব্যাখ্যা বাংলা থাকে। সেভ করলে সঙ্গে সঙ্গে প্রয়োগ হবে।</p></div></div>
      <div className="syllabus-check"><label><input type="checkbox" checked={draft.syllabusChecked} onChange={e => update('syllabusChecked', e.target.checked)} /><span><strong>আমি নিজের বই ও পরীক্ষার পাঠ্যসূচির সঙ্গে অধ্যায়গুলো মিলিয়েছি।</strong><small>টিক দিলে সিলেবাস যাচাইয়ের রিমাইন্ডার ব্যানারটি লুকাবে। অধ্যায়ের তালিকা বদলাবে না।</small></span></label><p>{SYLLABUS_NOTE}</p></div>
      <div className="form-actions"><span>{t("তারিখ বদলালে অগ্রগতি মুছে যায় না।", "Changing the date doesn't erase progress.")}</span><button className="button primary" type="submit"><Save size={17} />{t("সেভ করো", "Save")}</button></div>
    </form>
    <section className="card data-settings">
      <div className="card-heading"><div><h2><Database size={20} />{t("তোমার তথ্য, তোমার কাছে", "Your data, in your hands")}</h2><p>কোনো অ্যাকাউন্ট, সার্ভার বা ক্লাউড নেই। সব তথ্য এই ডিভাইসের স্থানীয় স্টোরেজে থাকে।</p></div><span className="local-badge"><CheckCircle2 size={14} />{t("অফলাইন", "Offline")}</span></div>
      {recoveryRaw && <div className="notice-box"><ShieldCheck size={18} /><p><strong>{t("আগের সেভ করা তথ্য পড়া যায়নি।", "The saved data could not be read.")}</strong> সম্ভব হলে কাঁচা তথ্য রিকভারি ফাইল হিসেবে রাখা হয়েছে। নামিয়ে রাখো; পরে চাইলে ইমপোর্ট করে দেখতে পারো।</p><button className="button secondary small" onClick={() => { downloadText(recoveryRaw, `prostuti-recovery-${todayKey()}.json`, 'application/json;charset=utf-8'); notify('রিকভারি ফাইল ডাউনলোড হয়েছে।'); }}>{t("রিকভারি ফাইল", "Recovery file")}</button><button className="text-button" onClick={() => { try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ } setRecoveryRaw(null); }}>{t("সরাও", "Remove")}</button></div>}
      <div className="data-actions"><div><span className="large-icon green"><ArrowDownToLine size={23} /></span><h3>{t("JSON ব্যাকআপ", "JSON backup")}</h3><p>{t("অগ্রগতি, নোট, সেশন, MCQ, পরীক্ষা ও সেটিংস—সব এক ফাইলে।", "Progress, notes, sessions, MCQ, exams and settings — all in one file.")}</p><p className={`backup-status ${backupAgeDays() === null || backupAgeDays()! >= 7 ? 'stale' : ''}`}>{backupLabel()}</p><div className="data-action-buttons"><button className="button secondary" onClick={backup}><Download size={16} />{t("ব্যাকআপ রাখো", "Keep a backup")}</button><button className="button ghost small" onClick={() => void share()}><Share2 size={15} />{t("শেয়ার / কপি", "Share / copy")}</button></div></div><div><span className="large-icon blue"><ArrowUpFromLine size={23} /></span><h3>{t("ব্যাকআপ ইমপোর্ট", "Import backup")}</h3><p>{t("v1 বা v2 ব্যাকআপ ফিরিয়ে আনো। পুরোনো v1 ফাইলও চলবে।", "Restore a v1 or v2 backup. Old v1 files work too.")}</p><input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label={t("ব্যাকআপ ফাইল", "Backup file")} onChange={e => void importFile(e.target.files?.[0])} /><button className="button secondary" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} />{t("ফাইল নির্বাচন", "Choose file")}</button></div><div><span className="large-icon peach"><FileText size={23} /></span><h3>{t("Markdown পরিকল্পনা", "Markdown plan")}</h3><p>{t("তারিখসহ পুরো রুটিন, অগ্রগতি, নম্বর ও ভুলের খাতা।", "Full routine with dates, progress, marks and the mistake book.")}</p><button className="button secondary" onClick={() => { downloadText(makeMarkdown(plan, data), `HSC-27-plan-${todayKey()}.md`, 'text/markdown;charset=utf-8'); notify('Markdown পরিকল্পনা ডাউনলোড হয়েছে।'); }}><FileText size={16} />{t(".md ডাউনলোড", "Download .md")}</button></div><div><span className="large-icon lavender"><CalendarDays size={23} /></span><h3>{t("রুটিন ও তারিখ CSV", "Routine & dates CSV")}</h3><p>কাস্টম সাপ্তাহিক ব্লক ও গুরুত্বপূর্ণ তারিখের আলাদা শিট।</p><div className="data-action-buttons"><button className="button secondary" onClick={exportRoutine}><Download size={16} />{t("রুটিন", "Routine")}</button><button className="button secondary" onClick={exportImportantDates}><Download size={16} />{t("তারিখ", "Date")}</button></div></div></div>
      <div className="csv-row"><div><strong>{t("CSV ডেটা", "CSV data")}</strong><p>{t("স্প্রেডশিটে বিশ্লেষণের জন্য আলাদা ফাইল।", "A separate file for spreadsheet analysis.")}</p></div><button className="button ghost small" onClick={exportSessions}>{t("স্টাডি সেশন", "Study session")}</button><button className="button ghost small" onClick={exportTests}>{t("টেস্ট", "Test")}</button><button className="button ghost small" onClick={exportAttempts}>{t("MCQ উত্তর", "MCQ answers")}</button></div>
      <div className="reset-row"><div><strong>{t("নতুন করে শুরু করতে চাও?", "Want to start over?")}</strong><p>সব অগ্রগতি, নোট, সেশন, নম্বর ও সেটিংস মুছে যাবে। আগে ব্যাকআপ রাখো।</p></div><button className="button danger-outline" onClick={() => confirm({ title: 'সব তথ্য মুছে নতুন শুরু করবে?', message: 'এই ব্রাউজারের সব অগ্রগতি, দিনের নোট, স্টাডি সেশন, MCQ উত্তর, পরীক্ষার নম্বর, ভুলের খাতা, লাইব্রেরি ও সেটিংস মুছে যাবে। ব্যাকআপ না থাকলে ফিরে পাওয়া যাবে না। ক্যালেন্ডারের ইভেন্ট আলাদাভাবে মুছতে হবে।', label: 'সব মুছে নতুন শুরু', danger: true, action: () => { void (async () => { const fresh = freshData(); if (!saveData(fresh, true)) { notify('তথ্য রিসেট করা যায়নি। স্টোরেজের অনুমতি ও খালি জায়গা যাচাই করো।', 'error'); return; } timer.reset(); setData(fresh); setSelectedDate(fresh.settings.startDate); void stopStudyTimerService(); void cancelTimerAlarm(); try { await Promise.race([clearDatabase(), new Promise(resolve => setTimeout(resolve, 3000))]); } catch { /* local reset is already saved */ } try { ['hsc27-focus-timer-v1', 'hsc27-focus-done-v1', 'hsc27-notified-v1', 'hsc27-study-timer-v2', 'hsc27-timer-claimed-v2', 'hsc27-revision-notified-v2', 'hsc27-exam-clock-v1', RECOVERY_KEY].forEach(key => localStorage.removeItem(key)); } catch { /* storage unavailable */ } window.location.reload(); })(); } })}><RotateCcw size={16} />{t("রিসেট করো", "Reset")}</button></div>
    </section>
    <section className="card channels-card">
      <div className="card-heading"><div><h2><Play size={20} />{t("ক্লাস কোথায় পাবে", "Where to find classes")}</h2><p>{t("প্রতিটি অধ্যায়ে এই শিক্ষকদের ক্লাসের লিংক বসানো আছে — সিলেবাস থেকে অধ্যায় খুললেই পাবে।", "Every chapter carries these teachers' class links — open a chapter from the syllabus.")}</p></div><span className="local-badge">YOUTUBE</span></div>
      <div className="channel-grid">{CHANNELS.map(channel => <a key={channel.handle} className="channel-row" href={channel.url} target="_blank" rel="noreferrer"><strong>{channel.name}</strong><span>{channel.note}</span><ArrowUpRight size={14} /></a>)}</div>
    </section>
    <section className="card sources-card"><h2>{t("সিলেবাস ও পরীক্ষার তথ্য যাচাই", "Verify syllabus & exam info")}</h2><p>অ্যাপের তালিকা সহায়ক পরিকল্পনা। তোমার পরীক্ষার বছরের সরকারি নোটিশ ও পাঠ্যবইই চূড়ান্ত।</p>{SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><div><strong>{source.name}</strong><span>{source.note}</span></div><ExternalLink size={17} /></a>)}<div className="inline-note"><CheckCircle2 size={16} /><p>কোনো অধ্যায় থেকে প্রশ্ন আসা ১০০% নিশ্চিত নয়। এই অ্যাপ ফলাফলের নিশ্চয়তা দেয় না।</p></div></section>
    <section className="card about-card"><div className="card-heading"><div><h2><Info size={20} />{t("অ্যাপের তথ্য", "About the app")}</h2><p>প্রস্তুতি · HSC 27 Study Planner · সংস্করণ ২.১৪</p></div><span className="version-badge">OFFLINE FIRST</span></div><div className="about-grid"><div><strong>{t("কী কাজ করে", "What works")}</strong><p>রুটিন, টাইমার, রিভিশন, MCQ/CQ, টেস্ট, GPA, নোট, ভিডিও লিংক, সূত্র, বোর্ড প্রশ্ন, ব্যাকআপ—সব অফলাইনে। YouTube ভিডিও দেখতে ইন্টারনেট লাগবে।</p></div><div><strong>{t("কী নেই", "What's missing")}</strong><p>লগইন, ক্লাউড সিঙ্ক, অনলাইন অ্যাকাউন্ট, পেইড API, AI সার্ভার বা সোশ্যাল ফিচার নেই। এক ডিভাইসের তথ্য অন্য ডিভাইসে নিতে JSON ব্যাকআপ ব্যবহার করো।</p></div><div><strong>{t("আপডেট", "Update")}</strong><p>একই স্বাক্ষর ও একই অ্যাপ আইডির নতুন APK আপডেট হিসেবে ইনস্টল হলে ডেটা সাধারণত থাকে। ভিন্ন স্বাক্ষরের APK ইনস্টল করতে পুরোনো অ্যাপ মুছতে হলে ডেটা হারাবে—আগে JSON ব্যাকআপ রাখো।</p></div><div><strong>{t("ভাষা / Language", "Language / ভাষা")}</strong><p>ইংরেজি মোডে অনেক নেভিগেশন ও নিয়ন্ত্রণ ইংরেজিতে দেখা যায়। কিছু লেবেল, বার্তা ও পড়ার কনটেন্ট এখনও বাংলায় থাকে।</p></div></div></section>
  </div>;
}
