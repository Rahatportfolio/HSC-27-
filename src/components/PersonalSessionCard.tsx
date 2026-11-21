import { usePlanner } from '../context';
import { chapterById } from '../data';
import { bn, formatDate, formatDurationBn, formatTime } from '../planner';
import type { Task } from '../planner';
import { isPersonalTaskComplete, personalMediaUrl, personalSessionForStage, personalUnfinishedRanges, PERSONAL_SESSIONS } from '../personalRoutine';
import { setTaskCompletion } from '../study';
import { t } from '../i18n';
import { TaskCard } from '../components';

function coveredMinutes(task: Task, completed: Record<string, string>) {
  const duration = task.endMinute - task.startMinute;
  if (!task.personalWork) return isPersonalTaskComplete(task, completed) ? duration : 0;
  const length = task.personalWork.to - task.personalWork.from;
  const remaining = personalUnfinishedRanges(task, completed).reduce((sum, range) => sum + range.to - range.from, 0);
  return length > 0 ? Math.max(0, Math.min(duration, Math.round(duration * (length - remaining) / length))) : 0;
}

/** Group only this date's allocated ranges; a tick never certifies other days. */
export default function PersonalSessionCard({ visibleTasks, date, main = false }: { visibleTasks?: Task[]; date?: string; main?: boolean } = {}) {
  const { data, plan, selectedDate, setData, openChapter } = usePlanner();
  const displayDate = date || selectedDate;
  const tasks = visibleTasks || plan.find(day => day.date === displayDate)?.tasks || [];
  const groups = new Map<string, { chapterId: string; session: typeof PERSONAL_SESSIONS[number]; tasks: Task[] }>();
  const other: Task[] = [];
  for (const task of tasks) {
    if (!task.personalWork || !task.chapterIds[0]) { other.push(task); continue; }
    const chapterId = task.chapterIds[0], session = personalSessionForStage(task.personalWork.stage), key = `${chapterId}:${session.id}`;
    const group = groups.get(key) || { chapterId, session, tasks: [] };
    group.tasks.push(task); groups.set(key, group);
  }
  return <section className="card daily-work-card" aria-label={t('আজকের কাজ এক নজরে', 'Today’s work at a glance')}>
    <div className="daily-work-top"><div><span className="eyebrow">{formatDate(displayDate, 'long')}</span>{main ? <h1>{t('তিন সেশনে অধ্যায় শেষ করো', 'Finish each chapter in three sessions')}</h1> : <h2>{t('তিন সেশনে অধ্যায় শেষ করো', 'Finish each chapter in three sessions')}</h2>}</div></div>
    <p className="tiny-muted">{t('১ ক্লাস → ২ নোট (কোনো ক্লাস নয়) → ৩ সলভিং ক্লাস ও নিজে অনুশীলন। বড় সেশন একাধিক দিনে চলতে পারে।', '1 class → 2 notes (no class) → 3 solving classes and own practice. A long session can continue across days.')}</p>
    {!groups.size && !other.length && <p>{t('এই দিনে কোনো কাজ বরাদ্দ নেই। অন্য দিন দেখো বা Settings-এ সময় মেলাও।', 'No work allocated on this date. Choose another day or review availability in Settings.')}</p>}
    <div className="personal-session-list">{[...groups.values()].map(({ chapterId, session, tasks: parts }) => {
      const done = parts.every(task => isPersonalTaskComplete(task, data.completed));
      const doneMinutes = parts.reduce((sum, task) => sum + coveredMinutes(task, data.completed), 0);
      const minutes = parts.reduce((sum, task) => sum + task.endMinute - task.startMinute, 0);
      const mediaParts = parts.filter(task => task.personalWork && personalMediaUrl(task.personalWork));
      const media = session.id === 'notes' ? [] : [...new Set(mediaParts.map(task => task.personalWork!.stage))].map(stage => mediaParts.find(task => task.personalWork!.stage === stage && !isPersonalTaskComplete(task, data.completed)) || mediaParts.find(task => task.personalWork!.stage === stage)!);
      return <article className="personal-session" key={`${chapterId}:${session.id}`}>
        <h3>{t(session.bn, session.en)}</h3>
        <button type="button" className="text-button" onClick={() => openChapter(chapterById[chapterId])}>{chapterById[chapterId]?.title}</button>
        <p>{t('এই দিনের বরাদ্দ', 'Allocated on this date')}: {formatDurationBn(minutes)} · {t('সম্পন্ন', 'done')} {formatDurationBn(doneMinutes)}</p>
        <p className="tiny-muted">{t('শুরু', 'Starts')} {formatTime(Math.min(...parts.map(task => task.startMinute)))} · {t('শুধু এখানে দেখানো এই দিনের অংশে টিক পড়বে, পুরো সেশনে নয়।', 'The tick covers only the parts shown for this date, not the whole session.')}</p>
        <div className="personal-session-actions">
          {media.map(task => <a className="button secondary small" key={task.personalWork!.stage} href={personalMediaUrl(task.personalWork!)} target="_blank" rel="noreferrer">{task.personalWork!.stage === 'class' ? t('YouTube ক্লাস খোলো', 'Open YouTube class') : task.personalWork!.stage === 'mcqClass' ? t('MCQ ক্লাস খোলো', 'Open MCQ class') : t('CQ ক্লাস খোলো', 'Open CQ class')}</a>)}
          {session.id === 'practice' && <button type="button" className="button secondary small" onClick={() => openChapter(chapterById[chapterId])}>{t('CQ/MCQ ক্লাসের তালিকা', 'Find CQ/MCQ classes')}</button>}
          <button type="button" className="button primary small" aria-pressed={done} onClick={() => setData(current => setTaskCompletion(current, parts.filter(part => done || !isPersonalTaskComplete(part, current.completed)).map(part => part.id), !done, plan))}>{done ? t('এই দিনের টিক ফেরাও', 'Undo this date’s work') : t('এই দিনের পুরো বরাদ্দ শেষ', 'Finished this date’s allocation')}</button>
          {!done && doneMinutes > 0 && <button type="button" className="button secondary small" onClick={() => setData(current => setTaskCompletion(current, parts.filter(part => coveredMinutes(part, current.completed) > 0).map(part => part.id), false, plan))}>{t('এই দিনের সম্পন্ন অংশের টিক ফেরাও', 'Undo completed parts on this date')}</button>}
        </div>
        {session.id === 'practice' && <p className="tiny-muted">{t('ডিফল্টে বাড়তি সলভিং ভিডিওর সময় ধরা নেই। দেখতে চাইলে তালিকা খোলো; সময় বরাদ্দ করতে Settings-এ সময় যোগ করো।', 'Extra solving-video time is not included by default. Open the class list to watch; add its duration in Settings to schedule it.')}</p>}
        <details><summary>{t('অংশভিত্তিক অগ্রগতি ও সময়', 'Partial progress and timing')} · {bn(parts.length)}</summary><p className="tiny-muted">{t('আংশিক কাজ হলে শুধু শেষ করা অংশে টিক দাও।', 'If you did only part, tick just the finished segments.')}</p>{parts.map(task => <TaskCard task={task} key={task.id} compact />)}</details>
      </article>;
    })}</div>
    {other.length > 0 && <div><h3>{t('নিজের অন্যান্য কাজ', 'Other scheduled work')}</h3>{other.map(task => <TaskCard task={task} key={task.id} compact />)}</div>}
  </section>;
}
