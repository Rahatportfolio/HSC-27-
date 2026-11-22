import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, Play, Plus, Save, Trash2 } from 'lucide-react';
import { CHAPTERS, SUBJECTS, chapterById } from '../data';
import { CHAPTER_CLASSES } from '../classLinks';
import { usePlanner } from '../context';
import { bn, shiftPlanStart, isValidDate, formatDate, formatDurationBn, formatTime, toMinutes, toTimeInput } from '../planner';
import { t, weekdayName } from '../i18n';
import { saveData } from '../storage';
import { DEFAULT_CHAPTER_MINUTES, RECOMMENDED_S_IDS, WORK_STAGES, applyPersonalRoutine, chapterWorkEstimate, newPersonalRoutine, parsePersonalRoutine, personalBookLabel, personalChapterPairs, personalRoutineHealth, routineIssueText, safeClassUrl, workloadFor } from '../personalRoutine';
import type { AvailabilityWindow, PersonalRoutine, WorkBudget, WorkStage } from '../personalRoutine';
import { inspectYouTubeDuration, youtubeVideoId } from '../youtubeDuration';
import { buildStudyPlan } from '../studyPlan';
import { applyScheduleSettings } from '../reschedule';
import IndependentWorkCalculator from './IndependentWorkCalculator';
import { classDurationReference, referenceDuration } from '../classDurationReferences';

interface WindowDraft { days: number[]; start: string; end: string }
function windowRows(windows: AvailabilityWindow[]): WindowDraft[] {
  const rows = new Map<string, WindowDraft>();
  for (const window of windows) {
    const key = `${window.startMinute}-${window.endMinute}`;
    const row = rows.get(key) || { days: [], start: toTimeInput(window.startMinute), end: window.endMinute === 1440 ? '24:00' : toTimeInput(window.endMinute) };
    row.days.push(window.weekday); rows.set(key, row);
  }
  return [...rows.values()];
}
function availabilityFromRows(rows: WindowDraft[]): AvailabilityWindow[] {
  return rows.flatMap(row => row.days.flatMap(weekday => {
    const startMinute = row.start ? toMinutes(row.start) : NaN, endMinute = row.end ? toMinutes(row.end) : NaN;
    return endMinute < startMinute ? [{ weekday, startMinute, endMinute: 1440 }, ...(endMinute > 0 ? [{ weekday: (weekday + 1) % 7, startMinute: 0, endMinute }] : [])] : [{ weekday, startMinute, endMinute }];
  }));
}
function DurationProbe({ url, onMeasured }: { url: string; onMeasured: (minutes: number) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const callback = useRef(onMeasured); callback.current = onMeasured;
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (mount.current) void inspectYouTubeDuration(url, mount.current, controller.signal).then(minutes => {
      if (!controller.signal.aborted) callback.current(minutes);
    }).catch(err => { if (!controller.signal.aborted) setError((err as Error).message); });
    return () => controller.abort();
  }, [url]);
  return <div className="duration-probe" role="status"><div ref={mount} />{error
    ? <p>{t('YouTube থেকে সময় পড়া যায়নি। মূল ভিডিও খুলে দেখানো প্রকৃত সময় লেখো; কোনো দৈর্ঘ্য অনুমান করা হয়নি।', 'Could not read YouTube metadata. Open the original video and enter its shown duration; no duration was guessed.')} <small>{error}</small></p>
    : <p>{t('নির্বাচিত ভিডিওর প্রকৃত দৈর্ঘ্য পড়ছি… ইন্টারনেট ও YouTube embed অনুমতি লাগবে।', 'Reading this exact video’s duration… internet and YouTube embedding must be available.')}</p>}</div>;
}
export default function PersonalRoutineSetup({ onDone, onCancel, initialRoutine, embedded = false }: { onDone?: () => void; onCancel?: () => void; initialRoutine?: PersonalRoutine; embedded?: boolean }) {
  const { data, plan: savedPlan, setData, notify, confirm, navigate, setSelectedDate, today } = usePlanner();
  const [draft, setDraft] = useState<PersonalRoutine>(() => initialRoutine ? structuredClone(initialRoutine) : data.personalRoutine ? structuredClone(data.personalRoutine) : newPersonalRoutine('ALL'));
  const [rows, setRows] = useState(() => draft.windows.length ? windowRows(draft.windows) : [{ days: [], start: '', end: '' }]);
  const [fixedRows, setFixedRows] = useState(() => windowRows(draft.exclusions || []));
  const [obligations, setObligations] = useState(draft.exclusions?.length ? 'some' : data.personalRoutine || initialRoutine ? 'none' : '');
  const [dailyHours, setDailyHours] = useState(draft.dailyLimitMinutes ? String(draft.dailyLimitMinutes / 60) : '');
  const [dates, setDates] = useState(data.settings);
  const dateAnchor = useRef(data.settings.startDate);
  const changeStartDate = (value: string) => {
    if (!isValidDate(value)) { setDates(current => ({ ...current, startDate: value })); return; }
    const previous = dateAnchor.current; dateAnchor.current = value;
    setDates(current => shiftPlanStart({ ...current, startDate: previous }, value));
  };
  const baseDates = useRef(JSON.stringify([data.settings.startDate, data.settings.testExamDate, data.settings.examDate, data.settings.examDatePolicy]));
  const scope = draft.scope;
  const retainedChapters = new Map(Object.values(data.personalPhases || {}).filter(phase => scope !== 'ALL' && phase.scope !== scope).flatMap(phase => phase.chapterIds.map(id => [id, phase.scope] as const)));
  const recommendedS = RECOMMENDED_S_IDS.filter(id => !retainedChapters.has(id));
  const currentPlan = useRef(savedPlan); currentPlan.current = savedPlan;
  const [step, setStep] = useState(0);
  const [chapterId, setChapterId] = useState(draft.chapterIds[0] || RECOMMENDED_S_IDS[0]);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState<WorkStage | null>(null);
  const latest = useRef(data); latest.current = data;
  const baseRoutine = useRef(JSON.stringify(data.personalRoutine || null));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView?.({ block: 'start' }); }, [step]);
  const draftWithWindows = useMemo(() => ({ ...draft, windows: availabilityFromRows(rows), exclusions: obligations === 'some' ? availabilityFromRows(fixedRows) : [], dailyLimitMinutes: dailyHours === '' ? NaN : Math.round(Number(dailyHours) * 60) }), [draft, rows, fixedRows, obligations, dailyHours]);
  const applyDates = (source: typeof data) => applyScheduleSettings(source.personalRoutine || source.routineSetupRequired ? source : { ...source, routineSetupRequired: true }, { ...source.settings, startDate: dates.startDate, testExamDate: dates.testExamDate, examDate: dates.examDate, examDatePolicy: dates.examDatePolicy });
  const preview = useMemo(() => {
    try {
      const routine = parsePersonalRoutine(draftWithWindows);
      const next = applyPersonalRoutine(applyDates(data), routine, { plan: savedPlan, asOf: today });
      const plan = buildStudyPlan(next, today);
      return { routine, projection: { plan, issues: personalRoutineHealth(next, plan).issues }, error: '' };
    } catch (err) { return { routine: null, projection: null, error: (err as Error).message }; }
  }, [data, draftWithWindows, today, dates, savedPlan]);
  const changeRow = (index: number, patch: Partial<WindowDraft>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  const toggleChapter = (id: string) => { if (!retainedChapters.has(id)) setDraft(current => ({ ...current, chapterIds: current.chapterIds.includes(id) ? current.chapterIds.filter(value => value !== id) : [...current.chapterIds, id] })); };
  const workload = workloadFor(draft, chapterId);
  const updateBudget = (stage: WorkStage, patch: Partial<WorkBudget>) => setDraft(current => ({ ...current, workloads: { ...current.workloads,
    [chapterId]: { ...workloadFor(current, chapterId), [stage]: { ...workloadFor(current, chapterId)[stage], ...patch } } } }));
  const next = () => {
    if (step === 0 && (!rows.length || rows.some(row => !row.days.length || !row.start || !row.end) || !dailyHours || !obligations || obligations === 'some' && (!fixedRows.length || fixedRows.some(row => !row.days.length || !row.start || !row.end)) || preview.error)) { setError(t('যে দিন পড়বে এবং শুরুর/শেষ সময় দাও। একই দিনের সময়গুলো যেন না মেলে; প্রতিটি সময়সীমা অন্তত ৫ মিনিট রাখো। দৈনিক মোট পড়ার ঘণ্টা ও নির্দিষ্ট বিরতি/দায়িত্বের কথাও দাও।', 'Choose your study days and start/end times. Windows on the same day must not overlap and must last at least 5 minutes. Enter your daily net hours and fixed-break/obligation choice too.')); return; }
    if (step === 1 && !draft.chapterIds.length) { setError(t('নির্বাচিত ধাপে অন্তত একটি অধ্যায় রাখো।', 'Choose at least one chapter for this phase.')); return; }
    setError(''); setStep(current => Math.min(3, current + 1));
    if (!draft.chapterIds.includes(chapterId)) setChapterId(draft.chapterIds[0]);
  };
  const commit = () => {
    try {
      const routine = parsePersonalRoutine({ ...draftWithWindows, updatedAt: new Date().toISOString() });
      applyPersonalRoutine(applyDates(latest.current), routine, { plan: currentPlan.current, asOf: today }); // Validate locks before asking for consent.
      const apply = () => {
        try {
          if (JSON.stringify(latest.current.personalRoutine || null) !== baseRoutine.current) throw new Error(t('এই ফর্ম খোলা থাকা অবস্থায় অন্য জায়গা থেকে রুটিন বদলেছে। বাতিল করে আবার খোলো; নতুন পরিবর্তন চাপা দেওয়া হয়নি।', 'The routine changed elsewhere while this form was open. Cancel and reopen it; newer changes were not overwritten.'));
          if (JSON.stringify([latest.current.settings.startDate, latest.current.settings.testExamDate, latest.current.settings.examDate, latest.current.settings.examDatePolicy]) !== baseDates.current) throw new Error(t('ফর্ম খোলা থাকা অবস্থায় পরিকল্পনার তারিখ বদলেছে। আবার খোলো; আগের তারিখ চাপানো হয়নি।', 'The planning dates changed while this form was open. Reopen it; newer dates were not overwritten.'));
          const nextData = applyPersonalRoutine(applyDates(latest.current), routine, { plan: currentPlan.current, asOf: today });
          if (!saveData(nextData, true)) throw new Error(t('সেভ হয়নি—আগের রুটিন ও তথ্য অক্ষত আছে। স্টোরেজ যাচাই করো।', 'Not saved—your existing routine and data are unchanged. Check storage.'));
          setData(nextData); setSelectedDate(today > nextData.settings.startDate && today < nextData.settings.examDate ? today : nextData.settings.startDate); onDone?.(); navigate('today');
          notify(scope === 'ALL' ? t('সব অধ্যায়ের রুটিন সেভ হয়েছে।', 'Your all-chapter routine was saved.') : scope === 'S' ? t('তোমার সময় ও S তালিকা সেভ হয়েছে। অজানা ক্লাসের সময় আগে মেলাও।', 'Your availability and S shortlist were saved. Resolve unknown class durations before relying on finish dates.') : t(`${scope} ধাপ সেভ হয়েছে। আগের S অগ্রগতি অক্ষত আছে।`, `${scope} phase saved. Your S progress is retained.`));
        } catch (err) { setError((err as Error).message); notify((err as Error).message, 'error'); }
      };
      if (!data.routineSetupRequired || data.personalRoutine) confirm({ title: scope === 'ALL' ? t('সব অধ্যায়ের রুটিন চালু করবে?', 'Apply the all-chapter routine?') : scope === 'S' ? t('নিজের সময় ও S-only রুটিন চালু করবে?', 'Apply availability & S-only routine?') : t(`${scope} ধাপের রুটিন চালু করবে?`, `Apply ${scope}-phase routine?`),
        message: scope === 'ALL' ? t('সব অধ্যায়ের রুটিন হবে। নোট, অগ্রগতি, ইতিহাস ও নিজের কাজ থাকবে; সংঘর্ষ থাকলে ঠিক করতে হবে।', 'All chapters will be planned. Notes, progress, history and custom appointments are retained; review conflicts.') : t('নির্বাচিত গুরুত্বপূর্ণ অধ্যায় ও প্রকৃত সময় দিয়ে নতুন রুটিন হবে। পুরোনো নোট, সম্পন্ন কাজের আসল সময়, ছবি, ভিডিও ও অগ্রগতি মুছবে না। আগের A/B/C রুটিনের checkbox নতুন ভিডিও শেষের প্রমাণ হিসেবে ব্যবহার হবে না। নিজের কাস্টম কাজ থাকবে; সংঘর্ষ দেখলে ঠিক করতে হবে।', 'The routine will use only your selected important chapters and actual durations. Notes, real completion timestamps, images, media and history are retained. Legacy task checkboxes do not prove a different new video was watched. Custom appointments remain; review conflicts.'),
        label: t('হ্যাঁ, নিজের রুটিন করো', 'Apply my routine'), action: apply });
      else apply();
    } catch (err) { setError((err as Error).message); }
  };
  const stepLabels = [t('কখন পড়বে', 'Availability'), scope === 'ALL' ? t('সব অধ্যায়', 'All chapters') : scope === 'S' ? t('শুধু S অধ্যায়', 'S chapters only') : `${scope} ${t('ধাপের অধ্যায়', 'phase chapters')}`, t('চাইলে সময় বদলাও', 'Optional time tuning'), t('পূর্বরূপ ও সেভ', 'Preview & save')];
  // Settings (and legacy Home) already owns its page title and .view wrapper.
  // Keep the same focused step title without introducing a second page outline.
  const Heading = embedded ? 'h2' : 'h1';
  return <section className={`${embedded ? '' : 'view '}card personal-setup`} aria-label={t('নিজের সময় দিয়ে প্রথম রুটিন', 'Availability-based routine setup')}>
    <div className="eyebrow">{scope === 'ALL' ? 'ALL CHAPTERS' : scope === 'S' ? 'S CATEGORY FIRST' : `${scope} · NEXT PHASE`} · YOUR TIME</div>
    <Heading className="personal-setup-title" ref={heading} tabIndex={-1}>{step === 0 ? t('আগে বলো, কখন পড়তে পারবে?', 'First, when can you study?') : stepLabels[step]}</Heading>
    <p>{scope === 'ALL' ? t('সব অধ্যায়ে তিন সেশন থাকবে। তোমার ফাঁকা সময় অনুযায়ী পরিকল্পনা হবে; সময় কম হলে শেষের লক্ষ্য ছাড়িয়ে যেতে পারে।', 'Every chapter has three sessions. Scheduling follows your availability; some work may not fit before the target.') : t('তোমার সময় না জেনে ৮/১৬ ঘণ্টার রুটিন চাপানো হবে না।', 'No default 8/16-hour routine is imposed without your availability.')}</p>
    <ol className="personal-steps">{stepLabels.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{bn(index + 1)}</span>{label}</li>)}</ol>
    <form noValidate onSubmit={event => { event.preventDefault(); if (step < 3) next(); else commit(); }}>
      {step === 0 && <div className="personal-availability">
        <h2>{t('কোন দিন, কোন সময় ফাঁকা?', 'Which days and time windows?')}</h2>
        <div className="form-grid personal-setup-dates"><label>{t('পরিকল্পনার শুরুর তারিখ', 'Plan start date')}<input type="date" required value={dates.startDate} onChange={event => changeStartDate(event.target.value)} /></label><label>{t('ব্যক্তিগত টেস্ট লক্ষ্য', 'Personal test target')}<input type="date" required value={dates.testExamDate} onChange={event => setDates(current => ({ ...current, testExamDate: event.target.value }))} /></label><label>{t('ব্যক্তিগত শেষ লক্ষ্য', 'Personal end target')}<input type="date" required value={dates.examDate} onChange={event => setDates(current => ({ ...current, examDate: event.target.value }))} /></label></div>
        <p className="tiny-muted">{t('এগুলো ব্যক্তিগত লক্ষ্য, সরকারি পরীক্ষার রুটিন নয়। শুরু সরালে সংযুক্ত ব্যক্তিগত লক্ষ্যও সরবে; আগের সম্পন্ন সময় ও নোট সরবে না।', 'These are personal goals, not official exam dates. Moving the start cascades linked personal targets; real completion timestamps and notes do not move.')}</p>

        <p>{t('বাংলাদেশ সময়। যে দিন বাছবে না সে দিন ছুটি। রাত পেরিয়ে গেলে শুরুর দিন ও পরের দিনে সময় ভাগ হবে; সময়সীমার বাইরে পড়া বসবে না।', 'Bangladesh time. Unselected weekdays are off. A window crossing midnight is split onto the chosen day and the next day; no work leaves these windows.')}</p>
        {rows.map((row, index) => <fieldset className="availability-row" key={index}>
          <legend>{t('পড়ার সময়', 'Study window')} {bn(index + 1)}</legend>
          <div className="availability-days">{[0, 1, 2, 3, 4, 5, 6].map(day => <label key={day}><input type="checkbox" checked={row.days.includes(day)} onChange={e => changeRow(index, { days: e.target.checked ? [...row.days, day] : row.days.filter(value => value !== day) })} />{weekdayName(day)}</label>)}</div>
          <button type="button" className="text-button" onClick={() => changeRow(index, { days: [0, 1, 2, 3, 4, 5, 6] })}>{t('এই সময় প্রতিদিন', 'This time every day')}</button>
          <div className="form-grid"><label>{t('শুরু', 'Start')}<input type="time" aria-label={t(`সময় ${index + 1} শুরু`, `Window ${index + 1} start`)} value={row.start} onChange={e => changeRow(index, { start: e.target.value })} /></label><label>{t('শেষ', 'End')}<input type="time" aria-label={t(`সময় ${index + 1} শেষ`, `Window ${index + 1} end`)} value={row.end === '24:00' ? '' : row.end} disabled={row.end === '24:00'} onChange={e => changeRow(index, { end: e.target.value })} /></label></div><label className="availability-midnight"><input type="checkbox" checked={row.end === '24:00'} onChange={e => changeRow(index, { end: e.target.checked ? '24:00' : '' })} />{t('দিনশেষ রাত ১২টা পর্যন্ত (২৪:০০)', 'Until midnight at the end of the day (24:00)')}</label>
          {rows.length > 1 && <button className="button ghost small" type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))}><Trash2 size={14} />{t('এই সময় বাদ দাও', 'Remove window')}</button>}
        </fieldset>)}
        <button type="button" className="button secondary small" onClick={() => setRows(current => [...current, { days: [], start: '', end: '' }])} disabled={rows.length >= 8}><Plus size={15} />{t('আরেকটি সময় যোগ', 'Add another window')}</button>
        <label className="form-label">{t('দৈনিক মোট পড়ার ঘণ্টা (বিরতি ছাড়া)', 'Daily total study hours (net)')}<input type="number" min="0.02" max="24" step="any" required value={dailyHours} onChange={event => setDailyHours(event.target.value)} placeholder={t('তোমার নিজের সময় দাও', 'Enter your own hours')} /><small>{t('দিনের এই সীমা ও ফাঁকা সময়—দুটির কমটিই ব্যবহার হবে। বিরতি/দায়িত্বের সময়ে কাজ বসবে না।', 'The lower of this daily limit and your free windows is used. Breaks and obligations never receive study tasks.')}</small></label>
        <fieldset className="availability-obligations"><legend>{t('নির্দিষ্ট বিরতি, কোচিং বা অন্য দায়িত্ব?', 'Fixed breaks, coaching or other obligations?')}</legend>
          <label className="check-line"><input type="radio" name="fixed-obligations" value="none" checked={obligations === 'none'} onChange={() => setObligations('none')} />{t('উপরের পড়ার সময়ের ভেতরে নেই', 'None inside the study windows above')}</label>
          <label className="check-line"><input type="radio" name="fixed-obligations" value="some" checked={obligations === 'some'} onChange={() => { setObligations('some'); if (!fixedRows.length) setFixedRows([{ days: [], start: '', end: '' }]); }} />{t('আছে—এই সময়গুলোতে পড়া বসিও না', 'Yes—do not schedule study in these intervals')}</label>
          {obligations === 'some' && <>{fixedRows.map((row, index) => <fieldset className="availability-row" key={index}><legend>{t('পড়তে পারব না', 'Unavailable interval')} {bn(index + 1)}</legend>
            <div className="availability-days">{[0, 1, 2, 3, 4, 5, 6].map(day => <label key={day}><input type="checkbox" checked={row.days.includes(day)} onChange={event => { const checked = event.target.checked; setFixedRows(current => current.map((value, i) => i === index ? { ...value, days: checked ? [...value.days, day] : value.days.filter(item => item !== day) } : value)); }} />{weekdayName(day)}</label>)}</div>
            <button type="button" className="text-button" onClick={() => setFixedRows(current => current.map((value, i) => i === index ? { ...value, days: [0, 1, 2, 3, 4, 5, 6] } : value))}>{t('এই দায়িত্ব প্রতিদিন', 'This obligation every day')}</button>
            <div className="form-grid"><label>{t('শুরু', 'Start')}<input type="time" aria-label={t(`বিরতি ${index + 1} শুরু`, `Obligation ${index + 1} start`)} value={row.start} onChange={event => { const start = event.target.value; setFixedRows(current => current.map((value, i) => i === index ? { ...value, start } : value)); }} /></label><label>{t('শেষ', 'End')}<input type="time" aria-label={t(`বিরতি ${index + 1} শেষ`, `Obligation ${index + 1} end`)} value={row.end === '24:00' ? '00:00' : row.end} onChange={event => { const end = event.target.value; setFixedRows(current => current.map((value, i) => i === index ? { ...value, end } : value)); }} /></label></div>
            <button className="button ghost small" type="button" onClick={() => setFixedRows(current => current.filter((_, i) => i !== index))}><Trash2 size={14} />{t('এই দায়িত্ব বাদ', 'Remove obligation')}</button>
          </fieldset>)}<button type="button" className="button secondary small" disabled={fixedRows.length >= 8} onClick={() => setFixedRows(current => [...current, { days: [], start: '', end: '' }])}><Plus size={14} />{t('আরেকটি নির্দিষ্ট বিরতি', 'Add fixed obligation')}</button></>}
        </fieldset>
        <div className="form-grid personal-session-options"><label>{t('একটানা সর্বোচ্চ সেশন (মিনিট)', 'Maximum continuous session (minutes)')}<input type="number" min="15" max="120" value={draft.sessionMinutes} onChange={e => setDraft(current => ({ ...current, sessionMinutes: Number(e.target.value) }))} /><small>{t('এটি ক্লাসের পুরো দৈর্ঘ্য নয়; বড় ক্লাস এমন ছোট অংশে ভাগ হবে।', 'This is a session limit, not the whole class duration; long classes are split into segments.')}</small></label><label>{t('সেশনের মাঝে বিরতি (মিনিট)', 'Break between sessions (minutes)')}<input type="number" min="0" max="60" value={draft.breakMinutes} onChange={e => setDraft(current => ({ ...current, breakMinutes: Number(e.target.value) }))} /><small>{t('বিরতিও তোমার দেওয়া সময়ের ভেতরেই থাকবে।', 'Breaks also fit inside your windows.')}</small></label></div>
      </div>}
      {step === 1 && scope !== 'S' && scope !== 'ALL' && <div><h2>{scope} {t('পরের ধাপের অধ্যায়', 'next-phase chapters')}</h2><p>{t('আগের ধাপের সব কাজ শেষ হওয়ার পরই এই অধ্যায়গুলো এসেছে। আগের S নির্বাচন ও ইতিহাস রাখা থাকবে।', 'These chapters are available only after the preceding phase’s required work are complete. S selection and history are retained.')}</p><ul>{draft.chapterIds.map(id => <li key={id}>{chapterById[id].title} · {personalBookLabel(id)}</li>)}</ul></div>}
      {step === 1 && scope === 'ALL' && <div><h2>{t('সব অধ্যায়ে একই তিন সেশন', 'Three sessions for every chapter')}</h2><p>{bn(draft.chapterIds.length)} {t('টি অধ্যায়: YouTube ক্লাস → নিজের নোট → CQ/MCQ সলভিং ও অনুশীলন।', 'chapters: YouTube class → own notes → CQ/MCQ solving and practice.')}</p><p>{t('প্রতিটির ২০ ঘণ্টা অনুমান Settings-এ বদলানো যায়। সব কাজ লক্ষ্য তারিখে না কুলালে তা স্পষ্ট দেখানো হবে।', 'The 20-hour estimate is editable in Settings. Work that does not fit before the target is disclosed.')}</p></div>}
      {step === 1 && scope === 'S' && <div>
        <h2>{t('A থেকে বাছাই করা গুরুত্বপূর্ণ S তালিকা', 'S shortlist of important A chapters')}</h2>
        <p>{t('শুরুর প্রস্তাব = A-category-এর বর্তমান ৫★ অধ্যায়। এটি পরিবর্তনযোগ্য ব্যক্তিগত shortlist, সরকারি S-category বা কমন প্রশ্নের নিশ্চয়তা নয়। B/C এবং বাকি A রুটিনে ঢুকবে না।', 'Starting suggestion = existing five-star A chapters. This is an editable personal shortlist, not an official S category or an exam prediction. B/C and other A chapters do not enter this routine.')}</p>
        <div className="personal-shortlist-actions"><strong>{bn(draft.chapterIds.length)} {t('টি S অধ্যায়', 'S chapters')}</strong><button type="button" className="button secondary small" onClick={() => setDraft(current => ({ ...current, chapterIds: [...recommendedS] }))}>{t('বাছাই করা তালিকা নাও', 'Use recommended shortlist')}</button><button type="button" className="button ghost small" onClick={() => setDraft(current => ({ ...current, chapterIds: [] }))}>{t('সব টিক সরাও', 'Clear selection')}</button></div>
        {retainedChapters.size > 0 && <p className="inline-note">{t('পরের সংরক্ষিত ধাপের অধ্যায় এখানে আবার নেওয়া যাবে না। এতে সেই ধাপ, পুরোনো কাজ ও ব্যাকআপ অক্ষত থাকে।', 'Chapters belonging to a retained later phase cannot be selected twice. That phase, its work and your restorable backup are preserved.')}</p>}
        <div className="personal-chapter-choices">{SUBJECTS.map(subject => <fieldset key={subject.id}><legend>{subject.name}</legend>{CHAPTERS.filter(c => c.subject === subject.id && c.priority === 'A').map(c => <label key={c.id}><input type="checkbox" value={c.id} checked={draft.chapterIds.includes(c.id)} disabled={retainedChapters.has(c.id)} onChange={() => toggleChapter(c.id)} /><span>{c.title}<small>{t('পত্র', 'Paper')} {bn(c.paper)} · A{RECOMMENDED_S_IDS.includes(c.id) ? ' · 5★' : ''}{retainedChapters.has(c.id) ? ` · ${t('সংরক্ষিত ধাপ', 'Retained phase')} ${retainedChapters.get(c.id)}` : ''}</small></span>{draft.chapterIds.includes(c.id) && <span className="s-category-badge">S</span>}</label>)}</fieldset>)}</div>
      </div>}
      {step === 2 && <div className="personal-workload-editor">
        <h2>{t('টিক দিলেই কাজ শুরু — সময় বদলাতে চাইলে এখানে', 'The schedule already works — change times only if you want')}</h2>
        <p>{t(`কিছু না বদলালেও প্রতিটি অধ্যায়ের জন্য ${formatDurationBn(DEFAULT_CHAPTER_MINUTES)} কাজ ধরা হয়েছে (ক্লাস ${formatDurationBn(480)} + বই পড়া ${formatDurationBn(240)} + নোট ${formatDurationBn(120)} + MCQ ${formatDurationBn(120)} + CQ ${formatDurationBn(180)} + রিভিশন ${formatDurationBn(60)})। এগুলো অনুমান, ভিডিওর মাপা দৈর্ঘ্য নয়। আসল সময় জানলে এখানে লেখো; প্লেয়ার থেকেও পড়া যায়।`, `Even if you change nothing, each chapter gets ${formatDurationBn(DEFAULT_CHAPTER_MINUTES)} of work (class ${formatDurationBn(480)} + reading ${formatDurationBn(240)} + notes ${formatDurationBn(120)} + MCQ ${formatDurationBn(120)} + CQ ${formatDurationBn(180)} + revision ${formatDurationBn(60)}). These are estimates, not measured video lengths. Enter the real time here if you know it; you can also read it from the player.`)}</p>
        <p className="personal-pair-note">{t('প্রথম জোড়া', 'First pair')}: {personalChapterPairs({ ...draft, chapterIds: draft.chapterIds.length ? draft.chapterIds : RECOMMENDED_S_IDS })[0]?.map(id => chapterById[id].title).join(' + ')}. {t('প্রতি অধ্যায়ে আগে ক্লাস, তারপর নোট, শেষে সলভিং ও অনুশীলন। সময় না কুলালে একই জোড়া আরও দিন চলবে।', 'For each chapter: class, then notes, then solving and practice; the same pair continues if more time is needed.')}</p>
        <div className="form-grid"><label>{t('সময় মিলিয়ে নেওয়ার অধ্যায়', 'Chapter to configure')}<select aria-label={t('সময় মিলিয়ে নেওয়ার অধ্যায়', 'Chapter to configure')} value={chapterId} onChange={e => { setChapterId(e.target.value); setProbe(null); }}>{draft.chapterIds.map(id => <option key={id} value={id}>{chapterById[id].title} · {personalBookLabel(id)}{chapterWorkEstimate(draft, id).complete ? ` · ${formatDurationBn(chapterWorkEstimate(draft, id).minutes)}` : ` — ${t('সময় দাও', 'set time')}`}</option>)}</select></label><label>{t('ভিডিও যে গতিতে দেখবে', 'Chosen playback speed')}<select value={draft.playbackSpeed} onChange={e => setDraft(current => ({ ...current, playbackSpeed: Number(e.target.value) as PersonalRoutine['playbackSpeed'], chapterSpeeds: undefined }))}>{[1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>{draft.chapterSpeeds && <small>{t('আগের ধাপের আলাদা গতি সংরক্ষিত আছে; গতি বদলালে সব অধ্যায়ে নতুন গতি লাগবে।', 'Saved phase-specific speeds are retained; changing this applies the new speed to every chapter.')}</small>}<small>{t('নিজে না বদলালে ১×; YouTube-এও এই গতি বেছে নাও। অনুশীলনের সময় কমবে না। উৎস/সময়/গতি বদলালে পুরোনো টিক নতুন উৎসের প্রমাণ হবে না।', '1× unless you choose otherwise; choose the same speed in YouTube. Practice time is never sped up. Changing a source/duration/speed retains old ticks but does not count them as evidence of a different source.')}</small></label></div>
        <div className="personal-shortlist-actions">{personalChapterPairs(draft)[0]?.map(id => <button type="button" className={`button small ${chapterId === id ? 'primary' : 'secondary'}`} key={id} onClick={() => { setChapterId(id); setProbe(null); }}>{t('প্রথম জোড়া', 'First pair')}: {chapterById[id].title}</button>)}<button type="button" className="button ghost small" onClick={() => { const id = draft.chapterIds.find(id => !chapterWorkEstimate(draft, id).complete); if (id) { setChapterId(id); setProbe(null); } }}>{t('পরের অজানা অধ্যায়', 'Next chapter needing durations')}</button></div>
        {WORK_STAGES.map(stage => {
          const budget = workload[stage.id]; const reference = classDurationReference(youtubeVideoId(budget.url || ''), chapterId, stage.id); const links = stage.media ? CHAPTER_CLASSES[chapterId]?.[stage.id === 'class' ? 'oneShot' : stage.id === 'mcqClass' ? 'mcq' : 'cq'].filter(link => link.kind !== 'search') || [] : [];
          const resources = [...new Map(links.map(link => [link.url, link])).values()];
          return <fieldset key={`${chapterId}-${stage.id}`} className="workload-stage"><legend>{t(stage.bn, stage.en)}</legend>
            {stage.media && <><label>{t('নির্বাচিত ক্লাস', 'Selected class')}<select aria-label={`${t(stage.bn, stage.en)} ${t('ক্লাস নির্বাচন', 'source')}`} value={budget.url || ''} onChange={e => { updateBudget(stage.id, { url: e.target.value || undefined, minutes: null, source: 'unknown', observedAt: undefined, acceptedAt: undefined }); setProbe(null); }}><option value="">{t('ক্লাস নির্বাচন করো / নিজের লিংক দাও', 'Select a class / enter your own URL')}</option>{budget.url && !resources.some(item => item.url === budget.url) && <option value={budget.url}>{budget.url}</option>}{resources.map(item => <option value={item.url} key={item.url}>{item.channel}{item.kind === 'playlist' ? t(' · প্লেলিস্ট (দৈর্ঘ্য অজানা)', ' · playlist (duration unknown)') : ''}</option>)}</select></label><label>{t('ক্লাসের লিংক', 'Class URL')}<input type="url" aria-label={`${t(stage.bn, stage.en)} URL`} value={budget.url || ''} onChange={e => { setProbe(null); updateBudget(stage.id, { url: e.target.value || undefined, minutes: null, source: 'unknown', observedAt: undefined, acceptedAt: undefined }); }} /></label></>}
            {!stage.media && <IndependentWorkCalculator key={`${chapterId}-${stage.id}-calculator`} stage={stage.id} budget={budget} onCalculated={value => updateBudget(stage.id, { ...value, observedAt: undefined, acceptedAt: undefined })} />}
            <div className="workload-time-row"><label>{stage.media ? t('প্রকৃত ভিডিও সময় (মিনিট)', 'Actual video duration (minutes)') : t('নিজে করার সময় রাখব (মিনিট)', 'My independent-work budget (minutes)')}<input type="number" min={['mcqClass', 'cqClass'].includes(stage.id) ? 0 : 0.01} max="10080" step="any" aria-label={`${t(stage.bn, stage.en)} ${t('মিনিট', 'minutes')}`} value={budget.minutes ?? ''} placeholder={t('অজানা', 'Unknown')} onChange={e => { setProbe(null); updateBudget(stage.id, { minutes: e.target.value === '' ? null : Number(e.target.value), source: e.target.value === '' ? 'unknown' : stage.media ? 'student' : 'planned', observedAt: undefined, acceptedAt: undefined, calculation: undefined }); }} /></label><span className={`duration-status ${budget.minutes === null ? 'unknown' : ''}`}>{budget.minutes === null ? t('সময় পাওয়া যায়নি', 'Duration Unavailable') : budget.minutes === 0 ? ['mcqClass', 'cqClass'].includes(stage.id) ? t('অতিরিক্ত ভিডিও বাদ দিয়েছ', 'Optional solving video omitted') : t('প্রয়োজনীয় কাজের সময় দাও', 'Required workload needs a positive budget') : `${formatDurationBn(budget.minutes)} · ${budget.source === 'youtube-player' ? t('প্লেয়ার থেকে পড়া', 'Read from player') : budget.source === 'reference-metadata' ? t('সংরক্ষিত পৃষ্ঠার reference', 'Saved page reference') : stage.media ? t('তোমার দেওয়া সময়', 'Student-entered') : t('পরিকল্পিত অনুশীলন', 'Planned practice')}`}</span></div>
            {reference && <div className={reference.suitability === 'chapter' ? 'inline-note' : 'personal-warning'}><p>{reference.title} · <strong>{referenceDuration(reference)}</strong> · {reference.checkedOn ? `${t('পৃষ্ঠায় যাচাই', 'Page checked')} ${reference.checkedOn}.` : t('যাচাইয়ের তারিখ নিশ্চিত নয়।', 'Observation date unverified.')} {t('এটি এই নির্দিষ্ট ভিডিওর সংরক্ষিত পৃষ্ঠার তথ্য, এখনকার player থেকে পড়া নয়। তারিখের record মেলেনি; কোনো তারিখকে নিশ্চিত যাচাই বলা হয়নি। সব ক্লাস যাচাই করা হয়নি; সময় অধ্যায় সম্পন্ন হওয়ার প্রমাণ নয়।', 'Saved page metadata for this exact video, not a current player reading. Recorded dates conflict; no observation date is certified. Not an audit of every class; duration is not completion evidence.')} {reference.suitability !== 'chapter' && t(reference.reasonBn!, reference.reasonEn!)}</p>{reference.suitability === 'chapter' && <button type="button" className="button secondary small" onClick={() => { setProbe(null); updateBudget(stage.id, { minutes: reference.seconds / 60, source: 'reference-metadata', observedAt: undefined, acceptedAt: new Date().toISOString() }); }}>{t('এই reference দৈর্ঘ্য নাও', 'Use this reference duration')}</button>}</div>}
            {stage.media && <><div className="workload-source-actions"><button type="button" className="button secondary small" disabled={!budget.url || !youtubeVideoId(budget.url)} onClick={() => setProbe(current => current === stage.id ? null : stage.id)}><Clock3 size={14} />{t('YouTube থেকে সময় পড়ো', 'Read duration from YouTube')}</button>{safeClassUrl(budget.url) && <a className="button ghost small" href={safeClassUrl(budget.url)} target="_blank" rel="noreferrer"><Play size={14} />{t('মূল ক্লাস খোলো', 'Open original class')}</a>}{['mcqClass', 'cqClass'].includes(stage.id) && <button type="button" className="text-button" onClick={() => { setProbe(null); updateBudget(stage.id, { minutes: 0, source: 'student', observedAt: undefined, acceptedAt: undefined }); }}>{t('এই অতিরিক্ত সলভিং ভিডিও লাগবে না (অনুশীলন প্রয়োজন)', 'Omit this optional solving video (practice stays required)')}</button>}</div>{probe === stage.id && budget.url && <DurationProbe key={budget.url} url={budget.url} onMeasured={minutes => { updateBudget(stage.id, { minutes, source: 'youtube-player', observedAt: new Date().toISOString(), acceptedAt: undefined }); setProbe(null); }} />}<p className="tiny-muted">{t('প্লেলিস্টের মোট দৈর্ঘ্য এই অধ্যায়ের সময় নয়। একক ভিডিও বাছো বা প্রাসঙ্গিক ক্লাসগুলোর আসল মোট সময় লেখো। প্লেলিস্টে অংশের মিনিট দেখে নিজে সঠিক ভিডিও বাছতে হবে; সেখানে অ্যাপ সরাসরি সঠিক অংশে নিতে পারে না।', 'A playlist total is not this chapter’s duration. Choose a single video or enter the real total of the relevant lessons. Playlist segments require you to choose the correct video yourself; the app cannot seek an aggregate playlist offset.')}</p></>}
          </fieldset>;
        })}
        <p><strong>{t('এই অধ্যায়ের জানা কাজ', 'Known workload for this chapter')}: {formatDurationBn(chapterWorkEstimate(draft, chapterId).minutes)}</strong> · {bn(chapterWorkEstimate(draft, chapterId).unknown.length)} {t('ধাপের সময় অজানা', 'steps have unknown duration')}</p>
      </div>}
      {step === 3 && <div className="personal-preview">
        <h2>{t('তোমার সময়ের সঙ্গে মিলিয়ে দেখো', 'Review against your own time')}</h2>
        <p><strong>{scope === 'ALL' ? t('লক্ষ্য: সব অধ্যায়', 'Goal: all chapters') : scope === 'S' ? t('লক্ষ্য: শুধু S', 'Goal: S only') : `${t('বর্তমান লক্ষ্য', 'Current goal')}: ${scope}`}</strong> · {bn(draft.chapterIds.length)} {scope === 'ALL' ? t('অধ্যায়।', 'chapters.') : t('অধ্যায়; বাকিগুলো সংরক্ষিত থাকবে, রুটিনে বাধ্যতামূলক নয়।', 'chapters; others remain in the library, not compulsory in the routine.')}</p>
        <p>{t('শুরু', 'Starts')} {formatDate(dates.startDate, 'long')}. {t('তারিখ বদলাতে Settings ব্যবহার করো; এটি কোনো সরকারি পরীক্ষা-তারিখ নয়।', 'Use Settings to change dates; these are not official exam dates.')}</p>
        <p>{t('দৈনিক সর্বোচ্চ নেট পড়া', 'Daily net study limit')}: {formatDurationBn(preview.routine?.dailyLimitMinutes || 0)} · {t('নির্দিষ্ট বিরতি/দায়িত্ব', 'Fixed breaks/obligations')}: {bn(preview.routine?.exclusions?.length || 0)}</p>
        <ul>{preview.routine?.windows.map((window, index) => <li key={index}>{weekdayName(window.weekday)} · {formatTime(window.startMinute)}–{formatTime(window.endMinute)}</li>)}</ul>
        {preview.projection?.issues.map((issue, index) => <p className="personal-warning" role="status" key={index}>{routineIssueText(issue)}</p>)}
        {preview.projection?.plan.filter(day => day.tasks.length).slice(0, 4).map(day => <div className="personal-preview-day" key={day.date}><strong>{formatDate(day.date, 'long')}</strong><ul>{[...new Set(day.tasks.flatMap(task => task.chapterIds))].map(id => <li key={id}>{chapterById[id].title} · {formatDurationBn(day.tasks.filter(task => task.chapterIds.includes(id)).reduce((sum, task) => sum + task.endMinute - task.startMinute, 0))}</li>)}</ul></div>)}
        {!preview.projection?.plan.some(day => day.tasks.length) && <p className="personal-warning">{scope} · {t('শুধু তোমার সময় ও নির্বাচিত অধ্যায় সেভ হবে, কোনো কাজ বসবে না। প্রতিটি অধ্যায়ের টিক থাকা সত্ত্বেও কিছুক্ষণ দেখা যাচ্ছে না—এটি বাগ, জানিও। নাহলে আগের ধাপে গিয়ে সময় মিলিয়ে দেখো।', 'Only your availability and selected chapters will be saved, with no work on any date. That should not happen when every chapter has a budget — if it does, please report it. Otherwise go back and re-check your availability.')}</p>}
      </div>}
      {(error || (step === 3 && preview.error)) && <p className="personal-warning" role="alert">{error || preview.error}</p>}
      <div className="personal-setup-actions">{step > 0 && <button type="button" className="button secondary" onClick={() => { setStep(current => current - 1); setError(''); setProbe(null); }}><ArrowLeft size={15} />{t('আগের ধাপ', 'Back')}</button>}{onCancel && <button type="button" className="button ghost" onClick={onCancel}>{t('বাতিল—কিছু বদলাবে না', 'Cancel—keep everything')}</button>}<button type="submit" className="button primary">{step < 3 ? <><ArrowRight size={15} />{t('পরের ধাপ', 'Next step')}</> : <><Save size={15} />{scope === 'ALL' ? t('সব অধ্যায়ের রুটিন সেভ করো', 'Save all-chapter routine') : scope === 'S' ? t('এই সময় ও S রুটিন সেভ করো', 'Save this availability & S routine') : t('এই ধাপের রুটিন সেভ করো', 'Save this phase routine')}</>}</button></div>
      {!data.personalRoutine && <p className="tiny-muted"><button className="text-button" type="button" onClick={() => navigate('settings')}>{t('আগের ব্যাকআপ থাকলে Settings থেকে ফিরিয়ে আনো', 'Have an existing backup? Restore it from Settings')}</button></p>}
    </form>
  </section>;
}
export function PersonalRoutineSettings() {
  const { data, routineSetupReady } = usePlanner(); const [editing, setEditing] = useState(false);
  if (routineSetupReady === false) return <section className="card personal-settings-summary" role="status">{t('আগের তথ্য লোড হওয়ার পর নিজের রুটিন সেট করা যাবে।', 'Availability setup will be available after your saved data loads.')}</section>;
  if (data.routineSetupRequired) return <PersonalRoutineSetup embedded />;
  return editing ? <PersonalRoutineSetup embedded onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
    : <section className="card personal-settings-summary"><div><span className="s-category-badge">{data.personalRoutine?.scope || 'S'}</span><h2>{t('আমার গুরুত্বপূর্ণ সিলেবাস ও পড়ার সময়', 'My important syllabus & availability')}</h2><p>{data.personalRoutine ? `${data.personalRoutine.scope} · ${t('শুধু নির্বাচিত অধ্যায় · একই দুই বইয়ের জোড়া অন্তত দুই পড়ার দিন · প্রকৃত ক্লাস-সময়।', 'Selected chapters only · the same two books for at least two study days · actual class durations.')}` : t('পুরোনো default রুটিন আছে। সব অধ্যায়ের নতুন রুটিন চাইলে আগে setup করো; পুরোনো তথ্য নিজে থেকে বদলাবে না।', 'This profile retains its legacy routine. Set up your own availability and all-chapter goal explicitly; existing data is not silently migrated.')}</p></div><button type="button" className="button primary" onClick={() => setEditing(true)}><Check size={15} />{!data.personalRoutine || data.personalRoutine.scope === 'S' ? t('সময়, S তালিকা ও ক্লাসের দৈর্ঘ্য ঠিক করো', 'Set availability, S list & class durations') : t('সময়, বর্তমান ধাপ ও ক্লাসের দৈর্ঘ্য ঠিক করো', 'Set availability, current phase & class durations')}</button></section>;
}
