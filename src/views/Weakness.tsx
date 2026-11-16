import { useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, Check, ChevronRight, ClipboardList, Flame, RotateCcw, ShieldAlert, Target, TrendingDown, Zap } from 'lucide-react';
import { usePlanner } from '../context';
import { chapterById, subjectById } from '../data';
import { bn, formatDate, percent } from '../planner';
import { EmptyState, PageHeading, ProgressBar, SubjectBadge } from '../components';
import { weaknessReport, weaknessSummary, weaknessWeekPlan, markWeaknessPracticed, pullRevisionForward } from '../weakness';
import type { WeaknessRow } from '../weakness';
import { retryBuckets } from '../retryLoop';
import { chapterStage } from '../learning';
import { t } from '../i18n';

const ACTION_ICON = { retry: RotateCcw, practice: ClipboardList, revise: CalendarClock, study: Target } as const;

export default function WeaknessView() {
  const { plan, data, setData, today, openChapter, navigate, notify, startTimer } = usePlanner();
  const [filter, setFilter] = useState<'all' | 'critical' | 'retry'>('all');
  const rows = useMemo(() => weaknessReport(plan, data, today), [plan, data, today]);
  const summary = useMemo(() => weaknessSummary(plan, data, today), [plan, data, today]);
  const week = useMemo(() => weaknessWeekPlan(plan, data, today), [plan, data, today]);
  const retries = useMemo(() => retryBuckets(data, today), [data, today]);
  const shown = filter === 'critical' ? rows.filter(row => row.score >= 8) : filter === 'retry' ? rows.filter(row => row.dueRetries > 0) : rows;

  const open = (chapterId: string) => { const chapter = chapterById[chapterId]; if (chapter) openChapter(chapter); };
  const act = (row: WeaknessRow) => {
    setData(current => markWeaknessPracticed(current, row.chapterId, today));
    if (row.action === 'retry' || row.action === 'practice') { notify(t('অনুশীলন শুরু—সিমুলেটরে প্রশ্ন তৈরি হয়েছে।', 'Practice started — build a paper in the simulator.'), 'info'); navigate('examsim'); return; }
    if (row.action === 'revise') {
      setData(current => pullRevisionForward(current, row.chapterId, today));
      notify(t('অধ্যায়টির রিভিশন কার্ড কালকের জন্য এগিয়ে আনা হয়েছে।', 'That chapter’s revision card was pulled forward to tomorrow.'), 'success');
      navigate('revision');
      return;
    }
    open(row.chapterId);
  };

  return <div className="view weakness-view">
    <PageHeading
      eyebrow="WEAKNESS DETECTOR"
      title="কোথায় নম্বর যাচ্ছে, সেটা আগে।"
      titleEn="Find the marks that are leaking."
      description="MCQ নির্ভুলতা, CQ নম্বর, ফেরত বাকি ভুল প্রশ্ন, সিমুলেটেড পরীক্ষার ফল আর নিজের দুর্বল চিহ্ন—সব এক জায়গায় মিলিয়ে প্রতিটি অধ্যায়ের কারণসহ তালিকা। প্রতিটি সারিতে একটাই কাজ, যেটা সবচেয়ে দরকার।"
      descriptionEn="MCQ accuracy, CQ marks, questions still owed a retry, simulated exam results and your own flags are merged into one ranked, explainable list — with the single next action per chapter."
      action={<button className="button secondary" onClick={() => navigate('examsim')}><Zap size={17} />{t('পুনরায় পরীক্ষা', 'Retry test')}</button>}
    />

    <div className="weakness-stat-row">
      <div className="card weakness-stat accent"><span className="stat-icon peach"><ShieldAlert size={20} /></span><div><span>{t('চিহ্নিত অধ্যায়', 'Chapters flagged')}</span><strong>{bn(summary.total)}</strong><p>{t('সব বিষয়ে', 'across subjects')}</p></div></div>
      <div className="card weakness-stat"><span className="stat-icon green"><Target size={20} /></span><div><span>{t('আজকের ফোকাস', 'Focus today')}</span><strong>{bn(summary.focus.length)}</strong><p>{t('শীর্ষ ৩', 'top three')}</p></div></div>
      <div className="card weakness-stat"><span className="stat-icon lavender"><RotateCcw size={20} /></span><div><span>{t('ভুল প্রশ্ন বাকি', 'Retries due')}</span><strong>{bn(retries.due.length)}</strong><p>{t('ল্যাডারে', 'on the ladder')}</p></div></div>
      <div className="card weakness-stat"><span className="stat-icon blue"><TrendingDown size={20} /></span><div><span>{t('সবচেয়ে ঝুঁকিপূর্ণ', 'Biggest risk')}</span><strong>{summary.focus[0] ? subjectById[summary.focus[0].subject].short : '—'}</strong><p>{summary.focus[0] ? chapterById[summary.focus[0].chapterId]?.title.slice(0, 18) : t('কিছু নেই', 'nothing yet')}</p></div></div>
    </div>

    {!rows.length ? <EmptyState title={t('এখনো কোনো দুর্বলতা ধরা পড়েনি', 'Nothing flagged yet')} description={t('MCQ অনুশীলন ও পরীক্ষা দিলে এখানে কারণসহ তালিকা তৈরি হবে।', 'Practise MCQ and take a paper — this list builds itself from real answers.')} action={<button className="button primary" onClick={() => navigate('examsim')}>{t('পরীক্ষা শুরু করো', 'Start a paper')}</button>} /> : <>
      {summary.focus.length > 0 && <section className="card weakness-focus">
        <div className="card-heading"><div><h2><Flame size={19} />{t('আজ ঠিক এই তিনটি', 'These three, today')}</h2><p>{t('স্কোর সবচেয়ে বেশি, অর্থাৎ এখনই ধরলে সবচেয়ে বেশি লাভ।', 'Highest scores — the most marks saved per hour spent.')}</p></div><span className="tiny-muted">{t('আগে এগুলো', 'Do these first')}</span></div>
        <div className="weakness-focus-grid">{summary.focus.map((row, index) => <article className="weakness-focus-card" key={row.chapterId}>
          <span className="weakness-rank">{bn(index + 1)}</span>
          <div className="weakness-focus-body">
            <div className="weakness-focus-top"><SubjectBadge subject={row.subject} small /><span className={`priority-pill ${row.priority}`}>{row.priority}</span></div>
            <h3>{row.chapter.title}</h3>
            <p>{row.signals.map(signal => signal.label).join(' · ')}</p>
            <ProgressBar value={row.stagePercent} />
            <div className="weakness-focus-actions">
              <button className="button primary small" onClick={() => act(row)}>{(() => { const Icon = ACTION_ICON[row.action]; return <Icon size={15} />; })()}{t(row.actionLabel, row.actionLabelEn)}</button>
              <button className="button ghost small" onClick={() => open(row.chapterId)}>{t('অধ্যায়', 'Chapter')}<ChevronRight size={14} /></button>
              <button className="icon-button" aria-label={t('এই অধ্যায়ে টাইমার', 'Timer on this chapter')} onClick={() => startTimer(row.subject, row.chapterId)}><CalendarClock size={16} /></button>
            </div>
          </div>
        </article>)}</div>
      </section>}

      <div className="weakness-main-grid">
        <section className="card weakness-list-card">
          <div className="card-heading"><div><h2><Target size={19} />{t('সব দুর্বল অধ্যায়', 'Every flagged chapter')}</h2><p>{t('স্কোর বেশি মানে আগে। প্রতিটি সারি নিজেই কারণ বলে দেয়।', 'Higher score first. Every row explains itself.')}</p></div><div className="segmented small">{([['all', 'সব'], ['critical', 'গুরুতর'], ['retry', 'ভুল প্রশ্ন']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
          <div className="weakness-list">{shown.map(row => {
            const Icon = ACTION_ICON[row.action];
            return <article className="weakness-row" key={row.chapterId}>
              <span className={`weakness-score ${row.score >= 8 ? 'critical' : row.score >= 5 ? 'warn' : ''}`}>{bn(row.score)}</span>
              <div className="weakness-row-main">
                <div className="weakness-row-top"><SubjectBadge subject={row.subject} small /><strong>{row.chapter.title}</strong><span className={`priority-pill ${row.priority}`}>{row.priority}</span></div>
                <div className="weakness-signals">{row.signals.map(signal => <span key={signal.label}>{signal.label}</span>)}</div>
                <div className="weakness-row-bar"><ProgressBar value={row.stagePercent} /><small>{bn(row.stagePercent)}% {t('সম্পন্ন', 'done')}</small></div>
              </div>
              <div className="weakness-row-actions">
                <button className="button secondary small" onClick={() => act(row)}><Icon size={14} />{t(row.actionLabel, row.actionLabelEn)}</button>
                <button className="icon-button" aria-label={t('অধ্যায় খুলো', 'Open chapter')} onClick={() => open(row.chapterId)}><ChevronRight size={16} /></button>
              </div>
            </article>;
          })}</div>
        </section>

        <aside className="weakness-rail">
          <section className="card weakness-plan-card">
            <div className="card-heading"><div><h2><CalendarClock size={18} />{t('এই সপ্তাহের প্রতিকার', 'This week’s attack plan')}</h2><p>{t('প্রতিদিন দুটি অধ্যায়—তারপর নতুন কিছু।', 'Two chapters a day, then move on.')}</p></div></div>
            {week.length ? <div className="weakness-week">{week.map(day => <div key={day.date}>
              <span className="weakness-day">{day.date === today ? t('আজ', 'Today') : formatDate(day.date, 'weekday')}<small>{formatDate(day.date)}</small></span>
              <div>{day.rows.map(row => <button key={row.chapterId} onClick={() => open(row.chapterId)}>{chapterById[row.chapterId]?.title}<i style={{ background: subjectById[row.subject].color }} /></button>)}</div>
            </div>)}</div> : <p className="tiny-muted padded">{t('পরিকল্পনার মতো নতুন কিছু নেই।', 'Nothing left to schedule right now.')}</p>}
          </section>
          <section className="card weakness-subject-card">
            <div className="card-heading"><h3>{t('বিষয়ভিত্তিক ঝুঁকি', 'Risk by subject')}</h3></div>
            {summary.bySubject.length ? <div className="accuracy-subjects">{summary.bySubject.map(row => <div key={row.subject}>
              <span>{subjectById[row.subject].short}</span>
              <ProgressBar value={percent(row.count, Math.max(summary.total, 1))} color={subjectById[row.subject].color} />
              <small>{bn(row.count)}</small>
            </div>)}</div> : <p className="tiny-muted padded">{t('এখনো কিছু নেই।', 'Nothing yet.')}</p>}
          </section>
          <section className="card weakness-tip-card">
            <div className="card-heading"><h3><Check size={17} />{t('কীভাবে ব্যবহার করবে', 'How to use this')}</h3></div>
            <ol className="weakness-tips">
              <li>{t('সকালে শীর্ষ ৩টি অধ্যায়ের প্রথম কাজটি করো।', 'Do the first action of the top three in the morning.')}</li>
              <li>{t('ভুল প্রশ্ন বাকি থাকলে আগে পুনরায় পরীক্ষা দাও।', 'If retries are due, take that paper first.')}</li>
              <li>{t('স্কোর ৮-এর বেশি হলে সেদিন অন্য নতুন অধ্যায় নয়।', 'Anything scoring 8+ replaces a new chapter that day.')}</li>
              <li>{t('সপ্তাহ শেষে তালিকা আবার দেখো—কমেছে কি না।', 'Re-check the list at the end of the week.')}</li>
            </ol>
            <button className="button ghost small" onClick={() => navigate('analytics')}>{t('আনলিটিক্সে যাও', 'Open analytics')}<ArrowRight size={14} /></button>
          </section>
          <section className="card weakness-stage-card">
            <div className="card-heading"><h3>{t('অধ্যায়ের ধাপ', 'Chapter stages')}</h3></div>
            {rows.slice(0, 5).map(row => { const stage = chapterStage(row.chapter, data, plan); return <div className="weakness-stage-row" key={row.chapterId}><span>{chapterById[row.chapterId]?.title}</span><small>{t(STAGE_LABEL[stage], STAGE_LABEL_EN[stage])}</small></div>; })}
          </section>
        </aside>
      </div>
    </>}
  </div>;
}

const STAGE_LABEL: Record<string, string> = { notStarted: 'শুরু হয়নি', inProgress: 'চলছে', completed: 'পড়া শেষ', revisionNeeded: 'রিভিশন দরকার', fullyRevised: 'ঝালাই' };
const STAGE_LABEL_EN: Record<string, string> = { notStarted: 'Not started', inProgress: 'In progress', completed: 'Read', revisionNeeded: 'Needs revision', fullyRevised: 'Sharp' };
