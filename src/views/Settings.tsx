import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, CheckCircle2, Database, Download, ExternalLink, FileText, Info, Languages, Monitor, Moon, Palette, RotateCcw, Save, ShieldCheck, Sun, Timer } from 'lucide-react';
import { usePlanner } from '../context';
import { SOURCES, SYLLABUS_NOTE, chapterById, subjectById } from '../data';
import { freshData, todayKey } from '../planner';
import type { Settings } from '../planner';
import { downloadCsv, downloadText, makeMarkdown } from '../exports';
import { parseBackup, RECOVERY_KEY, sanitizeSettings, saveData, SAVED_AT_KEY } from '../storage';
import { clearDatabase } from '../db';
import { PageHeading } from '../components';

const BOARDS = ['সিলেট', 'ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'কুমিল্লা', 'যশোর', 'বরিশাল', 'দিনাজপুর', 'ময়মনসিংহ', 'মাদ্রাসা', 'কারিগরি'];
export default function SettingsView() {
  const { data, setData, plan, notify, confirm, setSelectedDate, setTheme } = usePlanner();
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
    const scheduleChanged = (['startDate', 'startTime', 'dailyHours'] as const).some(key => settings[key] !== data.settings[key]);
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
  const backup = () => { downloadText(JSON.stringify(data, null, 2), `prostuti-backup-${todayKey()}.json`, 'application/json;charset=utf-8'); notify('JSON ব্যাকআপ ডাউনলোড হয়েছে। নিরাপদ জায়গায় রাখো।'); };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error('ব্যাকআপটি ৮ MB-এর কম হতে হবে।');
      const parsed = parseBackup(await file.text());
      confirm({ title: 'ব্যাকআপ ফিরিয়ে আনবে?', message: 'বর্তমান অগ্রগতি, নোট, সেশন, MCQ, পরীক্ষা ও সেটিংস এই ব্যাকআপের তথ্য দিয়ে বদলে যাবে। প্রয়োজন হলে আগে বর্তমান তথ্যের ব্যাকআপ রাখো।', label: 'ব্যাকআপ ইমপোর্ট করো', action: () => { setDirty(false); setData(parsed); setSelectedDate(parsed.settings.startDate); notify('ব্যাকআপ ফিরিয়ে আনা হয়েছে।'); } });
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
      <div className="card-heading"><h2>পরিকল্পনা ও পরিচয়</h2><span className="local-badge"><ShieldCheck size={14} />শুধু এই ডিভাইসে</span></div>
      <div className="form-grid">
        <label>তোমার নাম <span className="optional">(ইচ্ছামতো)</span><input value={draft.name} maxLength={60} placeholder="কী নামে ডাকব?" onChange={e => update('name', e.target.value)} /></label>
        <label>শিক্ষা বোর্ড<select value={draft.board} onChange={e => update('board', e.target.value)}>{!BOARDS.includes(draft.board) && <option value={draft.board}>{draft.board}</option>}{BOARDS.map(board => <option key={board}>{board}</option>)}</select></label>
        <label>রুটিন শুরুর তারিখ<input type="date" required min="2020-01-01" max="2040-12-31" value={draft.startDate} onChange={e => update('startDate', e.target.value)} /><small>৩ মাস সিলেবাস → ২ মাস রিভিশন → ১ মাস মডেল টেস্ট</small></label>
        <label>প্রথম সেশনের সময়<input type="time" required value={draft.startTime} onChange={e => update('startTime', e.target.value)} /><small>বাংলাদেশ সময় (Asia/Dhaka)</small></label>
        <label>দৈনিক পড়ার লক্ষ্য<select value={draft.dailyHours} onChange={e => update('dailyHours', Number(e.target.value))}><option value={6}>৬ ঘণ্টা</option><option value={8}>৮ ঘণ্টা · প্রস্তাবিত</option><option value={10}>১০ ঘণ্টা</option></select><small>বিরতি বাদে পড়ার সময়</small></label>
        <label>HSC পরীক্ষার লক্ষ্য তারিখ<input type="date" required min="2026-01-01" max="2041-12-31" value={draft.examDate} onChange={e => update('examDate', e.target.value)} /><small>নিজের কাউন্টডাউনের জন্য; সরকারি তারিখ নয়</small></label>
        <div className="fixed-setting"><span>বিষয় ও লক্ষ্য</span><strong>বিজ্ঞান · উচ্চতর গণিত ৪র্থ বিষয়</strong><small>A+ / GPA 5.00 / Golden — লক্ষ্য, নিশ্চয়তা নয়</small></div>
      </div>
      <div className="settings-subsection"><h3><Timer size={18} />পড়ার অভ্যাস</h3><div className="form-grid">
        <label>রিভিশন কার্ড<select value={draft.revisionEnabled ? 'on' : 'off'} onChange={e => update('revisionEnabled', e.target.value === 'on')}><option value="on">অটো তৈরি হবে</option><option value="off">বন্ধ</option></select><small>অধ্যায় শেষ হলে ১/৩/৭/১৪/৩০ দিনের কার্ড</small></label>
        <label>ব্যাকলগ ক্যারিওভার<select value={draft.carryoverMode} onChange={e => update('carryoverMode', e.target.value as Settings['carryoverMode'])}><option value="manual">নিজে বেছে নেব</option><option value="auto">প্রতিদিন অটো (সর্বোচ্চ ৬টি)</option></select><small>মিস হওয়া সাম্প্রতিক সেশন আজকের তালিকায়</small></label>
        <label>পোমোডোরো ফোকাস (মিনিট)<input type="number" min={5} max={120} value={draft.pomodoroFocus} onChange={e => update('pomodoroFocus', Number(e.target.value))} /></label>
        <label>ছোট বিরতি (মিনিট)<input type="number" min={1} max={60} value={draft.pomodoroBreak} onChange={e => update('pomodoroBreak', Number(e.target.value))} /></label>
        <label>লম্বা বিরতি (মিনিট)<input type="number" min={5} max={120} value={draft.pomodoroLongBreak} onChange={e => update('pomodoroLongBreak', Number(e.target.value))} /></label>
      </div></div>
      <div className="settings-subsection"><h3><Palette size={18} />চেহারা</h3><div className="theme-picker">{(['light', 'dark', 'system'] as const).map(theme => <button type="button" key={theme} className={draft.theme === theme ? 'active' : ''} onClick={() => { update('theme', theme); setTheme(theme); }}>{theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}<span>{theme === 'light' ? 'হালকা' : theme === 'dark' ? 'গাঢ়' : 'সিস্টেম'}</span></button>)}</div><p className="tiny-muted">থিম সঙ্গে সঙ্গে বদলে যায়।</p><div className="settings-subsection language-section"><h3><Languages size={18} />ভাষা / Language</h3><div className="language-picker">{(['bn', 'en'] as const).map(language => <button type="button" key={language} className={draft.language === language ? 'active' : ''} onClick={() => update('language', language)}><strong>{language === 'bn' ? 'বাংলা' : 'English'}</strong><small>{language === 'bn' ? 'সম্পূর্ণ ইন্টারফেস' : 'Shell, dates & headings'}</small></button>)}</div><p className="tiny-muted">ইংরেজি মোডে নেভিগেশন, তারিখ, সংখ্যা ও পেজ শিরোনাম ইংরেজি হয়; অধ্যায়ের নাম ও বিস্তারিত পড়ার কনটেন্ট বাংলা থাকে। সেভ করলে প্রয়োগ হবে।</p></div></div>
      <div className="syllabus-check"><label><input type="checkbox" checked={draft.syllabusChecked} onChange={e => update('syllabusChecked', e.target.checked)} /><span><strong>আমি নিজের বই ও পরীক্ষার পাঠ্যসূচির সঙ্গে অধ্যায়গুলো মিলিয়েছি।</strong><small>টিক দিলে সিলেবাস যাচাইয়ের রিমাইন্ডার ব্যানারটি লুকাবে। অধ্যায়ের তালিকা বদলাবে না।</small></span></label><p>{SYLLABUS_NOTE}</p></div>
      <div className="form-actions"><span>তারিখ বদলালে অগ্রগতি মুছে যায় না।</span><button className="button primary" type="submit"><Save size={17} />সেভ করো</button></div>
    </form>
    <section className="card data-settings">
      <div className="card-heading"><div><h2><Database size={20} />তোমার তথ্য, তোমার কাছে</h2><p>কোনো অ্যাকাউন্ট, সার্ভার বা ক্লাউড নেই। সব তথ্য এই ডিভাইসের স্থানীয় স্টোরেজে থাকে।</p></div><span className="local-badge"><CheckCircle2 size={14} />অফলাইন</span></div>
      {recoveryRaw && <div className="notice-box"><ShieldCheck size={18} /><p><strong>আগের সেভ করা তথ্য পড়া যায়নি।</strong> সম্ভব হলে কাঁচা তথ্য রিকভারি ফাইল হিসেবে রাখা হয়েছে। নামিয়ে রাখো; পরে চাইলে ইমপোর্ট করে দেখতে পারো।</p><button className="button secondary small" onClick={() => { downloadText(recoveryRaw, `prostuti-recovery-${todayKey()}.json`, 'application/json;charset=utf-8'); notify('রিকভারি ফাইল ডাউনলোড হয়েছে।'); }}>রিকভারি ফাইল</button><button className="text-button" onClick={() => { try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ } setRecoveryRaw(null); }}>সরাও</button></div>}
      <div className="data-actions"><div><span className="large-icon green"><ArrowDownToLine size={23} /></span><h3>JSON ব্যাকআপ</h3><p>অগ্রগতি, নোট, সেশন, MCQ, পরীক্ষা ও সেটিংস—সব এক ফাইলে।</p><button className="button secondary" onClick={backup}><Download size={16} />ব্যাকআপ রাখো</button></div><div><span className="large-icon blue"><ArrowUpFromLine size={23} /></span><h3>ব্যাকআপ ইমপোর্ট</h3><p>v1 বা v2 ব্যাকআপ ফিরিয়ে আনো। পুরোনো v1 ফাইলও চলবে।</p><input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="ব্যাকআপ ফাইল" onChange={e => void importFile(e.target.files?.[0])} /><button className="button secondary" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} />ফাইল নির্বাচন</button></div><div><span className="large-icon peach"><FileText size={23} /></span><h3>Markdown পরিকল্পনা</h3><p>তারিখসহ পুরো রুটিন, অগ্রগতি, নম্বর ও ভুলের খাতা।</p><button className="button secondary" onClick={() => { downloadText(makeMarkdown(plan, data), `HSC-27-plan-${todayKey()}.md`, 'text/markdown;charset=utf-8'); notify('Markdown পরিকল্পনা ডাউনলোড হয়েছে।'); }}><FileText size={16} />.md ডাউনলোড</button></div><div><span className="large-icon lavender"><CalendarDays size={23} /></span><h3>রুটিন ও তারিখ CSV</h3><p>কাস্টম সাপ্তাহিক ব্লক ও গুরুত্বপূর্ণ তারিখের আলাদা শিট।</p><div className="data-action-buttons"><button className="button secondary" onClick={exportRoutine}><Download size={16} />রুটিন</button><button className="button secondary" onClick={exportImportantDates}><Download size={16} />তারিখ</button></div></div></div>
      <div className="csv-row"><div><strong>CSV ডেটা</strong><p>স্প্রেডশিটে বিশ্লেষণের জন্য আলাদা ফাইল।</p></div><button className="button ghost small" onClick={exportSessions}>স্টাডি সেশন</button><button className="button ghost small" onClick={exportTests}>টেস্ট</button><button className="button ghost small" onClick={exportAttempts}>MCQ উত্তর</button></div>
      <div className="reset-row"><div><strong>নতুন করে শুরু করতে চাও?</strong><p>সব অগ্রগতি, নোট, সেশন, নম্বর ও সেটিংস মুছে যাবে। আগে ব্যাকআপ রাখো।</p></div><button className="button danger-outline" onClick={() => confirm({ title: 'সব তথ্য মুছে নতুন শুরু করবে?', message: 'এই ব্রাউজারের সব অগ্রগতি, দিনের নোট, স্টাডি সেশন, MCQ উত্তর, পরীক্ষার নম্বর, ভুলের খাতা, লাইব্রেরি ও সেটিংস মুছে যাবে। ব্যাকআপ না থাকলে ফিরে পাওয়া যাবে না। ক্যালেন্ডারের ইভেন্ট আলাদাভাবে মুছতে হবে।', label: 'সব মুছে নতুন শুরু', danger: true, action: () => { void (async () => { try { await Promise.race([clearDatabase(), new Promise(resolve => setTimeout(resolve, 3000))]); } catch { /* best effort */ } const fresh = freshData(); setData(fresh); saveData(fresh); setSelectedDate(fresh.settings.startDate); try { ['hsc27-focus-timer-v1', 'hsc27-focus-done-v1', 'hsc27-notified-v1', 'hsc27-study-timer-v2', 'hsc27-timer-claimed-v2', 'hsc27-revision-notified-v2', RECOVERY_KEY, SAVED_AT_KEY].forEach(key => localStorage.removeItem(key)); } catch { /* storage unavailable */ } window.location.reload(); })(); } })}><RotateCcw size={16} />রিসেট করো</button></div>
    </section>
    <section className="card sources-card"><h2>সিলেবাস ও পরীক্ষার তথ্য যাচাই</h2><p>অ্যাপের তালিকা সহায়ক পরিকল্পনা। তোমার পরীক্ষার বছরের সরকারি নোটিশ ও পাঠ্যবইই চূড়ান্ত।</p>{SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><div><strong>{source.name}</strong><span>{source.note}</span></div><ExternalLink size={17} /></a>)}<div className="inline-note"><CheckCircle2 size={16} /><p>কোনো অধ্যায় থেকে প্রশ্ন আসা ১০০% নিশ্চিত নয়। এই অ্যাপ ফলাফলের নিশ্চয়তা দেয় না।</p></div></section>
    <section className="card about-card"><div className="card-heading"><div><h2><Info size={20} />অ্যাপের তথ্য</h2><p>প্রস্তুতি · HSC 27 Study Planner · সংস্করণ ২.৩</p></div><span className="version-badge">OFFLINE FIRST</span></div><div className="about-grid"><div><strong>কী কাজ করে</strong><p>রুটিন, টাইমার, রিভিশন, MCQ/CQ, টেস্ট, GPA, নোট, ভিডিও লিংক, সূত্র, বোর্ড প্রশ্ন, ব্যাকআপ—সব অফলাইনে। YouTube ভিডিও দেখতে ইন্টারনেট লাগবে।</p></div><div><strong>কী নেই</strong><p>লগইন, ক্লাউড সিঙ্ক, অনলাইন অ্যাকাউন্ট, পেইড API, AI সার্ভার বা সোশ্যাল ফিচার নেই। এক ডিভাইসের তথ্য অন্য ডিভাইসে নিতে JSON ব্যাকআপ ব্যবহার করো।</p></div><div><strong>আপডেট</strong><p>কোড বদলালে GitHub Actions নতুন APK তৈরি করে; GitHub Actions/Releases থেকে নতুন APK ইনস্টল করলে ফোনের ডেটা অক্ষত থাকে। JSON ব্যাকআপ রাখলে ডেটা আরও নিরাপদ।</p></div><div><strong>ভাষা / Language</strong><p>উপরে বাংলা বা English বেছে নাও। ইংরেজি মোডে নেভিগেশন, পেজ শিরোনাম, তারিখ ও সংখ্যা ইংরেজি হয়; অধ্যায়ের নাম, রুটিন ও পড়ার বিস্তারিত বর্ণনা বাংলাই থাকে।</p></div></div></section>
  </div>;
}
