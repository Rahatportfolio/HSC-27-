import { useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Bell, BellRing, CalendarDays, CheckCircle2, ChevronDown, Clock3, Info, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { usePlanner } from '../context';
import { addDays, bn, formatDate, taskStart } from '../planner';
import { revisionBuckets, revisionDueCount } from '../revision';
import { showNotification } from '../hooks';
import { isNativeApp, syncNativeReminders } from '../native';
import { PageHeading } from '../components';
import { t } from '../i18n';

export default function RemindersView() {
  const { data, setData, plan, today, notify, exportICS, navigate } = usePlanner();
  const native = isNativeApp();
  const revisionDue = revisionDueCount(data, today);
  const revisionLate = revisionBuckets(data.revisions, today).overdue.length;
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [busy, setBusy] = useState(false);
  const request = async (): Promise<boolean> => {
    if (!('Notification' in window)) { notify('এই ব্রাউজারে নোটিফিকেশন নেই। ক্যালেন্ডার রিমাইন্ডার ব্যবহার করো।', 'info'); return false; }
    if (!window.isSecureContext) { notify('নোটিফিকেশনের জন্য HTTPS দরকার। ক্যালেন্ডার এক্সপোর্ট ব্যবহার করতে পারো।', 'info'); return false; }
    setBusy(true);
    try { const p = await Notification.requestPermission(); setPermission(p); if (p === 'granted') { notify('ব্রাউজার রিমাইন্ডারের অনুমতি দেওয়া হয়েছে।'); return true; } notify('অনুমতি পাওয়া যায়নি। ব্রাউজারের site settings থেকে দিতে পারো; ক্যালেন্ডার রিমাইন্ডারও কাজ করবে।', 'info'); return false; }
    catch { notify('এই ব্রাউজারে অনুমতি চাওয়া যায়নি। ক্যালেন্ডার রিমাইন্ডার ব্যবহার করো।', 'error'); return false; }
    finally { setBusy(false); }
  };
  const toggle = async () => { if (data.settings.reminderEnabled) { setData(d => ({ ...d, settings: { ...d.settings, reminderEnabled: false } })); return; } if (permission === 'granted' || await request()) setData(d => ({ ...d, settings: { ...d.settings, reminderEnabled: true } })); };
  const test = async () => { try { await showNotification('প্রস্তুতি · রিমাইন্ডার কাজ করছে', 'এভাবেই পড়ার সেশনের আগে মনে করিয়ে দেওয়া হবে। অ্যাপ খোলা রাখতে হবে।'); notify('টেস্ট নোটিফিকেশন পাঠানো হয়েছে। ডিভাইসের নোটিফিকেশন সেটিংসও দেখো।'); } catch { notify('নোটিফিকেশন পাঠানো যায়নি। অনুমতি ও ডিভাইসের সেটিংস যাচাই করো।', 'error'); } };
  const count = (start: string, end?: string) => plan.flatMap(d => d.tasks).filter(t => !data.completed[t.id] && taskStart(t).date >= start && (!end || taskStart(t).date < end)).length;
  const ranges = [
    { id: 'day' as const, title: 'আজকের রুটিন', desc: 'শুধু আজকের বাকি সেশনগুলো', icon: Clock3, count: count(today, addDays(today, 1)), date: today },
    { id: 'week' as const, title: 'আগামী ৭ দিন', desc: 'এই সপ্তাহটা গুছিয়ে রাখো', icon: CalendarDays, count: count(today, addDays(today, 7)), date: `${today} → ${addDays(today, 6)}` },
    { id: 'all' as const, title: 'পুরো পরিকল্পনা', desc: 'শুরু থেকে শেষ পর্যন্ত সব বাকি সেশন', icon: ArrowDownToLine, count: count(plan[0].date), date: `${plan[0].date} → ${plan[plan.length - 1].date}` },
  ];
  return <div className="view reminders-view"><PageHeading eyebrow="A GENTLE NUDGE" title="পড়ার কথা মনে থাকবে।" titleEn="You won’t forget to study." description="দুইভাবে রিমাইন্ডার: ক্যালেন্ডারে অ্যালার্ম, আর অ্যাপ খোলা থাকলে ব্রাউজার নোটিফিকেশন।" descriptionEn="Device notifications in the Android app, browser notifications while the app is open, and calendar alarms." />
    {native ? <NativeReminderCard /> : <section className="card browser-reminder-card"><div className="reminder-card-main"><span className="large-icon green"><BellRing size={27} /></span><div><h2>{t("ব্রাউজার রিমাইন্ডার", "Browser reminders")}</h2><p>অ্যাপ খোলা থাকা অবস্থায় প্রতিটি সেশনের আগে মনে করিয়ে দেবে।</p><span className={`permission-status ${permission === 'granted' ? 'granted' : ''}`}><span className="status-dot" />{permission === 'granted' ? 'ব্রাউজারের অনুমতি আছে' : permission === 'denied' ? 'ব্রাউজারে অনুমতি বন্ধ আছে' : permission === 'unsupported' ? 'এই ব্রাউজারে সমর্থিত নয়' : 'এখনও অনুমতি দেওয়া হয়নি'}</span></div><button className={`switch ${data.settings.reminderEnabled ? 'on' : ''}`} role="switch" aria-checked={data.settings.reminderEnabled} aria-label={t("ব্রাউজার রিমাইন্ডার", "Browser reminders")} onClick={() => void toggle()} disabled={busy}><span /></button></div><div className="reminder-controls"><label>{t("কত মিনিট আগে?", "How many minutes before?")}<select value={data.settings.reminderLead} onChange={e => setData(d => ({ ...d, settings: { ...d.settings, reminderLead: Number(e.target.value), calendarRevision: d.settings.calendarRevision + 1 } }))}>{[0, 5, 10, 15, 30].map(n => <option key={n} value={n}>{n === 0 ? 'সেশন শুরুর সময়' : `${bn(n)} মিনিট আগে`}</option>)}</select></label><button className="button secondary" disabled={permission !== 'granted'} onClick={() => void test()}><Bell size={16} />{t("টেস্ট নোটিফিকেশন", "Test notification")}</button>{permission === 'default' && <button className="text-button" disabled={busy} onClick={() => void request()}>{t("অনুমতি দাও", "Grant permission")}<ArrowUpRight size={14} /></button>}</div><div className="inline-note"><Info size={16} /><p>অ্যাপ বা ট্যাব পুরো বন্ধ থাকলে এই ব্রাউজার রিমাইন্ডার কাজ করবে না। সেই সময়ে নিচের ক্যালেন্ডার অ্যালার্ম ব্যবহার করো।</p></div></section>}
    <section className="card revision-reminder-card"><div className="reminder-card-main"><span className="large-icon peach"><Bell size={26} /></span><div><h2>{t("রিভিশন রিমাইন্ডার", "Revision reminders")}</h2><p>রিভিশন কার্ড দরকার হলে অ্যাপ খোলা অবস্থায় দিনে একবার নোটিফিকেশন আসে। এখন {bn(revisionDue)}টি রিভিশন দরকার{revisionLate ? `, তার মধ্যে ${bn(revisionLate)}টি ওভারডিউ` : ''}।</p><span className="permission-status"><span className="status-dot" />{t("ব্রাউজার রিমাইন্ডার চালু থাকলেই কাজ করবে", "Works only while browser reminders stay on")}</span></div><button className="button secondary small" onClick={() => navigate('revision')}>{t("রিভিশন দেখো", "See revision")}<ArrowUpRight size={15} /></button></div></section>
    <div className="section-heading"><h2>{t("ক্যালেন্ডারে রিমাইন্ডার নাও", "Take the reminders into a calendar")}</h2><span>Google Calendar · Apple Calendar · Outlook</span></div><div className="export-grid">{ranges.map(r => <section className={`card export-card ${r.id === 'week' ? 'recommended' : ''}`} key={r.id}>{r.id === 'week' && <span className="recommended-label">{t("শুরু করার জন্য ভালো", "Good to start")}</span>}<span className="large-icon green"><r.icon size={24} /></span><h3>{r.title}</h3><p>{r.desc}</p><strong>{bn(r.count)}<small>{t("টি বাকি সেশন", " sessions pending")}</small></strong><span className="export-date">{r.date}</span><button className={`button ${r.id === 'week' ? 'primary' : 'secondary'} full-width`} disabled={!r.count} onClick={() => exportICS(r.id, today)}><ArrowDownToLine size={16} />{t(".ics ডাউনলোড", "Download .ics")}</button></section>)}</div>
    <section className="card import-guide"><h2><CalendarDays size={20} />{t("ক্যালেন্ডারে কীভাবে যোগ করবে?", "How do you add it to a calendar?")}</h2><details open><summary>Google Calendar <ChevronDown size={17} /></summary><ol><li>কম্পিউটারে Google Calendar খুলো। Settings → Import & export → Import।</li><li>{t("ডাউনলোড করা", "Downloaded")}<code>.ics</code> ফাইল নির্বাচন করো। চাইলে আলাদা “HSC 27” ক্যালেন্ডার তৈরি করো।</li><li>Import করো। ক্যালেন্ডারের নোটিফিকেশন চালু রাখো। ইভেন্টে {bn(data.settings.reminderLead)} মিনিট আগের অ্যালার্ম আছে; ডিফল্ট নোটিফিকেশন থাকলে সেটিও থাকতে পারে।</li></ol></details><details><summary>Apple Calendar <ChevronDown size={17} /></summary><p>Mac-এ ফাইলটি খুলে গন্তব্য ক্যালেন্ডার বেছে যোগ করো। iPhone-এ ফাইলটি Calendar-এ খুলে ইভেন্ট যোগ করো। ডিভাইসের Calendar নোটিফিকেশন অনুমতি চালু রাখো। অ্যালার্ম সাপোর্্ট ক্যালেন্ডার অ্যাপের ওপর নির্ভর করে।</p></details><details><summary>{t("Outlook ও তারিখ বদলানো", "Outlook & changing dates")}<ChevronDown size={17} /></summary><ol><li>Outlook Calendar → Add calendar → Upload from file → ফাইল নির্বাচন → Import।</li><li>রুটিনের তারিখ/সময় বদলালে নতুন ফাইল ডাউনলোড করো। একই UID থাকলে অনেক অ্যাপ আপডেট করে, তবে নিরাপদ উপায় হলো আলাদা HSC ক্যালেন্ডারের পুরোনো ইভেন্ট মুছে নতুন ফাইল ইমপোর্ট করা।</li><li>সম্পন্ন কাজ এক্সপোর্টে বাদ যায়। আগের ইমপোর্ট করা ক্যালেন্ডার নিজে থেকে আপডেট হয় না।</li></ol></details></section>
    <div className="reminder-bottom-grid"><div className="info-panel"><ShieldCheck size={22} /><p><strong>{t("সময় অঞ্চল: Asia/Dhaka (UTC+6)।", "Time zone: Asia/Dhaka (UTC+6).")}</strong> বাংলাদেশের বাইরে থাকলেও রুটিন বাংলাদেশের সময়েই দেখানো হয়। ক্যালেন্ডার স্থানীয় সময়ে রূপান্তর করে নেবে।</p></div><div className="info-panel"><MonitorSmartphone size={22} /><p><strong>{t("অ্যাপ হিসেবে রাখো।", "Keep it as an app.")}</strong> Chrome/Edge-এর Install অ্যাপ আইকন, বা Safari-এর Share → Add to Home Screen ব্যবহার করো। একবার অনলাইনে খোলার পর মূল অ্যাপ অফলাইনেও ব্যবহার করা যায়।</p></div></div><div className="view-footer"><span><CheckCircle2 size={14} />{t("ফাইল ডাউনলোড হলে ক্যালেন্ডারে ইমপোর্ট করা বাকি", "File downloaded — now import it into your calendar")}</span><span>{formatDate(today, 'long')}</span></div>
  </div>;
}

function NativeReminderCard() {
  const { data, setData, plan, today, notify } = usePlanner();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const run = async () => {
    setBusy(true);
    try {
      const result = await syncNativeReminders(plan, data, today, { requestPermission: true });
      if (result.permission === 'denied') { setStatus('অনুমতি বন্ধ'); notify('ফোনের সেটিংস থেকে এই অ্যাপের নোটিফিকেশনের অনুমতি দাও।', 'error'); return; }
      if (result.permission !== 'granted') { setStatus('অনুমতি দেওয়া হয়নি'); notify('অনুমতি ছাড়া রিমাইন্ডার সেট করা যায় না।', 'info'); return; }
      setData(current => ({ ...current, settings: { ...current.settings, reminderEnabled: true } }));
      setStatus(`${bn(result.scheduled)}টি সেট`);
      notify(`${bn(result.scheduled)}টি রিমাইন্ডার ডিভাইসে সেট হয়েছে।`);
    } catch { notify('রিমাইন্ডার সেট করা যায়নি। অ্যাপ আপডেট করে আবার চেষ্টা করো।', 'error'); }
    finally { setBusy(false); }
  };
  const disable = () => { setData(current => ({ ...current, settings: { ...current.settings, reminderEnabled: false } })); setStatus('বন্ধ'); };
  return <section className="card browser-reminder-card"><div className="reminder-card-main"><span className="large-icon green"><BellRing size={27} /></span><div><h2>{t("ডিভাইস নোটিফিকেশন", "Device notifications")}</h2><p>অ্যাপ বন্ধ থাকলেও Android ডিভাইসে সেশন ও রিভিশনের রিমাইন্ডার আসবে। পরের ১৪ দিনের রিমাইন্ডার একবারে সেট হয়।</p><span className={`permission-status ${data.settings.reminderEnabled ? 'granted' : ''}`}><span className="status-dot" />{data.settings.reminderEnabled ? `চালু${status ? ` · ${status}` : ''}` : 'এখনও সেট করা হয়নি'}</span></div><button className={`switch ${data.settings.reminderEnabled ? 'on' : ''}`} role="switch" aria-checked={data.settings.reminderEnabled} aria-label={t("ডিভাইস নোটিফিকেশন", "Device notifications")} onClick={() => data.settings.reminderEnabled ? disable() : void run()} disabled={busy}><span /></button></div><div className="reminder-controls"><button className="button secondary" disabled={busy} onClick={() => void run()}><Bell size={16} />{busy ? 'সেট হচ্ছে…' : 'এখনই সিঙ্ক করো'}</button><span className="export-date">{t("টাইমজোন: Asia/Dhaka", "Time zone: Asia/Dhaka")}</span></div><div className="inline-note"><Info size={16} /><p>ফোনের সেটিংসে ব্যাটারি অপটিমাইজেশন বন্ধ রাখলে রিমাইন্ডার সময়মতো আসে। রুটিন বদলালে আবার সিঙ্ক করো।</p></div></section>;
}
