import { useMemo, useState } from 'react';
import PersonalStudyHome from './PersonalStudyHome';
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
  const { data } = usePlanner();
  return data.personalRoutine ? <PersonalStudyHome /> : <LegacyTestPrepView />;
}
function LegacyTestPrepView() {
  const { plan, data, setData, today, navigate, openChapter, notify, confirm } = usePlanner();
  const stats = useMemo(() => testPrepStats(data, plan, today), [data, plan, today]);
  const checklist = useMemo(() => aCategoryChecklist(data, plan), [data, plan]);
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
        title="টেস্ট পরীক্ষার আগে A ক্যাটাগরি শেষ করো।"
        titleEn="Finish category A before the Test Exam."
        description="মূল লক্ষ্য: টেস্ট পরীক্ষার তারিখের আগে সব A-ক্যাটাগরি অধ্যায় শেষ। সংখ্যাগুলো তোমার নিজের অগ্রগতি থেকে — কোনো নিশ্চয়তা নয়।"
        descriptionEn="The goal: complete every A-category chapter before the Test Exam. These numbers come from your own progress — nothing is guaranteed."
        action={
          <div className="testprep-countdown">
            <Flag size={17} />
            <strong>{testDays > 0 ? bn(testDays) : t('০', '0')}</strong>
            <span>{t('দিন বাকি', 'days left')}<small>{formatDate(data.settings.testExamDate, 'long')}</small></span>
          </div>
        }
      />

      {(behind || overdue) && (
        <div className={`testprep-warning ${overdue ? 'critical' : ''}`} role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>{overdue
              ? t('টেস্ট পরীক্ষার তারিখ শেষ হয়ে গেছে এবং A ক্যাটাগরি বাকি আছে।', 'The Test Exam date has passed and A-category work remains.')
              : t('বর্তমান গতিতে টেস্ট পরীক্ষার আগে A শেষ করা সম্ভব নয়।', 'At your current pace, category A will not finish before the Test Exam.')}</strong>
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
          <span>{t('A সম্পন্ন', 'A done')}</span>
        </ProgressRing>
        <div className="testprep-hero-copy">
          <span className="eyebrow">{t('A ক্যাটাগরি — সর্বোচ্চ অগ্রাধিকার', 'Category A — highest priority')}</span>
          <h2>{bn(stats.doneA)} / {bn(stats.totalA)} {t('অধ্যায় সম্পন্ন', 'chapters completed')}</h2>
          <p>{stats.remainingA === 0
            ? t('🎉 সব A অধ্যায় শেষ! এখন B ও C ক্যাটাগরির পালা — সিলেবাস ড্যাশবোর্ড দেখে পরের ধাপ নাও।', '🎉 All A chapters done! Move on to B and C — check the syllabus dashboard for the next step.')
            : t(`বাকি ${bn(stats.remainingA)} টি A অধ্যায় · প্রস্তুতির ধাপ: ক্লাস → পড়া → CQ → MCQ → বোর্ড প্রশ্ন → রিভিশন।`, `${stats.remainingA} A chapters left · the loop: class → reading → CQ → MCQ → board questions → revision.`)}</p>
          <div className="testprep-hero-actions">
            <button className="button secondary" onClick={() => navigate('calendar')}><CalendarDays size={15} />{t('স্টাডি প্ল্যান দেখো', 'Open study plan')}</button>
            <button className="button secondary" onClick={() => navigate('syllabus')}><Target size={15} />{t('সিলেবাসে A ফিল্টার', 'Filter syllabus to A')}</button>
            {stats.remainingA > 0 && <button className="button primary" onClick={rebalance}><RefreshCw size={15} />{t('প্ল্যান রিব্যালেন্স', 'Rebalance plan')}</button>}
          </div>
        </div>
      </div>

      <div className="testprep-stats">
        <div className="card stat-tile">
          <span>{t('মোট A অধ্যায়', 'Total A chapters')}</span>
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
          <small>{t('টি A-ধাপ অন্তত', 'A-tasks at least')}</small>
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
            <h2><CircleCheck size={18} />{t('A ক্যাটাগরি চেকলিস্ট', 'Category A checklist')}</h2>
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
        {!checklist.length && <EmptyState title={t('কোনো A অধ্যায় নেই', 'No A chapters')} description={t('অগ্রাধিকার বদলালে তালিকা বদলাবে।', 'Changing priorities updates this list.')} />}
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
        <p>{t('A শেষ হলে স্বয়ংক্রিয়ভাবে B ও C লুকানো হবে না — সিলেবাস ও প্ল্যানে সব থাকবে। অগ্রাধিকার কখনোই পরীক্ষার পূর্বাভাস নয়; কোনো অধ্যায় বাদ দেওয়া হয় না।', 'Finishing A never hides B or C — everything stays in the syllabus and plan. Priority is a study order, never an exam prediction; no chapter is dropped.')}</p>
      </div>
    </div>
  );
}
