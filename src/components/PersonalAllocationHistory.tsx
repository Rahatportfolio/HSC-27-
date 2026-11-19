import type { Task } from '../planner';
import { formatDate, formatTime } from '../planner';
import { usePlanner } from '../context';
import { t } from '../i18n';
import { isPersonalTaskComplete } from '../personalRoutine';
import { parseTaskRangeId } from '../taskReferences';

/** Read-only prior ALLOCATIONS, never fabricated actual study-session dates. */
export default function PersonalAllocationHistory({ tasks }: { tasks: Task[] }) {
  const { data } = usePlanner();
  const completed = tasks.filter(task => isPersonalTaskComplete(task, data.completed));
  if (!completed.length) return null;
  return <details className="personal-history"><summary>{t('সংরক্ষিত আগের বরাদ্দ ও সম্পন্নের সময়', 'Retained prior allocations & confirmation times')} ({completed.length})</summary>
    <p className="tiny-muted">{t('আগের বরাদ্দের সময় আর সত্যিকারের সম্পন্ন করার সময় এক নয়। এই ইতিহাস নতুন availability-এর বাইরে নতুন পড়া বসায় না এবং নতুন উৎস/কাজ সম্পন্ন করে না।', 'Prior allocation time is not the actual confirmation time. This history does not schedule new work outside your current availability or complete a different source/workload.')}</p>
    <ul>{completed.map(task => {
      const work = task.personalWork!;
      const at = Object.entries(data.completed).filter(([id]) => {
        const range = parseTaskRangeId(id);
        return id === work.sourceId || id === task.id || range?.sourceId === work.sourceId && range.to > work.from && range.from < work.to;
      }).map(([, at]) => at).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
      return <li key={`${task.date}-${task.id}`}><strong>{task.title}</strong><span>{t('আগের বরাদ্দ', 'Prior allocation')}: {formatDate(task.date)} · {formatTime(task.startMinute)}–{formatTime(task.endMinute)}</span>{at && <span>{t('শেষ নিশ্চিত করার সময় (বাংলাদেশ সময়)', 'Last confirmation (Bangladesh time)')}: <time dateTime={at}>{new Date(at).toLocaleString(t('bn-BD', 'en-GB'), { timeZone: 'Asia/Dhaka' })}</time></span>}</li>;
    })}</ul>
  </details>;
}
