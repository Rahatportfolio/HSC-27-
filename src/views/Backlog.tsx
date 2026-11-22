import PersonalSessionCard from '../components/PersonalSessionCard';
import { isPersonalTaskComplete } from '../personalRoutine';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Layers, ShieldAlert, Undo2 } from 'lucide-react';
import { usePlanner } from '../context';
import { subjectById, chapterById } from '../data';
import { bn, formatDate, formatDurationBn } from '../planner';
import { EmptyState, PageHeading, ProgressBar } from '../components';
import {
  BACKLOG_HORIZON_DEFAULT, applyBacklogPlan, backlogBySubject, criticalBacklog, dropBacklog,
  itemTaskIds, mergedMinutes, planBacklog, repeatedChapters,
} from '../backlog';
import { t } from '../i18n';

/**
 * Backlog manager. The page answers three questions in order:
 *   1. How much is actually pending, and is any of it A-priority?
 *   2. Where can it go without breaking the daily ceiling?
 *   3. If it cannot go anywhere — what is honestly true, and what can be let go?
 */
export default function BacklogView() {
  const { data } = usePlanner();
  return data.personalRoutine ? <PersonalBacklogView /> : <LegacyBacklogView />;
}
function PersonalBacklogView() {
  const { plan, data, today, navigate } = usePlanner();
  const pending = plan.flatMap(day => day.tasks).filter(task => (task.date < today || task.rescheduledFrom && task.rescheduledFrom < today) && !isPersonalTaskComplete(task, data.completed));
  const dates = [...new Set(pending.map(task => task.date))].sort();
  const deferred = plan.reduce((sum, day) => sum + (day.deferredMinutes || 0), 0);
  return <div className="view personal-home">
    <PageHeading eyebrow="UNFINISHED S SEGMENTS" title="আগের অংশ বাকি মানে এখনও বাকি।" titleEn="An unfinished segment is still owed."
      description="একই অধ্যায়ের পরের কাজকে আগের অসমাপ্ত কাজের বিকল্প ধরা হবে না। আগের অসমাপ্ত অংশ পরের খালি স্লটে বসে, পরের কাজকে পিছিয়ে দেয়। কোনো দিনের সময়সীমায় বাড়তি ঘণ্টা যোগ হয়নি। কেবল সত্যিই শেষ করা অংশ টিক দাও।"
      descriptionEn="Later work cannot replace a missed segment. Unfinished ranges occupy the next available slots and displace later work. No bonus hours are added to any day. Tick only the segments you actually finish."
      action={<button type="button" className="button secondary" onClick={() => navigate('settings')}>{t('নিজের সময় ও রুটিন মেলাও', 'Review availability & routine')}</button>} />
    <section className="card"><h2>{t('অসমাপ্ত কাজ', 'Unfinished work')}</h2>
      {deferred > 0 && <p className="personal-warning" role="status">{formatDurationBn(deferred)} {t('কাজ লক্ষ্য তারিখের আগে বসেনি—অসমাপ্তই আছে। সময় বাড়াও/লক্ষ্য বদলাও; সম্পন্ন ধরা হয়নি।', 'of work does not fit before the target and remains unfinished. Increase availability or revise the target; it was not counted as done.')}</p>}
      {pending.length ? <div>{dates.map(date => <PersonalSessionCard key={date} date={date} visibleTasks={pending.filter(task => task.date === date)} />)}</div> : <p>{t('অতীতের নির্ধারিত অংশে কোনো অসমাপ্ত কাজ নেই। অজানা সময়ের বা এখনও বরাদ্দ না হওয়া অধ্যায় এতে সম্পন্ন ধরা হয় না।', 'No unfinished allocated segment in the past. Unknown or unallocated chapters are not counted as complete.')}</p>}
    </section>
  </div>;
}
function LegacyBacklogView() {
  const { plan, data, setData, today, navigate, notify, confirm } = usePlanner();
  const [horizon, setHorizon] = useState(BACKLOG_HORIZON_DEFAULT);
  const backlog = useMemo(() => planBacklog(plan, data, today, { horizonDays: horizon }), [plan, data, today, horizon]);
  const critical = useMemo(() => criticalBacklog(backlog.items, data), [backlog.items, data]);
  const subjects = useMemo(() => backlogBySubject(backlog.items), [backlog.items]);
  const repeated = useMemo(() => repeatedChapters(backlog.items), [backlog.items]);
  const placedCount = backlog.days.reduce((sum, day) => sum + day.itemCount, 0);

  const place = () => {
    if (!backlog.placements.length) {
      notify(t('এই মুহূর্তে বসানোর মতো জায়গা নেই—নিচের দিনগুলোর অবস্থা দেখো।', 'No room to place anything right now — see the day list below.'), 'info');
      return;
    }
    const { data: next, placed } = applyBacklogPlan(backlog, data, plan);
    setData(next);
    notify(t(`${bn(placed)}টি সেশন পরের দিনগুলোতে ভাগ করে বসানো হয়েছে—দিনের ৮ ঘণ্টার সীমা ভাঙেনি।`, `${placed} session(s) spread onto the coming days without breaking the 8-hour ceiling.`), 'success');
  };

  const drop = (taskIds: string[], label: string) => {
    confirm({
      title: t('ছেড়ে দেবে?', 'Let it go?'),
      message: t(`“${label}” আর ব্যাকলগে থাকবে না—পুরোনো কাজের তালিকা থেকেও সরে যাবে। এটি ফেরানো যাবে না।`, `“${label}” leaves the backlog and the old plan. This cannot be undone.`),
      danger: true,
      label: t('ছেড়ে দাও', 'Let go'),
      action: () => {
        setData(current => dropBacklog(current, taskIds));
        notify(t('ছেড়ে দেওয়া হয়েছে—ব্যাকলগ হালকা হলো।', 'Let go — the backlog is lighter.'), 'success');
      },
    });
  };

  const totalHours = Math.round(backlog.totalMinutes / 6) / 10;

  return <div className="view backlog-view">
    <PageHeading
      eyebrow="WHAT HAPPENED TO THE DAYS YOU MISSED"
      title={t('জমে থাকা পড়ার হিসাব, অপরাধবোধ নয়।', 'A plan for the work you missed.')}
      titleEn="A plan for the work you missed."
      description="মিস হওয়া সেশন জমে থাকলে এখানে দেখা যাবে কতটা বাকি, কোনটা জরুরি, আর কোনটা পরের দিনগুলোর খালি জায়গায় কীভাবে ভাগ হবে—দিনের ৮ ঘণ্টার সীমা না ভেঙে।"
      descriptionEn="See what is pending, what is urgent, and how it can be spread without breaking the daily ceiling."
      action={<div className="backlog-head-stats">
        <span><Layers size={16} /><strong>{bn(backlog.items.length)}</strong>{t('সেশন', 'sessions')}</span>
        <span className={critical.length ? 'warn' : ''}><ShieldAlert size={16} /><strong>{bn(critical.length)}</strong>{t('A-প্রায়োরিটি', 'A-priority')}</span>
        <span><CalendarClock size={16} /><strong>{bn(totalHours)}</strong>{t('ঘণ্টা', 'hours')}</span>
      </div>}
    />

    {!backlog.items.length
      ? <EmptyState
          title={t('ব্যাকলগ নেই।', 'No backlog.')}
          description={t('পরিকল্পনার কোনো সেশন বাকি নেই—যেটা করার কথা ছিল, সব হয়েছে বা ছেড়ে দেওয়া হয়েছে। এটাই সবচেয়ে ভালো অবস্থা।', 'Every planned session is finished or was let go. That is the best possible state.')}
        />
      : <>
        <section className="card backlog-summary">
          <div className="backlog-summary-grid">
            <div><span>{t('মোট বাকি', 'Total pending')}</span><strong>{bn(totalHours)}<small>{t(' ঘণ্টা', ' h')}</small></strong></div>
            <div><span>{t('দিনের সীমা', 'Daily ceiling')}</span><strong>{bn(Math.round(backlog.cap / 60))}<small>{t(' ঘণ্টা', ' h')}</small></strong></div>
            <div><span>{t('এই মুহূর্তে বসানো যাবে', 'Can be placed now')}</span><strong>{bn(placedCount)}<small>{t(' ব্লক', ' blocks')}</small></strong></div>
            <div><span>{t('জায়গা নেই', 'No room yet')}</span><strong className={backlog.unplaced.length ? 'warn' : ''}>{bn(backlog.unplaced.length)}</strong></div>
          </div>
          <div className="backlog-actions">
            <button className="button primary" onClick={place} disabled={!backlog.placements.length}><Check size={16} />{t('খালি জায়গায় ভাগ করে বসাও', 'Spread into free room')}</button>
            <label>{t('কত দিনের মধ্যে', 'Within how many days')}<select value={horizon} onChange={event => setHorizon(Number(event.target.value))}>{[3, 7, 14, 30].map(days => <option key={days} value={days}>{bn(days)} {t('দিন', 'days')}</option>)}</select></label>
            <button className="button secondary" onClick={() => navigate('calendar')}>{t('প্ল্যানে দেখো', 'See on the plan')}</button>
          </div>
        </section>

        {backlog.merged.length > 0 && <section className="card">
          <div className="card-heading"><div><h2><Layers size={18} />{t('একই অধ্যায়ে মিলে গেছে', 'Already covered by the same chapter')}</h2><p>{t('এই কাজগুলো আলাদা করে বসানো হয়নি—একই অধ্যায় ইতিমধ্যে পরের দিনগুলোতে আছে, তাই আরেকবার বসালে একই পড়া দুবার হতো।', 'These were not re-scheduled because the same chapter is already on a coming day.')}</p></div><span className="tiny-muted">{bn(mergedMinutes(backlog))} {t('মিনিট', 'min')}</span></div>
          <div className="backlog-list">{backlog.merged.map(({ item, date }) => <div key={item.key} className="backlog-row merged">
            <span><strong>{item.title}</strong><small>{subjectById[item.subject].short} · {bn(item.minutes)} {t('মি.', 'min')} · {t('প্ল্যানে আছে', 'planned')} {formatDate(date)}</small></span>
            <span className="backlog-tag ok">{t('আচ্ছাদিত', 'Covered')}</span>
          </div>)}</div>
        </section>}

        <section className="card">
          <div className="card-heading"><div><h2>{t('প্রতিটি দিন কী নিতে পারে', 'What each day can take')}</h2><p>{t('প্রতিটি দিনের আগে থেকে কত মিনিট আছে, আর ব্যাকলগের জন্য কত জায়গা—সব খোলাখুলি।', 'How full each day already is, and how much it can still take.')}</p></div></div>
          <div className="backlog-days">{backlog.days.map(day => <div key={day.date} className={`backlog-day ${day.added ? 'has-room' : ''}`}>
            <span className="backlog-day-date">{day.date === today ? t('আজ', 'Today') : formatDate(day.date)}</span>
            <span className="backlog-day-bar"><ProgressBar value={Math.min(100, Math.round((day.before + day.added) / Math.max(1, day.cap) * 100))} /></span>
            <small>{bn(day.before)}/{bn(day.cap)} {t('মি.', 'min')}{day.added ? ` · +${bn(day.added)}` : ''}</small>
            {day.displaced && <span className="backlog-tag warn">{t('জায়গা হলো', 'Made room')}: {day.displacedTitle}</span>}
            {!day.displaced && day.note === 'locked' && <span className="backlog-tag">{t('লক করা দিন', 'Locked')}</span>}
            {!day.displaced && day.note === 'full' && <span className="backlog-tag">{t('পূর্ণ', 'Full')}</span>}
          </div>)}</div>
        </section>

        {subjects.length > 0 && <section className="card">
          <div className="card-heading"><div><h2>{t('কোন বিষয়ে সবচেয়ে বেশি জমেছে', 'Where the backlog sits')}</h2><p>{t('বিষয়ভিত্তিক মিনিট—যেটা সবচেয়ে বেশি, সেটাই আগে।', 'Minutes per subject, worst first.')}</p></div></div>
          <div className="backlog-subjects">{subjects.map(entry => <div key={entry.subject} className="backlog-subject">
            <span>{subjectById[entry.subject].short}</span>
            <ProgressBar value={Math.round(entry.minutes / Math.max(1, subjects[0].minutes) * 100)} color={subjectById[entry.subject].color} />
            <small>{bn(entry.minutes)} {t('মি.', 'min')} · {bn(entry.count)}</small>
          </div>)}</div>
        </section>}

        {repeated.length > 0 && <section className="card">
          <div className="card-heading"><div><h2><AlertTriangle size={18} />{t('একই অধ্যায় বারবার ফিরছে', 'The same chapters keep coming back')}</h2><p>{t('বারবার মিস হওয়া মানে দুর্বলতা, সময়ের অভাব নয়—হিটম্যাপে দেখো।', 'Repeated misses point at weakness, not just lack of time.')}</p></div><button className="text-button" onClick={() => navigate('heatmap')}>{t('হিটম্যাপে দেখো', 'Open heatmap')}</button></div>
          <div className="backlog-list">{repeated.map(entry => <div key={entry.chapterId} className="backlog-row">
            <span><strong>{chapterById[entry.chapterId]?.title ?? entry.chapterId}</strong><small>{subjectById[chapterById[entry.chapterId]?.subject ?? 'physics'].short} · {bn(entry.count)}{t(' বার', '×')} · {bn(entry.minutes)} {t('মি.', 'min')}</small></span>
            <span className={`backlog-tag ${entry.count >= 3 ? 'warn' : ''}`}>{entry.count >= 3 ? t('গুরুতর', 'Urgent') : t('খেয়াল রাখো', 'Watch')}</span>
          </div>)}</div>
        </section>}

        {backlog.unplaced.length > 0 && <section className="card backlog-unplaced">
          <div className="card-heading"><div><h2><ShieldAlert size={18} />{t('জায়গা নেই—সৎ উত্তর', 'No room — the honest answer')}</h2><p>{t('দিনগুলো আগে থেকেই ৮ ঘণ্টায় পূর্ণ (সবই A-প্রায়োরিটি), তাই নতুন কিছু বসালে সীমা ভাঙত। দুইটাই করা যায়: দিনের ঘণ্টা বাড়াও, নাকি কিছু ছেড়ে দাও।', 'Those days are already full of A-priority work, so adding more would break the ceiling. Either raise the daily hours, or let some work go.')}</p></div></div>
          <div className="backlog-list">{backlog.unplaced.map(item => <div key={item.key} className="backlog-row">
            <span><strong>{item.title}</strong><small>{subjectById[item.subject].short} · {bn(item.minutes)} {t('মি.', 'min')} · {formatDate(item.fromDate)}</small></span>
            <button className="text-button" onClick={() => drop(itemTaskIds(item), item.title)}><Undo2 size={14} />{t('ছেড়ে দাও', 'Let go')}</button>
          </div>)}</div>
          <div className="backlog-actions">
            <button className="button secondary small" onClick={() => drop(backlog.unplaced.flatMap(itemTaskIds), t('সব জায়গাহীন কাজ', 'all unplaced work'))}>{t('সব ছেড়ে দাও', 'Let all go')}</button>
            <button className="button secondary small" onClick={() => navigate('settings')}>{t('দিনের ঘণ্টা বাড়াও', 'Raise daily hours')}</button>
          </div>
        </section>}

        <section className="card">
          <div className="card-heading"><div><h2>{t('সব বাকি কাজ', 'Everything pending')}</h2><p>{t('পুরোনোটা আগে—৭ দিনের বেশি পুরোনো কাজ আলাদা করে দেখানো।', 'Oldest first; anything over a week old is flagged.')}</p></div></div>
          {backlog.buckets.map(bucket => <div key={bucket.key} className="backlog-bucket">
            <div className="backlog-bucket-head"><strong>{t(bucket.title.bn, bucket.title.en)}</strong><span>{bn(bucket.items.length)} · {bn(bucket.minutes)} {t('মি.', 'min')}</span></div>
            {bucket.items.map(item => <div key={item.taskId} className="backlog-row">
              <span><strong>{item.title}</strong><small>{subjectById[item.subject].short} · {formatDate(item.fromDate)} · {item.daysLate ? t(`${bn(item.daysLate)} দিন দেরি`, `${item.daysLate} day(s) late`) : t('আজকের বাকি', 'left from today')}</small></span>
              <span className={`backlog-tag ${item.daysLate > 7 ? 'warn' : ''}`}>{bn(item.minutes)} {t('মি.', 'min')}</span>
            </div>)}
          </div>)}
        </section>
      </>}
  </div>;
}
