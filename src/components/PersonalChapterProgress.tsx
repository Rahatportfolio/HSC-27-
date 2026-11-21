import { usePlanner } from '../context';
import { t } from '../i18n';
import { bn } from '../planner';
import { PERSONAL_SESSIONS, WORK_STAGES, personalChapterProgress, personalRoutineForChapter, personalStageDone, setPersonalStageCompletion, workloadFor } from '../personalRoutine';
import { ProgressBar } from '../components';

/** Three visible sessions, retaining each legacy source and its own evidence. */
export default function PersonalChapterProgress({ chapterId }: { chapterId: string }) {
  const { data, setData, notify, confirm } = usePlanner();
  const routine = personalRoutineForChapter(data, chapterId);
  if (!routine) return null;
  const progress = personalChapterProgress(routine, chapterId, data.completed), work = workloadFor(routine, chapterId);
  const sessions = PERSONAL_SESSIONS.map(session => ({ ...session, done: session.stages.every(stage => personalStageDone(routine, chapterId, stage, data.completed)) }));
  return <section className="personal-completion" aria-label={t('অধ্যায়ের তিনটি সেশন', 'Three chapter sessions')}>
    <div className="card-heading"><h2>{t('অধ্যায়ের তিনটি সেশন', 'Three chapter sessions')}</h2><strong>{bn(sessions.filter(session => session.done).length)}/3 · {progress.fullyComplete ? t('পুরোপুরি সম্পন্ন', 'Fully completed') : t('এখনও অসমাপ্ত', 'Not fully completed')}</strong></div>
    <p className="tiny-muted">{t('সেশনের কিছু অংশ শেষ করলে পুরো সেশন সম্পন্ন হবে না। আগের পড়া ও টিক আগের মতোই সংরক্ষিত আছে।', 'Finishing a part does not complete the whole session. Earlier work and ticks remain saved.')}</p>
    <div className="personal-metrics">
      <div><strong>{t('সিলেবাস কভারেজ', 'Syllabus Coverage')} · {bn(progress.coveragePercent)}%</strong><ProgressBar value={progress.coveragePercent} /><small>{t('ভিডিও + বই পড়া + নোট', 'Video + reading + notes')}</small></div>
      <div><strong>{t('পরীক্ষার প্রস্তুতি', 'Exam Readiness')} · {bn(progress.readinessPercent)}%</strong><ProgressBar value={progress.readinessPercent} /><small>{t('কাজের অগ্রগতি, নম্বরের পূর্বাভাস নয়', 'Work progress, not a score prediction')}</small></div>
    </div>
    <div className="personal-completion-groups">{sessions.map(session => <fieldset key={session.id} className={session.done ? 'is-complete' : ''}>
      <legend>{t(session.bn, session.en)} · {session.done ? t('সম্পন্ন', 'Done') : t('বাকি', 'Pending')}</legend>
      <p className="tiny-muted">{session.id === 'class' ? t('শুধু অধ্যায়ের ক্লাস দেখো।', 'Watch only the chapter class.') : session.id === 'notes' ? t('বই দেখে নিজের নোট তৈরি করো; এখানে কোনো ক্লাস নেই।', 'Use the book to make your own notes; no class here.') : t('সলভিং ক্লাস, নিজের CQ/MCQ অনুশীলন ও অনুশীলনের সঙ্গে রিভিশন।', 'Solving classes, own CQ/MCQ practice and revision as part of practice.')}</p>
      {!session.done && <button type="button" className="button secondary small" disabled={session.stages.some(stage => work[stage].minutes === null || work[stage].minutes === 0 && !['mcqClass', 'cqClass'].includes(stage))}
        onClick={() => confirm({ title: t('পুরো সেশন শেষ করেছ?', 'Finished the entire session?'), message: t('এই সেশনের সব কাজ সত্যিই শেষ হয়ে থাকলেই নিশ্চিত করো। শুধু আজকের অংশ শেষ হলে হোমে সেই অংশে টিক দাও।', 'Confirm only if all work in this session is actually finished. For today’s part, tick the allocation on Home instead.'), label: t('পুরো সেশন সম্পন্ন', 'Confirm entire session'), action: () => { try { setData(current => session.stages.reduce((next, stage) => setPersonalStageCompletion(next, chapterId, stage, true), current)); } catch (error) { notify((error as Error).message, 'error'); } } })}>{t('পুরো সেশন সম্পন্ন নিশ্চিত করো', 'Confirm entire session complete')}</button>}
      <details><summary>{t('আলাদা কাজ ও আগের অগ্রগতি', 'Individual work and previous progress')}</summary>{session.stages.map(stageId => {
        const stage = WORK_STAGES.find(item => item.id === stageId)!, budget = work[stageId];
        const omitted = ['mcqClass', 'cqClass'].includes(stageId) && budget.minutes === 0;
        const unavailable = budget.minutes === null || budget.minutes === 0;
        return <label className="check-line" key={stageId}><input type="checkbox" checked={personalStageDone(routine, chapterId, stageId, data.completed)} disabled={unavailable}
          onChange={event => { const done = event.target.checked; try { setData(current => setPersonalStageCompletion(current, chapterId, stageId, done)); } catch (error) { notify((error as Error).message, 'error'); } }} />
          <span>{t(stage.bn, stage.en)}<small>{omitted ? t('এই অতিরিক্ত ভিডিওটি বাদ; অনুশীলন প্রয়োজন।', 'Optional video omitted; practice remains required.') : unavailable ? t('সময় ঠিক করো—এখন সম্পন্ন ধরা যাবে না।', 'Configure the workload first; this cannot be certified yet.') : t('সম্পূর্ণ কাজ সত্যিই শেষ হয়েছে', 'I actually finished this entire step')}</small></span>
        </label>;
      })}</details>
    </fieldset>)}</div>
  </section>;
}
