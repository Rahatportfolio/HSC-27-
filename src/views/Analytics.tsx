import { useMemo, useState } from 'react';
import { Award, BarChart3, Check, ChevronRight, Flame, LibraryBig, Medal, ShieldAlert, Target, TrendingUp } from 'lucide-react';
import { usePlanner } from '../context';
import { SUBJECTS, chapterById, subjectById } from '../data';
import { addDays, bn, formatDate, percent } from '../planner';
import { attemptStats, badgeList, currentStreak, dailySeries, longestStreak, minutesBetween, startOfWeek, studyDates, subjectAccuracy, subjectMinutes, weakChapters, weeklyReview } from '../analytics';
import { learningDashboard } from '../learning';
import { expectedPercentBy, overallTaskProgress, scheduleStatus } from '../prediction';
import { ProgressBar, PageHeading, ProgressRing } from '../components';
import { weekReport } from '../backup';
import { t } from '../i18n';

export default function AnalyticsView() {
  const { plan, data, today, openChapter, navigate, notify } = usePlanner();
  const report = weekReport(data, plan, today, id => subjectById[id as keyof typeof subjectById]?.name || id);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const review = weeklyReview(plan, data, today);
  const series = dailySeries(data.studySessions, today, range);
  const maxMinutes = Math.max(data.settings.dailyHours * 60, ...series.map(point => point.minutes), 1);
  const totalMinutes = data.focus.minutes;
  const weekMinutes = minutesBetween(data.studySessions, startOfWeek(today), addDays(startOfWeek(today), 6));
  const last30 = addDays(today, -29);
  const bySubject = subjectMinutes(data.studySessions, last30, today);
  const accuracy = subjectAccuracy(data.attempts);
  const weak = weakChapters(plan, data);
  const badges = badgeList(data, plan, today);
  const earned = badges.filter(badge => badge.earned).length;
  const dates = studyDates(data);
  const streak = currentStreak(data, today);
  const best = longestStreak(data);
  const gridStart = addDays(startOfWeek(today), -49);
  const gridDays = Array.from({ length: 56 }, (_, index) => addDays(gridStart, index));
  // Smart syllabus dashboard: real A/B/C and subject progress from the student's own data.
  const learning = useMemo(() => learningDashboard(data, plan), [data, plan]);
  const tasksOverall = useMemo(() => overallTaskProgress(plan, data), [plan, data]);
  const planStatus = useMemo(() => scheduleStatus(plan, data, today), [plan, data, today]);
  const expectedAtTest = useMemo(() => expectedPercentBy(plan, data, today, data.settings.testExamDate), [plan, data, today]);
  const shareReport = async () => {
    const text = report.lines.join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ title: 'প্রস্তুতি · সাপ্তাহিক রিপোর্ট', text }); return; }
      await navigator.clipboard.writeText(text);
      notify(t('রিপোর্ট লেখা হিসেবে কপি হয়েছে — যেখানে খুশি পেস্ট করো।', 'The report was copied as text — paste it anywhere you like.'));
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      notify(t('শেয়ার করা যায়নি। প্রিন্ট করে PDF রাখো।', 'Sharing failed. Print it to keep a PDF.'), 'error');
    }
  };
  /** Prints only the report card; the browser's "Save as PDF" turns it into a file. */
  const printReport = () => {
    const root = document.documentElement;
    root.classList.add('print-report');
    const cleanup = () => { root.classList.remove('print-report'); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 2000);
  };
  return <div className="view analytics-view">
    <PageHeading eyebrow="SMALL DATA, HONEST PICTURE" title="নিজের সঙ্গে তুলনা।" titleEn="Compare with yourself." description="মাপা সময়, নির্ভুলতা, দুর্বল অধ্যায় আর সাপ্তাহিক রিপোর্ট—সিদ্ধান্তের জন্য, অপ্রয়োজনীয় চাপের জন্য নয়।" descriptionEn="Measured time, accuracy, weak chapters and a weekly report — for decisions, not pressure." action={<div className="analytics-head"><span><Flame size={16} /><strong>{bn(streak)}</strong>{t("দিনের ধারা", "Day streak")}</span><span><TrendingUp size={16} /><strong>{bn(best)}</strong>{t("দিন সেরা", "Best day")}</span></div>} />
    <section className="card syllabus-dashboard" aria-label={t('সিলেবাস ড্যাশবোর্ড', 'Syllabus dashboard')}>
      <div className="card-heading">
        <div>
          <h2><LibraryBig size={19} />{t('স্মার্ট সিলেবাস ড্যাশবোর্ড', 'Smart syllabus dashboard')}</h2>
          <p>{t('সত্যিকার অগ্রগতি — কোনো হার্ডকোডেড নম্বর নয়। কয়েক সেকেন্ডে বোঝা যায় কতটুকু বাকি, A শেষ কি না, কোন বিষয় পিছিয়ে।', 'Real progress — no hardcoded numbers. See in seconds how much remains, whether A is done, and which subject is behind.')}
          </p>
        </div>
        <button className="button secondary small" onClick={() => navigate('syllabus')}>{t('সিলেবাস খোলো', 'Open syllabus')}<ChevronRight size={14} /></button>
      </div>
      <div className="syllabus-dash-grid">
        <div className="syllabus-dash-overall">
          <ProgressRing value={learning.overall.percent} size={116} stroke={9}>
            <strong>{bn(learning.overall.percent)}%</strong>
            <span>{t('সম্পন্ন', 'done')}</span>
          </ProgressRing>
          <div className="syllabus-dash-overall-copy">
            <strong>{t('সমগ্র সিলেবাস', 'Whole syllabus')}</strong>
            <span>{bn(learning.overall.total)} {t('টি অধ্যায়/ইউনিট', ' chapters & units')}</span>
            <div className="syllabus-dash-chips">
              <em className="ok">{bn(learning.overall.completed)} {t('সম্পন্ন', 'done')}</em>
              <em>{bn(learning.overall.inProgress)} {t('চলছে', 'in progress')}</em>
              <em className="muted">{bn(learning.overall.remaining)} {t('বাকি', 'left')}</em>
            </div>
            <small>{t('টাস্ক হিসাব', 'By tasks')}: {bn(tasksOverall.done)}/{bn(tasksOverall.total)} ({bn(tasksOverall.percent)}%) · {planStatus.status === 'ahead' ? t('সময়ের আগে', 'ahead of schedule') : planStatus.status === 'ontrack' ? t('সময়ের সঙ্গে', 'on track') : t(`${bn(planStatus.gapPercent)}% পিছিয়ে`, `${planStatus.gapPercent}% behind`)}</small>
          </div>
        </div>
        <div className="syllabus-dash-categories">
          {(['A', 'B', 'C'] as const).map(key => (
            <button key={key} className={`category-card cat-${key}`} onClick={() => navigate('testprep')}>
              <span className="category-card-head"><strong>{key}</strong><em>{key === 'A' ? t('সর্বোচ্চ অগ্রাধিকার', 'Highest priority') : key === 'B' ? t('মাঝারি ধাপ', 'Medium step') : t('বাকি ধাপ', 'Remaining step')}</em></span>
              <strong className="category-count">{bn(learning.category[key].completed)}/{bn(learning.category[key].total)}</strong>
              <ProgressBar value={learning.category[key].percent} color={key === 'A' ? '#236149' : key === 'B' ? '#9a6722' : '#5a4b82'} />
              <small>{bn(learning.category[key].percent)}% {t('সম্পন্ন', 'complete')} · {bn(learning.category[key].remaining)} {t('বাকি', 'left')}</small>
            </button>
          ))}
        </div>
        <div className="syllabus-dash-subjects">
          {SUBJECTS.map(subject => {
            const group = learning.subject[subject.id];
            const behindSubject = group.total > 0 && group.percent < learning.overall.percent - 15;
            return (
              <button key={subject.id} className={`subject-progress-row ${behindSubject ? 'behind' : ''}`} onClick={() => navigate('syllabus')}>
                <span className="subject-progress-name" style={{ color: subject.color }}>{subject.short}</span>
                <ProgressBar value={group.percent} color={subject.color} />
                <strong>{bn(group.completed)}/{bn(group.total)}</strong>
                <small>{bn(group.percent)}%</small>
                {behindSubject && <em title={t('সমগ্র সিলেবাসের চেয়ে পিছিয়ে', 'Behind the overall syllabus')}>!</em>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="syllabus-dash-foot">
        <span>{t('টেস্ট পরীক্ষায় প্রত্যাশিত', 'Expected by Test Exam')}: <strong>{bn(expectedAtTest)}%</strong></span>
        <span>{t('A শেষ হওয়ার সম্ভাব্য তারিখ', 'Estimated A finish')}: <strong>{learning.category.A.remaining === 0 ? t('হয়ে গেছে', 'done') : t('প্ল্যান অনুযায়ী', 'as planned')}</strong></span>
        <button className="text-button" onClick={() => navigate('testprep')}>{t('টেস্ট মোড খোলো', 'Open test mode')}<ChevronRight size={14} /></button>
      </div>
    </section>
    <div className="analytics-overview">
      <section className="card weekly-hero"><span className="eyebrow">{t("এই সপ্তাহ", "This week")}</span><div className="weekly-hero-numbers"><strong>{bn(Math.floor(weekMinutes / 60))}<small>{t("ঘ", "h")}</small> {bn(weekMinutes % 60)}<small>{t("মি", "m")}</small></strong><span>{t("মাপা পড়ার সময়", "Measured study time")}</span></div><ProgressBar value={percent(weekMinutes, review.targetMinutes)} /><div className="weekly-hero-meta"><span>লক্ষ্য {bn(Math.floor(review.targetMinutes / 60))} ঘণ্টা</span><span>{bn(review.daysStudied)} দিন পড়া</span><span>{bn(review.tasksCompleted)} কাজ সম্পন্ন</span></div></section>
      <div className="analytics-stat"><span className="stat-icon green"><Target size={19} /></span><div><span>{t("সর্বকালীন মাপা সময়", "All-time measured time")}</span><strong>{bn(Math.floor(totalMinutes / 60))}<small>{t("ঘণ্টা", "hours")}</small></strong><p>{bn(data.focus.sessions)}টি সেশন</p></div></div>
      <div className="analytics-stat"><span className="stat-icon peach"><Award size={19} /></span><div><span>{t("MCQ নির্ভুলতা", "MCQ accuracy")}</span><strong>{bn(attemptStats(data.attempts).accuracy)}<small>%</small></strong><p>{bn(attemptStats(data.attempts).total)}টি উত্তর</p></div></div>
      <div className="analytics-stat"><span className="stat-icon lavender"><BarChart3 size={19} /></span><div><span>{t("সম্পন্ন অধ্যায়", "Chapters finished")}</span><strong>{bn(review.chaptersCompleted.length)}<small>{t("এই সপ্তাহে", "this week")}</small></strong><p>{bn(weak.length)}টি দুর্বল চিহ্নিত</p></div></div>
    </div>
    <section className="card weekly-report">
      <div className="card-heading"><div><h2><BarChart3 size={19} />{t("সাপ্তাহিক রিপোর্ট", "Weekly report")}</h2><p>{formatDate(report.from, 'long')} – {formatDate(report.to, 'long')} · এই সাত দিনের হিসাব</p></div><div className="report-actions"><button className="button secondary small" onClick={() => void shareReport()}>{t("শেয়ার / কপি", "Share / copy")}</button><button className="button ghost small" onClick={printReport}>{t("প্রিন্ট / PDF", "Print / PDF")}</button></div></div>
      <div className="report-grid">
        <div><span>{t("পড়ার সময়", "Study time")}</span><strong>{bn(Math.floor(report.minutes / 60))}ঘ {bn(report.minutes % 60)}মি</strong><small>{bn(report.sessions)}টি সেশন</small></div>
        <div><span>{t("কাজ শেষ", "Work done")}</span><strong>{bn(report.tasksDone)}</strong><small>{bn(report.chaptersDone)}টি অধ্যায় এগিয়েছে</small></div>
        <div><span>MCQ</span><strong>{bn(report.mcq)}</strong><small>নির্ভুলতা {bn(report.accuracy)}%</small></div>
        <div><span>CQ</span><strong>{bn(report.cq)}</strong><small>{report.cq ? `গড় ${bn(report.cqAverage)}%` : 'এই সপ্তাহে লেখা হয়নি'}</small></div>
        <div><span>{t("রিভিশন", "Revision")}</span><strong>{bn(report.revisions)}</strong><small>{t("সম্পন্ন কার্ড", "Cards done")}</small></div>
        <div><span>{t("টেস্ট", "Test")}</span><strong>{bn(report.tests)}</strong><small>{report.tests ? `গড় ${bn(report.testAverage)}%` : 'হয়নি'}</small></div>
      </div>
      <p className="report-foot">{report.topSubject ? `সবচেয়ে বেশি সময় ${report.topSubject}-এ।` : 'এখনও মাপা সময় নেই।'} {report.chaptersDone === 0 ? 'নতুন অধ্যায় শুরু করতে পারলে সপ্তাহটা আরও এগোবে।' : 'এই গতি ধরে রাখলে সিলেবাস সময়ের আগেই শেষ হবে।'}</p>
    </section>
    <div className="analytics-grid">
      <section className="card study-chart-card"><div className="card-heading"><div><h2>{t("পড়ার ছন্দ", "Study rhythm")}</h2><p>{t('টাইমারে মাপা মিনিট। ধূসর রেখা দৈনিক লক্ষ্য।', 'Minutes measured by the timer. The grey line is your daily goal.')}</p></div><div className="segmented small">{([7, 30, 90] as const).map(value => <button key={value} className={range === value ? 'active' : ''} onClick={() => setRange(value)}>{value === 7 ? t('৭ দিন', '7 days') : value === 30 ? t('৩০ দিন', '30 days') : t('৯০ দিন', '90 days')}</button>)}</div></div><div className={`study-bars range-${range}`}>{series.map(point => <div className={`study-bar ${point.date === today ? 'today' : ''} ${point.minutes === 0 ? 'empty' : ''}`} key={point.date} title={`${formatDate(point.date, 'long')}: ${bn(point.minutes)} মিনিট`}><span style={{ height: `${Math.max(point.minutes ? 4 : 1, point.minutes / maxMinutes * 100)}%` }} />{range === 7 && <small>{formatDate(point.date).split(' ')[0]}</small>}</div>)}</div><div className="chart-footer"><span>সর্বোচ্চ {bn(Math.round(maxMinutes))} মি. · গড় {bn(Math.round(series.reduce((sum, point) => sum + point.minutes, 0) / series.length))} মি.</span><span>দৈনিক লক্ষ্য {bn(data.settings.dailyHours * 60)} মি.</span></div></section>
      <section className="card subject-time-card"><div className="card-heading"><h2>{t("শেষ ৩০ দিনে বিষয়ভিত্তিক সময়", "Time by subject, last 30 days")}</h2><span className="tiny-muted">মোট {bn(Math.round(Object.values(bySubject).reduce((sum, value) => sum + value, 0) / 60))} ঘণ্টা</span></div>{SUBJECTS.map(subject => <div className="subject-time-row" key={subject.id}><span style={{ color: subject.color }}>{subject.short}</span><ProgressBar value={percent(bySubject[subject.id], Math.max(...Object.values(bySubject), 1))} color={subject.color} /><small>{bn(Math.floor(bySubject[subject.id] / 60))}ঘ {bn(bySubject[subject.id] % 60)}মি</small></div>)}</section>
    </div>
    <div className="analytics-grid second">
      <section className="card weekly-review-card"><div className="card-heading"><div><h2>{t("সাপ্তাহিক রিভিউ", "Weekly review")}</h2><p>{formatDate(review.weekStart)} – {formatDate(review.weekEnd)} · এখন পর্যন্ত</p></div><button className="text-button" onClick={() => navigate('calendar')}>{t("পরের সপ্তাহ", "Next week")}<ChevronRight size={14} /></button></div><div className="review-facts"><div><span>{t("মাপা সময়", "Measured time")}</span><strong>{bn(Math.floor(review.minutes / 60))}ঘ {bn(review.minutes % 60)}মি</strong><small>লক্ষ্যের {bn(percent(review.minutes, review.targetMinutes))}%</small></div><div><span>{t("কাজ সম্পন্ন", "Work finished")}</span><strong>{bn(review.tasksCompleted)}</strong><small>/{bn(review.tasksPlanned)} পরিকল্পিত</small></div><div><span>{t("অধ্যায় শেষ", "Chapters done")}</span><strong>{bn(review.chaptersCompleted.length)}</strong><small>{t("এই সপ্তাহে", "this week")}</small></div><div><span>MCQ</span><strong>{bn(review.mcq.accuracy)}%</strong><small>{bn(review.mcq.total)}টি উত্তর</small></div></div><div className="review-chapters">{review.chaptersCompleted.length ? review.chaptersCompleted.slice(0, 6).map(id => <span key={id}>{chapterById[id]?.title}</span>) : <p>{t("এই সপ্তাহে নতুন অধ্যায় সম্পন্ন হয়নি। ছোট ধাপেই শুরু হোক।", "No new chapter finished this week. Start with one small step.")}</p>}</div><div className="next-week-plan"><strong>{t("পরের ৭ দিনের পরিকল্পনা", "Plan for the next 7 days")}</strong>{review.nextWeek.map(day => <div key={day.date}><span>{formatDate(day.date)} · {formatDate(day.date, 'weekday')}</span><span>{bn(day.tasks.length)} সেশন · {bn(Math.floor(day.minutes / 60))}ঘ</span><span className="next-week-subjects">{day.tasks.slice(0, 3).map(task => <i key={task.id} style={{ background: subjectById[task.subject].color }} title={subjectById[task.subject].name} />)}</span></div>)}</div></section>
      <section className="card weak-card"><div className="card-heading"><div><h2><ShieldAlert size={19} />{t("দুর্বল অধ্যায়", "Weak chapters")}</h2><p>আত্মবিশ্বাস, MCQ নির্ভুলতা ও CQ নম্বর—তিন সূত্র মিলিয়ে।</p></div></div>{weak.length ? <div className="weak-list">{weak.slice(0, 8).map(item => <button key={item.chapterId} className="weak-row" onClick={() => { const chapter = chapterById[item.chapterId]; if (chapter) openChapter(chapter); }}><span className="weak-score">{item.score}</span><span><strong>{chapterById[item.chapterId]?.title}</strong><small>{subjectById[item.subject].name} · {item.reasons.join(' · ')}</small></span><ChevronRight size={15} /></button>)}</div> : <div className="weak-empty"><Check size={20} /><p>{t("এখন কোনো দুর্বল অধ্যায় চিহ্নিত নেই। MCQ ও CQ অনুশীলন করলে ছবিটা আরও স্পষ্ট হবে।", "No weak chapter flagged yet. Practise MCQ and CQ to sharpen the picture.")}</p></div>}</section>
    </div>
    <div className="analytics-grid second">
      <section className="card streak-card"><div className="card-heading"><div><h2><Flame size={19} />{t("স্টাডি স্ট্রিক ক্যালেন্ডার", "Study streak calendar")}</h2><p>{t("শেষ ৮ সপ্তাহ · সবুজ মানে পড়া হয়েছে", "Last 8 weeks · green means studied")}</p></div><span className="tiny-muted">{bn(dates.size)} দিন</span></div><div className="streak-calendar">{gridDays.map(date => <span key={date} className={`${dates.has(date) ? 'studied' : ''} ${date === today ? 'today' : ''}`} title={`${formatDate(date, 'long')}${dates.has(date) ? ' · পড়া হয়েছে' : ''}`} />)}</div><div className="streak-legend"><span><i className="studied" />{t("পড়া হয়েছে", "Studied")}</span><span><i />{t("পড়া হয়নি", "Not studied")}</span><span><i className="today" />{t("আজ", "Today")}</span></div></section>
      <section className="card accuracy-card"><div className="card-heading"><div><h2>{t("বিষয়ভিত্তিক MCQ নির্ভুলতা", "MCQ accuracy by subject")}</h2><p>যেখানে ৭০%-এর নিচে, সেখানে আরও অনুশীলন দরকার।</p></div></div>{SUBJECTS.map(subject => { const stat = accuracy[subject.id]; return <div className="accuracy-row" key={subject.id}><span>{subject.short}</span><ProgressBar value={stat.accuracy} color={subject.color} /><small>{stat.total ? `${bn(stat.accuracy)}% · ${bn(stat.total)}টি` : '—'}</small></div>; })}<button className="button secondary full-width small" onClick={() => navigate('practice')}>{t("MCQ অনুশীলন করো", "Practise MCQ")}</button></section>
    </div>
    <section className="card badges-card"><div className="card-heading"><div><h2><Medal size={19} />{t("অ্যাচিভমেন্ট ব্যাজ", "Achievement badges")}</h2><p>প্রতিদিনের ছোট ছোট জয়। {bn(earned)}/{bn(badges.length)}টি অর্জিত।</p></div></div><div className="badge-grid">{badges.map(badge => <div key={badge.id} className={`badge-item ${badge.earned ? 'earned' : ''}`}><span className="badge-icon">{badge.earned ? <Medal size={22} /> : <Target size={22} />}</span><strong>{badge.title}</strong><span>{badge.detail}</span>{badge.earned && <em><Check size={12} />{t("অর্জিত", "Earned")}</em>}</div>)}</div></section>
    <div className="analytics-disclaimer"><ShieldAlert size={17} /><p>সব হিসাব এই ডিভাইসের স্থানীয় তথ্য থেকে। টাইমার বন্ধ থাকলে সময় স্বয়ংক্রিয়ভাবে ধরা পড়ে না; ম্যানুয়াল এন্ট্রি ব্যবহার করো। শিক্ষার ফলাফল একা মিনিট গোনায় নির্ভর করে না—বিশ্রাম, ঘুম ও বোঝার গভীরতাও গুরুত্বপূর্ণ।</p></div>
  </div>;
}
