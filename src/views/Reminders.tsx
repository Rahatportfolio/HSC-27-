import { isPersonalTaskComplete } from '../personalRoutine';
import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Bell, BellRing, CalendarDays, CheckCircle2, ChevronDown, Clock3, Info, MonitorSmartphone, ShieldCheck, Sparkles } from 'lucide-react';
import { usePlanner } from '../context';
import { buildDailyNotificationDigest, buildDailyStatusNotification } from '../notifications';
import { addDays, bn, formatDate, formatTime, taskStart } from '../planner';
import { revisionBuckets, revisionDueCount } from '../revision';
import { showNotification } from '../hooks';
import { type NativeNotificationStatus, isNativeApp, nativeNotificationStatus, nativeNotify, openExactAlarmSettings, requestNativeNotifications, syncNativeReminders } from '../native';
import { PageHeading } from '../components';
import { t } from '../i18n';

export default function RemindersView() {
  const { data, setData, plan, today, notify, exportICS, navigate, sendStudyStatusNotification } = usePlanner();
  const native = isNativeApp();
  const revisionDue = revisionDueCount(data, today);
  const revisionLate = revisionBuckets(data.revisions, today).overdue.length;
  const digest = buildDailyNotificationDigest(plan, data, today);
  const statusPreview = buildDailyStatusNotification(plan, data, today);
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [busy, setBusy] = useState(false);
  const request = async (): Promise<boolean> => {
    if (!('Notification' in window)) { notify(t('এই ব্রাউজারে নোটিফিকেশন নেই। ক্যালেন্ডার রিমাইন্ডার ব্যবহার করো।', 'This browser has no notifications. Use calendar reminders.'), 'info'); return false; }
    if (!window.isSecureContext) { notify(t('নোটিফিকেশনের জন্য HTTPS দরকার। ক্যালেন্ডার এক্সপোর্ট ব্যবহার করতে পারো।', 'Notifications need HTTPS. You can use the calendar export instead.'), 'info'); return false; }
    setBusy(true);
    try { const p = await Notification.requestPermission(); setPermission(p); if (p === 'granted') { notify(t('ব্রাউজার রিমাইন্ডারের অনুমতি দেওয়া হয়েছে।', 'Browser reminder permission granted.')); return true; } notify(t('অনুমতি পাওয়া যায়নি। ব্রাউজারের site settings থেকে দিতে পারো; ক্যালেন্ডার রিমাইন্ডারও কাজ করবে।', 'Permission was not granted. You can allow it in the browser site settings; calendar reminders still work.'), 'info'); return false; }
    catch { notify(t('এই ব্রাউজারে অনুমতি চাওয়া যায়নি। ক্যালেন্ডার রিমাইন্ডার ব্যবহার করো।', 'This browser could not ask for permission. Use calendar reminders.'), 'error'); return false; }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    if (data.settings.reminderEnabled) { setData(d => ({ ...d, settings: { ...d.settings, reminderEnabled: false } })); return; }
    if (permission === 'granted' || await request()) {
      setData(d => ({ ...d, settings: { ...d.settings, reminderEnabled: true } }));
      const latest = buildDailyStatusNotification(plan, data, today);
      try { await showNotification(latest.title, latest.body, { tag: 'prostuti-daily-progress' }); } catch { /* ignore */ }
    }
  };
  const test = async () => {
    try {
      const latest = buildDailyStatusNotification(plan, data, today);
      await showNotification(latest.title, latest.body, { tag: 'prostuti-daily-progress' });
      notify(t('আজকের কী পড়া, মোট সময় ও কমপ্লিট করার বাকি অংশসহ নোটিফিকেশন পাঠানো হয়েছে!', 'Notification sent with today’s study list, total time and what is left!'));
    } catch {
      notify(t('নোটিফিকেশন পাঠানো যায়নি। অনুমতি ও ডিভাইসের সেটিংস যাচাই করো।', 'The notification could not be sent. Check permission and device settings.'), 'error');
    }
  };
  const sendNow = async () => {
    const ok = await sendStudyStatusNotification?.(today);
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    if (!ok && permission === 'granted') void test();
  };
  const count = (start: string, end?: string) => plan.flatMap(d => d.tasks).filter(t => !isPersonalTaskComplete(t, data.completed) && taskStart(t).date >= start && (!end || taskStart(t).date < end)).length;
  // "0 pending today" is ambiguous: it can mean "finished" or "the next session is
  // later". Name the next real session so the empty number is never a dead end.
  const pendingSessions = plan.flatMap(day => day.tasks).filter(task => !isPersonalTaskComplete(task, data.completed))
    .sort((a, b) => taskStart(a).date.localeCompare(taskStart(b).date) || a.startMinute - b.startMinute);
  const nextSession = pendingSessions[0];
  const ranges = [
    { id: 'day' as const, title: t('আজকের রুটিন', 'Today’s routine'), desc: t('শুধু আজকের বাকি সেশনগুলো', 'Only today’s remaining sessions'), icon: Clock3, count: count(today, addDays(today, 1)), date: today },
    { id: 'week' as const, title: t('আগামী ৭ দিন', 'Next 7 days'), desc: t('এই সপ্তাহটা গুছিয়ে রাখো', 'Keep this week organised'), icon: CalendarDays, count: count(today, addDays(today, 7)), date: `${today} → ${addDays(today, 6)}` },
    { id: 'all' as const, title: t('পুরো পরিকল্পনা', 'Whole plan'), desc: t('শুরু থেকে শেষ পর্যন্ত সব বাকি সেশন', 'Every remaining session, start to finish'), icon: ArrowDownToLine, count: plan.length ? count(plan[0].date) : 0, date: plan.length ? `${plan[0].date} → ${plan[plan.length - 1].date}` : t('এখনও রুটিন বরাদ্দ হয়নি', 'No routine allocated yet') },
  ];
  return <div className="view reminders-view"><PageHeading eyebrow="A GENTLE NUDGE" title="পড়ার কথা মনে থাকবে।" titleEn="You won’t forget to study." description="প্রতিটি নোটিফিকেশনেই থাকবে আজ কী পড়া, মোট কতটুকু পড়া এবং আর কতটুকু কমপ্লিট করা লাগবে।" descriptionEn="Every notification tells you what to study today, total scheduled time, and how much still needs to be completed." />
    <section className="card live-notif-preview-card" aria-label={t('স্টাডি নোটিফিকেশন প্রিভিউ', 'Study notification preview')}>
      <div className="live-notif-header">
        <div>
          <span className="eyebrow"><Sparkles size={13} /> {t('স্মার্ট স্টাডি ডাইজেস্ট নোটিফিকেশন', 'SMART STUDY DIGEST NOTIFICATION')}</span>
          <h2>{t('নোটিফিকেশনেই সম্পূর্ণ হিসাব', 'Everything inside your notification')}</h2>
          <p>{t('সকালের ব্রিফিং, সেশন শুরুর আগে, পড়া টিক দেওয়ার সাথে সাথে এবং রাত ৮টায় — সব নোটিফিকেশনে নিচের তথ্যগুলো অটো আপডেট হয়ে আসবে।', 'Morning briefing, pre-session alerts, live completion updates, and 8 PM evening check-ins all include this full study breakdown.')}</p>
        </div>
        <button type="button" className="button primary" onClick={() => void sendNow()}>
          <BellRing size={16} />{t('এখনই নোটিফিকেশনে পাঠাও', 'Send notification now')}
        </button>
      </div>
      <div className="os-notif-mockup">
        <div className="os-notif-top">
          <span className="os-notif-app">{t('প্রস্তুতি · HSC ’27 স্টাডি রিমাইন্ডার', 'Prostuti · HSC ’27 Study Reminder')}</span>
          <span className="os-notif-time">{t('এখন · লাইভ প্রিভিউ', 'Now · Live preview')}</span>
        </div>
        <strong className="os-notif-title">{statusPreview.title}</strong>
        <div className="os-notif-grid">
          <div className="os-notif-item">
            <span>{t('আজ কী পড়া', 'What to study today')}</span>
            <strong>{digest.whatToStudy}</strong>
          </div>
          <div className="os-notif-item">
            <span>{t('কতটুকু পড়া (মোট)', 'Total scheduled study')}</span>
            <strong>{digest.totalSummary}</strong>
          </div>
          <div className="os-notif-item">
            <span>{t('সম্পন্ন হয়েছে', 'Completed so far')}</span>
            <strong>{digest.completedSummary}</strong>
          </div>
          <div className="os-notif-item highlight">
            <span>{t('কতটুকু কমপ্লিট করা লাগবে', 'Still needed to complete')}</span>
            <strong>{digest.remainingSummary}</strong>
            {digest.remainingTitles.length > 0 && <small>{digest.remainingTitles.join(' · ')}</small>}
          </div>
        </div>
        {digest.pastUnfinishedCount > 0 && (
          <div className="os-notif-past">
            {t(`আগের দিনের অসমাপ্ত বাকি: ${bn(digest.pastUnfinishedCount)}টি সেশন (${digest.pastUnfinishedSummary})`, `Earlier unfinished: ${digest.pastUnfinishedCount} sessions (${digest.pastUnfinishedSummary})`)}
          </div>
        )}
      </div>
      <div className="notif-schedule-chips">
        <span><CheckCircle2 size={14} />{t('১. সকালের ডেইলি ব্রিফিং', '1. Morning daily briefing')}</span>
        <span><CheckCircle2 size={14} />{t('২. প্রতিটি সেশন শুরুর আগে', '2. Before every session')}</span>
        <span><CheckCircle2 size={14} />{t('৩. পড়া সম্পন্ন করলে লাইভ আপডেট', '3. Live update on task tick')}</span>
        <span><CheckCircle2 size={14} />{t('৪. রাত ৮টায় বাকি পড়ার রিমাইন্ডার', '4. 8 PM remaining study check-in')}</span>
      </div>
    </section>
    {native ? <NativeReminderCard /> : <section className="card browser-reminder-card"><div className="reminder-card-main"><span className="large-icon green"><BellRing size={27} /></span><div><h2>{t("ব্রাউজার রিমাইন্ডার", "Browser reminders")}</h2><p>{t('অ্যাপ খোলা থাকা অবস্থায় প্রতিটি সেশনের আগে মনে করিয়ে দেবে।', 'While the app stays open, you get a reminder before each session.')}</p><span className={`permission-status ${permission === 'granted' ? 'granted' : ''}`}><span className="status-dot" />{permission === 'granted' ? t('ব্রাউজারের অনুমতি আছে', 'Browser permission granted') : permission === 'denied' ? t('ব্রাউজারে অনুমতি বন্ধ আছে', 'Browser permission blocked') : permission === 'unsupported' ? t('এই ব্রাউজারে সমর্থিত নয়', 'Not supported in this browser') : t('এখনও অনুমতি দেওয়া হয়নি', 'Permission not given yet')}</span></div><button className={`switch ${data.settings.reminderEnabled ? 'on' : ''}`} role="switch" aria-checked={data.settings.reminderEnabled} aria-label={t("ব্রাউজার রিমাইন্ডার", "Browser reminders")} onClick={() => void toggle()} disabled={busy}><span /></button></div><div className="reminder-controls"><label>{t("কত মিনিট আগে?", "How many minutes before?")}<select value={data.settings.reminderLead} onChange={e => setData(d => ({ ...d, settings: { ...d.settings, reminderLead: Number(e.target.value), calendarRevision: d.settings.calendarRevision + 1 } }))}>{[0, 5, 10, 15, 30].map(n => <option key={n} value={n}>{n === 0 ? t('সেশন শুরুর সময়', 'At session start') : `${bn(n)} ${t('মিনিট আগে', 'minutes before')}`}</option>)}</select></label><button className="button secondary" disabled={permission !== 'granted'} onClick={() => void test()}><Bell size={16} />{t("টেস্ট নোটিফিকেশন", "Test notification")}</button>{permission === 'default' && <button className="text-button" disabled={busy} onClick={() => void request()}>{t("অনুমতি দাও", "Grant permission")}<ArrowUpRight size={14} /></button>}</div><div className="inline-note"><Info size={16} /><p>{t('অ্যাপ বা ট্যাব পুরো বন্ধ থাকলে এই ব্রাউজার রিমাইন্ডার কাজ করবে না। সেই সময়ে নিচের ক্যালেন্ডার অ্যালার্ম ব্যবহার করো।', 'If the app or tab is fully closed, browser reminders will not fire. Use the calendar alarms below for those times.')}</p></div></section>}
    <section className="card revision-reminder-card"><div className="reminder-card-main"><span className="large-icon peach"><Bell size={26} /></span><div><h2>{t("রিভিশন রিমাইন্ডার", "Revision reminders")}</h2><p>{t('রিভিশন কার্ড দরকার হলে অ্যাপ খোলা অবস্থায় দিনে একবার নোটিফিকেশন আসে।', 'While the app stays open you get one notification a day when revision cards are due.')} {t('এখন', 'Right now')} {bn(revisionDue)}{t('টি রিভিশন দরকার', 'revisions are due')}{revisionLate ? `, ${bn(revisionLate)} ${t('টি ওভারডিউ', 'overdue')}` : ''}।</p><span className="permission-status"><span className="status-dot" />{t("ব্রাউজার রিমাইন্ডার চালু থাকলেই কাজ করবে", "Works only while browser reminders stay on")}</span></div><button className="button secondary small" onClick={() => navigate('revision')}>{t("রিভিশন দেখো", "See revision")}<ArrowUpRight size={15} /></button></div></section>
    <div className="section-heading"><h2>{t("ক্যালেন্ডারে রিমাইন্ডার নাও", "Take the reminders into a calendar")}</h2><span>Google Calendar · Apple Calendar · Outlook</span></div><div className="export-grid">{ranges.map(r => <section className={`card export-card ${r.id === 'week' ? 'recommended' : ''}`} key={r.id}>{r.id === 'week' && <span className="recommended-label">{t("শুরু করার জন্য ভালো", "Good to start")}</span>}<span className="large-icon green"><r.icon size={24} /></span><h3>{r.title}</h3><p>{r.desc}</p><strong>{bn(r.count)}<small>{t("টি বাকি সেশন", " sessions pending")}</small></strong>{r.id === 'day' && !r.count && nextSession && <p className="tiny-muted">{t('আজ আর কিছু নেই। পরের সেশন: ', 'Nothing left today. Next session: ')}{formatDate(taskStart(nextSession).date, 'long')} · {formatTime(taskStart(nextSession).minute)}</p>}<span className="export-date">{r.date}</span><button className={`button ${r.id === 'week' ? 'primary' : 'secondary'} full-width`} disabled={!r.count} onClick={() => exportICS(r.id, today)}><ArrowDownToLine size={16} />{t(".ics ডাউনলোড", "Download .ics")}</button></section>)}</div>
    <section className="card import-guide"><h2><CalendarDays size={20} />{t("ক্যালেন্ডারে কীভাবে যোগ করবে?", "How do you add it to a calendar?")}</h2><details open><summary>Google Calendar <ChevronDown size={17} /></summary><ol><li>{t('কম্পিউটারে Google Calendar খুলো। Settings → Import & export → Import।', 'On a computer, open Google Calendar. Settings → Import & export → Import.')}</li><li>{t("ডাউনলোড করা", "Downloaded")}<code>.ics</code>{t(' ফাইল নির্বাচন করো। চাইলে আলাদা “HSC 27” ক্যালেন্ডার তৈরি করো।', ' Choose the file. Optionally create a separate “HSC 27” calendar.')}</li><li>{t('Import করো। ক্যালেন্ডারের নোটিফিকেশন চালু রাখো।', 'Import it. Keep calendar notifications on.')} {t('ইভেন্টে', 'Each event has an alarm')} {bn(data.settings.reminderLead)} {t('মিনিট আগে', 'minutes before')}; {t('ডিফল্ট নোটিফিকেশন থাকলে সেটিও থাকতে পারে।', 'default notifications may also appear.')}</li></ol></details><details><summary>Apple Calendar <ChevronDown size={17} /></summary><p>{t('Mac-এ ফাইলটি খুলে গন্তব্য ক্যালেন্ডার বেছে যোগ করো। iPhone-এ ফাইলটি Calendar-এ খুলে ইভেন্ট যোগ করো। ডিভাইসের Calendar নোটিফিকেশন অনুমতি চালু রাখো। অ্যালার্ম সাপোর্্ট ক্যালেন্ডার অ্যাপের ওপর নির্ভর করে।', 'On a Mac, open the file and choose the destination calendar. On iPhone, open it in Calendar and add the events. Keep calendar notifications allowed. Alarm support depends on the calendar app.')}</p></details><details><summary>{t("Outlook ও তারিখ বদলানো", "Outlook & changing dates")}<ChevronDown size={17} /></summary><ol><li>{t('Outlook Calendar → Add calendar → Upload from file → ফাইল নির্বাচন → Import।', 'Outlook Calendar → Add calendar → Upload from file → Choose file → Import.')}</li><li>{t('রুটিনের তারিখ/সময় বদলালে নতুন ফাইল ডাউনলোড করো। একই UID থাকলে অনেক অ্যাপ আপডেট করে, তবে নিরাপদ উপায় হলো আলাদা HSC ক্যালেন্ডারের পুরোনো ইভেন্ট মুছে নতুন ফাইল ইমপোর্ট করা।', 'Download a fresh file whenever routine dates or times change. Many apps update events that share a UID, but the safe route is to delete the old events from your HSC calendar and import the new file.')}</li><li>{t('সম্পন্ন কাজ এক্সপোর্টে বাদ যায়। আগের ইমপোর্ট করা ক্যালেন্ডার নিজে থেকে আপডেট হয় না।', 'Completed work is left out of the export. A previously imported calendar does not update itself.')}</li></ol></details></section>
    <div className="reminder-bottom-grid"><div className="info-panel"><ShieldCheck size={22} /><p><strong>{t("সময় অঞ্চল: Asia/Dhaka (UTC+6)।", "Time zone: Asia/Dhaka (UTC+6).")}</strong>{t(' বাংলাদেশের বাইরে থাকলেও রুটিন বাংলাদেশের সময়েই দেখানো হয়। ক্যালেন্ডার স্থানীয় সময়ে রূপান্তর করে নেবে।', ' The routine is always shown in Bangladesh time even if you are abroad. Your calendar converts it to local time.')}</p></div><div className="info-panel"><MonitorSmartphone size={22} /><p><strong>{t("অ্যাপ হিসেবে রাখো।", "Keep it as an app.")}</strong>{t(' Chrome/Edge-এর Install অ্যাপ আইকন, বা Safari-এর Share → Add to Home Screen ব্যবহার করো। একবার অনলাইনে খোলার পর মূল অ্যাপ অফলাইনেও ব্যবহার করা যায়।', ' Use the Install app icon in Chrome/Edge, or Share → Add to Home Screen in Safari. After one online visit the app also works offline.')}</p></div></div><div className="view-footer"><span><CheckCircle2 size={14} />{t("ফাইল ডাউনলোড হলে ক্যালেন্ডারে ইমপোর্ট করা বাকি", "File downloaded — now import it into your calendar")}</span><span>{formatDate(today, 'long')}</span></div>
  </div>;
}

function NativeReminderCard() {
  const { data, setData, plan, today, notify } = usePlanner();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState<NativeNotificationStatus | null>(null);
  const refresh = async () => setHealth(await nativeNotificationStatus());
  useEffect(() => { void refresh(); }, []);

  const run = async () => {
    setBusy(true);
    try {
      const permission = await requestNativeNotifications();
      await refresh();
      if (permission === 'denied') { notify(t('ফোনের সেটিংস → Apps → প্রস্তুতি → Notifications থেকে অনুমতি দাও।', 'Allow it from phone Settings → Apps → Prostuti → Notifications.'), 'error'); setStatus(t('অনুমতি বন্ধ', 'Permission blocked')); return; }
      if (permission !== 'granted') { notify(t('অনুমতি ছাড়া রিমাইন্ডার সেট করা যায় না।', 'A reminder cannot be set without permission.'), 'info'); setStatus(t('অনুমতি দেওয়া হয়নি', 'Permission not given')); return; }
      const result = await syncNativeReminders(plan, { ...data, settings: { ...data.settings, reminderEnabled: true } }, today, { requestPermission: true });
      if (result.permission !== 'granted') { setStatus(t('অনুমতি দেওয়া হয়নি', 'Permission not given')); notify(t('রিমাইন্ডার সেট করা যায়নি—অনুমতি দরকার।', 'The reminder could not be set — permission is needed.'), 'info'); return; }
      setData(current => ({ ...current, settings: { ...current.settings, reminderEnabled: true } }));
      setStatus(`${bn(result.scheduled)}টি সেট`);
      notify(result.scheduled
        ? `${bn(result.scheduled)}টি রিমাইন্ডার ডিভাইসে সেট হয়েছে।`
        : 'এই ১৪ দিনে নতুন রিমাইন্ডার নেই—সব সেশন তো আগেই সেট করা আছে।', 'success');
    } catch { notify(t('রিমাইন্ডার সেট করা যায়নি। অ্যাপ আপডেট করে আবার চেষ্টা করো।', 'The reminder could not be set. Update the app and try again.'), 'error'); }
    finally { setBusy(false); void refresh(); }
  };
  const disable = () => { setData(current => ({ ...current, settings: { ...current.settings, reminderEnabled: false } })); setStatus(t('বন্ধ', 'Off')); };
  const test = async () => {
    const latest = buildDailyStatusNotification(plan, data, today);
    const sent = await nativeNotify(latest.title, latest.body);
    notify(sent
      ? 'আজকের কী পড়া, মোট সময় ও কমপ্লিট করার বাকি অংশসহ নোটিফিকেশন পাঠানো হয়েছে!'
      : 'নোটিফিকেশন পাঠানো যায়নি—অনুমতি বা চ্যানেল নেই। উপরের সুইচ চালু করে আবার চেষ্টা করো।', sent ? 'success' : 'error');
    void refresh();
  };
  const permissionLabel = health === null ? 'দেখা হচ্ছে…'
    : health.permission === 'granted' ? 'অনুমতি আছে'
    : health.permission === 'denied' ? 'ফোনের সেটিংসে বন্ধ'
    : health.permission === 'unavailable' ? 'এই ডিভাইসে পাওয়া যায়নি'
    : 'অনুমতি দেওয়া হয়নি';
  const exactOff = health?.exact === 'denied';

  return <section className="card browser-reminder-card">
    <div className="reminder-card-main"><span className="large-icon green"><BellRing size={27} /></span><div><h2>{t("ডিভাইস নোটিফিকেশন", "Device notifications")}</h2><p>{t('অ্যাপ বন্ধ থাকলেও Android ফোনে সেশন, রিভিশন আর টাইমার শেষের অ্যালার্ম আসবে। পরের ১৪ দিনের রিমাইন্ডার একবারে সেট হয়।', 'On an Android phone the session, revision and timer-end alarms still arrive with the app closed. The next 14 days of reminders are set at once.')}</p><span className={`permission-status ${health?.permission === 'granted' ? 'granted' : ''}`}><span className="status-dot" />{permissionLabel}{data.settings.reminderEnabled && status ? ` · ${status}` : ''}</span></div><button className={`switch ${data.settings.reminderEnabled ? 'on' : ''}`} role="switch" aria-checked={data.settings.reminderEnabled} aria-label={t("ডিভাইস নোটিফিকেশন", "Device notifications")} onClick={() => data.settings.reminderEnabled ? disable() : void run()} disabled={busy}><span /></button></div>
    <div className="reminder-controls">
      <button className="button secondary" disabled={busy} onClick={() => void run()}><Bell size={16} />{busy ? 'সেট হচ্ছে…' : 'এখনই সিঙ্ক করো'}</button>
      <button className="button secondary" disabled={busy} onClick={() => void test()}><BellRing size={16} />{t("টেস্ট নোটিফিকেশন", "Test notification")}</button>
      {exactOff && <button className="text-button" onClick={() => void openExactAlarmSettings()}><ArrowUpRight size={14} />{t("সঠিক অ্যালার্ম চালু করো", "Allow exact alarms")}</button>}
      <span className="export-date">{t("টাইমজোন: Asia/Dhaka", "Time zone: Asia/Dhaka")}</span>
    </div>
    <div className="inline-note"><Info size={16} /><p>{exactOff
      ? 'ফোন "Alarms & reminders" বন্ধ রেখেছে—টাইমার শেষের অ্যালার্ম কয়েক মিনিট দেরিতে আসতে পারে। উপরের বোতাম চেপে চালু করো।'
      : 'ফোনের সেটিংসে ব্যাটারি অপটিমাইজেশন বন্ধ রাখলে রিমাইন্ডার সময়মতো আসে। রুটিন বদলালে আবার সিঙ্ক করো।'}</p></div>
  </section>;
}
