import { useMemo, useState } from 'react';
import { AlarmClock, CalendarClock, Check, CheckCheck, ChevronRight, Clock3, RotateCcw, Timer, Undo2 } from 'lucide-react';
import { usePlanner } from '../context';
import { chapterById } from '../data';
import { addDays, bn, diffDays, formatDate } from '../planner';
import { INTERVAL_LABEL, completeRevision, reopenRevision, revisionBuckets, snoozeRevision } from '../revision';
import type { RevisionItem } from '../types';
import { EmptyState, PageHeading, ProgressBar, SubjectBadge } from '../components';

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
  const markDone = (item: RevisionItem) => { setData(d => completeRevision(d, item.id)); notify('রিভিশন সম্পন্ন হিসেবে টিক হয়েছে।', 'success'); };
  const open = (chapterId: string) => { const chapter = chapterById[chapterId]; if (chapter) openChapter(chapter); };
  const finishAll = () => confirm({ title: 'আজকের সব রিভিশন সম্পন্ন?', message: `${bn(due.length)}টি রিভিশন একসাথে সম্পন্ন হিসেবে চিহ্নিত হবে। সত্যিই ঝালাই করা হলে তবেই টিক দাও।`, label: 'সব সম্পন্ন করো', action: () => { setData(d => due.reduce((next, item) => completeRevision(next, item.id), d)); notify(`${bn(due.length)}টি রিভিশন সম্পন্ন হয়েছে।`, 'success'); } });
  return <div className="view revision-view">
    <PageHeading eyebrow="MAKE IT STICK" title="ভুলে যাওয়ার আগেই ঝালাই।" titleEn="Review before you forget." description="প্রতিটি অধ্যায় শেষ হলে ১, ৩, ৭, ১৪ ও ৩০ দিনের রিভিশন কার্ড নিজে থেকেই তৈরি হয়। আজ যা দরকার, সেটাই আগে।" descriptionEn="Finishing a chapter creates 1, 3, 7, 14 and 30-day revision cards. Today’s due cards come first." action={<button className="button secondary" onClick={() => navigate('settings')}><AlarmClock size={17} />রিভিশন সেটিংস</button>} />
    <div className="revision-overview">
      <section className="card revision-hero-card"><div><span className="eyebrow">আজকের রিভিশন</span><strong className="revision-big-number">{bn(due.length)}</strong><p>{buckets.overdue.length ? `${bn(buckets.overdue.length)}টি ওভারডিউ · ` : ''}{bn(totalPending)}টি মোট বাকি</p></div><div className="revision-ring-short"><ProgressBar value={completion} /><span>সব রিভিশনের {bn(completion)}% সম্পন্ন</span></div>{due.length > 0 && <button className="button primary" onClick={finishAll}><CheckCheck size={17} />সব সম্পন্ন</button>}</section>
      <div className="revision-stat"><span className="stat-icon peach"><AlarmClock size={19} /></span><div><span>ওভারডিউ</span><strong>{bn(buckets.overdue.length)}</strong><p>আজ বা আগের</p></div></div>
      <div className="revision-stat"><span className="stat-icon green"><CalendarClock size={19} /></span><div><span>আগামী ৭ দিন</span><strong>{bn(buckets.upcoming.length)}</strong><p>পরিকল্পিত</p></div></div>
      <div className="revision-stat"><span className="stat-icon lavender"><Check size={19} /></span><div><span>সম্পন্ন</span><strong>{bn(doneCount)}</strong><p>সর্বকালীন</p></div></div>
    </div>
    <div className="revision-how card"><Clock3 size={19} /><div><strong>কীভাবে কাজ করে</strong><p>অধ্যায়ের সব ধাপ শেষ হলে সেই দিন থেকে ১, ৩, ৭, ১৪ ও ৩০ দিন পরের তারিখে রিভিশন কার্ড তৈরি হয়। অধ্যায় আবার অসম্পূর্ণ করলে শুধু বাকি কার্ডগুলো সরে যায়; সম্পন্ন ইতিহাস থাকে।</p></div></div>
    <div className="filter-bar revision-tabs"><div className="segmented">{(['due', 'upcoming', 'all', 'history'] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'due' ? `আজ দরকার (${bn(due.length)})` : item === 'upcoming' ? `আগামী ৭ দিন (${bn(buckets.upcoming.length)})` : item === 'all' ? `সব বাকি (${bn(allPending.length)})` : `ইতিহাস (${bn(doneCount)})`}</button>)}</div></div>
    {tab === 'due' && due.length > 0 && <div className="revision-list">{due.map(item => <RevisionCard key={item.id} item={item} today={today} onDone={markDone} onSnooze={() => { setData(d => snoozeRevision(d, item.id, today, 1)); notify('আগামীকালের জন্য সরানো হয়েছে।', 'info'); }} onOpen={() => open(item.chapterId)} onTimer={() => startTimer(item.subject, item.chapterId)} />)}</div>}
    {tab === 'upcoming' && (buckets.upcoming.length ? <div className="revision-list">{buckets.upcoming.map(item => <RevisionCard key={item.id} item={item} today={today} onDone={markDone} onSnooze={() => setData(d => snoozeRevision(d, item.id, today, 1))} onOpen={() => open(item.chapterId)} onTimer={() => startTimer(item.subject, item.chapterId)} />)}</div> : <EmptyState title="আগামী ৭ দিনে রিভিশন নেই" description="নতুন অধ্যায় শেষ করলে কার্ড নিজে থেকেই তৈরি হবে।" action={<button className="button secondary" onClick={() => navigate('syllabus')}>সিলেবাসে যাও</button>} />)}
    {tab === 'all' && (allPending.length ? <div className="revision-list">{allPending.map(item => <RevisionCard key={item.id} item={item} today={today} onDone={markDone} onSnooze={() => setData(d => snoozeRevision(d, item.id, today, 1))} onOpen={() => open(item.chapterId)} onTimer={() => startTimer(item.subject, item.chapterId)} />)}</div> : <EmptyState title="কোনো বাকি রিভিশন নেই" description="চমৎকার! নতুন অধ্যায় শেষ করে পরের রিভিশন কার্ড তৈরি করো।" />)}
    {tab === 'history' && (buckets.completed.length ? <section className="card revision-history"><div className="card-heading"><div><h2>রিভিশন ইতিহাস</h2><p>সর্বশেষ সম্পন্ন রিভিশন আগে। ভুলে গেলে আবার খুলে দিতে পারো।</p></div><span className="tiny-muted">{bn(buckets.completed.length)}টি</span></div><div className="history-list">{buckets.completed.slice(0, 60).map(item => <div key={item.id} className="history-row"><span className="history-check"><Check size={14} /></span><div><strong>{chapterById[item.chapterId]?.title || 'অধ্যায়'}</strong><span>{INTERVAL_LABEL[item.interval]} রিভিশন · নির্ধারিত ছিল {formatDate(item.dueDate)} · সম্পন্ন {item.completedAt ? formatDate(item.completedAt.slice(0, 10)) : '—'}</span></div><button className="text-button" onClick={() => setData(d => reopenRevision(d, item.id))}><Undo2 size={14} />আবার খুলো</button></div>)}</div></section> : <EmptyState title="ইতিহাস এখনও খালি" description="একটি রিভিশন সম্পন্ন করলে তার রেকর্ড এখানে থাকবে।" />)}
    {weekAhead.length > 0 && tab === 'due' && <p className="muted padded">৩০ দিনের মধ্যে আরও {bn(weekAhead.length)}টি রিভিশন আছে।</p>}
    <div className="revision-tip"><RotateCcw size={18} /><p><strong>রিভিশন মানে আবার পড়া নয়।</strong> বই বন্ধ করে মূল ধারণা লেখো, ১০টি MCQ করো, ভুল হলে সেই অধ্যায়ে টাইমার চালাও।</p></div>
  </div>;
}
function RevisionCard({ item, today, onDone, onSnooze, onOpen, onTimer }: { item: RevisionItem; today: string; onDone: (item: RevisionItem) => void; onSnooze: () => void; onOpen: () => void; onTimer: () => void }) {
  const chapter = chapterById[item.chapterId];
  const late = item.dueDate < today;
  const days = diffDays(item.dueDate, today);
  return <article className={`card revision-card ${late ? 'late' : ''}`}>
    <div className="revision-card-main"><div className="revision-card-top"><SubjectBadge subject={item.subject} small /><span className="revision-interval">{INTERVAL_LABEL[item.interval]} পরের রিভিশন</span>{item.completedAt && <span className="exam-status result-recorded">সম্পন্ন</span>}{late && <span className="late-pill">{bn(days)} দিন দেরি</span>}</div><h3>{chapter?.title || 'অধ্যায়'}</h3><p>{chapter?.focus}</p><span className="revision-due"><CalendarClock size={14} />নির্ধারিত {formatDate(item.dueDate, 'long')} · পত্র {chapter ? bn(chapter.paper) : '—'}</span></div>
    <div className="revision-actions">
      <button className="button primary small" onClick={() => onDone(item)}><Check size={15} />সম্পন্ন</button>
      <button className="button secondary small" onClick={onTimer}><Timer size={15} />টাইমার</button>
      <button className="button ghost small" onClick={onSnooze}><Clock3 size={15} />১ দিন পরে</button>
      <button className="icon-button" aria-label="অধ্যায় খুলো" onClick={onOpen}><ChevronRight size={17} /></button>
    </div>
  </article>;
}

