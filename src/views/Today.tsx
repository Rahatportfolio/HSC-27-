import DailyGoals from '../components/DailyGoals';
import { StudyOverview } from './StudySystem';
import { learningDashboard } from '../learning';
import { weaknessSummary } from '../weakness';
import { classProgress } from '../classes';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowRight, ArrowUpRight, Bell, BellRing, BookOpen, CalendarDays, Check, CheckCheck, ChevronDown,
  ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Flame, FolderOpen, HeartPulse, Layers, ListChecks, Minus,
  NotebookPen, Pause, Play, Plus, RotateCcw, ShieldAlert, Sparkles, Timer, Trash2, Zap,
} from 'lucide-react';
import { usePlanner } from '../context';
import { chapterById, subjectById, SUBJECTS } from '../data';
import type { Chapter, SubjectId } from '../data';
import { BANGLA_LESSONS, CHAPTER_CLASSES } from '../classLinks';
import { buildDailyNotificationDigest } from '../notifications';
import {
  addDays, bn, chapterStudyTasks, dhakaMinutes, diffDays, dailyTargetMinutes, formatDate,
  formatDurationBn, formatTime, getNextUnfinishedDay, getStats, getUnfinishedPastTasks,
  isDayComplete, isValidDate, percent, phaseName, toMinutes, toTimeInput,
} from '../planner';
import type { Day, Task } from '../planner';
import { minutesBetween, minutesOn, startOfWeek } from '../analytics';
import { revisionBuckets, INTERVAL_LABEL } from '../revision';
import { t } from '../i18n';
import { newId } from '../storage';
import { motivationFor } from '../motivation';
import { planBacklog } from '../backlog';
import { dueCount as flashcardDueCount } from '../flashcards';
import { unresolvedMistakeCount } from '../study';
import { testPrepStats } from '../testPrep';
import { carryoversOn, pendingCarryovers, removeCarryover, setTaskCompletion, toggleCarryover } from '../study';
import {
  BackupNudge, ClassBlock, DaySummary, EmptyState, LessonList, LocalNote, PhaseJourney,
  ProgressBar, SubjectBadge, StudyIllustration, SyllabusNotice, TaskCard, WeekChart,
} from '../components';

interface DailyChapterItem {
  chapter: Chapter;
  tasks: Task[];
  totalParts: number;
  doneParts: number;
  totalMinutes: number;
}

interface UnfinishedGroup {
  key: string;
  fromDate: string;
  subject: SubjectId;
  chapter?: Chapter;
  title: string;
  tasks: Task[];
  totalMinutes: number;
}

function buildDailyChapters(day: Day | undefined, plan: Day[], completed: Record<string, string>): DailyChapterItem[] {
  if (!day) return [];
  const map = new Map<string, Task[]>();
  for (const task of day.tasks) {
    for (const cid of task.chapterIds) {
      const list = map.get(cid) || [];
      list.push(task);
      map.set(cid, list);
    }
  }
  const items: DailyChapterItem[] = [];
  for (const [cid, tasksForDay] of map.entries()) {
    const chapter = chapterById[cid];
    if (!chapter) continue;
    const allSessions = chapterStudyTasks(plan, cid);
    const doneParts = allSessions.filter(s => completed[s.id]).length;
    const totalMinutes = tasksForDay.reduce((n, tk) => n + Math.max(15, tk.endMinute - tk.startMinute), 0);
    items.push({ chapter, tasks: tasksForDay, totalParts: allSessions.length, doneParts, totalMinutes });
  }
  return items;
}

function buildUnfinishedGroups(tasks: Task[]): UnfinishedGroup[] {
  const map = new Map<string, UnfinishedGroup>();
  for (const tk of tasks) {
    const cid = tk.chapterIds[0];
    const chapter = cid ? chapterById[cid] : undefined;
    const key = cid ? `${tk.date}:${cid}` : `${tk.date}:${tk.id}`;
    const existing = map.get(key);
    const dur = Math.max(15, tk.endMinute - tk.startMinute);
    if (existing) {
      existing.tasks.push(tk);
      existing.totalMinutes += dur;
    } else {
      map.set(key, {
        key,
        fromDate: tk.date,
        subject: tk.subject,
        chapter,
        title: chapter ? chapter.title : tk.title,
        tasks: [tk],
        totalMinutes: dur,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
}

export default function TodayView() {
  const {
    plan, data, setData, storageOk, today, now, selectedDate, setSelectedDate,
    navigate, exportICS, timer, startTimer, startPresetTimer, sendStudyStatusNotification,
    toggleTask, openChapter, openMistake, notify, confirm,
  } = usePlanner();

  const day = plan.find(item => item.date === selectedDate);
  const notifDigest = buildDailyNotificationDigest(plan, data, selectedDate);
  const stats = getStats(plan, data, today);
  const [openLessons, setOpenLessons] = useState<Record<string, boolean>>({});
  const [collapsedClasses, setCollapsedClasses] = useState<Record<string, boolean>>({});
  const [openPastClasses, setOpenPastClasses] = useState<Record<string, boolean>>({});
  const [showAllUnfinished, setShowAllUnfinished] = useState(false);
  const [taskSubject, setTaskSubject] = useState<SubjectId | 'all'>('all');
  const [taskStatus, setTaskStatus] = useState<'all' | 'pending' | 'done'>('all');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState<SubjectId>('physics');
  const [newTaskTime, setNewTaskTime] = useState('20:00');
  const [newTaskMinutes, setNewTaskMinutes] = useState('60');
  const [showTaskForm, setShowTaskForm] = useState(false);

  const isToday = selectedDate === today;
  const dayNumber = diffDays(data.settings.startDate, selectedDate) + 1;
  const dayOverride = data.dayOverrides?.[selectedDate];
  const activeHours = dailyTargetMinutes(data,selectedDate)/60;
  const measured = minutesOn(data.studySessions, selectedDate);
  const target = activeHours * 60;
  const weekMinutes = minutesBetween(data.studySessions, startOfWeek(today), addDays(startOfWeek(today), 6));
  const totalHours = Math.round(data.focus.minutes / 6) / 10;
  const carriedTasks = new Set(pendingCarryovers(data).map(item => item.taskId));
  const pending = pendingCarryovers(data).length + stats.backlog.filter(task => !carriedTasks.has(task.id)).length;
  const buckets = revisionBuckets(data.revisions, today);
  const due = [...buckets.overdue, ...buckets.today];
  const carryovers = carryoversOn(data, selectedDate);
  const backlog = planBacklog(plan, data, today);
  const backlogCount = backlog.items.length;
  const backlogHours = Math.round(backlog.totalMinutes / 6) / 10;
  const motivation = motivationFor(today);

  const filteredTasks = day?.tasks.filter(task => (taskSubject === 'all' || task.subject === taskSubject) && (taskStatus === 'all' || (taskStatus === 'done') === !!data.completed[task.id])) || [];
  const addPersonalTask = (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = Number(newTaskMinutes);
    if (!newTaskTitle.trim() || newTaskTitle.trim().length > 120 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTaskTime) || !Number.isInteger(minutes) || minutes < 15 || minutes > 480 || data.routineBlocks.length >= 500) {
      notify(t('কাজের নাম, সময় ও ১৫–৪৮০ মিনিট যাচাই করো।', 'Check the task title, time and duration (15–480 minutes).'), 'error'); return;
    }
    const date = selectedDate;
    setData(d => ({ ...d, routineBlocks: [...d.routineBlocks, { id: newId(), date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), startMinute: toMinutes(newTaskTime), minutes, subject: newTaskSubject, title: newTaskTitle.trim(), createdAt: new Date().toISOString() }] }));
    setNewTaskTitle(''); setShowTaskForm(false);
    notify(t('এই দিনের কাজ যোগ হয়েছে।', 'Task added to this day.'));
  };
  const dailyChapters = buildDailyChapters(day, plan, data.completed);
  const dayDone = isDayComplete(day, data.completed);
  const nextStudyDay = dayDone ? getNextUnfinishedDay(plan, selectedDate, data.completed) : undefined;
  const nextDayChapters = buildDailyChapters(nextStudyDay, plan, data.completed);
  const nextUpTask = day?.tasks.find(tk => !data.completed[tk.id]);
  const heroProgressPct = Math.max(percent(measured, target), notifDigest.percentDone);
  const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Previous unfinished chapters/tasks surfaced automatically alongside today's 2 chapters!
  const carryoversHere = new Set(carryovers.filter(item => !item.completedAt).map(item => item.taskId));
  const unfinishedPastTasks = getUnfinishedPastTasks(plan, selectedDate, data.completed).filter(task => !carryoversHere.has(task.id));
  const unfinishedGroups = buildUnfinishedGroups(unfinishedPastTasks);
  const visibleUnfinished = showAllUnfinished ? unfinishedGroups : unfinishedGroups.slice(0, 4);

  const firstStartMin = day?.tasks[0]?.startMinute ?? toMinutes(data.settings.startTime);
  const hasDayOverride = Boolean(
    dayOverride &&
    (dayOverride.startMinute !== undefined ||
      dayOverride.dailyHours !== undefined ||
      (dayOverride.taskMinutes && Object.keys(dayOverride.taskMinutes).length > 0) ||
      (dayOverride.taskStartMinutes && Object.keys(dayOverride.taskStartMinutes).length > 0)),
  );

  // Cascading time & daily hours controls for selectedDate
  const setDayStartMinute = (minuteOfDay: number) => {
    const clamped = Math.max(0, Math.min(1439, Math.round(minuteOfDay)));
    setData(d => ({
      ...d,
      dayOverrides: {
        ...d.dayOverrides,
        [selectedDate]: {
          ...(d.dayOverrides?.[selectedDate] || {}),
          startMinute: clamped,
          taskStartMinutes: {},
        },
      },
    }));
    notify(`শুরুর সময় ${formatTime(clamped)}-এ সেট হয়েছে — পরের সব সেশনের সময় অটো আপডেট হয়েছে!`);
  };

  const setDayHours = (hours: number) => {
    if(data.advanced?.targets[selectedDate]!==undefined){notify(t('এই দিনের target locked।','This day’s target is locked.'),'info');return;}
    const clamped = Math.max(4, Math.min(18, Math.round(hours)));
    setData(d => ({
      ...d,
      dayOverrides: {
        ...d.dayOverrides,
        [selectedDate]: {
          ...(d.dayOverrides?.[selectedDate] || {}),
          dailyHours: clamped,
          taskMinutes: {},
        },
      },
    }));
  };

  const resetDayOverride = () => {
    setData(d => {
      const copy = { ...d.dayOverrides };
      delete copy[selectedDate];
      return { ...d, dayOverrides: copy };
    });
    notify('এই দিনের সময়সূচি ডিফল্ট অবস্থায় ফিরে গেছে।', 'info');
  };

  const markTasksComplete = (tasksToMark: Task[]) => {
    setData(d => setTaskCompletion(d, tasksToMark.map(task => task.id), !tasksToMark.every(task => !!d.completed[task.id])));
  };

  const runPreset = (tk: Task, chapter?: Chapter, customMinutes?: number) => {
    const mins = customMinutes ?? Math.max(15, tk.endMinute - tk.startMinute);
    if (timer.taskId === tk.id && (timer.running || timer.accumulatedMs > 0)) {
      if (timer.running) timer.pause();
      else timer.start();
      return;
    }
    if (startPresetTimer) {
      startPresetTimer({
        subject: tk.subject,
        chapterId: chapter?.id || tk.chapterIds[0],
        durationMin: mins,
        label: chapter ? chapter.title : tk.title,
        taskId: tk.id,
      });
    } else {
      startTimer(tk.subject, chapter?.id || tk.chapterIds[0]);
      navigate('timer');
    }
  };

  const nextImportant = [...data.importantDates].filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const shiftDate = (amount: number) => { const next = addDays(selectedDate, amount); if (isValidDate(next)) setSelectedDate(next); };
  const timerText = timer.mode === 'stopwatch'
    ? `${bn(String(Math.floor(timer.elapsedSec / 60)).padStart(2, '0'))}:${bn(String(timer.elapsedSec % 60).padStart(2, '0'))}`
    : `${bn(String(Math.floor(timer.remainingSec / 60)).padStart(2, '0'))}:${bn(String(timer.remainingSec % 60).padStart(2, '0'))}`;

  const renderChapterCards = (items: DailyChapterItem[], isNextDayPreview = false) => (
    <div className="daily-chapter-list">
      {items.map(({ chapter, tasks: chTasks, totalParts, doneParts, totalMinutes }, idx) => {
        const links = CHAPTER_CLASSES[chapter.id];
        const lessons = BANGLA_LESSONS[chapter.id];
        const allChTasksDone = chTasks.every(tk => !!data.completed[tk.id]);
        const nextPendingTask = chTasks.find(tk => !data.completed[tk.id]) || chTasks[0];
        const firstTask = chTasks[0];
        const lastTask = chTasks[chTasks.length - 1];
        const subject = subjectById[chapter.subject];
        const lessonsExpanded = !!openLessons[chapter.id];
        const activeChapterTimer = chTasks.some(tk => timer.taskId === tk.id && (timer.running || timer.accumulatedMs > 0));

        return (
          <article
            key={`${isNextDayPreview ? 'next-' : ''}${chapter.id}`}
            className={`daily-chapter-card ${allChTasksDone ? 'done' : ''} ${activeChapterTimer ? 'timer-live' : ''}`}
            style={{ '--subject': subject.color, '--subject-tint': subject.tint } as CSSProperties}
          >
            <div className="daily-chapter-top">
              <div className="daily-chapter-info">
                <div className="daily-chapter-badges">
                  <span className="subject-slot-pill">{t(`বিষয় ${bn(idx + 1)}`, `Subject ${idx + 1}`)}</span>
                  <SubjectBadge subject={chapter.subject} small />
                  <span className="paper-chip">{chapter.paper === 1 ? t('১ম পত্র', '1st Paper') : t('২য় পত্র', '2nd Paper')} · {t('অধ্যায়', 'Ch.')} {bn(chapter.number)}</span>
                  {chapter.priority === 'A' && <span className="priority-badge a">{t('অগ্রাধিকার A', 'Priority A')}</span>}
                  <span className="time-chip strong">
                    <Clock3 size={12} />
                    {formatDurationBn(totalMinutes)} · {formatTime(firstTask.startMinute)} – {formatTime(lastTask.endMinute)}
                  </span>
                </div>
                <button type="button" className="daily-chapter-title" onClick={() => openChapter(chapter)}>
                  <h3>{chapter.title}</h3>
                  <span className="chapter-part-pill">{t('অগ্রগতি', 'Progress')} {bn(doneParts)}/{bn(totalParts)}</span>
                </button>
              </div>
              <div className="daily-chapter-actions">
                {!allChTasksDone && (
                  <button
                    type="button"
                    className={`button small ${activeChapterTimer && timer.running ? 'danger' : 'secondary'} preset-launch-btn`}
                    onClick={() => runPreset(nextPendingTask, chapter)}
                  >
                    {activeChapterTimer && timer.running ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                    {activeChapterTimer
                      ? `${timer.running ? t('চলছে', 'Live') : t('বিরতি', 'Paused')} · ${timerText}`
                      : `${t('টাইমার', 'Timer')} · ${formatDurationBn(Math.max(15, nextPendingTask.endMinute - nextPendingTask.startMinute))}`}
                  </button>
                )}
                <button
                  type="button"
                  className={`button small ${allChTasksDone ? 'secondary' : 'primary'}`}
                  onClick={() => markTasksComplete(chTasks)}
                >
                  <Check size={14} />
                  {allChTasksDone ? t('সম্পন্ন ✓', 'Done ✓') : t('সম্পন্ন করো', 'Mark done')}
                </button>
                <button type="button" className="button ghost small" onClick={() => openChapter(chapter)}>
                  {t('নোট ও বিস্তারিত', 'Details')} <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Step-by-step sub-sessions for this chapter with individual checkboxes & preset timers */}
            <div className="chapter-session-steps">
              {chTasks.map(tk => {
                const tkDone = !!data.completed[tk.id];
                const tkMin = Math.max(15, tk.endMinute - tk.startMinute);
                const tkRunning = timer.taskId === tk.id && (timer.running || timer.accumulatedMs > 0);
                return (
                  <div key={tk.id} className={`chapter-step-row ${tkDone ? 'done' : ''} ${tkRunning ? 'running' : ''}`}>
                    <button
                      type="button"
                      className={`task-check small ${tkDone ? 'checked' : ''}`}
                      aria-pressed={tkDone}
                      aria-label={`${tk.title} সম্পন্ন`}
                      onClick={() => toggleTask(tk.id)}
                    >
                      {tkDone && <Check size={13} strokeWidth={2.6} />}
                    </button>
                    <div className="chapter-step-copy">
                      <strong>{tk.title}</strong>
                      <span>{formatTime(tk.startMinute)} – {formatTime(tk.endMinute)} · <b>{formatDurationBn(tkMin)}</b></span>
                    </div>
                    {!tkDone && (
                      <button
                        type="button"
                        className={`step-timer-pill ${tkRunning && timer.running ? 'live' : ''}`}
                        onClick={() => runPreset(tk, chapter, tkMin)}
                      >
                        {tkRunning && timer.running ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        <span>{tkRunning ? timerText : t(`${formatDurationBn(tkMin)} টাইমার`, `${formatDurationBn(tkMin)} timer`)}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {links && (
              <div className="daily-classes-section">
                <div className="daily-classes-bar">
                  <span className="daily-classes-caption">{t('সরাসরি ইউটিউব ক্লাস (ওয়ান শট · CQ · MCQ)', 'Direct YouTube classes (One-Shot · CQ · MCQ)')}</span>
                  <button
                    type="button"
                    className="text-button collapse-classes-btn"
                    onClick={() => setCollapsedClasses(s => ({ ...s, [chapter.id]: !s[chapter.id] }))}
                  >
                    {collapsedClasses[chapter.id] ? t('ক্লাস দেখো', 'Show classes') : t('সংক্ষিপ্ত করো', 'Collapse')}
                    <ChevronDown size={13} className={!collapsedClasses[chapter.id] ? 'rotated' : ''} />
                  </button>
                </div>
                {!collapsedClasses[chapter.id] && <ClassBlock classes={links} compact />}
              </div>
            )}

            {lessons && lessons.length > 0 && (
              <div className="daily-lessons-wrap">
                <button type="button" className="text-button daily-lessons-toggle" onClick={() => setOpenLessons(s => ({ ...s, [chapter.id]: !lessonsExpanded }))}>
                  <BookOpen size={14} />
                  {t(`পাঠভিত্তিক গদ্য/পদ্য ক্লাস (${bn(lessons.length)}টি)`, `Lesson-by-lesson classes (${lessons.length})`)}
                  <ChevronDown size={14} className={lessonsExpanded ? 'rotated' : ''} />
                </button>
                {lessonsExpanded && <LessonList lessons={lessons} />}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );

  const learning = learningDashboard(data, plan);
  const weakness = weaknessSummary(plan, data, today);
  const watchedClasses = classProgress(data);
  const prep = testPrepStats(data, plan, today);
  const dueCount = flashcardDueCount(data, today);
  const unresolvedMistakes = unresolvedMistakeCount(data);
  /** Exam readiness is a separate metric from syllabus completion: syllabus × mock performance × MCQ accuracy. Never a guarantee of GPA. */
  const mockScores = Object.values(data.exams).map(exam => exam.total ? Math.round((exam.score / exam.total) * 100) : 0);
  const mockAvg = mockScores.length ? mockScores.reduce((a, b) => a + b, 0) / mockScores.length : 0;
  const mcqAttempts = data.attempts.filter(a => a.date >= addDays(today, -45));
  const mcqAcc = mcqAttempts.length ? Math.round((mcqAttempts.filter(a => a.correct).length / mcqAttempts.length) * 100) : 0;
  const syllabusPart = learning.overall.percent * 0.5;
  const mockPart = mockAvg * 0.3;
  const mcqPart = mcqAcc * 0.2;
  const examReadiness = Math.round(syllabusPart + mockPart + mcqPart);
  return <div className="view today-view"><StudyOverview /><DailyGoals key={today}/>
    {weakness.total > 0 && <div className="home-weakness-alert" role="status">
      <ShieldAlert size={20} />
      <div>
        <strong>{weakness.dueRetries > 0
          ? t(`${bn(weakness.dueRetries)}টি ভুল প্রশ্ন ফেরত পাওয়ার অপেক্ষায়`, `${weakness.dueRetries} wrong question(s) waiting for a retry`)
          : t(`${bn(weakness.total)}টি অধ্যায়ে দুর্বলতা ধরা পড়েছে`, `${weakness.total} chapter(s) flagged as weak`)}</strong>
        <span>{weakness.focus[0]
          ? t(`আজ আগে: ${chapterById[weakness.focus[0].chapterId]?.title || ''}`, `Start with: ${chapterById[weakness.focus[0].chapterId]?.title || ''}`)
          : t('বিশ্লেষণে দেখো কোন অধ্যায়ে নম্বর কমছে।', 'See which chapters are losing marks.')}</span>
      </div>
      <button className="button secondary small" onClick={() => navigate('weakness')}>{t('দুর্বলতা দেখো', 'Open weak spots')}<ChevronRight size={15} /></button>
    </div>}
    <section className="card" aria-label={t('সিলেবাসের অগ্রগতি', 'Syllabus progress')}>
      <div className="card-heading"><div><h2>{t('অধ্যায়ের অগ্রগতি', 'Chapter progress')}</h2><p>{t('ব্যক্তিগত অবস্থা বা সম্পন্ন সেশনের হিসাবে; ক্লাস দেখা একা অধ্যায় সম্পন্ন করে না।', 'Based on personal status or completed sessions; watching a class alone does not complete a chapter.')}</p></div><strong>{bn(learning.overall.percent)}%</strong></div>
      <ProgressBar value={learning.overall.percent} />
      <p>{t('সম্পন্ন', 'Completed')} {bn(learning.overall.completed)} / {bn(learning.overall.total)} · {t('চলছে', 'In progress')} {bn(learning.overall.inProgress)} · {t('বাকি', 'Remaining')} {bn(learning.overall.remaining)}</p>
      <div className="test-readiness-subjects">{(['A', 'B', 'C'] as const).map(p => <div className="test-readiness-row" key={p}><span>{p}</span><ProgressBar value={learning.category[p].percent} /><small>{bn(learning.category[p].completed)}/{bn(learning.category[p].total)}</small></div>)}{SUBJECTS.map(sub => <div className="test-readiness-row" key={sub.id}><span>{sub.short}</span><ProgressBar value={learning.subject[sub.id].percent} color={sub.color} /><small>{bn(learning.subject[sub.id].completed)}/{bn(learning.subject[sub.id].total)}</small></div>)}</div>
    </section>
    <section className="card testprep-quick" aria-label={t('টেস্ট প্রস্তুতি সংক্ষিপ্ত', 'Test prep snapshot')}>
      <div className="testprep-quick-top">
        <div>
          <span className="eyebrow">{t('ফেব্রুয়ারি ২০২৭ টেস্ট পরীক্ষা', 'Feb 2027 Test Exam')}</span>
          <h2>{t('টেস্ট প্রস্তুতি', 'Test prep')} · {t(`${bn(prep.daysLeft)} দিন বাকি`, `${prep.daysLeft} days left`)}</h2>
        </div>
        <button type="button" className="button secondary small" onClick={() => navigate('testprep')}>{t('টেস্ট মোডে যাও', 'Open test mode')}<ArrowRight size={13} /></button>
      </div>
      <div className="testprep-quick-stats">
        <div><strong>{bn(prep.percentA)}%</strong><span>{t('A ক্যাটাগরি শেষ', 'Category A done')}</span></div>
        <div><strong>{bn(prep.doneA)}/{bn(prep.totalA)}</strong><span>{t('A-অধ্যায়', 'A chapters')}</span></div>
        <div><strong>{bn(prep.requiredTasksPerDay)}</strong><span>{t('A-কাজ/দিন লাগবে', 'A-tasks/day needed')}</span></div>
        <div><strong>{bn(examReadiness)}%</strong><span>{t('পরীক্ষা প্রস্তুতি', 'Exam readiness')}</span></div>
      </div>
      <ProgressBar value={prep.percentA} />
      {prep.warning && <p className="testprep-quick-warning">{t('পেছিয়ে আছো — আজ অন্তত একটি A-কাজ করে ফেলো।', 'You are behind — do at least one A-task today.')}</p>}
    </section>
    <section className="welcome-hero">
      <div className="hero-copy">
        <div className="hero-eyebrow"><span className="live-dot" />{t('লক্ষ্য: ফেব্রুয়ারি ২০২৭ টেস্ট পরীক্ষা · দিনে ২টি বিষয়', 'Target: Feb 2027 Test Exam · 2 Subjects Daily')}</div>
        <h1>{isToday ? t('প্রতিদিন ২টি বিষয়,', '2 subjects a day,') : t('তোমার গোছানো রুটিন,', 'Your focused routine,')}<br /><span>{t('ধাপে ধাপে এগিয়ে যাই।', 'moves us forward.')}</span></h1>
        <p>{formatDate(selectedDate, 'long')}, {formatDate(selectedDate, 'weekday')} <span className="hero-separator">·</span> {day ? `${t('দিন', 'Day')} ${bn(dayNumber)} / ${bn(plan.length)}` : t('পরিকল্পনার বাইরে', 'outside plan range')}</p>
        <div className="hero-chips">
          <span><BookOpen size={14} />{t('আজকের লক্ষ্য', 'Target today')} {bn(activeHours)} {t('ঘণ্টা', 'hrs')}</span>
          {data.settings.boostEnabled && selectedDate < data.settings.boostStartDate && (
            <span><Zap size={14} />{formatDate(data.settings.boostStartDate)} {t(`থেকে দৈনিক ${bn(data.settings.boostDailyHours)} ঘণ্টা`, `→ ${data.settings.boostDailyHours}h/day`)}</span>
          )}
          <span><Clock3 size={14} />{t('পড়া হয়েছে', 'Studied')} {bn(Math.floor(measured / 60))}{t('ঘ', 'h')} {bn(measured % 60)}{t('মি', 'm')}</span>
          <button type="button" className="hero-chip-link" onClick={() => { sessionStorage.setItem('prostuti.openClass', '1'); navigate('videos'); }}><Play size={14} />{t(`ক্লাস দেখা চালিয়ে যাও · ${bn(watchedClasses.watched)}/${bn(watchedClasses.total)}`, `Continue classes · ${watchedClasses.watched}/${watchedClasses.total}`)}</button>
          <span><HeartPulse size={14} />{day ? phaseName(day.phase) : t('তোমার পরিকল্পনা', 'your plan')}</span>
          {dueCount > 0 && <span><ListChecks size={14} />{t('ফ্ল্যাশকার্ড রিভিশন', 'Flashcard revision')} <strong>{bn(dueCount)}</strong> {t('বাকি', 'due')}</span>}
          {unresolvedMistakes > 0 && <span><NotebookPen size={14} fill="currentColor" />{t('অসমাধান ভুল', 'Mistakes pending')} <strong>{bn(unresolvedMistakes)}</strong> {t('বাকি', 'pending')}</span>}
        </div>
        <div className="hero-progress-wrap">
          <div className="hero-progress">
            <div>
              <span>{t('আজকের অগ্রগতি', 'Today’s progress')} · {bn(notifDigest.doneTasks)}/{bn(notifDigest.totalTasks)} {t('সেশন', 'sessions')}</span>
              <strong>{bn(heroProgressPct)}%</strong>
            </div>
            <ProgressBar value={heroProgressPct} />
          </div>
          <div className="hero-action-row">
            {nextUpTask ? (
              <button
                type="button"
                className="hero-primary-cta"
                onClick={() => runPreset(nextUpTask, nextUpTask.chapterIds[0] ? chapterById[nextUpTask.chapterIds[0]] : undefined)}
              >
                <Play size={14} fill="currentColor" />
                <span>{t('এখন শুরু করো:', 'Start next:')} <strong>{nextUpTask.title}</strong> ({formatDurationBn(Math.max(15, nextUpTask.endMinute - nextUpTask.startMinute))})</span>
              </button>
            ) : dayDone && nextStudyDay ? (
              <button type="button" className="hero-primary-cta" onClick={() => setSelectedDate(nextStudyDay.date)}>
                <Sparkles size={14} />
                <span>{t('আজকের সব পড়া সম্পন্ন! পরের দিনে যাও', 'Today 100% complete! Open next day')}</span>
              </button>
            ) : null}
            <button type="button" className="hero-secondary-cta" onClick={() => openMistake()}>
              <NotebookPen size={14} />{t('দ্রুত ভুল নোট', 'Log mistake')}
            </button>
            <button type="button" className="hero-secondary-cta" onClick={() => navigate('library')}>
              <FolderOpen size={14} />{t('ক্লাস আর্কাইভ', 'Class archive')}
            </button>
          </div>
        </div>
      </div>
      <div className="hero-art"><StudyIllustration /><div className="hero-art-note"><span className="small-spark">✦</span>{t('দিনে ২টি অধ্যায় · স্থির মনোযোগ।', '2 chapters/day · calm focus.')}</div></div>
    </section>

    <div className="today-quick-strip">
      <div className="motivation-ribbon">
        <span className="motivation-mark" aria-hidden="true">✦</span>
        <p><strong>{t('আজকের কথা:', 'Note:')}</strong> {t(motivation.bn, motivation.en)}</p>
      </div>
      <div className="today-jump-pills" role="navigation" aria-label={t('দ্রুত সেকশন নেভিগেশন', 'Quick section jump')}>
        <button type="button" onClick={() => scrollToSection('today-study-hub')}>{t('আজকের ২ বিষয়', '2 Subjects')}</button>
        <button type="button" onClick={() => scrollToSection('today-timeline-card')}>{t('সময়সূচি', 'Timeline')}</button>
        <button type="button" onClick={() => navigate('revision')}>{t('রিভিশন', 'Revision')}{due.length > 0 ? ` (${bn(due.length)})` : ''}</button>
        <button type="button" onClick={() => navigate('practice')}>{t('কুইজ ও CQ', 'Quiz & CQ')}</button>
      </div>
    </div>

    {/* 1. Previous Unfinished Study Rollover — automatically appears beside Today's study if earlier tasks weren't completed! */}
    <div id="today-pending">{carryovers.some(item => !item.completedAt) && <button className="text-button" onClick={() => scrollToSection('today-timeline-card')}><ListChecks size={15} />{t('এই দিনের ব্যাকলগ দেখো', 'See backlog for this day')}</button>}</div>
    {unfinishedGroups.length > 0 && (
      <section className="card unfinished-rollover-card" aria-label={t('আগের দিনের অসমাপ্ত পড়া', 'Previous unfinished study')}>
        <div className="unfinished-header">
          <div>
            <h2>
              <RotateCcw size={18} />
              {t('আগের দিনের অসমাপ্ত পড়া', 'Unfinished from earlier days')}
              <span className="count-badge warn">{bn(unfinishedGroups.length)}{t('টি বাকি', ' pending')}</span>
            </h2>
            <p>{t('কোনো তাড়াহুড়ো নেই—আজকের ২টি অধ্যায়ের ফাঁকে সুবিধামতো এগুলো শেষ করে টিক দিয়ে দাও।', 'No rush — finish these calmly alongside today’s 2 chapters and tick them off as you go.')}</p>
          </div>
          {unfinishedGroups.length > 4 && (
            <button type="button" className="button secondary small" onClick={() => setShowAllUnfinished(v => !v)}>
              {showAllUnfinished ? t('সংক্ষিপ্ত করো', 'Show fewer') : t(`সব দেখো (${bn(unfinishedGroups.length)}টি)`, `See all (${unfinishedGroups.length})`)}
            </button>
          )}
        </div>
        <div className="unfinished-grid">
          {visibleUnfinished.map(group => {
            const links = group.chapter ? CHAPTER_CLASSES[group.chapter.id] : undefined;
            const firstTk = group.tasks[0];
            const isRunningThis = group.tasks.some(tk => timer.taskId === tk.id && (timer.running || timer.accumulatedMs > 0));
            return (
              <article key={group.key} className="unfinished-item-card" style={{ '--subject': subjectById[group.subject].color, '--subject-tint': subjectById[group.subject].tint } as CSSProperties}>
                <div className="unfinished-item-top">
                  <div>
                    <div className="daily-chapter-badges">
                      <SubjectBadge subject={group.subject} small />
                      <span className="from-date-pill">{formatDate(group.fromDate)} {t('থেকে বাকি', 'leftover')}</span>
                      <span className="time-chip"><Clock3 size={12} />{formatDurationBn(group.totalMinutes)}</span>
                    </div>
                    <h4>{group.title}</h4>
                  </div>
                  <div className="unfinished-item-actions">
                    <button
                      type="button"
                      className={`button small ${isRunningThis && timer.running ? 'danger' : 'secondary'}`}
                      onClick={() => runPreset(firstTk, group.chapter, group.totalMinutes)}
                    >
                      {isRunningThis && timer.running ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                      {isRunningThis ? timerText : `${t('টাইমার', 'Timer')} · ${formatDurationBn(group.totalMinutes)}`}
                    </button>
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => markTasksComplete(group.tasks)}
                    >
                      <CheckCheck size={14} />{t('সম্পন্ন ✓', 'Done ✓')}
                    </button>
                  </div>
                </div>
                {links && (
                  <div className="unfinished-classes-toggle-wrap">
                    <button
                      type="button"
                      className="text-button unfinished-classes-btn"
                      onClick={() => setOpenPastClasses(s => ({ ...s, [group.key]: !s[group.key] }))}
                    >
                      <Play size={12} />
                      {openPastClasses[group.key] ? t('ক্লাস লুকাও', 'Hide classes') : t('সরাসরি ক্লাস লিংক দেখো', 'Show class links')}
                      <ChevronDown size={13} className={openPastClasses[group.key] ? 'rotated' : ''} />
                    </button>
                    {openPastClasses[group.key] && <ClassBlock classes={links} compact />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    )}

    {/* 2. Today's 2-Subject / 2-Chapter Study Cockpit + Cascading Time/Hour Bar */}
    <section id="today-study-hub" className="card daily-hub-card">
      <div className="daily-hub-header">
        <div className="daily-hub-title">
          <h2>
            <Sparkles size={18} />
            {isToday ? t('আজকের নির্ধারিত পড়া', 'Today’s study plan') : t('নির্বাচিত দিনের পড়া', 'Selected day’s study')}
            {dailyChapters.length > 0 && <span className="count-badge">{bn(dailyChapters.length)}{t('টি বিষয়', ' subjects')}</span>}
          </h2>
          <p>{t('আজকের ২টি বিষয়ের সময়কাল, টাইমার ও ক্লাস নিচে সাজানো আছে। যেকোনো সময় বদলালে পরের সেশনগুলো স্বয়ংক্রিয়ভাবে মিলিয়ে নেবে।', 'Duration, preset timers, and classes for today’s 2 subjects are arranged below. Changing any time shifts later sessions automatically.')}</p>
        </div>
        <div className="daily-date-bar">
          <button type="button" className="icon-button" onClick={() => shiftDate(-1)} aria-label={t('আগের দিন', 'Previous day')}><ChevronLeft size={18} /></button>
          <label className="daily-date-picker">
            <CalendarDays size={15} />
            <span>{isToday ? t('আজ · ', 'Today · ') : ''}{formatDate(selectedDate)}</span>
            <input type="date" aria-label={t('পড়ার তারিখ নির্বাচন', 'Pick study date')} value={selectedDate} min="2020-01-01" max="2041-12-31" onChange={e => { if (isValidDate(e.target.value)) setSelectedDate(e.target.value); }} />
          </label>
          <button type="button" className="icon-button" onClick={() => shiftDate(1)} aria-label={t('পরের দিন', 'Next day')}><ChevronRight size={18} /></button>
          {!isToday && <button type="button" className="button secondary small" onClick={() => setSelectedDate(today)}>{t('আজকে ফেরো', 'Today')}</button>}
          <button
            type="button"
            className={`button small notif-quick-btn ${data.settings.reminderEnabled ? 'secondary' : 'primary'}`}
            onClick={() => void sendStudyStatusNotification?.(selectedDate)}
            title={t('আজ কী পড়া, কতটুকু পড়া ও কতটুকু কমপ্লিট করা লাগবে — নোটিফিকেশনে পাঠাও', 'Send today’s study, total hours & remaining progress to notifications')}
          >
            <BellRing size={14} />
            {data.settings.reminderEnabled
              ? t('নোটিফিকেশনে পাঠাও', 'Notify progress')
              : t('রিমাইন্ডার চালু করো', 'Enable reminders')}
          </button>
        </div>
      </div>

      {/* Flexible Start Time & Study Hours Strip (Cascades all times automatically!) */}
      {day && (
        <div className="day-time-control-bar">
          <div className="time-ctrl-group">
            <label className="time-ctrl-input">
              <Clock3 size={14} />
              <span>{t('শুরুর সময়:', 'Start time:')}</span>
              <input
                type="time"
                aria-label={t('আজকের শুরুর সময়', 'Today start time')}
                value={toTimeInput(firstStartMin)}
                onChange={e => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) setDayStartMinute(toMinutes(e.target.value)); }}
              />
            </label>
            {isToday && (
              <button type="button" className="button secondary small" onClick={() => setDayStartMinute(dhakaMinutes(now))}>
                <Zap size={13} />{t('এখন থেকে শুরু', 'Start from now')}
              </button>
            )}
          </div>

          <div className="time-ctrl-group">
            <span className="ctrl-label">{t('দৈনিক পড়া:', 'Study hours:')}</span>
            <div className="hours-stepper">
              <button type="button" className="icon-step-btn" aria-label={t('১ ঘণ্টা কমাও', 'Decrease 1 hour')} onClick={() => setDayHours(activeHours - 1)} disabled={activeHours <= 4}><Minus size={13} /></button>
              <strong>{bn(activeHours)} {t('ঘণ্টা', 'hrs')}</strong>
              <button type="button" className="icon-step-btn" aria-label={t('১ ঘণ্টা বাড়াও', 'Increase 1 hour')} onClick={() => setDayHours(activeHours + 1)} disabled={activeHours >= 18}><Plus size={13} /></button>
            </div>
            <div className="hours-quick-pills">
              {[8, 12, 16, 18].map(h => (
                <button key={h} type="button" className={`hour-pill ${activeHours === h ? 'active' : ''}`} onClick={() => setDayHours(h)}>
                  {bn(h)}{t('ঘ.', 'h')}
                </button>
              ))}
            </div>
            {hasDayOverride && (
              <button type="button" className="text-button reset-override-btn" onClick={resetDayOverride}>
                <RotateCcw size={13} />{t('পূর্বাবস্থা', 'Reset')}
              </button>
            )}
          </div>
        </div>
      )}

      {day && day.tasks.some(task => !task.chapterIds.length) && <button className="text-button" onClick={() => scrollToSection('today-timeline-card')}><ListChecks size={15} />{t(`${bn(day.tasks.filter(task => !task.chapterIds.length).length)}টি অন্যান্য সেশন সময়সূচিতে দেখো`, `See ${day.tasks.filter(task => !task.chapterIds.length).length} other sessions in the timeline`)}</button>}
      {dailyChapters.length > 0 ? (
        renderChapterCards(dailyChapters, false)
      ) : (
        <div className="daily-hub-empty">
          <p>{day ? t('আজ নতুন অধ্যায় নেই — নিচের সময়সূচি অনুযায়ী রিভিশন, মডেল টেস্ট বা বাকি কাজ সম্পন্ন করো।', 'No new chapter today — complete the scheduled revision, model test, or catch-up blocks below.') : t('এই তারিখে কোনো সেশন নেই। সিলেবাস থেকে যেকোনো অধ্যায়ের ক্লাস দেখতে পারো।', 'No scheduled session on this date. Open Syllabus & Classes to study any chapter.')}</p>
          <button type="button" className="button secondary small" onClick={() => navigate('syllabus')}>{t('সিলেবাস ও ক্লাস দেখো', 'Browse syllabus & classes')} <ArrowRight size={14} /></button>
        </div>
      )}
    </section>

    {/* 3. Auto-Advance Next Day Study Card — appears IMMEDIATELY when today's work is 100% done! */}
    {dayDone && nextStudyDay && (
      <section className="card next-day-auto-card" aria-label={t('পরের দিনের পড়া', 'Next day study')}>
        <div className="next-day-banner">
          <div>
            <span className="next-day-eyebrow">✦ {t('অভিনন্দন! আজকের নির্ধারিত পড়া সম্পন্ন হয়েছে', 'Well done! Today’s scheduled study is complete')}</span>
            <h2>
              {t('পরের দিনের পড়া রেডি — চাইলে এখনই এগিয়ে রাখো', 'Next day’s study is ready — get ahead now')}
              <span className="count-badge">{formatDate(nextStudyDay.date, 'long')}</span>
            </h2>
            <p>{t('হাতে সময় থাকলে এখনই পরের দিনের অধ্যায় শুরু করতে পারো—এখন টিক দিলে সেটি সম্পন্ন হিসেবেই সেভ থাকবে।', 'If you have extra time, start tomorrow’s chapters right away — anything you tick stays saved.')}</p>
          </div>
          <button type="button" className="button secondary small" onClick={() => setSelectedDate(nextStudyDay.date)}>
            {t('পরের দিনে যাও', 'Open next day')} <ArrowRight size={14} />
          </button>
        </div>
        {nextDayChapters.length > 0 ? (
          renderChapterCards(nextDayChapters, true)
        ) : (
          <div className="task-list">{nextStudyDay.tasks.map(tk => <TaskCard key={tk.id} task={tk} compact />)}</div>
        )}
      </section>
    )}

    <PhaseJourney startDate={data.settings.startDate} activeDate={selectedDate} />

    <div className="stats-grid">
      <button className="stat-card stat-link" onClick={() => navigate('syllabus')}><span className="stat-icon green"><BookOpen size={19} /></span><div><span>{t('সিলেবাস সম্পন্ন', 'Syllabus progress')}</span><strong>{bn(learning.overall.percent)}<small>%</small></strong><p>{bn(learning.overall.completed)} / {bn(learning.overall.total)} {t('অধ্যায় ও ইউনিট', 'chapters & units')}</p></div><ProgressBar value={learning.overall.percent} className="stat-progress" /></button>
      <button className="stat-card stat-link" onClick={() => navigate('timer')}><span className="stat-icon peach"><Clock3 size={19} /></span><div><span>{t('এ সপ্তাহের পড়া', 'Studied this week')}</span><strong>{bn(Math.floor(weekMinutes / 60))}<small> ঘণ্টা {bn(weekMinutes % 60)} মি.</small></strong><p>{t('মোট', 'Total')} {bn(totalHours)} {t('ঘণ্টা টাইমারে', 'hours on timer')}</p></div></button>
      <button className="stat-card stat-link" onClick={() => navigate('analytics')}><span className="stat-icon lavender"><Flame size={19} /></span><div><span>{t('টানা পড়ার ধারা', 'Active streak')}</span><strong>{bn(stats.streak)}<small> {t('দিন', 'days')}</small></strong><p>{stats.streak ? t('ধারাবাহিকতা বজায় রাখো', 'Keep this streak going') : t('আজ থেকেই শুরু হোক', 'Start your streak today')}</p></div></button>
      <button className="stat-card stat-link" onClick={() => { setSelectedDate(today); scrollToSection('today-pending'); }}><span className="stat-icon blue"><ListChecks size={19} /></span><div><span>{t('বাকি কাজ ও রিভিশন', 'Pending & revision')}</span><strong>{bn(pending)}<small> {t('টি কাজ', ' tasks')}</small></strong><p>{due.length ? `${bn(due.length)} ${t('টি রিভিশন বাকি', 'revisions due')}` : t('আজ কোনো রিভিশন বাকি নেই', 'No revision due')}</p></div><ArrowUpRight size={15} className="stat-arrow" /></button>
      <button className="stat-card stat-link" onClick={() => navigate('backlog')}><span className="stat-icon lavender"><Layers size={19} /></span><div><span>{t('জমে থাকা কাজ', 'Backlog')}</span><strong>{bn(backlogHours)}<small>{t(' ঘণ্টা', ' h')}</small></strong><p>{backlogCount ? t(`${bn(backlogCount)}টি সেশন · ৮ ঘণ্টার সীমায় ভাগ হবে`, `${backlogCount} sessions · spread under the 8-hour cap`) : t('কিছু জমে নেই', 'Nothing pending')}</p></div><ArrowUpRight size={15} className="stat-arrow" /></button>
    </div>

    {due.length > 0 && <div className="recall-banner"><span><RotateCcw size={17} /><strong>{bn(due.length)} {t('টি অধ্যায়ের রিভিশন বাকি আছে।', 'chapter revisions are due.')}</strong> {t('অল্প সময় নিয়ে একবার দেখে নাও।', 'Take a few minutes to review them.')}</span><button className="text-button" onClick={() => navigate('revision')}>{t('রিভিশনে যাও', 'Open revision')} <ArrowRight size={15} /></button></div>}
    {nextImportant && <div className="important-banner"><span><Bell size={17} /><strong>{nextImportant.title}</strong> · {formatDate(nextImportant.date, 'long')} · {diffDays(today, nextImportant.date) === 0 ? t('আজ', 'today') : `${bn(diffDays(today, nextImportant.date))} ${t('দিন বাকি', 'days left')}`}{nextImportant.note ? ` — ${nextImportant.note}` : ''}</span><button className="text-button" onClick={() => navigate('calendar')}>{t('সব তারিখ', 'All dates')} <ArrowRight size={15} /></button></div>}

    <div className="dashboard-grid">
      <section id="today-timeline-card" className="card schedule-card">
        <div className="schedule-heading">
          <div>
            <h2>{isToday ? t('আজকের সময়সূচি · এক নজরে', 'Today’s timeline · at a glance') : t('দিনের সময়সূচি · এক নজরে', 'Day timeline · at a glance')} <span className="count-badge">{bn(day?.tasks.length || 0)}{t('টি সেশন', ' sessions')}</span></h2>
            <p>{t('যেকোনো সেশনে ক্লিক করে আলাদাভাবে সময় কমাতে বা বাড়াতে পারবে—পরের সেশনগুলো স্বয়ংক্রিয়ভাবে মিলিয়ে নেবে।', 'Click any session to fine-tune its start time or duration — later sessions shift automatically.')}</p>
          </div>
          <button type="button" className="button secondary small" onClick={() => exportICS('day', selectedDate)}>
            <CalendarDays size={14} />{t('ক্যালেন্ডারে যোগ', 'Export .ics')}
          </button>
        </div>
        {!isToday && <div className="selected-date-bar"><span>{formatDate(selectedDate, 'long')}</span><button className="text-button" onClick={() => setSelectedDate(today)}>{t('আজকে ফেরো', 'Back to today')} <ArrowRight size={14} /></button></div>}
        {day?.isCatchup && <div className="catchup-note"><RotateCcw size={16} />{t('সাপ্তাহিক গোছানো ও রিভিশন দিন (২টি বিষয়) — জমে থাকা পড়া ও বোর্ড প্রশ্ন ঝালাই করো।', 'Weekly 2-subject catch-up & revision day.')}</div>}
        {carryovers.length > 0 && <div className="carryover-list"><div className="carryover-heading"><strong><ListChecks size={15} />{t('এই দিনের ব্যাকলগ', 'Backlog for this day')}</strong><span>{bn(carryovers.filter(item => !item.completedAt).length)} {t('টি বাকি', 'left')}</span></div>{carryovers.map(item => <div key={item.id} className={`carryover-row ${item.completedAt ? 'done' : ''}`}><button className={`task-check ${item.completedAt ? 'checked' : ''}`} aria-pressed={!!item.completedAt} aria-label={`${item.title} সম্পন্ন`} onClick={() => setData(d => toggleCarryover(d, item.id))}>{item.completedAt && <span>✓</span>}</button><div><strong>{item.title}</strong><span>{phaseName(plan.find(d => d.date === item.fromDate)?.phase || 'learn')} · {t('থেকে', 'from')} {formatDate(item.fromDate)} · {bn(item.minutes)} {t('মি.', 'min')}</span></div><button className="icon-button" aria-label={t('ব্যাকলগ থেকে সরাও', 'Remove from backlog')} onClick={() => setData(d => removeCarryover(d, item.id))}><Trash2 size={15} /></button></div>)}</div>}
        {day ? <><div className="filter-bar task-filter-bar"><select aria-label={t('কাজের বিষয়', 'Task subject')} value={taskSubject} onChange={e => setTaskSubject(e.target.value as SubjectId | 'all')}><option value="all">{t('সব বিষয়', 'All subjects')}</option>{SUBJECTS.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><select aria-label={t('কাজের অবস্থা', 'Task status')} value={taskStatus} onChange={e => setTaskStatus(e.target.value as 'all' | 'pending' | 'done')}><option value="all">{t('সব কাজ', 'All tasks')}</option><option value="pending">{t('বাকি', 'Pending')}</option><option value="done">{t('সম্পন্ন', 'Done')}</option></select><button className="button secondary small" onClick={() => setShowTaskForm(v => !v)}><Plus size={15} />{t('নতুন কাজ', 'New task')}</button></div>
        {showTaskForm && <form className="personal-task-form" onSubmit={addPersonalTask}><input aria-label={t('কাজের নাম', 'Task title')} placeholder={t('কাজের নাম', 'Task title')} maxLength={120} required value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} /><select aria-label={t('নতুন কাজের বিষয়', 'New task subject')} value={newTaskSubject} onChange={e => setNewTaskSubject(e.target.value as SubjectId)}>{SUBJECTS.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><input aria-label={t('কাজের সময়', 'Task time')} type="time" required value={newTaskTime} onChange={e => setNewTaskTime(e.target.value)} /><input aria-label={t('কাজের সময়কাল মিনিট', 'Task duration minutes')} type="number" min="15" max="480" required value={newTaskMinutes} onChange={e => setNewTaskMinutes(e.target.value)} /><button className="button primary small" type="submit">{t('যোগ করো', 'Add task')}</button></form>}
        <div className="task-list">{filteredTasks.map(task => { const custom = data.routineBlocks.find(block => block.date === selectedDate && task.id === `custom-${selectedDate}-${block.id}`); return <div key={task.id}><TaskCard task={task} compact />{custom && <button className="text-button" onClick={() => confirm({ title: t('নিজের কাজ মুছবে?', 'Delete this task?'), message: task.title, danger: true, label: t('মুছে ফেলো', 'Delete'), action: () => setData(d => { const completed = { ...d.completed }; delete completed[task.id]; return { ...d, completed, routineBlocks: d.routineBlocks.filter(block => block.id !== custom.id), carryovers: d.carryovers.filter(item => item.taskId !== task.id) }; }) })}><Trash2 size={14} />{t('নিজের কাজ মুছো', 'Delete personal task')}</button>}</div>; })}{!filteredTasks.length && <p className="tiny-muted">{t('এই ফিল্টারে কোনো কাজ নেই।', 'No tasks match these filters.')}</p>}</div><DaySummary day={day} /><div className="schedule-footer"><span>{t(`বিরতি বাদে মোট ${bn(activeHours)} ঘণ্টা পড়ার লক্ষ্য · বাংলাদেশ সময়`, `Total ${activeHours}h net study time · Bangladesh time`)}</span><button className="text-button" onClick={() => navigate('calendar', selectedDate)}><CalendarDays size={15} />{t('মাসিক রুটিন দেখো', 'Open monthly calendar')}</button></div></> : <EmptyState title={t('এই তারিখে কোনো সেশন নেই', 'No session on this date')} description={t(`তোমার পরিকল্পনা ${formatDate(plan[0].date)} থেকে ${formatDate(plan[plan.length - 1].date)} পর্যন্ত।`, `Your plan runs from ${formatDate(plan[0].date)} to ${formatDate(plan[plan.length - 1].date)}.`)} action={<button className="button primary" onClick={() => setSelectedDate(today)}>{t('আজকের পড়ায় ফিরে যাও', 'Back to today’s study')}</button>} />}
      </section>

      <aside className="dashboard-rail">
        <section className="focus-card">
          <div className="focus-heading"><span><span className="live-dot" />{timer.mode === 'pomodoro' ? 'পোমোডোরো' : timer.mode === 'countdown' ? 'কাউন্টডাউন' : 'স্টপওয়াচ'}</span><button className="mini-link" onClick={() => navigate('timer')}>{t('পূর্ণ টাইমার', 'Full timer')}<ArrowUpRight size={13} /></button></div>
          <div className="timer-mini-display"><strong className="timer-digits">{timerText}</strong><span>{chapterById[timer.chapterId]?.title || timer.label || subjectById[timer.subject].name}</span></div>
          <div className="timer-mini-actions"><button className="timer-start" onClick={timer.running ? timer.pause : timer.start}>{timer.running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}{timer.running ? t('বিরতি', 'Pause') : t('শুরু', 'Start')}</button><button className="timer-reset" onClick={() => navigate('timer')} aria-label={t('টাইমার পেজ', 'Timer page')}><Timer size={16} /></button></div>
          <p>{t('মোট', 'Total')} {bn(data.focus.sessions)}{t('টি সেশন', ' sessions')} · {bn(totalHours)} {t('ঘণ্টা', 'hrs')}</p>
        </section>
        <section className="card revision-mini-card">
          <div className="card-heading"><h3>{t('আজকের রিভিশন', "Today's revision")}</h3><span className="tiny-muted">{bn(due.length)}{t('টি', '')}</span></div>
          {due.length ? <div className="mini-revision-list">{due.slice(0, 3).map(item => <button key={item.id} onClick={() => navigate('revision')}><span className={`revision-dot ${item.dueDate < today ? 'late' : ''}`} /><span><strong>{chapterById[item.chapterId]?.title}</strong><small>{INTERVAL_LABEL[item.interval]} · {formatDate(item.dueDate)}</small></span><ChevronRight size={15} /></button>)}</div> : <div className="mini-empty"><CheckMark />{t('আজ কোনো রিভিশন বাকি নেই', 'All caught up on revision')}</div>}
          <button className="button secondary full-width small" onClick={() => navigate('revision')}><RotateCcw size={15} />{t('সব রিভিশন দেখো', 'See all revision')}</button>
        </section>
        <section className="card week-card"><div className="card-heading"><h3>{t('এ সপ্তাহের অগ্রগতি', "This week's progress")}</h3><span className="tiny-muted">{t('সম্পন্ন সেশন', 'Completed blocks')}</span></div><WeekChart /><div className="week-legend"><span className="legend-dot" />{t('টিক দেওয়া সেশনের সময় অনুযায়ী হিসাব', 'Calculated from completed study blocks')}</div></section>
        <LocalNote />
        <section className="reminder-nudge">
          <div className="reminder-nudge-head">
            <span className="nudge-icon"><BellRing size={20} /></span>
            <span className={`notif-live-pill ${data.settings.reminderEnabled ? 'on' : ''}`}>
              {data.settings.reminderEnabled ? t('রিমাইন্ডার চালু', 'Active') : t('রিমাইন্ডার বন্ধ', 'Off')}
            </span>
          </div>
          <h3>{t('স্টাডি নোটিফিকেশন ও হিসাব', 'Study notifications & digest')}</h3>
          <div className="notif-mini-digest">
            <div><span>{t('আজ কী পড়া', 'Today')}</span><strong>{notifDigest.whatToStudy}</strong></div>
            <div><span>{t('কতটুকু পড়া', 'Total study')}</span><strong>{notifDigest.totalSummary}</strong></div>
            <div><span>{t('কমপ্লিট বাকি', 'To complete')}</span><strong>{notifDigest.remainingSummary}</strong></div>
          </div>
          <div className="reminder-nudge-actions">
            <button type="button" className="notif-send-btn" onClick={() => void sendStudyStatusNotification?.(selectedDate)}>
              <BellRing size={15} />
              {data.settings.reminderEnabled
                ? t('আজকের হিসাব নোটিফিকেশনে পাঠাও', 'Send study digest now')
                : t('চালু করো ও নোটিফিকেশনে দেখো', 'Turn on & send digest')}
            </button>
            <button type="button" className="notif-settings-link" onClick={() => navigate('reminders')}>
              {t('রিমাইন্ডার সেট করো', 'Set reminders')}<ArrowUpRight size={15} />
            </button>
          </div>
        </section>
      </aside>
    </div>
    <SyllabusNotice />
    <BackupNudge />
    <div className="view-footer"><span><span className={`status-dot ${storageOk ? 'ok' : ''}`} />{storageOk ? 'সব তথ্য এই ডিভাইসে সেভ হচ্ছে' : 'সেভ হয়নি — ব্যাকআপ রাখো'}</span><button className="text-button" onClick={() => navigate('settings')}>{t('ব্যাকআপ রাখো', 'Keep a backup')}<ArrowUpRight size={13} /></button></div>
  </div>;
}

function CheckMark() {
  return <span className="mini-check"><ClipboardCheck size={15} /></span>;
}
