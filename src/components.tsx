import { useEffect, useId, useRef, useState } from 'react';
import { openDialogScope } from './dialog';
import { isPersonalTaskComplete, personalMediaUrl } from './personalRoutine';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, FlaskConical, Leaf, Minus, NotebookPen, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { CHAPTERS, chapterById, subjectById } from './data';
import type { SubjectId } from './data';
import { bn, dhakaMinutes, dailyTargetMinutes, formatDate, formatDayOffset, formatDurationBn, formatTime, getPhases, isTaskCurrent, isValidDate, percent, todayKey, toMinutes, toTimeInput } from './planner';
import type { Day, Task } from './planner';
import { editTask, moveTask, removeTask } from './scheduleEdit';
import { useOptionalPlanner, usePlanner } from './context';
import { isEnglish, t } from './i18n';
import { CHAPTER_CLASSES } from './classLinks';
import type { ChapterClasses, ClassOption, LessonLink } from './classLinks';
import { allOptions, isWatched, lessonKey, toggleClassWatched } from './classes';
import { backupAgeDays, downloadBackup, needsBackup, shareBackup, snoozeBackup } from './backup';

export function SubjectBadge({ subject, small = false }: { subject: SubjectId; small?: boolean }) {
  const s = subjectById[subject];
  return <span className={`subject-badge ${small ? 'small' : ''}`} style={{ '--subject': s.color, '--subject-tint': s.tint } as CSSProperties}><span className="subject-dot" />{s.short}</span>;
}
export function SubjectIcon({ subject, size = 18 }: { subject: SubjectId; size?: number }) {
  const Icon = subject === 'chemistry' ? FlaskConical : subject === 'biology' ? Leaf : subject === 'bangla' || subject === 'english' ? BookOpen : NotebookPen;
  return <Icon size={size} strokeWidth={1.7} />;
}
export function ProgressBar({ value, color, label, className = '' }: { value: number; color?: string; label?: string; className?: string }) {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return <div className={`progress-track ${className}`} role="progressbar" aria-label={label || t('অগ্রগতি', 'Progress')} aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${safe}%`, background: color }} /></div>;
}
export function ProgressRing({ value, size = 112, stroke = 8, children, color = 'var(--green)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return <div className="progress-ring" style={{ width: size, height: size }}><svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="ring-track" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg><div className="ring-content">{children}</div></div>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => ref.current ? openDialogScope(ref.current, () => closeRef.current()) : undefined, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('বন্ধ করো', 'Close')}><X size={20} /></button></div><div className="modal-body">{children}</div></div></div>;
}
export function PageHeading({ eyebrow, title, titleEn, description, descriptionEn, action }: { eyebrow?: string; title: string; titleEn?: string; description: string; descriptionEn?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{t(title, titleEn || title)}</h1><p>{t(description, descriptionEn || description)}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}
export function EmptyState({ title, description, titleEn, descriptionEn, action }: { title: string; description: string; titleEn?: string; descriptionEn?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><CheckCheck size={28} strokeWidth={1.5} /></div><h3>{t(title, titleEn || title)}</h3><p>{t(description, descriptionEn || description)}</p>{action}</div>;
}
export function PhaseJourney({ activeDate }: { activeDate: string }) {
  const { navigate, data } = usePlanner();
  const phases = getPhases(data.settings);
  return <div className="phase-journey">{phases.map((p, i) => {
    const active = activeDate >= p.start && activeDate <= p.end;
    return <button key={p.id} className={`phase-step ${active ? 'active' : ''}`} onClick={() => navigate('calendar', p.start)} style={{ '--phase-color': p.color } as CSSProperties}><span className="phase-number">{active ? <span className="live-dot" /> : bn(i + 1)}</span><span className="phase-copy"><strong>{p.name}</strong><span>{formatDate(p.start)} – {formatDate(p.end)} <span className="phase-days">· {bn(p.days)} {t('দিন', 'days')}</span></span></span>{i < 2 && <ChevronRight className="phase-arrow" size={17} />}</button>;
  })}</div>;
}
export function TaskCard({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { data, setData, plan, notify, toggleTask, today, now, openMistake, openChapter, timer, startTimer, startPresetTimer, navigate, confirm } = usePlanner();
  const [expanded, setExpanded] = useState(false);
  const done = isPersonalTaskComplete(task, data.completed);
  const minute = dhakaMinutes(now);
  const current = !done && isTaskCurrent(task, today, minute);
  const generated = !!task.video || task.id.startsWith('smart-part|');
  const durationMin = Math.max(1, task.endMinute - task.startMinute);
  const primaryChapterId = task.chapterIds[0];
  const primaryChapter = primaryChapterId ? chapterById[primaryChapterId] : undefined;
  const primaryClasses = primaryChapterId ? CHAPTER_CLASSES[primaryChapterId] : undefined;
  const isThisTimerActive = timer.taskId === task.id && (timer.running || timer.elapsedSec > 0);

  const openVideo = () => { navigate('studySystem'); window.location.hash = `studySystem?class=${encodeURIComponent(task.video!.classId)}`; };
  const launchPreset = () => {
    if (isThisTimerActive) {
      if (timer.running) timer.pause();
      else timer.start();
      return;
    }
    if (startPresetTimer) {
      startPresetTimer({
        subject: task.subject,
        chapterId: primaryChapter?.id,
        durationMin,
        label: task.title,
        taskId: task.id,
      });
    } else {
      startTimer(task.subject, primaryChapter?.id);
      navigate('timer');
    }
  };

  const adjustTaskDuration = (delta: number) => {
    const nextMin = Math.max(15, Math.min(720, durationMin + delta));
    setData(d => {
      const prev = d.dayOverrides?.[task.date] || {};
      return {
        ...d,
        dayOverrides: {
          ...d.dayOverrides,
          [task.date]: {
            ...prev,
            taskMinutes: { ...(prev.taskMinutes || {}), [task.id]: nextMin },
          },
        },
      };
    });
  };

  const adjustTaskStartTime = (timeValue: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) return;
    // A session already on the next calendar day must remain on that day.
    const sm = toMinutes(timeValue) + Math.floor(task.startMinute / 1440) * 1440;
    const tasks = plan.find(day => day.date === task.date)?.tasks || [];
    const index = tasks.findIndex(item => item.id === task.id);
    if (index > 0 && sm < tasks[index - 1].endMinute) {
      notify(t('আগের সেশন শেষ হওয়ার পরের সময় বেছে নাও।', 'Choose a time after the previous session ends.'), 'error');
      return;
    }
    setData(d => {
      const prev = d.dayOverrides?.[task.date] || {};
      return {
        ...d,
        dayOverrides: {
          ...d.dayOverrides,
          [task.date]: {
            ...prev,
            taskStartMinutes: { ...(prev.taskStartMinutes || {}), [task.id]: sm },
          },
        },
      };
    });
  };

  return <article className={`task-card ${done ? 'done' : ''} ${current || isThisTimerActive ? 'current' : ''} ${compact ? 'compact' : ''}`}>
    <div className="task-time"><strong>{formatTime(task.startMinute).split(' ')[0]}</strong><span>{formatTime(task.startMinute).split(' ')[1]}{formatDayOffset(task.startMinute)}</span><span className="time-line" /><small>{formatDurationBn(durationMin)}</small></div>
    <div className="task-main">
      <div className="task-topline">
        <SubjectBadge subject={task.subject} small />
        {current && <span className="now-badge">{t('এখন চলছে', 'in progress')}</span>}
        {task.kind === 'exam' && <span className="kind-badge">{t('মডেল টেস্ট', 'model test')}</span>}
        {task.kind === 'revision' && <span className="kind-badge">{t('রিভিশন', 'revision')}</span>}
        {task.kind === 'custom' && <span className="kind-badge custom">{t('কাস্টম', 'custom')}</span>}
        {!done && (
          <button
            type="button"
            className={`task-preset-timer-btn ${isThisTimerActive && timer.running ? 'live' : ''}`}
            onClick={launchPreset}
            title={t('এই সেশনের নির্ধারিত সময়ের প্রিসেট টাইমার চালু করো', 'Start preset timer for this session')}
          >
            {isThisTimerActive && timer.running ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            <span>
              {isThisTimerActive
                ? `${timer.running ? t('চলছে', 'Running') : t('বিরতি', 'Paused')} · ${bn(String(Math.floor(timer.remainingSec / 60)).padStart(2, '0'))}:${bn(String(timer.remainingSec % 60).padStart(2, '0'))}`
                : `${t('টাইমার', 'Timer')} · ${formatDurationBn(durationMin)}`}
            </span>
          </button>
        )}
      </div>
      {task.personalWork && personalMediaUrl(task.personalWork) && <a className="button secondary small" href={personalMediaUrl(task.personalWork)} target="_blank" rel="noreferrer"><Play size={14}/>{t('নির্ধারিত ক্লাসের অংশ খোলো', 'Open selected class segment')}</a>}{task.video && <button className="button secondary small" onClick={openVideo}><Play size={14}/>{t('ক্লাস খোলো','Open class')}</button>}<button className="task-title-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><h3>{task.title}</h3><ChevronDown size={16} className={expanded ? 'rotated' : ''} /></button>
      <p className={`task-detail ${expanded ? 'expanded' : ''}`}>{task.detail}</p>
      {expanded && <div className="task-expanded-wrap">
        {!generated && <><div className="task-move-editor">
          <label className="move-date-field">
            <span>{t('তারিখ:', 'Date:')}</span>
            <input
              type="date"
              min={plan[0]?.date}
              max={plan[plan.length - 1]?.date}
              value={task.date}
              onChange={e => {
                const next = e.target.value;
                if (!isValidDate(next) || next === task.date) return;
                setData(d => moveTask(d, task.id, task.date, next));
                notify(t(`কাজ ${formatDate(next, 'long')} তারিখে সরানো হয়েছে।`, `Task moved to ${formatDate(next, 'long')}.`));
              }}
            />
          </label>
          {task.chapterIds.length > 0 && chapterById[task.chapterIds[0]] ? (
            <label className="move-chapter-field">
              <span>{t('অধ্যায়:', 'Chapter:')}</span>
              <select
                value={task.chapterIds[0]}
                onChange={e => {
                  const chapter = chapterById[e.target.value];
                  if (!chapter) return;
                  setData(d => editTask(d, task.id, { chapterIds: [chapter.id], subject: chapter.subject }));
                  notify(t('সেশনের অধ্যায় বদলানো হয়েছে।', 'Session chapter updated.'));
                }}
              >
                {CHAPTERS.filter(chapter => chapter.subject === task.subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
            </label>
          ) : (
            <label className="move-subject-field">
              <span>{t('বিষয়:', 'Subject:')}</span>
              <select
                value={task.subject}
                onChange={e => {
                  setData(d => editTask(d, task.id, { subject: e.target.value as SubjectId }));
                  notify(t('সেশনের বিষয় বদলানো হয়েছে।', 'Session subject updated.'));
                }}
              >
                {(['physics', 'chemistry', 'biology', 'math', 'bangla', 'english', 'ict'] as SubjectId[]).map(id => <option key={id} value={id}>{subjectById[id].short}</option>)}
              </select>
            </label>
          )}
          <button
            type="button"
            className="button ghost small task-delete-btn"
            onClick={() => confirm({
              title: t('এই সেশনটি মুছবে?', 'Delete this session?'),
              message: t('রুটিন থেকে সরানো হবে; সম্পন্ন হয়ে থাকলে সেই হিসাব অক্ষত থাকবে। পরে সেটিংস পরিবর্তনে ফিরে আসতে পারে।', 'It will be removed from the routine. If completed, that record stays. A settings change may bring it back.'),
              danger: true,
              label: t('মুছে ফেলো', 'Delete'),
              action: () => { setData(d => removeTask(d, task.id)); notify(t('সেশন মুছে ফেলা হয়েছে।', 'Session deleted.')); },
            })}
          >
            <Trash2 size={13} />{t('মুছো', 'Delete')}
          </button>
        </div>
        <div className="task-cascade-editor">
          <label className="cascade-time-field">
            <span>{t('শুরুর সময়:', 'Start time:')}</span>
            <input type="time" value={toTimeInput(task.startMinute)} onChange={e => adjustTaskStartTime(e.target.value)} />
          </label>
          <div className="cascade-duration-btns">
            <span>{t('সময়কাল:', 'Duration:')}</span>
            <button type="button" className="button ghost small" onClick={() => adjustTaskDuration(-15)} disabled={durationMin <= 15}><Minus size={12} />{t('১৫ মি.', '15m')}</button>
            <strong>{formatDurationBn(durationMin)}</strong>
            <button type="button" className="button ghost small" onClick={() => adjustTaskDuration(15)}><Plus size={12} />{t('১৫ মি.', '15m')}</button>
            <button type="button" className="button ghost small" onClick={() => adjustTaskDuration(30)}><Plus size={12} />{t('৩০ মি.', '30m')}</button>
          </div>
        </div>
        </>}{generated && <p className="tiny-muted">{task.personalWork ? t('এটি পুরো ক্লাস/কাজের ছোট অংশ। টাইমার শেষ মানে ভিডিও দেখা/অনুশীলন শেষ নয়; সত্যিই এই অংশ শেষ হলে টিক দাও। সময় ও উৎস বদলাতে Settings-এর নিজের রুটিন ব্যবহার করো।', 'This is a segment of a full class/work stage. A timer cannot prove it was watched/practised; tick it only when actually finished. Edit availability and sources in your personal routine in Settings.') : t('এই duration-based session workload থেকে তৈরি। সময় বদলাতে Study & offline-এর daily limit ব্যবহার করো।','This duration-based session follows the workload. Change daily limits in Study & offline.')}</p>}
        {primaryClasses && <div className="task-inline-classes">
          {compact ? <ClassLinkRow classes={primaryClasses} /> : <ClassBlock classes={primaryClasses} compact />}
        </div>}
        <div className="task-expanded">
          <span><Clock3 size={14} />{formatTime(task.startMinute)}{formatDayOffset(task.startMinute)} – {formatTime(task.endMinute)}{formatDayOffset(task.endMinute)}</span>
          <button className="text-button" onClick={launchPreset}><Play size={13} />{t('টাইমার শুরু করো', 'Start timer')}</button>
          {primaryChapter && <button className="text-button" onClick={() => openChapter(primaryChapter)}><BookOpen size={14} />{t('অধ্যায় ও নোট', 'Chapter & notes')}</button>}
          <button className="text-button" onClick={() => openMistake(task.subject, `${task.title}: `)}><NotebookPen size={14} />{t('ভুলের খাতায় যোগ করো', 'Add to mistake notebook')}</button>
        </div>
      </div>}
    </div>
    <button className={`task-check ${done ? 'checked' : ''}`} onClick={() => toggleTask(task.id)} aria-label={`${task.title} — ${done ? t('অসম্পন্ন করো', 'mark incomplete') : t('সম্পন্ন করো', 'mark complete')}`} aria-pressed={done}>{done && <Check size={17} strokeWidth={2.5} />}</button>
  </article>;
}
export function WeekChart({ large = false }: { large?: boolean }) {
  const { plan, data, today, setSelectedDate, navigate } = usePlanner();
  const date = new Date(`${today}T00:00:00Z`); const dow = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - dow * 86400000).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10); return { date: d, day: plan.find(x => x.date === d) }; });
  return <div className={`week-chart ${large ? 'large' : ''}`}>{days.map((d, i) => {
    const minutes = d.day?.tasks.filter(task => isPersonalTaskComplete(task, data.completed)).reduce((n, t) => n + t.endMinute - t.startMinute, 0) || 0;
    const dayTargetMin = dailyTargetMinutes(data,d.date);
    return <button key={d.date} className={`week-day ${d.date === today ? 'today' : ''}`} onClick={() => { setSelectedDate(d.date); navigate('today', d.date); }} title={`${formatDate(d.date)}: ${bn(Math.round(minutes / 6) / 10)} ${t('ঘণ্টার কাজ সম্পন্ন', 'hours of tasks done')}`}><div className="bar-space"><span style={{ height: `${Math.max(3, Math.min(100, dayTargetMin > 0 ? minutes / dayTargetMin * 100 : minutes ? 100 : 0))}%` }} className={minutes ? 'has-value' : ''} /></div><span>{(isEnglish() ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['সো', 'মঙ্গল', 'বু', 'বৃ', 'শু', 'শ', 'র'])[i]}</span>{large && <small>{bn(Math.round(minutes / 6) / 10)}{t('ঘ', 'h')}</small>}</button>;
  })}</div>;
}
export function StudyIllustration() {
  return <svg className="study-illustration" viewBox="0 0 280 210" fill="none" aria-hidden="true"><circle cx="161" cy="102" r="83" fill="#DCE7CC" /><circle cx="220" cy="42" r="19" fill="#F2D995" /><path d="M43 165c35-13 62-8 94 8 36-18 69-20 105-7v16c-38-12-70-5-105 10-34-16-64-20-94-9z" fill="#B8CDA7" opacity=".4" /><path d="M42 70c31-9 62-2 94 18 32-20 63-27 94-18v94c-31-9-62-2-94 18-32-20-63-27-94-18z" fill="#FAFCF4" stroke="#719475" strokeWidth="2.5" /><path d="M136 89v92" stroke="#719475" strokeWidth="2.5" /><path d="M57 91c22-3 42 2 62 13M57 108c22-3 42 2 62 13M57 125c22-3 42 2 62 13M57 142c17-2 32 1 45 7" stroke="#C2D2B7" strokeWidth="4" strokeLinecap="round" /><path d="M153 105c17-10 36-15 59-14M153 122c17-10 36-15 59-14M153 139c17-10 36-15 44-14" stroke="#C2D2B7" strokeWidth="4" strokeLinecap="round" /><path d="M182 54c-3-24 8-37 27-40-1 22-11 34-27 40z" fill="#6F956B" /><path d="M181 55c-20-4-29-17-27-34 19 3 28 15 27 34z" fill="#A4BD87" /><path d="M181 54v30" stroke="#6F956B" strokeWidth="3" strokeLinecap="round" /><rect x="178" y="128" width="70" height="54" rx="12" fill="#2B654E" transform="rotate(-8 178 128)" /><path d="m198 151 9 7 17-21" stroke="#EDF4DE" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="m40 39 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#9BB486" /><circle cx="247" cy="102" r="4" fill="#A4BD87" /><circle cx="67" cy="188" r="3" fill="#C2A66C" /></svg>;
}
export function LocalNote() {
  const { data, setData, selectedDate, storageOk } = usePlanner();
  return <section className="card note-card"><div className="card-heading"><h3><NotebookPen size={17} />{t('দিনের ছোট নোট', 'Short day note')}</h3><span className="tiny-muted">{storageOk ? t('অটো সেভ', 'auto-saved') : t('সেভ হয়নি', 'not saved')}</span></div><textarea aria-label={t('দিনের নোট', 'Day note')} placeholder={t('কী শিখলে, কোথায় আটকে গেলে… নিজের জন্য লিখে রাখো।', 'What did you learn? Where did you get stuck? Write it for yourself…')} value={data.notes[selectedDate] || ''} maxLength={10000} onChange={e => setData(d => ({ ...d, notes: { ...d.notes, [selectedDate]: e.target.value } }))} /><span className="note-date">{formatDate(selectedDate, 'long')}</span></section>;
}
export function SyllabusNotice() {
  const { data, navigate } = usePlanner();
  if (data.settings.syllabusChecked) return null;
  return <div className="syllabus-notice"><Sparkles size={17} /><p>{t('বইয়ের সঙ্গে সিলেবাস মিলিয়ে নাও।', 'Check the syllabus against your books.')} <span>{t('A আগে, B এরপর—কোনো অধ্যায় বাদ নয়।', 'A first, then B — no chapter is dropped.')}</span></p><button className="text-button" onClick={() => navigate('settings')}>{t('যাচাই করো', 'Check')} <ArrowUpRight size={14} /></button></div>;
}
export function DaySummary({ day }: { day: Day }) {
  const { data } = usePlanner();
  const done = day.tasks.filter(task => isPersonalTaskComplete(task, data.completed)).length;
  return <div className="day-summary"><span>{bn(done)}/{bn(day.tasks.length)} {t('কাজ শেষ', 'tasks done')}</span><ProgressBar value={percent(done, day.tasks.length)} /></div>;
}

const CLASS_KINDS = ['oneShot', 'cq', 'mcq'] as const;
const CLASS_LABEL = {
  oneShot: { bn: 'ওয়ান শট ক্লাস', en: 'One-Shot Class', shortBn: 'ওয়ান শট', shortEn: 'One-Shot' },
  cq: { bn: 'CQ সলভিং ক্লাস', en: 'CQ Solving Class', shortBn: 'CQ সলভিং', shortEn: 'CQ' },
  mcq: { bn: 'MCQ সলভিং ক্লাস', en: 'MCQ Solving Class', shortBn: 'MCQ সলভিং', shortEn: 'MCQ' },
} as const;
const classLabel = (kind: 'oneShot' | 'mcq' | 'cq', short = false) =>
  short ? t(CLASS_LABEL[kind].shortBn, CLASS_LABEL[kind].shortEn) : t(CLASS_LABEL[kind].bn, CLASS_LABEL[kind].en);

const TEACHER_DISPLAY: Record<string, string> = {
  'মাশরুর': 'মাশরুর ভাই',
  'অপূর্ব': 'অপূর্ব দাদা',
  'রাকিব': 'রাকিব ভাই',
  'হাসনাত': 'হাসনাত শুভ্র',
  'ফাহাদ': 'ফাহাদ স্যার',
  'সাকিব': 'সাকিব স্যার',
  'বন্দি': 'বন্দি পাঠশালা',
  'আলোরণ · পাহলভী': 'মোত্তাসিন পাহলভী',
  'আলোরণ': 'আলোরণ',
  'চিন্ময়': 'চিন্ময় স্যার',
  'প্যাভেল': 'প্যাভেল স্যার',
};
const baseChannel = (name: string) =>
  name
    .replace(/\s*\(সার্চ\)\s*/g, '')
    .replace(/\s+প্লেলিস্ট$/g, '')
    .replace(/\s+(CQ|MCQ)$/gi, '')
    .trim();

const formatTeacherLabel = (name: string) => {
  const clean = baseChannel(name);
  return TEACHER_DISPLAY[clean] || clean;
};

/** One class chip plus a "seen it" tick. The tick is stored per url, so a link stays marked everywhere. */
function ClassLink({ option, kind, showKind }: { option: ClassOption; kind: 'oneShot' | 'mcq' | 'cq'; showKind: boolean }) {
  const planner = useOptionalPlanner();
  const search = option.kind === 'search';
  const isPlaylist = option.kind === 'playlist';
  const watched = !!planner && !search && isWatched(planner.data, option.url);
  const label = formatTeacherLabel(option.channel);
  // Speech users must be able to say the label they can see, including the
  // short class kind and the Search/Playlist chips, in the same order.
  const visibleLabel = [showKind ? classLabel(kind, true) : '', label, isPlaylist ? t('প্লেলিস্ট', 'Playlist') : '', search ? t('খুঁজুন', 'Search') : ''].filter(Boolean).join(' ');
  return <span className={`class-pill ${search ? 'is-search' : 'is-direct'} ${watched ? 'watched' : ''}`}>
    <a
      className={`class-link ${search ? 'search' : 'real'} ${isPlaylist ? 'playlist' : ''}`}
      href={option.url} target="_blank" rel="noreferrer"
      aria-label={`${visibleLabel} — ${classLabel(kind)}${search ? t(' (ইউটিউবে খুঁজে দেখো)', ' (search on YouTube)') : isPlaylist ? t(' (প্লেলিস্ট)', ' (playlist)') : t(' (সরাসরি ক্লাস)', ' (direct class)')}${watched ? t(' (দেখা হয়েছে)', ' (watched)') : ''}`}
      title={`${classLabel(kind)} · ${label}${isPlaylist ? t(' (সম্পূর্ণ প্লেলিস্ট)', ' (full playlist)') : search ? t(' — ইউটিউবে খুঁজে দেখো', ' — search on YouTube') : t(' — এক ক্লিকে সরাসরি ক্লাস', ' — click to watch class')}`}>
      {search ? <Search size={12.5} className="class-play-icon" aria-hidden="true" /> : <Play size={12.5} className="class-play-icon" aria-hidden="true" />}
      {showKind && <span className="class-kind-tag">{classLabel(kind, true)}</span>}{' '}
      <span className="class-channel">{label}</span>
      {isPlaylist && <> <span className="class-playlist-tag">{t('প্লেলিস্ট', 'Playlist')}</span></>}
      {search && <> <span className="class-search-tag">{t('খুঁজুন', 'Search')}</span></>}
    </a>
    {!search && planner && <button type="button" className={`class-watch ${watched ? 'on' : ''}`} aria-pressed={watched}
      aria-label={`${label} ${classLabel(kind)} — ${watched ? t('দেখা হয়েছে, টিক সরাও', 'watched, clear the tick') : t('দেখেছি বলে টিক দাও', 'mark as watched')}`}
      title={watched ? t('দেখা হয়েছে', 'watched') : t('দেখেছি', 'mark watched')}
      onClick={() => planner.setData(d => toggleClassWatched(d, option.url))}>
      {watched ? <CheckCheck size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
    </button>}
  </span>;
}

/** Compact flat chips — one direct class per block (One-Shot · CQ · MCQ). */
export function ClassLinkRow({ classes }: { classes: ChapterClasses }) {
  return <div className="class-link-row compact">
    {CLASS_KINDS.map(kind => classes[kind].slice(0, 1).map(option =>
      <ClassLink key={`${kind}-${option.url}`} option={option} kind={kind} showKind />))}
  </div>;
}

/** Structured 3-block class layout: ওয়ান শট ক্লাস → CQ সলভিং ক্লাস → MCQ সলভিং ক্লাস. */
export function ClassBlock({ classes, hint, compact = false }: { classes: ChapterClasses; hint?: string; compact?: boolean }) {
  const planner = useOptionalPlanner();
  const total = classes.oneShot.length + classes.cq.length + classes.mcq.length;
  const all = allOptions(classes);
  const real = all.filter(option => option.kind !== 'search');
  const hasSearch = all.some(option => option.kind === 'search');
  const seen = planner ? real.filter(option => isWatched(planner.data, option.url)).length : 0;
  return <div className={`class-block ${compact ? 'compact' : ''}`}>
    {!compact && <div className="class-block-head">
      <strong>{t('অধ্যায়ের ক্লাসসমূহ', 'Chapter classes')} <span className="count-badge">{isEnglish() ? `${total} links` : `${bn(total)}টি লিংক`}</span></strong>
      <span className="class-legend">
        <i className="dot real" aria-hidden="true" />{t('সরাসরি ক্লাস', 'direct class')}
        {hasSearch && <><i className="dot search" aria-hidden="true" />{t('ইউটিউব সার্চ', 'YouTube search')}</>}
      </span>
    </div>}
    {!compact && planner && real.length > 0 && <p className="class-seen-line">{isEnglish() ? `${seen}/${real.length} classes watched` : `${bn(seen)}/${bn(real.length)} ক্লাস দেখা হয়েছে`}{seen === real.length && <span className="class-seen-done">{t('✓ সব দেখা শেষ', '✓ all done')}</span>}</p>}
    {!compact && <p className="class-hint">{t('বিদ্যমান লিংকগুলো বিষয় ও অধ্যায়ের জন্য যাচাই করা হয়নি; খোলার পর মিলিয়ে নাও।', 'Existing links have not been verified for this chapter; check the content after opening.')}</p>}
    {hint && <p className="class-hint">{hint}</p>}
    <div className="class-groups-grid">
      {CLASS_KINDS.map(kind => {
        const list = [...classes[kind]].sort((a, b) => (a.kind === 'search' ? 1 : 0) - (b.kind === 'search' ? 1 : 0));
        const directInKind = list.filter(o => o.kind !== 'search');
        const kindSeen = planner ? directInKind.filter(o => isWatched(planner.data, o.url)).length : 0;
        return <div className={`class-group-card ${kind}`} key={kind}>
          <div className="class-group-header">
            <span className={`class-kind ${kind}`}>{classLabel(kind)}</span>
            <span className="class-group-count">
              {planner && kindSeen > 0 ? `${bn(kindSeen)}/${bn(directInKind.length)} ✓` : `${bn(directInKind.length)}${t('টি ক্লাস', ' direct')}`}
            </span>
          </div>
          <div className="class-link-row">
            {list.map(option => <ClassLink key={`${kind}-${option.url}`} option={option} kind={kind} showKind={false} />)}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

/**
 * Weekly backup nudge. Manual backups are forgotten within days, so the app asks
 * again once a week, and can be pushed away for three days.
 */
export function BackupNudge() {
  const { data, notify } = usePlanner();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayKey();
  if (hidden || !needsBackup(data, today)) return null;
  const age = backupAgeDays(today);
  const keep = () => {
    try {
      const name = downloadBackup(data, today);
      notify(`${name} সেভ হয়েছে। নিরাপদ জায়গায় রাখো।`);
      setHidden(true);
    } catch { notify(t('ব্যাকআপ ফাইল তৈরি হয়নি। সেটিংস থেকে আবার চেষ্টা করো।', 'The backup file was not created. Try again from Settings.'), 'error'); }
  };
  const share = async () => {
    setBusy(true);
    try {
      const outcome = await shareBackup(data, today);
      if (outcome === 'cancelled') return;
      notify(outcome === 'shared' ? 'ব্যাকআপ শেয়ার শিটে পাঠানো হয়েছে।' : outcome === 'copied' ? 'ব্যাকআপ JSON কপি হয়েছে — যেখানে খুশি পেস্ট করো।' : 'ব্যাকআপ ফাইল ডাউনলোড হয়েছে।');
      setHidden(true);
    } catch { notify(t('শেয়ার করা যায়নি। ডাউনলোড করে নাও।', 'Sharing failed. Download it instead.'), 'error'); }
    finally { setBusy(false); }
  };
  return <div className="backup-nudge" role="note">
    <div>
      <ShieldCheck size={20} />
      <span><strong>{age === null ? 'এখনও কোনো ব্যাকআপ নেই' : `${bn(age)} দিন ধরে ব্যাকআপ নেওয়া হয়নি`}</strong>{t('ফোন হারালে বা অ্যাপ মুছলে এই অগ্রগতি ফিরে পাওয়ার একটাই উপায়—JSON ব্যাকআপ।', 'One JSON file is the only way to restore this progress if the phone is lost.')}</span>
    </div>
    <span className="backup-nudge-actions">
      <button className="button primary small" onClick={keep}>{t('ব্যাকআপ রাখো', 'Save backup')}</button>
      <button className="button secondary small" disabled={busy} onClick={() => void share()}>{t('শেয়ার / কপি', 'Share / copy')}</button>
      <button className="text-button" onClick={() => { snoozeBackup(); setHidden(true); notify(t('তিন দিন পরে আবার মনে করাব।', 'I will remind you again in three days.'), 'info'); }}>{t('পরে', 'Later')}</button>
    </span>
  </div>;
}

/** Bangla 1st paper: lesson-by-lesson classes inside a chapter group. */
export function LessonList({ lessons, channel = 'shakibsirbangla' }: { lessons: LessonLink[]; channel?: string }) {
  const planner = useOptionalPlanner();
  const ready = lessons.filter(lesson => lesson.url).length;
  const seen = planner ? lessons.filter(lesson => lesson.url && isWatched(planner.data, lesson.url)).length : 0;
  return <div className="lesson-block">
    <div className="class-block-head">
      <strong>{t('পাঠভিত্তিক ক্লাস', 'Lesson-by-lesson classes')}</strong>
      <span>{isEnglish() ? `${ready}/${lessons.length} lessons have a video` : `${bn(ready)}/${bn(lessons.length)} পাঠের ভিডিও আছে`}</span>
    </div>
    {planner && ready > 0 && <p className="class-seen-line">{isEnglish() ? `${seen}/${ready} classes watched` : `${bn(seen)}/${bn(ready)} ক্লাস দেখা হয়েছে`}{seen === ready && <span className="class-seen-done">{t('✓ সব শেষ', '✓ all done')}</span>}</p>}
    <div className="lesson-grid">{lessons.map(lesson => {
      const href = lesson.url || `https://www.youtube.com/@${channel}/search?query=${encodeURIComponent(lesson.title)}`;
      const key = lesson.url || lessonKey(lesson.title);
      const watched = !!planner && !!lesson.url && isWatched(planner.data, key);
      return <span key={lesson.title} className={`lesson-pill ${watched ? 'watched' : ''}`}>
        <a className={`lesson-row ${lesson.url ? 'ready' : 'todo'}`} href={href} target="_blank" rel="noreferrer"
          aria-label={`${lesson.title}${lesson.channel ? ' ' + lesson.channel : ''} ${lesson.url ? t('ক্লাস', 'class') : t('খুঁজো', 'search')}${watched ? t(' — দেখা হয়েছে', ' — watched') : ''}`}>
          <span className="lesson-copy"><span className="lesson-title">{lesson.title}</span>{lesson.channel && <> <span className="lesson-channel">{lesson.channel}</span></>}</span>
          {' '}{lesson.url ? <span className="lesson-state ready"><Play size={11} aria-hidden="true" />{t('ক্লাস', 'class')}</span> : <span className="lesson-state"><Search size={11} aria-hidden="true" />{t('খুঁজো', 'search')}</span>}
        </a>
        {lesson.url && planner && <button type="button" className={`class-watch ${watched ? 'on' : ''}`} aria-pressed={watched}
          aria-label={`${lesson.title} — ${watched ? t('দেখা হয়েছে, টিক সরাও', 'watched, clear the tick') : t('দেখেছি বলে টিক দাও', 'mark as watched')}`}
          title={watched ? t('দেখা হয়েছে', 'watched') : t('দেখেছি', 'mark watched')}
          onClick={() => planner.setData(d => toggleClassWatched(d, key))}>
          {watched ? <CheckCheck size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
        </button>}
      </span>;
    })}</div>
  </div>;
}
