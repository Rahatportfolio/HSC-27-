import { useMemo, useRef, useState } from 'react';
import PersonalSessionCard from '../components/PersonalSessionCard';
import StudyBrainTeaser from '../components/StudyBrainTeaser';
import PersonalAllocationHistory from '../components/PersonalAllocationHistory';
import PersonalRoutineSetup from '../components/PersonalRoutineSetup';
import type { PersonalRoutine } from '../personalRoutine';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Settings2 } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, chapterById } from '../data';
import { addDays, bn, dailyTargetMinutes, formatDate, formatDurationBn, formatTime, isValidDate } from '../planner';
import { BackupNudge, LocalNote, ProgressBar, TaskCard } from '../components';
import { learningProgress } from '../learning';
import { applyAllChapterRoutine, hasFullPersonalAllocation, isPersonalTaskComplete, personalBookLabel, personalChapterPairs, personalRoutineHealth, routineIssueText, weeklyWindows, personalChapterProgress, nextPersonalRoutine } from '../personalRoutine';
import { t } from '../i18n';
import { parseBackup, saveData } from '../storage';

/** The core goal is a selected important syllabus, not completing every app feature. */
export default function PersonalStudyHome() {
  const { data, plan, selectedDate, setSelectedDate, today, navigate, exportICS, openChapter, confirm, setData, notify } = usePlanner();
  const latest = useRef({ data, plan }); latest.current = { data, plan };
  const routine = data.personalRoutine!;
  const [phaseDraft, setPhaseDraft] = useState<PersonalRoutine | null>(null);
  const sRoutine = routine.scope === 'S' ? routine : data.personalPhases?.S;
  const nextPhase = useMemo(() => nextPersonalRoutine(data, today), [data, today]);
  const health = useMemo(() => personalRoutineHealth(data, plan), [data, plan]);
  const plannedChapterIds = routine.chapterIds.filter(id => hasFullPersonalAllocation(data, plan, id));
  const unknownChapters = health.issues.find(issue => issue.code === 'unknown-duration')?.chapterIds || [];
  const selected = CHAPTERS.filter(c => routine.chapterIds.includes(c.id));
  const progress = learningProgress(selected, data, plan);
  const sProgress = routine.scope === 'ALL' ? progress : sRoutine ? learningProgress(CHAPTERS.filter(c => sRoutine.chapterIds.includes(c.id)), data, plan) : progress;
  const groupProgress = routine.chapterIds.map(id => personalChapterProgress(routine, id, data.completed));
  const coverage = Math.round(groupProgress.reduce((sum, item) => sum + item.coveragePercent, 0) / Math.max(1, groupProgress.length));
  const readiness = Math.round(groupProgress.reduce((sum, item) => sum + item.readinessPercent, 0) / Math.max(1, groupProgress.length));
  const day = plan.find(item => item.date === selectedDate);
  const tasks = day?.tasks || [];
  const chapterIds = [...new Set(tasks.flatMap(task => task.personalWork ? task.chapterIds : []))];
  const pair = chapterIds.length ? chapterIds : personalChapterPairs(routine).find(ids => ids.some(id => !personalChapterProgress(routine, id, data.completed).fullyComplete)) || [];
  const dayMinutes = tasks.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
  const doneMinutes = tasks.filter(task => isPersonalTaskComplete(task, data.completed)).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
  const backlog = plan.flatMap(d => d.tasks).filter(task => (task.date < today || task.rescheduledFrom && task.rescheduledFrom < today) && !isPersonalTaskComplete(task, data.completed));
  const windows = weeklyWindows(routine, selectedDate);
  const changeDate = (value: string) => { if (isValidDate(value) && value >= data.settings.startDate && value < data.settings.examDate) setSelectedDate(value); };
  if (phaseDraft) return <PersonalRoutineSetup initialRoutine={phaseDraft} onDone={() => setPhaseDraft(null)} onCancel={() => setPhaseDraft(null)} />;
  return <div className="view personal-home">
    <PersonalSessionCard main />
    {routine.scope !== 'ALL' && <section className="card personal-session"><h2>{t('সব অধ্যায়ে তিন-সেশন রুটিন', 'Three sessions for every chapter')}</h2><p>{t('পুরোনো নির্বাচনের বাইরে থাকা অধ্যায়ও যোগ করো। আগের সময়, নোট, টিক ও সংরক্ষিত ধাপ থাকবে; সব কাজ লক্ষ্য তারিখে নাও কুলাতে পারে।', 'Add chapters outside your old selection. Existing availability, notes, ticks and saved phases stay; not all work may fit before the target.')}</p><button type="button" className="button primary" onClick={() => { const original = JSON.stringify(data); confirm({ title: t('সব অধ্যায় যোগ করবে?', 'Add all chapters?'), message: t('পুরোনো অগ্রগতি ও ধাপ রাখা হবে। সময় না কুলালে ঘাটতি দেখাবে।', 'Old progress and phases are retained. Any capacity shortfall will be shown.'), label: t('সব অধ্যায় যোগ করো', 'Add all chapters'), action: () => { try { if (JSON.stringify(latest.current.data) !== original) throw new Error(t('তথ্য বদলেছে; আবার চেষ্টা করো। নতুন পরিবর্তন অক্ষত আছে।', 'Data changed; try again. Newer changes were not overwritten.')); const next = applyAllChapterRoutine(latest.current.data, latest.current.plan); parseBackup(JSON.stringify(next)); if (!saveData(next, true)) throw new Error(t('সেভ হয়নি; আগের তথ্য অক্ষত আছে।', 'Could not save; existing data is unchanged.')); setData(next); notify(t('সব অধ্যায় যোগ হয়েছে।', 'All chapters added.'), 'success'); } catch (error) { notify((error as Error).message, 'error'); } } }); }} title={t('পুরোনো রুটিন বদলাতে নিশ্চিতকরণ লাগবে', 'Confirmation required to change your saved routine')}>{t('সব অধ্যায় যোগ করো', 'Add all chapters')}</button></section>}
    <StudyBrainTeaser />
    <BackupNudge />
    <section className="card personal-day-controls" aria-label={t('পড়ার দিন নির্বাচন', 'Choose study day')}>
      <button type="button" className="icon-button" aria-label={t('আগের দিন', 'Previous day')} disabled={selectedDate <= data.settings.startDate} onClick={() => changeDate(addDays(selectedDate, -1))}><ArrowLeft size={18} /></button>
      <label>{t('পড়ার তারিখ', 'Study date')}<input type="date" aria-label={t('পড়ার তারিখ নির্বাচন', 'Select study date')} min={data.settings.startDate} max={addDays(data.settings.examDate, -1)} value={selectedDate} onChange={e => changeDate(e.target.value)} /></label>
      <button type="button" className="icon-button" aria-label={t('পরের দিন', 'Next day')} disabled={selectedDate >= addDays(data.settings.examDate, -1)} onClick={() => changeDate(addDays(selectedDate, 1))}><ArrowRight size={18} /></button>
      <button type="button" className="button ghost small" onClick={() => changeDate(today < data.settings.startDate ? data.settings.startDate : today)}>{t('আজ', 'Today')}</button>
      <div className="personal-availability-summary"><strong>{formatDate(selectedDate, 'long')}</strong><span>{windows.length ? windows.map(window => `${formatTime(window.startMinute)}–${formatTime(window.endMinute)}`).join(' · ') : t('এই দিন পড়ার সময় দাওনি', 'No availability on this weekday')}</span><small>{t('দেওয়া সময়ের সীমা', 'Availability cap')}: {formatDurationBn(dailyTargetMinutes(data, selectedDate))} · {t('পড়ার বরাদ্দ', 'Allocated work')}: {formatDurationBn(dayMinutes)} · {t('সম্পন্ন', 'Done')}: {formatDurationBn(doneMinutes)}</small></div>
    </section>
    {health.issues.length > 0 && <section className="card personal-capacity" aria-label={t('আসল সময় ও রুটিনের ঘাটতি', 'Actual duration and capacity gaps')}>
      <h2><Clock3 size={18} />{t('সময় না মিললে আগে সেটাই জানবে', 'See time gaps before trusting a finish date')}</h2>
      {health.issues.slice(0, 4).map((issue, index) => <p className="personal-warning" key={index}>{routineIssueText(issue)}</p>)}
      {health.issues.length > 4 && <details><summary>{t('বাকি সতর্কতা', 'More warnings')} ({bn(health.issues.length - 4)})</summary>{health.issues.slice(4).map((issue, index) => <p key={index}>{routineIssueText(issue)}</p>)}</details>}
      <button type="button" className="button primary small" onClick={() => navigate('settings')}>{t('ভিডিওর সময় ও নিজের পড়ার সময় মেলাও', 'Review class durations & availability')}</button>
    </section>}
    <LocalNote />
    <details className="personal-more"><summary>{t('অগ্রগতি, তারিখ ও আরও তথ্য', 'Progress, date and more')}</summary>
    <button type="button" className="button secondary" onClick={() => navigate('settings')}><Settings2 size={16} />{t('সময় ও রুটিন বদলাও', 'Edit availability & routine')}</button>
    <section className="card personal-goal" aria-label={routine.scope === 'ALL' ? t('সব অধ্যায়ের অগ্রগতি', 'All-chapter progress') : t('S ক্যাটাগরির অগ্রগতি', 'S category progress')}>
      <div className="card-heading"><div><span className="s-category-badge">{routine.scope === 'ALL' ? 'ALL' : 'S'}</span><h2>{routine.scope === 'ALL' ? t('আমার সব অধ্যায়', 'All my chapters') : t('আমার গুরুত্বপূর্ণ সিলেবাস', 'My important syllabus')}</h2><p>{routine.scope === 'ALL' ? t('সব অধ্যায় তিনটি সেশনে থাকবে। সময় না কুলালে নিচে সতর্কতা দেখাবে।', 'All chapters use three sessions. Capacity shortfalls are shown.') : t('বাকিগুলো বই/ক্লাসের তালিকায় আছে, কিন্তু এখনকার রুটিনে বাধ্যতামূলক নয়। S কোনো সরকারি সাজেশন নয়।', 'Other chapters remain in the library, but are not compulsory in this routine. S is not an official exam suggestion.')}</p></div><strong>{bn(sProgress.completed)}/{bn(sProgress.total)}</strong></div>
      <div className="personal-s-counts"><span>{routine.scope === 'ALL' ? t('মোট অধ্যায়', 'Total chapters') : t('মোট S', 'S total')}: <strong>{bn(sProgress.total)}</strong></span><span>{t('সম্পন্ন', 'Completed')}: <strong>{bn(sProgress.completed)}</strong></span><span>{t('বাকি', 'Remaining')}: <strong>{bn(sProgress.remaining)}</strong></span></div>
      <ProgressBar value={sProgress.percent} /><p>{bn(sProgress.percent)}% {t('সম্পন্ন', 'complete')} · {bn(sProgress.remaining)} {t('টি বাকি। কেবল অর্ধেক বা এক ভিডিও শেষ হলেই পুরো অধ্যায় সম্পন্ন হয় না।', 'remaining. A half or one finished video does not complete a whole chapter.')}</p>
      {routine.scope !== 'S' && routine.scope !== 'ALL' && <p><strong>{t('বর্তমান ধাপ', 'Current phase')}: {routine.scope}</strong> · {bn(progress.completed)}/{bn(progress.total)} · {bn(progress.remaining)} {t('বাকি। S-এর সব কাজ শেষ করার পরই এই ধাপ চালু হয়েছে।', 'remaining. This phase was enabled only after all S work were completed.')}</p>}
      <div className="personal-metrics" role="group" aria-label={t('কভারেজ ও প্রস্তুতি আলাদা হিসাব', 'Separate coverage and readiness')}><div><strong>{t('সিলেবাস কভারেজ', 'Syllabus Coverage')} · {bn(coverage)}%</strong><ProgressBar value={coverage} /><small>{routine.scope} · {t('ভিডিও + বই পড়া + নোট', 'Video + reading + notes')}</small></div><div><strong>{t('পরীক্ষার প্রস্তুতি', 'Exam Readiness')} · {bn(readiness)}%</strong><ProgressBar value={readiness} /><small>{t('সব কাজের হিসাব, নম্বরের নিশ্চয়তা নয়', 'All work, not a score guarantee')}</small></div></div>
      {health.syllabusEnd && <p>{routine.scope} · {t('শেষ সময় বরাদ্দ (পড়ার প্রমাণ নয়)', 'Last allocated work date (not proof of completion)')}: {formatDate(health.syllabusEnd, 'long')}</p>}
      <button type="button" className="text-button" onClick={() => navigate('syllabus')}>{routine.scope === 'ALL' ? t('সব অধ্যায়ের তালিকা খোলো', 'Open all chapters') : t('S অধ্যায়ের তালিকা খোলো', 'Open S chapter list')}</button>
    </section>
    {nextPhase && <section className="card personal-next-phase" aria-label={t('পরের ধাপের পরিকল্পনা', 'Next-phase planning')}><h2>{routine.scope} {t('ধাপের সব কাজ সম্পন্ন', 'phase’s required work is complete')}</h2><p>{t('এবার বাকি সিলেবাসের পরের ধাপ তৈরি করতে পারো। তোমার সময় বজায় থাকবে; অজানা ভিডিওর দৈর্ঘ্য বানানো হবে না।', 'You can now prepare the next syllabus phase. Your availability is retained; unknown video durations are never invented.')} {nextPhase.scope} · {bn(nextPhase.chapterIds.length)} {t('অধ্যায়', 'chapters')}</p><button type="button" className="button primary" onClick={() => setPhaseDraft(nextPhase)}>{t('পরের ধাপ তৈরি করো', 'Prepare next phase')} · {nextPhase.scope}</button></section>}
    <section className="card personal-current-pair">
      <div className="card-heading"><div><h2>{t('একই দুই বই, দুই দিনের জোড়া', 'Same two books, two-day pair')}</h2><p>{t('প্রতি অধ্যায়ে প্রথমে ক্লাস, তারপর নোট, শেষে সলভিং ও নিজের অনুশীলন। সময় কম হলে একই জোড়া বেশি দিন চলবে।', 'For each chapter: class first, then notes, then solving and practice. The pair continues for as many days as needed.')}</p></div><button type="button" className="button ghost small" onClick={() => exportICS('week', selectedDate)}><CalendarDays size={15} />{t('সপ্তাহের ক্যালেন্ডার', 'Week calendar')}</button></div>
      <div className="personal-pair-grid">{pair.map(id => <button type="button" className="personal-pair-chapter" key={id} onClick={() => openChapter(chapterById[id])}><span className="s-category-badge">{routine.scope}</span><small>{personalBookLabel(id)}</small><strong>{chapterById[id].title}</strong><span>{tasks.find(task => task.chapterIds.includes(id))?.personalWork?.pairDay ? `${t('এই জোড়ার পড়ার দিন', 'Pair study day')} ${bn(tasks.find(task => task.chapterIds.includes(id))!.personalWork!.pairDay)}` : t('ক্লাসের প্রকৃত সময় মেলানো বাকি', 'Actual class durations still needed')}</span></button>)}</div>
      {!pair.length && <p>{plannedChapterIds.length === routine.chapterIds.length ? routine.scope === 'ALL' ? t('এই তারিখে নতুন অধ্যায় নেই। নিজের সম্পন্ন অগ্রগতি মিলিয়ে নাও।', 'No new chapter on this date. Check your actual completion.') : t('এই তারিখে নতুন অধ্যায় নেই। S-এর বরাদ্দ শেষ হলে স্বয়ংক্রিয়ভাবে বাকি A/B/C ঢোকানো হবে না; নিজের সম্পন্ন অগ্রগতি মিলিয়ে নাও।', 'No new chapter on this date. Allocating S never automatically adds other A/B/C chapters; check your actual completion.') : t('এই দিনে জোড়ার কাজ নেই। সময় ও ভিডিওর দৈর্ঘ্য মেলাও।', 'No paired work on this date. Review availability and durations.')}</p>}
    </section>
    <details><summary>{t('অংশভিত্তিক বিস্তারিত সময়সূচি', 'Detailed segment schedule')}</summary><section className="card personal-tasks" aria-label={t('নির্বাচিত দিনের সময়সূচি', 'Selected day schedule')}>
      <div className="card-heading"><h2>{t('আজকের অংশ—পুরো ক্লাস নয়', 'Today’s segments—not an entire long class')}</h2><span>{formatDurationBn(dayMinutes)}</span></div>
      {tasks.length ? <div className="task-list">{tasks.map(task => <TaskCard task={task} key={task.id} />)}</div> : <p>{!windows.length ? t('ছুটির দিন—তোমার দেওয়া সময়ের বাইরে রুটিন বসানো হয়নি।', 'Off day—no routine was placed outside your availability.') : !unknownChapters.length && health.syllabusEnd && selectedDate > health.syllabusEnd ? t(`এই ধাপের সব বরাদ্দ ${formatDate(health.syllabusEnd, 'long')}-এ শেষ। এরপর আর কোনো কাজ নেই; পরের ধাপ তৈরি বা সময় বাড়াতে Settings খোলো।`, `This phase’s allocation ends on ${formatDate(health.syllabusEnd, 'long')}. There is no work after it; open Settings to prepare the next phase or add time.`) : unknownChapters.length ? t(`${unknownChapters.slice(0, 2).map(id => chapterById[id]?.title || id).join(' + ')} — সময় অজানা। Settings-এ প্রকৃত সময় পড়ো/লেখো; অযৌক্তিক ৮০ মিনিট ধরে কাজ বানানো হয়নি। বাকি অধ্যায়ের কাজ চলছে।`, `${unknownChapters.slice(0, 2).map(id => chapterById[id]?.title || id).join(' + ')} — durations are unknown. Read/enter the real durations in Settings; no arbitrary 80-minute task was made. The other chapters keep their sessions.`) : t('এই তারিখের জন্য কাজ বরাদ্দ নেই। ক্যালেন্ডারে আগের/পরের পড়ার দিন দেখো।', 'No work allocated on this date. Check earlier/later study days in the calendar.')}</p>}
    </section>
    </details>
    {!!day?.historyTasks?.length && <PersonalAllocationHistory tasks={day.historyTasks} />}
    {!!day?.unscheduled?.length && <section className="card personal-unallocated"><h2>{t('সংরক্ষিত কাজের সময় মেলেনি', 'Retained appointments need a valid slot')}</h2><p>{t('নিজের যোগ করা কাজ পড়ার সময়ের বাইরে বা অন্য কাজের সঙ্গে মিলেছে। ক্যালেন্ডারে গিয়ে সময় ঠিক করো; তথ্য মুছেনি।', 'Some custom appointments are outside availability or clash. Edit their time in the calendar; no record was deleted.')}</p><button type="button" className="button secondary small" onClick={() => navigate('calendar', selectedDate)}>{t('ক্যালেন্ডারে সময় ঠিক করো', 'Edit appointment in calendar')}</button></section>}
    {backlog.length > 0 && <section className="card"><h2>{t('আগের দিনের অসমাপ্ত অংশ', 'Earlier unfinished segments')}</h2><p>{bn(backlog.length)} {t('টি অংশ বাকি। এগুলো পরের ফাঁকা সময়ে বসেছে, অথবা লক/সময়সীমার কারণে এখনও বসেনি। পরের কাজ পিছিয়েছে; কোনো দিনের সীমার ওপর বাড়তি কাজ চাপেনি।', 'segments are still owed. They occupy actual free slots, or remain blocked by locks/deadlines. Later work moves back; nothing is stacked above a day’s limit.')}</p><button type="button" className="button secondary small" onClick={() => navigate('backlog')}>{t('অসমাপ্ত কাজ দেখো', 'Review unfinished work')}</button></section>}
    </details>
  </div>;
}
