import { S_CHAPTERS, S_REASONS, S_REFERENCE, isSuperChapter } from '../superCategory';
import { CHAPTERS } from '../data';
import { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, Check, ChevronRight, CircleCheck, Flag, RefreshCw, Target, TrendingUp,
} from 'lucide-react';
import { usePlanner } from '../context';
import { SUBJECTS, chapterById, subjectById } from '../data';
import { bn, diffDays, formatDate } from '../planner';
import { learningDashboard } from '../learning';
import { scheduleStatus } from '../prediction';
import { regenerationSummary, rescheduleUnfinished } from '../scheduleEdit';
import { aCategoryChecklist, testPrepStats } from '../testPrep';
import { EmptyState, PageHeading, ProgressBar, ProgressRing } from '../components';
import { t } from '../i18n';

export default function TestPrepView() {
  const { plan, data, setData, today, navigate, openChapter, notify, confirm } = usePlanner();
  const stats = useMemo(() => testPrepStats(data, plan, today, 'S'), [data, plan, today]);
  const checklist = useMemo(() => aCategoryChecklist(data, plan, 'S'), [data, plan]);
  const learning = useMemo(() => learningDashboard(data, plan), [data, plan]);
  const status = useMemo(() => scheduleStatus(plan, data, today), [plan, data, today]);
  const [showAll, setShowAll] = useState(false);
  const testDays = diffDays(today, data.settings.testExamDate);

  const rebalance = () => {
    const summary = regenerationSummary(data);
    confirm({
      title: t('অসমাপ্ত কাজ সামনে সরাবে?', 'Move unfinished work forward?'),
      message: t(
        `তারিখ বদলানো হবে, কিন্তু সম্পন্ন কাজ (${bn(summary.completedPreserved)}টি), লক করা দিন (${bn(summary.lockedDates)}টি) ও নিজের সম্পাদনা (${bn(summary.editedTasks)}টি) অক্ষত থাকবে। প্রতি দিন সর্বোচ্চ ৪৫ মিনিট বাড়তে পারে।`,
        `Dates will shift, but completed work (${summary.completedPreserved}), locked dates (${summary.lockedDates}) and your edits (${summary.editedTasks}) stay untouched. Each day may grow by up to 45 minutes.`,
      ),
      label: t('হ্যাঁ, সামনে সরাও', 'Yes, move forward'),
      action: () => {
        const result = rescheduleUnfinished(plan, data, today);
        setData(result.data);
        notify(result.moved
          ? t(`${bn(result.moved)}টি অসমাপ্ত কাজ আজ বা পরের দিনে সরানো হয়েছে।`, `${result.moved} unfinished task(s) moved to today or later.`)
          : t('সরানো মতো কোনো অসমাপ্ত কাজ পাওয়া যায়নি (লক বা সময়সীমা)।', 'No movable unfinished work found (locked or out of budget).'), result.moved ? 'success' : 'info');
      },
    });
  };

  const visibleChecklist = showAll ? checklist : checklist.slice(0, 12);
  const behind = stats.warning === 'behind';
  const overdue = stats.warning === 'overdue';

  return (
    <div className="view testprep-view">
      <PageHeading
        eyebrow="TEST EXAMINATION MODE"
        title="টেস্ট পরীক্ষার আগে S ক্যাটাগরি শেষ করো।"
        titleEn="Finish category S before the Test Exam."
        description="মূল লক্ষ্য: টেস্ট পরীক্ষার তারিখের আগে সব S-ক্যাটাগরি অধ্যায় শেষ। সংখ্যাগুলো তোমার নিজের অগ্রগতি থেকে — কোনো নিশ্চয়তা নয়।"
        descriptionEn="The goal: complete every S-category chapter before the Test Exam. These numbers come from your own progress — nothing is guaranteed."
        action={
          <div className="testprep-countdown">
            <Flag size={17} />
            <strong>{testDays > 0 ? bn(testDays) : t('০', '0')}</strong>
            <span>{t('দিন বাকি', 'days left')}<small>{formatDate(data.settings.testExamDate, 'long')}</small></span>
          </div>
        }
      />

      <section className="study-panel" aria-label="S Super category">
        <h2>{t('S · Super — জানুয়ারির সংক্ষিপ্ত লক্ষ্য', 'S · Super — compact January target')}</h2>
        <p>{t('জানুয়ারি ২০২৭ সম্ভাব্য টেস্ট মাস। নিশ্চিত তারিখ জানা নেই বলে নিরাপদ প্রস্তুতি-সীমা ১ জানুয়ারি; সেটিংসে কলেজের তারিখ বদলাতে পারবে। A/B/C ও আগের progress অপরিবর্তিত। টেস্টের আগে S, পরে বাকি A → B → C।', 'January 2027 is tentative. January 1 is a conservative preparation deadline, not a confirmed exam date. Adjust it in Settings. A/B/C and saved progress remain unchanged: S before the test, remaining A → B → C afterwards.')}</p>
        <p>{t('সৎ সীমাবদ্ধতা: পূর্ণ ও যাচাইকৃত বহু বছরের বোর্ড প্রশ্নের corpus নেই, তাই এটি বিষয়বস্তু ও ভিত্তিগত দক্ষতা ধরে প্রাথমিক shortlist—পরিসংখ্যানভিত্তিক “সবচেয়ে বেশি আসা” তালিকা বা কমনের নিশ্চয়তা নয়। কলেজের সিলেবাসে বাদ থাকা অধ্যায় পড়তে হবে না, আর S-এর বাইরেও প্রশ্ন হতে পারে।', 'Evidence limit: a complete verified multi-year board-question corpus is unavailable. This is a provisional coverage/foundation shortlist, not a statistical frequency ranking or a prediction. Match it to your college syllabus; questions may come from outside S.')}</p>
        <a href={S_REFERENCE.url} target="_blank" rel="noreferrer">{t('দেখা প্রশ্নব্যাংক: ভেক্টর (তৃতীয় পক্ষ)', 'Inspected question bank: vectors (third party)')}</a>
        {!data.settings.sCategoryMode && <button className="button primary" onClick={() => confirm({title: t('S-first জানুয়ারি পরিকল্পনা চালু করবে?', 'Enable S-first January planning?'), message: t('টার্গেট ১ জানুয়ারি হবে। সম্পন্ন কাজ, নোট, লক ও নিজের edits মুছবে না; পুরোনো টার্গেট বদলাবে।', 'Sets the target to January 1. Completed work, notes, locks and manual edits are preserved; the old target changes.'), action: () => setData(d => ({...d, settings: {...d.settings, sCategoryMode: true, testExamDate: '2027-01-01'}}))})}>{t('জানুয়ারির S পরিকল্পনা চালু করো', 'Enable January S plan')}</button>}
        {SUBJECTS.map(subject => <details key={subject.id} className="study-class"><summary>{subject.name} · S {bn(S_CHAPTERS.filter(c => c.subject === subject.id).length)} · {t('টেস্টের পরে বাকি A', 'remaining A after test')} {bn(CHAPTERS.filter(c => c.subject === subject.id && c.priority === 'A' && !isSuperChapter(c)).length)}</summary><p>{t(S_REASONS[subject.id].bn, S_REASONS[subject.id].en)}</p><div className="study-actions">{S_CHAPTERS.filter(c => c.subject === subject.id).map(c => <button key={c.id} className="button secondary small" onClick={() => openChapter(c)}>{t('পত্র', 'Paper')} {bn(c.paper)} · {c.title}</button>)}</div></details>)}
      </section>

      {(behind || overdue) && (
        <div className={`testprep-warning ${overdue ? 'critical' : ''}`} role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>{overdue
              ? t('টেস্ট পরীক্ষার তারিখ শেষ হয়ে গেছে এবং S ক্যাটাগরি বাকি আছে।', 'The Test Exam date has passed and S-category work remains.')
              : t('বর্তমান গতিতে টেস্ট পরীক্ষার আগে S শেষ করা সম্ভব নয়।', 'At your current pace, category S will not finish before the Test Exam.')}</strong>
            {overdue
              ? t(' নতুন তারিখ সেটিংসে ঠিক করো, অথবা বাকি অধ্যায়গুলো প্রাধান্য দিয়ে পড়ো।', ' Set a new date in Settings, or study the remaining chapters by priority.')
              : t(` গত ১৪ দিনে গড়ে দৈনিক ${bn(stats.paceTasksPerDay)} ধাপ শেষ হয়েছে, কিন্তু ${bn(stats.daysLeft)} দিনে ${bn(stats.remainingATasks)} ধাপ দরকার — মানে দৈনিক ${bn(stats.requiredTasksPerDay)} ধাপ।`, ` You completed ${stats.paceTasksPerDay} tasks/day over the last 14 days, but ${stats.remainingATasks} tasks remain in ${stats.daysLeft} days — about ${stats.requiredTasksPerDay} per day.`)}
          </div>
          <button className="button primary small" onClick={rebalance}><RefreshCw size={14} />{t('অসমাপ্ত কাজ সরাও', 'Rebalance schedule')}</button>
        </div>
      )}

      <div className="testprep-hero card">
        <ProgressRing value={stats.percentA} size={132} stroke={10} color={stats.onPace ? 'var(--green)' : '#c98a3b'}>
          <strong>{bn(stats.percentA)}%</strong>
          <span>{t('S সম্পন্ন', 'S done')}</span>
        </ProgressRing>
        <div className="testprep-hero-copy">
          <span className="eyebrow">{t('S ক্যাটাগরি — সর্বোচ্চ অগ্রাধিকার', 'Category S — highest priority')}</span>
          <h2>{bn(stats.doneA)} / {bn(stats.totalA)} {t('অধ্যায় সম্পন্ন', 'chapters completed')}</h2>
          <p>{stats.remainingA === 0
            ? t('🎉 সব S অধ্যায় শেষ! টেস্টের পর বাকি A, তারপর B ও C ক্যাটাগরির পালা — সিলেবাস ড্যাশবোর্ড দেখে পরের ধাপ নাও।', '🎉 All S chapters done! After the test, continue remaining A, then B and C — check the syllabus dashboard for the next step.')
            : t(`বাকি ${bn(stats.remainingA)} টি S অধ্যায় · প্রস্তুতির ধাপ: ক্লাস → পড়া → CQ → MCQ → বোর্ড প্রশ্ন → রিভিশন।`, `${stats.remainingA} S chapters left · the loop: class → reading → CQ → MCQ → board questions → revision.`)}</p>
          <div className="testprep-hero-actions">
            <button className="button secondary" onClick={() => navigate('calendar')}><CalendarDays size={15} />{t('স্টাডি প্ল্যান দেখো', 'Open study plan')}</button>
            <button className="button secondary" onClick={() => navigate('syllabus')}><Target size={15} />{t('পুরো সিলেবাস দেখো', 'View full syllabus')}</button>
            {stats.remainingA > 0 && <button className="button primary" onClick={rebalance}><RefreshCw size={15} />{t('প্ল্যান রিব্যালেন্স', 'Rebalance plan')}</button>}
          </div>
        </div>
      </div>

      <div className="testprep-stats">
        <div className="card stat-tile">
          <span>{t('মোট S অধ্যায়', 'Total S chapters')}</span>
          <strong>{bn(stats.totalA)}</strong>
          <small>{t('সব বিষয় মিলিয়ে', 'across all subjects')}</small>
        </div>
        <div className="card stat-tile">
          <span>{t('সম্পন্ন', 'Completed')}</span>
          <strong className="good">{bn(stats.doneA)}</strong>
          <small>{bn(stats.percentA)}%</small>
        </div>
        <div className="card stat-tile">
          <span>{t('বাকি', 'Remaining')}</span>
          <strong className={behind || overdue ? 'warn' : ''}>{bn(stats.remainingA)}</strong>
          <small>{bn(stats.remainingATasks)} {t('টি নির্ধারিত ধাপ', 'scheduled tasks')}</small>
        </div>
        <div className="card stat-tile">
          <span>{t('টেস্ট পরীক্ষা কাউন্টডাউন', 'Test exam countdown')}</span>
          <strong className={testDays <= 45 ? 'warn' : ''}>{bn(Math.max(0, testDays))}</strong>
          <small>{formatDate(data.settings.testExamDate)}</small>
        </div>
        <div className="card stat-tile">
          <span>{t('প্রতিদিন লাগবে', 'Required per day')}</span>
          <strong>{bn(stats.requiredTasksPerDay)}</strong>
          <small>{t('টি ধাপ/দিন', 'tasks/day')} · {bn(stats.requiredChaptersPerDay)} {t('অধ্যায়/দিন', 'chapters/day')}</small>
        </div>
        <div className="card stat-tile">
          <span>{t('১৪ দিনের আসল গতি', 'Actual 14-day pace')}</span>
          <strong className={stats.onPace ? 'good' : 'warn'}>{bn(stats.paceTasksPerDay)}</strong>
          <small>{t('টি ধাপ/দিন', 'tasks/day')}</small>
        </div>
        <div className="card stat-tile">
          <span>{t('আজকের টার্গেট', "Today's target")}</span>
          <strong>{bn(stats.dailyTarget)}</strong>
          <small>{t('টি S-ধাপ অন্তত', 'S-tasks at least')}</small>
        </div>
        <div className="card stat-tile">
          <span>{t('পুরো পরিকল্পনা', 'Whole plan')}</span>
          <strong className={status.status === 'behind' ? 'warn' : 'good'}>{bn(status.dueDone)}/{bn(status.dueTotal)}</strong>
          <small>{status.status === 'ahead' ? t('সময়ের আগে', 'ahead of schedule') : status.status === 'ontrack' ? t('সময়ের সঙ্গে', 'on track') : t(`${bn(status.gapPercent)}% পিছিয়ে`, `${status.gapPercent}% behind`)}</small>
        </div>
      </div>

      <section className="card testprep-checklist">
        <div className="card-heading">
          <div>
            <h2><CircleCheck size={18} />{t('S ক্যাটাগরি চেকলিস্ট', 'Category S checklist')}</h2>
            <p>{t('প্ল্যানের তারিখ অনুযায়ী সাজানো; অসম্পন্নগুলো আগে। কোনো অধ্যায়ে ক্লিক করলে পুরো লার্নিং পেজ খুলবে।', 'Ordered by plan date, unfinished first. Open any chapter for its full learning page.')}</p>
          </div>
          <button className="button ghost small" onClick={() => setShowAll(v => !v)}>
            {showAll ? t('কম দেখাও', 'Show less') : t(`সব ${bn(checklist.length)} টি দেখাও`, `Show all ${checklist.length}`)}
          </button>
        </div>
        <div className="testprep-list">
          {visibleChecklist.map(item => {
            const chapter = chapterById[item.id];
            if (!chapter) return null;
            return (
              <button key={item.id} className={`testprep-row ${item.done ? 'done' : ''}`} onClick={() => openChapter(chapter)}>
                <span className="testprep-check">{item.done ? <Check size={15} /> : <span className="pending-dot" />}</span>
                <span className="testprep-row-copy">
                  <strong>{chapter.title}</strong>
                  <small style={{ color: subjectById[chapter.subject].color }}>{subjectById[chapter.subject].name} · {t('পত্র', 'Paper')} {bn(chapter.paper)}</small>
                </span>
                <span className="testprep-row-date">{item.date ? formatDate(item.date) : '—'}</span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </div>
        {!checklist.length && <EmptyState title={t('কোনো S অধ্যায় নেই', 'No S chapters')} description={t('অগ্রাধিকার বদলালে তালিকা বদলাবে।', 'Changing priorities updates this list.')} />}
      </section>

      <div className="testprep-subjects">
        {SUBJECTS.map(subject => {
          const group = learning.subject[subject.id];
          return (
            <div className="card testprep-subject-card" key={subject.id}>
              <span className="testprep-subject-name" style={{ color: subject.color }}>{subject.name}</span>
              <strong>{bn(group.completed)}/{bn(group.total)}</strong>
              <ProgressBar value={group.percent} color={subject.color} />
              <small>{bn(group.percent)}% {t('সম্পন্ন', 'complete')}</small>
            </div>
          );
        })}
      </div>

      <div className="info-panel">
        <TrendingUp size={18} />
        <p>{t('S শেষ হলে স্বয়ংক্রিয়ভাবে B ও C লুকানো হবে না — সিলেবাস ও প্ল্যানে সব থাকবে। অগ্রাধিকার কখনোই পরীক্ষার পূর্বাভাস নয়; কোনো অধ্যায় বাদ দেওয়া হয় না।', 'Finishing A never hides B or C — everything stays in the syllabus and plan. Priority is a study order, never an exam prediction; no chapter is dropped.')}</p>
      </div>
    </div>
  );
}
