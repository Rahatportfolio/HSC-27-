import { ArrowRight, CalendarDays, Check, Clock3, Sunrise } from 'lucide-react';
import { usePlanner } from '../context';
import { chapterById, subjectById } from '../data';
import { addDays, bn, formatDate, formatDurationBn, formatTime, phaseName } from '../planner';
import { isPersonalTaskComplete } from '../personalRoutine';
import { t } from '../i18n';

/**
 * The simplest possible answer to "what do I study today?" — one card, at the
 * very top of Home, listing today's sessions with one-tap checkmarks, plus a
 * one-line preview of tomorrow's classes. Everything else the app knows lives
 * further down the page; this card stays deliberately minimal.
 */
export default function DailyWorkCard() {
  const { data, plan, today, toggleTask, setSelectedDate } = usePlanner();
  if (data.routineSetupRequired) return null;

  const todayDay = plan.find(day => day.date === today);
  const tasks = todayDay?.tasks ?? [];
  const doneCount = tasks.filter(tk => isPersonalTaskComplete(tk, data.completed)).length;
  const remaining = tasks.filter(tk => !isPersonalTaskComplete(tk, data.completed));
  const remainingMinutes = remaining.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);
  const totalMinutes = tasks.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);

  const tomorrowKey = addDays(today, 1);
  const tomorrowDay = plan.find(day => day.date === tomorrowKey);
  const tomorrowOpen = (tomorrowDay?.tasks ?? []).filter(tk => !isPersonalTaskComplete(tk, data.completed));
  const tomorrowMinutes = tomorrowOpen.reduce((sum, tk) => sum + Math.max(0, tk.endMinute - tk.startMinute), 0);
  const tomorrowFirst = tomorrowOpen.length ? Math.min(...tomorrowOpen.map(tk => tk.startMinute)) : 0;
  const tomorrowSubjects = [...new Set(tomorrowOpen.map(tk => subjectById[tk.subject]?.short).filter(Boolean))] as string[];

  const nextStudyDay = tasks.length === 0 ? plan.find(day => day.date > today && day.tasks.length > 0) : undefined;

  return <section className="card daily-work-card" aria-label={t('আজকের কাজ এক নজরে', 'Today’s work at a glance')}>
    <div className="daily-work-top">
      <div>
        <span className="eyebrow">{t('আজকের লিস্ট', 'TODAY’S LIST')}</span>
        <h2>{t('আজ কী পড়বে — এক নজরে', 'What you will study today')}</h2>
        <p className="daily-work-date">{formatDate(today, 'long')}{todayDay ? ` · ${t('দিন', 'Day')} ${bn(todayDay.index + 1)}/${bn(plan.length)}` : ''}</p>
      </div>
      {tasks.length > 0 && <div className={`daily-work-pill ${remaining.length === 0 ? 'done' : ''}`}><strong>{bn(doneCount)}/{bn(tasks.length)}</strong>{t('সেশন', 'sessions')}</div>}
    </div>

    {tasks.length === 0 ? (
      <div className="daily-work-empty">
        <Sunrise size={24} aria-hidden="true" />
        <div>
          <strong>{t('আজ কোনো সেশন নেই — ছুটি।', 'No sessions today — a free day.')}</strong>
          <p>{nextStudyDay
            ? t(`পরের পড়া: ${formatDate(nextStudyDay.date, 'long')} · ${phaseName(nextStudyDay.phase)}`, `Next study day: ${formatDate(nextStudyDay.date, 'long')} · ${phaseName(nextStudyDay.phase)}`)
            : t('এই সময়ে আর কোনো কাজ বরাদ্দ নেই।', 'Nothing else is allocated in this span.')}</p>
        </div>
      </div>
    ) : (
      <>
        <ul className="daily-work-list">
          {tasks.map(task => {
            const done = isPersonalTaskComplete(task, data.completed);
            const subject = subjectById[task.subject];
            const chapters = task.chapterIds.map(id => chapterById[id]?.title).filter(Boolean).join(', ');
            const minutes = Math.max(15, task.endMinute - task.startMinute);
            return <li key={task.id} className={`daily-work-item ${done ? 'done' : ''}`}>
              <span className="daily-work-time"><Clock3 size={12} aria-hidden="true" />{formatTime(task.startMinute)}<small>{formatTime(task.endMinute)}</small></span>
              <div className="daily-work-info">
                <strong>{task.title}</strong>
                <span>{subject?.short}{chapters ? ` · ${chapters}` : ''} · {formatDurationBn(minutes)}</span>
              </div>
              <button type="button" className={`daily-work-toggle ${done ? 'done' : ''}`} aria-pressed={done}
                aria-label={done ? t(`সম্পন্ন হয়েছে — ${task.title}`, `Done — ${task.title}`) : t(`সম্পন্ন বলে টিক দাও — ${task.title}`, `Mark done — ${task.title}`)}
                onClick={() => toggleTask(task.id)}>
                <Check size={16} strokeWidth={2.5} /><span>{done ? t('সম্পন্ন', 'Done') : t('টিক দাও', 'Done?')}</span>
              </button>
            </li>;
          })}
        </ul>
        <p className="daily-work-summary">{remaining.length > 0
          ? t(`বাকি আছে ${bn(remaining.length)}টি সেশন · ${formatDurationBn(remainingMinutes)} (মোট ${formatDurationBn(totalMinutes)})`, `${remaining.length} session(s) left · ${formatDurationBn(remainingMinutes)} (of ${formatDurationBn(totalMinutes)})`)
          : t('আজকের সব কাজ সম্পন্ন! 🎉', 'Everything planned today is done! 🎉')}</p>
      </>
    )}

    {tomorrowOpen.length > 0 && (
      <button type="button" className="daily-work-tomorrow" onClick={() => setSelectedDate(tomorrowKey)} aria-label={t('আগামীকালের রুটিন দেখো', 'See tomorrow’s routine')}>
        <CalendarDays size={19} aria-hidden="true" />
        <div>
          <strong>{t('আগামীকালের ক্লাস', 'Tomorrow’s classes')} · {formatDate(tomorrowKey, 'weekday')}</strong>
          <span>{t('প্রথম সেশন', 'First session')} {formatTime(tomorrowFirst)} · {tomorrowSubjects.join(', ')} · {formatDurationBn(tomorrowMinutes)} · {bn(tomorrowOpen.length)} {t('টি সেশন', 'sessions')}</span>
        </div>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    )}
  </section>;
}
