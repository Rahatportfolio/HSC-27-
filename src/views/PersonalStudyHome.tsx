import { useMemo, useState } from 'react';
import PersonalAllocationHistory from '../components/PersonalAllocationHistory';
import PersonalRoutineSetup from '../components/PersonalRoutineSetup';
import type { PersonalRoutine } from '../personalRoutine';
import StudyBrainTeaser from '../components/StudyBrainTeaser';
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Settings2 } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, chapterById } from '../data';
import { addDays, bn, dailyTargetMinutes, formatDate, formatDurationBn, formatTime, isValidDate } from '../planner';
import { BackupNudge, LocalNote, PageHeading, ProgressBar, TaskCard } from '../components';
import { learningProgress } from '../learning';
import { hasFullPersonalAllocation, isPersonalTaskComplete, personalBookLabel, personalChapterPairs, personalRoutineHealth, routineIssueText, weeklyWindows, personalChapterProgress, nextPersonalRoutine } from '../personalRoutine';
import { t } from '../i18n';

/** The core goal is a selected important syllabus, not completing every app feature. */
export default function PersonalStudyHome() {
  const { data, plan, selectedDate, setSelectedDate, today, navigate, exportICS, openChapter } = usePlanner();
  const routine = data.personalRoutine!;
  const [phaseDraft, setPhaseDraft] = useState<PersonalRoutine | null>(null);
  const sRoutine = routine.scope === 'S' ? routine : data.personalPhases?.S;
  const nextPhase = useMemo(() => nextPersonalRoutine(data, today), [data, today]);
  const health = useMemo(() => personalRoutineHealth(data, plan), [data, plan]);
  const plannedChapterIds = routine.chapterIds.filter(id => hasFullPersonalAllocation(data, plan, id));
  const unknownChapters = health.issues.find(issue => issue.code === 'unknown-duration')?.chapterIds || [];
  const selected = CHAPTERS.filter(c => routine.chapterIds.includes(c.id));
  const progress = learningProgress(selected, data, plan);
  const sProgress = sRoutine ? learningProgress(CHAPTERS.filter(c => sRoutine.chapterIds.includes(c.id)), data, plan) : progress;
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
    <PageHeading eyebrow="S CATEGORY FIRST" title="আগে গুরুত্বপূর্ণ অধ্যায়গুলো শেষ করি।" titleEn="Finish the important chapters first."
      description={routine.scope === 'S' ? 'A থেকে বাছাই করা S অধ্যায়ই এখন লক্ষ্য। প্রতিদিন দুই বইয়ের একই অধ্যায়ের অংশ; পুরো ক্লাস, MCQ/CQ ক্লাস ও নিজের অনুশীলনের সময় আলাদা।' : `S শেষ করে এখন ${routine.scope} ধাপ। একই জোড়া, নিজের সময় ও ছয়টি প্রয়োজনীয় কাজের নিয়ম অটুট আছে।`}
      descriptionEn={routine.scope === 'S' ? 'Your selected S chapters from A are the goal. Keep the same two-book pair across study days, with separate class, MCQ/CQ and practice durations.' : `After completing S, you are now in phase ${routine.scope}. The same-pair, availability and six-required-group rules still apply.`}
      action={<button type="button" className="button secondary" onClick={() => navigate('settings')}><Settings2 size={16} />{routine.scope === 'S' ? t('সময় ও S রুটিন বদলাও', 'Edit availability & S routine') : t('সময় ও বর্তমান ধাপ বদলাও', 'Edit availability & current phase')}</button>} />
    <section className="card personal-goal" aria-label={t('S ক্যাটাগরির অগ্রগতি', 'S category progress')}>
      <div className="card-heading"><div><span className="s-category-badge">S</span><h2>{t('আমার গুরুত্বপূর্ণ সিলেবাস', 'My important syllabus')}</h2><p>{t('বাকিগুলো বই/ক্লাসের তালিকায় আছে, কিন্তু এখনকার রুটিনে বাধ্যতামূলক নয়। S কোনো সরকারি সাজেশন নয়।', 'Other chapters remain in the library, but are not compulsory in this routine. S is not an official exam suggestion.')}</p></div><strong>{bn(sProgress.completed)}/{bn(sProgress.total)}</strong></div>
      <div className="personal-s-counts"><span>{t('মোট S', 'S total')}: <strong>{bn(sProgress.total)}</strong></span><span>{t('সম্পন্ন', 'Completed')}: <strong>{bn(sProgress.completed)}</strong></span><span>{t('বাকি', 'Remaining')}: <strong>{bn(sProgress.remaining)}</strong></span></div>
      <ProgressBar value={sProgress.percent} /><p>{bn(sProgress.percent)}% {t('সম্পন্ন', 'complete')} · {bn(sProgress.remaining)} {t('টি বাকি। কেবল অর্ধেক বা এক ভিডিও শেষ হলেই পুরো অধ্যায় সম্পন্ন হয় না।', 'remaining. A half or one finished video does not complete a whole chapter.')}</p>
      {routine.scope !== 'S' && <p><strong>{t('বর্তমান ধাপ', 'Current phase')}: {routine.scope}</strong> · {bn(progress.completed)}/{bn(progress.total)} · {bn(progress.remaining)} {t('বাকি। S-এর ছয়টি কাজ শেষ করার পরই এই ধাপ চালু হয়েছে।', 'remaining. This phase was enabled only after S’s six required groups were completed.')}</p>}
      <div className="personal-metrics" role="group" aria-label={t('কভারেজ ও প্রস্তুতি আলাদা হিসাব', 'Separate coverage and readiness')}><div><strong>{t('সিলেবাস কভারেজ', 'Syllabus Coverage')} · {bn(coverage)}%</strong><ProgressBar value={coverage} /><small>{routine.scope} · {t('ভিডিও + বই পড়া + নোট', 'Video + reading + notes')}</small></div><div><strong>{t('পরীক্ষার প্রস্তুতি', 'Exam Readiness')} · {bn(readiness)}%</strong><ProgressBar value={readiness} /><small>{t('ছয়টি কাজের হিসাব, নম্বরের নিশ্চয়তা নয়', 'All six groups, not a score guarantee')}</small></div></div>
      {health.syllabusEnd && <p>{routine.scope} · {t('শেষ সময় বরাদ্দ (পড়ার প্রমাণ নয়)', 'Last allocated work date (not proof of completion)')}: {formatDate(health.syllabusEnd, 'long')}</p>}
      <button type="button" className="text-button" onClick={() => navigate('syllabus')}>{t('S অধ্যায়ের তালিকা খোলো', 'Open S chapter list')}</button>
    </section>
    {nextPhase && <section className="card personal-next-phase" aria-label={t('পরের ধাপের পরিকল্পনা', 'Next-phase planning')}><h2>{routine.scope} {t('ধাপের ছয়টি কাজ সম্পন্ন', 'phase’s six required groups are complete')}</h2><p>{t('এবার বাকি সিলেবাসের পরের ধাপ তৈরি করতে পারো। তোমার সময় বজায় থাকবে; অজানা ভিডিওর দৈর্ঘ্য বানানো হবে না।', 'You can now prepare the next syllabus phase. Your availability is retained; unknown video durations are never invented.')} {nextPhase.scope} · {bn(nextPhase.chapterIds.length)} {t('অধ্যায়', 'chapters')}</p><button type="button" className="button primary" onClick={() => setPhaseDraft(nextPhase)}>{t('পরের ধাপ তৈরি করো', 'Prepare next phase')} · {nextPhase.scope}</button></section>}
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
    <section className="card personal-current-pair">
      <div className="card-heading"><div><h2>{t('একই দুই বই, দুই দিনের জোড়া', 'Same two books, two-day pair')}</h2><p>{t('প্রথম পড়ার দিনে দুই অধ্যায়ের ভিডিও/পড়া/নোটের প্রথম অংশ; দ্বিতীয় দিনে বাকি অংশ ও অনুশীলন/রিভিশন। সময় কম হলে একই জোড়া বেশি দিন চলবে, নতুন দুই অধ্যায় চাপাবে না।', 'The first parts of both chapters’ video/reading/notes on day one; the rest plus practice/revision on day two. With insufficient time this same pair continues longer; new chapters are not piled on.')}</p></div><button type="button" className="button ghost small" onClick={() => exportICS('week', selectedDate)}><CalendarDays size={15} />{t('সপ্তাহের ক্যালেন্ডার', 'Week calendar')}</button></div>
      <div className="personal-pair-grid">{pair.map(id => <button type="button" className="personal-pair-chapter" key={id} onClick={() => openChapter(chapterById[id])}><span className="s-category-badge">{routine.scope}</span><small>{personalBookLabel(id)}</small><strong>{chapterById[id].title}</strong><span>{tasks.find(task => task.chapterIds.includes(id))?.personalWork?.pairDay ? `${t('এই জোড়ার পড়ার দিন', 'Pair study day')} ${bn(tasks.find(task => task.chapterIds.includes(id))!.personalWork!.pairDay)}` : t('ক্লাসের প্রকৃত সময় মেলানো বাকি', 'Actual class durations still needed')}</span></button>)}</div>
      {!pair.length && <p>{plannedChapterIds.length === routine.chapterIds.length ? t('এই তারিখে নতুন অধ্যায় নেই। S-এর বরাদ্দ শেষ হলে স্বয়ংক্রিয়ভাবে বাকি A/B/C ঢোকানো হবে না; নিজের সম্পন্ন অগ্রগতি মিলিয়ে নাও।', 'No new chapter on this date. Allocating S never automatically adds other A/B/C chapters; check your actual completion.') : t('এই দিনে জোড়ার কাজ নেই। সময় ও ভিডিওর দৈর্ঘ্য মেলাও।', 'No paired work on this date. Review availability and durations.')}</p>}
    </section>
    <section className="card personal-tasks" aria-label={t('নির্বাচিত দিনের সময়সূচি', 'Selected day schedule')}>
      <div className="card-heading"><h2>{t('আজকের অংশ—পুরো ক্লাস নয়', 'Today’s segments—not an entire long class')}</h2><span>{formatDurationBn(dayMinutes)}</span></div>
      {tasks.length ? <div className="task-list">{tasks.map(task => <TaskCard task={task} key={task.id} />)}</div> : <p>{!windows.length ? t('ছুটির দিন—তোমার দেওয়া সময়ের বাইরে রুটিন বসানো হয়নি।', 'Off day—no routine was placed outside your availability.') : !unknownChapters.length && health.syllabusEnd && selectedDate > health.syllabusEnd ? t(`এই ধাপের সব বরাদ্দ ${formatDate(health.syllabusEnd, 'long')}-এ শেষ। এরপর আর কোনো কাজ নেই; পরের ধাপ তৈরি বা সময় বাড়াতে Settings খোলো।`, `This phase’s allocation ends on ${formatDate(health.syllabusEnd, 'long')}. There is no work after it; open Settings to prepare the next phase or add time.`) : unknownChapters.length ? t(`${unknownChapters.slice(0, 2).map(id => chapterById[id]?.title || id).join(' + ')} — সময় অজানা। Settings-এ প্রকৃত সময় পড়ো/লেখো; অযৌক্তিক ৮০ মিনিট ধরে কাজ বানানো হয়নি। বাকি অধ্যায়ের কাজ চলছে।`, `${unknownChapters.slice(0, 2).map(id => chapterById[id]?.title || id).join(' + ')} — durations are unknown. Read/enter the real durations in Settings; no arbitrary 80-minute task was made. The other chapters keep their sessions.`) : t('এই তারিখের জন্য কাজ বরাদ্দ নেই। ক্যালেন্ডারে আগের/পরের পড়ার দিন দেখো।', 'No work allocated on this date. Check earlier/later study days in the calendar.')}</p>}
    </section>
    {!!day?.historyTasks?.length && <PersonalAllocationHistory tasks={day.historyTasks} />}
    {!!day?.unscheduled?.length && <section className="card personal-unallocated"><h2>{t('সংরক্ষিত কাজের সময় মেলেনি', 'Retained appointments need a valid slot')}</h2><p>{t('নিজের যোগ করা কাজ পড়ার সময়ের বাইরে বা অন্য কাজের সঙ্গে মিলেছে। ক্যালেন্ডারে গিয়ে সময় ঠিক করো; তথ্য মুছেনি।', 'Some custom appointments are outside availability or clash. Edit their time in the calendar; no record was deleted.')}</p><button type="button" className="button secondary small" onClick={() => navigate('calendar', selectedDate)}>{t('ক্যালেন্ডারে সময় ঠিক করো', 'Edit appointment in calendar')}</button></section>}
    <LocalNote />
    {backlog.length > 0 && <section className="card"><h2>{t('আগের দিনের অসমাপ্ত অংশ', 'Earlier unfinished segments')}</h2><p>{bn(backlog.length)} {t('টি অংশ বাকি। এগুলো পরের ফাঁকা সময়ে বসেছে, অথবা লক/সময়সীমার কারণে এখনও বসেনি। পরের কাজ পিছিয়েছে; কোনো দিনের সীমার ওপর বাড়তি কাজ চাপেনি।', 'segments are still owed. They occupy actual free slots, or remain blocked by locks/deadlines. Later work moves back; nothing is stacked above a day’s limit.')}</p><button type="button" className="button secondary small" onClick={() => navigate('backlog')}>{t('অসমাপ্ত কাজ দেখো', 'Review unfinished work')}</button></section>}
  </div>;
}
