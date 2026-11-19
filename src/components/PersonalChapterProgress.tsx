import { usePlanner } from '../context';
import { t } from '../i18n';
import { bn } from '../planner';
import { WORK_STAGES, personalChapterProgress, personalRoutineForChapter, personalStageDone, setPersonalStageCompletion, workloadFor } from '../personalRoutine';
import { ProgressBar } from '../components';

/** Six required groups; a session tick only proves its own source range. */
export default function PersonalChapterProgress({ chapterId }: { chapterId: string }) {
  const { data, setData, notify } = usePlanner();
  const routine = personalRoutineForChapter(data, chapterId);
  if (!routine) return null;
  const progress = personalChapterProgress(routine, chapterId, data.completed), work = workloadFor(routine, chapterId);
  return <section className="personal-completion" aria-label={t('অধ্যায়ের ছয়টি প্রয়োজনীয় কাজ', 'Six required chapter groups')}>
    <div className="card-heading"><h2>{t('অধ্যায়ের ছয়টি প্রয়োজনীয় কাজ', 'Six required chapter groups')}</h2><strong>{bn(progress.completedSteps)}/6 · {progress.fullyComplete ? t('পুরোপুরি সম্পন্ন', 'Fully completed') : t('এখনও অসমাপ্ত', 'Not fully completed')}</strong></div>
    <p className="tiny-muted">{t('একটি সেশনের টিক শুধু সেই অংশের প্রমাণ। নিচে কেবল পুরো ধাপ সত্যিই শেষ করার পর নিশ্চিত করো। অজানা/০ সময়ের প্রয়োজনীয় ধাপ এড়িয়ে পুরো অধ্যায় সম্পন্ন হবে না।', 'A session tick covers that segment only. Confirm a whole step here only after actually finishing it. Unknown/zero-budget required steps cannot be bypassed to complete a chapter.')}</p>
    <div className="personal-metrics">
      <div><strong>{t('সিলেবাস কভারেজ', 'Syllabus Coverage')} · {bn(progress.coveragePercent)}%</strong><ProgressBar value={progress.coveragePercent} /><small>{t('ভিডিও + বই পড়া + নোট', 'Video + reading + notes')}</small></div>
      <div><strong>{t('পরীক্ষার প্রস্তুতি', 'Exam Readiness')} · {bn(progress.readinessPercent)}%</strong><ProgressBar value={progress.readinessPercent} /><small>{t('ছয়টি কাজের অগ্রগতি, নম্বরের পূর্বাভাস নয়', 'Progress across six groups, not a score prediction')}</small></div>
    </div>
    <div className="personal-completion-groups">{progress.steps.map(group => <fieldset key={group.id} className={group.done ? 'is-complete' : ''}>
      <legend>{t(group.bn, group.en)} · {group.done ? t('সম্পন্ন', 'Done') : t('বাকি', 'Pending')}</legend>
      {group.stages.map(stageId => {
        const stage = WORK_STAGES.find(item => item.id === stageId)!, budget = work[stageId];
        const omitted = ['mcqClass', 'cqClass'].includes(stageId) && budget.minutes === 0;
        const unavailable = budget.minutes === null || budget.minutes === 0;
        return <label className="check-line" key={stageId}><input type="checkbox" checked={personalStageDone(routine, chapterId, stageId, data.completed)} disabled={unavailable}
          onChange={event => { const done = event.target.checked; try { setData(current => setPersonalStageCompletion(current, chapterId, stageId, done)); } catch (error) { notify((error as Error).message, 'error'); } }} />
          <span>{t(stage.bn, stage.en)}<small>{omitted ? t('এই অতিরিক্ত ভিডিওটি নিজে বাদ দিয়েছ; অনুশীলন এখনও আলাদা ও প্রয়োজনীয়।', 'You omitted this extra solving video; independent practice is still required.') : unavailable ? t('সময়/কাজের পরিমাণ ঠিক করো—এখন সম্পন্ন ধরা যাবে না।', 'Configure the time/workload—this cannot be certified complete yet.') : t('সম্পূর্ণ কাজ সত্যিই শেষ হয়েছে', 'I actually finished this entire step')}</small></span>
        </label>;
      })}
    </fieldset>)}</div>
  </section>;
}
