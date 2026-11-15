import { useMemo, useState } from 'react';
import { AlarmClock, CalendarClock, Check, CheckCheck, ChevronRight, Clock3, RotateCcw, Timer, Undo2 } from 'lucide-react';
import { usePlanner } from '../context';
import { chapterById } from '../data';
import { addDays, bn, diffDays, formatDate } from '../planner';
import { INTERVAL_LABEL, RECALL_HINT, RECALL_LABEL, completeRevision, completeRevisionWithRecall, recallSummary, reopenRevision, revisionBuckets, snoozeRevision } from '../revision';
import type { RecallRating, RevisionItem } from '../types';
import { EmptyState, PageHeading, ProgressBar, SubjectBadge, ClassLinkRow } from '../components';
import { CHAPTER_CLASSES } from '../classLinks';
import { t } from '../i18n';

type Tab = 'due' | 'upcoming' | 'history' | 'all';
export default function RevisionView() {
  const { data, setData, today, openChapter, startTimer, notify, confirm, navigate } = usePlanner();
  const [tab, setTab] = useState<Tab>('due');
  const buckets = useMemo(() => revisionBuckets(data.revisions, today), [data.revisions, today]);
  const due = [...buckets.overdue, ...buckets.today].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const allPending = [...due, ...buckets.upcoming].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const weekAhead = data.revisions.filter(item => !item.completedAt && item.dueDate > addDays(today, 7) && item.dueDate <= addDays(today, 30));
  const totalPending = data.revisions.filter(item => !item.completedAt).length;
  const doneCount = data.revisions.filter(item => !!item.completedAt).length;
  const completion = data.revisions.length ? Math.round(doneCount / data.revisions.length * 100) : 0;
  const recall = recallSummary(data.revisions, today);
  /** Rating the recall is what moves the next card: weak → tomorrow, okay → 3 days. */
  const rate = (item: RevisionItem, rating: RecallRating) => {
    const outcome = completeRevisionWithRecall(data, item.id, rating, today);
    setData(() => outcome.data);
    notify(outcome.dueDate ? `“${RECALL_LABEL[rating]}” — ${RECALL_HINT[rating]}` : `${RECALL_LABEL[rating]} — পরের কার্ড নিজের সময়েই থাকল।`, rating === 'weak' ? 'info' : 'success');
  };
  const open = (chapterId: string) => { const chapter = chapterById[chapterId]; if (chapter) openChapter(chapter); };
  const finishAll = () => confirm({ title: 'আজকের সব রিভিশন সম্পন্ন?', message: `${bn(due.length)}টি রিভিশন একসাথে সম্পন্ন হিসেবে চিহ্নিত হবে। সত্যিই ঝালাই করা হলে তবেই টিক দাও।`, label: 'সব সম্পন্ন করো', action: () => { setData(d => due.reduce((next, item) => completeRevision(next, item.id), d)); notify(`${bn(due.length)}টি রিভিশন সম্পন্ন হয়েছে।`, 'success'); } });
  return <div className="view revision-view">
    <PageHeading eyebrow="MAKE IT STICK" title="ভুলে যাওয়ার আগেই ঝালাই।" titleEn="Review before you forget." description="প্রতিটি অধ্যায় শেষ হলে ১, ৩, ৭, ১৪ ও ৩০ দিনের রিভিশন কার্ড নিজে থেকেই তৈরি হয়। আজ যা দরকার, সেটাই আগে।" descriptionEn="Finishing a chapter creates 1, 3, 7, 14 and 30-day revision cards. Today’s due cards come first." action={<button className="button secondary" onClick={() => navigate('settings')}><AlarmClock size={17} />{t("রিভিশন সেটিংস", "Revision settings")}</button>} />
    <div className="revision-overview">
      <section className="card revision-hero-card"><div><span className="eyebrow">{t("আজকের রিভিশন", "Today's revision")}</span><strong className="revision-big-number">{bn(due.length)}</strong><p>{buckets.overdue.length ? `${bn(buckets.overdue.length)}টি ওভারডিউ · ` : ''}{bn(totalPending)}টি মোট বাকি</p></div><div className="revision-ring-short"><ProgressBar value={completion} /><span>সব রিভিশনের {bn(completion)}% সম্পন্ন</span></div>{due.length > 0 && <button className="button primary" onClick={finishAll}><CheckCheck size={17} />{t("সব সম্পন্ন", "All done")}</button>}</section>
      <div className="revision-stat"><span className="stat-icon peach"><AlarmClock size={19} /></span><div><span>{t("ওভারডিউ", "Overdue")}</span><strong>{bn(buckets.overdue.length)}</strong><p>{t("আজ বা আগের", "Today or earlier")}</p></div></div>
      <div className="revision-stat"><span className="stat-icon green"><CalendarClock size={19} /></span><div><span>{t("আগামী ৭ দিন", "Next 7 days")}</span><strong>{bn(buckets.upcoming.length)}</strong><p>{t("পরিকল্পিত", "Planned")}</p></div></div>
      <div className="revision-stat"><span className="stat-icon lavender"><Check size={19} /></span><div><span>{t("সম্পন্ন", "Done")}</span><strong>{bn(doneCount)}</strong><p>{t("সর্বকালীন", "All time")}</p></div></div>
    </div>
    <div className="revision-how card"><Clock3 size={19} /><div><strong>{t("কীভাবে কাজ করে", "How it works")}</strong><p>অধ্যায়ের সব ধাপ শেষ হলে সেই দিন থেকে ১, ৩, ৭, ১৪ ও ৩০ দিন পরের তারিখে রিভিশন কার্ড তৈরি হয়। এখন প্রতিটি কার্ডে “ভুলে গেছি / মোটামুটি / মনে ছিল” বেছে নাও—ভুলে গেলে পরের কার্ড কালই, মোটামুটি হলে তিন দিন পর, মনে থাকলে নিজের সময়েই। অধ্যায় আবার অসম্পূর্ণ করলে শুধু বাকি কার্ডগুলো সরে যায়; সম্পন্ন ইতিহাস থাকে।</p></div>{recall.rated > 0 && <div className="recall-summary"><strong>{bn(recall.good)}</strong><span>{t("মনে ছিল", "Remembered")}</span><strong>{bn(recall.okay)}</strong><span>{t("মোটামুটি", "Okay")}</span><strong>{bn(recall.weak)}</strong><span>{t("ভুলে গেছি", "Forgot")}</span><small>৪৫ দিনে {bn(recall.rated)}টি রেটিং · স্মৃতি স্কোর {bn(recall.score)}%</small></div>}</div>
    <div className="filter-bar revision-tabs"><div className="segmented">{(['due', 'upcoming', 'all', 'history'] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'due' ? `আজ দরকার (${bn(due.length)})` : item === 'upcoming' ? `আগামী ৭ দিন (${bn(buckets.upcoming.length)})` : item === 'all' ? `সব বাকি (${bn(allPending.length)})` : `ইতিহাস (${bn(doneCount)})`}</button>)}</div></div>
    {tab === 'due' && due.length > 0 && <div className="revision-list">{due.map(item => <RevisionCard key={item.id} item={item} today={today} onRate={rate} onSnooze={() => { setData(d => snoozeRevision(d, item.id, today, 1)); notify('আগামীকালের জন্য সরানো হয়েছে।', 'info'); }} onOpen={() => open(item.chapterId)} onTimer={() => startTimer(item.subject, item.chapterId)} />)}</div>}
    {tab === 'upcoming' && (buckets.upcoming.length ? <div className="revision-list">{buckets.upcoming.map(item => <RevisionCard key={item.id} item={item} today={today} onRate={rate} onSnooze={() => setData(d => snoozeRevision(d, item.id, today, 1))} onOpen={() => open(item.chapterId)} onTimer={() => startTimer(item.subject, item.chapterId)} />)}</div> : <EmptyState title={t("আগামী ৭ দিনে রিভিশন নেই", "No revision in the next 7 days")} description="নতুন অধ্যায় শেষ করলে কার্ড নিজে থেকেই তৈরি হবে।" action={<button className="button secondary" onClick={() => navigate('syllabus')}>{t("সিলেবাসে যাও", "Go to syllabus")}</button>} />)}
    {tab === 'all' && (allPending.length ? <div className="revision-list">{allPending.map(item => <RevisionCard key={item.id} item={item} today={today} onRate={rate} onSnooze={() => setData(d => snoozeRevision(d, item.id, today, 1))} onOpen={() => open(item.chapterId)} onTimer={() => startTimer(item.subject, item.chapterId)} />)}</div> : <EmptyState title={t("কোনো বাকি রিভিশন নেই", "No revision pending")} description="চমৎকার! নতুন অধ্যায় শেষ করে পরের রিভিশন কার্ড তৈরি করো।" />)}
    {tab === 'history' && (buckets.completed.length ? <section className="card revision-history"><div className="card-heading"><div><h2>{t("রিভিশন ইতিহাস", "Revision history")}</h2><p>সর্বশেষ সম্পন্ন রিভিশন আগে। ভুলে গেলে আবার খুলে দিতে পারো।</p></div><span className="tiny-muted">{bn(buckets.completed.length)}টি</span></div><div className="history-list">{buckets.completed.slice(0, 60).map(item => <div key={item.id} className="history-row"><span className="history-check"><Check size={14} /></span><div><strong>{chapterById[item.chapterId]?.title || 'অধ্যায়'}</strong><span>{INTERVAL_LABEL[item.interval]} রিভিশন · নির্ধারিত ছিল {formatDate(item.dueDate)} · সম্পন্ন {item.completedAt ? formatDate(item.completedAt.slice(0, 10)) : '—'}{item.recall ? ` · মনে ছিল: ${RECALL_LABEL[item.recall]}` : ''}{item.adjusted ? ' · তারিখ নিজের ছন্দে বদলেছে' : ''}</span></div><button className="text-button" onClick={() => setData(d => reopenRevision(d, item.id))}><Undo2 size={14} />{t("আবার খুলো", "Reopen")}</button></div>)}</div></section> : <EmptyState title={t("ইতিহাস এখনও খালি", "History is still empty")} description="একটি রিভিশন সম্পন্ন করলে তার রেকর্ড এখানে থাকবে।" />)}
    {weekAhead.length > 0 && tab === 'due' && <p className="muted padded">৩০ দিনের মধ্যে আরও {bn(weekAhead.length)}টি রিভিশন আছে।</p>}
    <div className="revision-tip"><RotateCcw size={18} /><p><strong>{t("রিভিশন মানে আবার পড়া নয়।", "Revision is not re-reading.")}</strong> বই বন্ধ করে মূল ধারণা লেখো, ১০টি MCQ করো, ভুল হলে সেই অধ্যায়ে টাইমার চালাও।</p></div>
  </div>;
}
function RevisionCard({ item, today, onRate, onSnooze, onOpen, onTimer }: { item: RevisionItem; today: string; onRate: (item: RevisionItem, rating: RecallRating) => void; onSnooze: () => void; onOpen: () => void; onTimer: () => void }) {
  const chapter = chapterById[item.chapterId];
  const links = CHAPTER_CLASSES[item.chapterId];
  const late = item.dueDate < today;
  const days = diffDays(item.dueDate, today);
  return <article className={`card revision-card ${late ? 'late' : ''}`}>
    <div className="revision-card-main">
      <div className="revision-card-top"><SubjectBadge subject={item.subject} small /><span className="revision-interval">{item.adjusted ? 'নিজের ছন্দে সরানো' : `${INTERVAL_LABEL[item.interval]} পরের রিভিশন`}</span>{item.completedAt && <span className="exam-status result-recorded">{t("সম্পন্ন", "Done")}</span>}{late && <span className="late-pill">{bn(days)} দিন দেরি</span>}</div>
      <h3>{chapter?.title || 'অধ্যায়'}</h3>
      <p>{chapter?.focus}</p>
      <span className="revision-due"><CalendarClock size={14} />নির্ধারিত {formatDate(item.dueDate, 'long')} · পত্র {chapter ? bn(chapter.paper) : '—'}</span>
      {links && <div className="revision-class-row"><ClassLinkRow classes={links} /></div>}
    </div>
    <div className="revision-actions recall-actions">
      <span className="recall-label">{t("কেমন মনে আছে?", "How well do you remember?")}</span>
      <button className="recall-button weak" onClick={() => onRate(item, 'weak')}><RotateCcw size={14} />{t("ভুলে গেছি", "Forgot")}</button>
      <button className="recall-button okay" onClick={() => onRate(item, 'okay')}><Check size={14} />{t("মোটামুটি", "Okay")}</button>
      <button className="recall-button good" onClick={() => onRate(item, 'good')}><CheckCheck size={14} />{t("মনে ছিল", "Remembered")}</button>
      <button className="button secondary small" onClick={onTimer}><Timer size={15} />{t("টাইমার", "Timer")}</button>
      <button className="button ghost small" onClick={onSnooze}><Clock3 size={15} />{t("১ দিন পরে", "In 1 day")}</button>
      <button className="icon-button" aria-label={t("অধ্যায় খুলো", "Open chapter")} onClick={onOpen}><ChevronRight size={17} /></button>
    </div>
  </article>;
}

