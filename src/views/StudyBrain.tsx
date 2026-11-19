import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BrainCircuit, CalendarDays, Check, MessageCircle, Pause, Play, Send, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PageHeading } from '../components';
import { usePlanner } from '../context';
import { chapterById } from '../data';
import { bn, formatDate, formatTime } from '../planner';
import { personalBookLabel, weeklyWindows, WORK_STAGES } from '../personalRoutine';
import { BRAIN_LIMITS, brainCurrentPair, forgetStudyBrain, interpretBrainMessage, newStudyBrain, parseStudyBrain, saveBrainCheckIn, saveBrainFeedback, studyBrainSuggestion } from '../studyBrain';
import type { BrainSuggestion } from '../studyBrain';
import { brainStatusText } from '../studyBrainText';
import type { BrainCheckInDraft, BrainEnergy, BrainObstacle } from '../studyBrainTypes';
import { t } from '../i18n';

const energyLabel = (value: BrainEnergy) => value === 'low' ? t('ক্লান্ত / শক্তি কম', 'Tired / low energy') : value === 'fresh' ? t('বেশ চনমনে', 'Feeling fresh') : t('মোটামুটি', 'Doing okay');
const obstacleLabel = (value: BrainObstacle) => value === 'understanding' ? t('বুঝতে সমস্যা', 'Understanding') : value === 'remembering' ? t('মনে রাখতে সমস্যা', 'Remembering') : value === 'starting' ? t('শুরু করতে কষ্ট', 'Getting started') : t('নির্দিষ্ট বাধা নেই', 'No particular obstacle');
const difficultyLabel = (value: string) => value === 'hard' ? t('কঠিন লেগেছে', 'Felt hard') : value === 'easy' ? t('সহজ লেগেছে', 'Felt easy') : t('মোটামুটি হয়েছে', 'Felt okay');
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });

export default function StudyBrainView() {
  const { data, setData, routineSetupReady, storageOk, now, today, plan, navigate, confirm, notify } = usePlanner();
  const memory = data.studyBrain;
  const suggestion = useMemo(() => studyBrainSuggestion(data, plan, now), [data, plan, now]);
  const ready = routineSetupReady !== false;
  const forget = () => confirm({ title: t('শুধু ব্রেইনের স্মৃতি মুছবে?', 'Forget only the brain’s memory?'),
    message: t('ব্রেইনের পছন্দ, চেক-ইন ও কঠিন/সহজ ফিডব্যাক মুছবে, ব্রেইন বন্ধ হবে। পড়ার ইতিহাস, নোট, স্ক্যান, S তালিকা ও রুটিন অক্ষত থাকবে। পুরোনো ব্যাকআপে এই স্মৃতি থাকতে পারে; এটি encrypted vault নয়।', 'This removes brain preferences, check-ins and difficulty feedback, then turns the brain off. Study history, notes, scans, S selection and routine stay intact. Earlier backups may still contain this memory; it is not an encrypted vault.'),
    label: t('শুধু ব্রেইনের স্মৃতি মুছো', 'Forget brain memory only'), danger: true,
    action: () => { setData(current => forgetStudyBrain(current)); notify(t('ব্রেইনের স্মৃতি সরানো হয়েছে; পড়ার তথ্য রাখা আছে।', 'Brain memory removed; study data kept.')); } });
  return <div className="view brain-view">
    <PageHeading eyebrow="LOCAL STUDY BRAIN" title="একটু বলো, পরের কাজটা সহজ করি।" titleEn="A little context. A better next step."
      description="তোমার সময়, ক্লান্তি, ছোট ফিডব্যাক আর সংরক্ষিত পড়ার রেকর্ড মিলিয়ে পরামর্শ। তোমার হয়ে সিদ্ধান্ত নেওয়া নয়।"
      descriptionEn="Suggestions from your availability, energy, quick feedback and saved study records. You stay in charge."
      action={<span className="brain-local-badge"><ShieldCheck size={16} aria-hidden="true" />{t('ডিভাইসেই · নিয়মভিত্তিক', 'ON-DEVICE · RULE-BASED')}</span>} />
    <div className="brain-boundary"><BrainCircuit size={21} aria-hidden="true" /><p>{t('এটি সাধারণ AI চ্যাট নয়; অল্প কিছু বাংলা, Banglish ও English পড়াশোনার কথা বোঝে। কোনো সার্ভারে তোমার লেখা/তথ্য পাঠায় না, নোট বা স্ক্যান পড়ে না। ভিডিওর দৈর্ঘ্য বা পরীক্ষার নিশ্চয়তা বানায় না।', 'Not a general AI chatbot: it recognises a small set of Bengali, Banglish and English study requests. This feature sends no text or profile data to a server and does not read notes or scans. It cannot invent video durations or guarantee exam results.')}</p></div>
    {!ready ? <section className="card brain-panel" role="status"><p>{t('আগের ডিভাইসের তথ্য লোড হওয়া পর্যন্ত ব্রেইন বদলানো বন্ধ আছে।', 'Brain changes are paused until saved device data has loaded.')}</p></section> : <>
      {!memory?.enabled ? <section className="card brain-panel brain-welcome">
        <span className="brain-mark" aria-hidden="true"><BrainCircuit size={32} /></span>
        <h2>{memory ? t('ব্রেইন বিরতিতে আছে।', 'Your brain is paused.') : t('অল্প অল্প করে তোমার পড়ার ধরন শিখুক।', 'Let it learn your study preferences, a little at a time.')}</h2>
        <p>{memory ? t('স্মৃতি রাখা আছে, কিন্তু পরামর্শে ব্যবহার হচ্ছে না। আবার চালু করলে ব্যবহার হবে।', 'Memory is retained but is not being used for suggestions. Resume to use it again.') : t('চালু করলে তোমার নিশ্চিত করা চেক-ইন ও কঠিন/সহজ ফিডব্যাক এই প্রোফাইলে থাকবে। রুটিন বদলাবে না; এক ক্লিকে ব্রেইনের স্মৃতি মুছতে পারবে।', 'Enabling keeps only the check-ins and difficulty feedback you confirm in this profile. Your schedule does not change; brain memory can be forgotten separately.')}</p>
        <ul><li>{t('আগে S, একই দুই অধ্যায়ের জোড়া—এটা মনে রাখবে।', 'S first, with the same chapter pair intact.')}</li><li>{t('কম সময়/ক্লান্তি হলে ছোট ফোকাস সাজেস্ট করবে; বাকি কাজ মুছবে না।', 'Less time or low energy means a smaller focus, not deleted work.')}</li><li>{t('কেন পরামর্শ দিচ্ছে দেখাবে; অল্প তথ্য হলে সেটাও বলবে।', 'Every suggestion explains itself, including when evidence is thin.')}</li></ul>
        <div className="brain-actions"><button type="button" className="button primary" disabled={!storageOk} onClick={() => setData(current => ({ ...current, studyBrain: current.studyBrain ? { ...current.studyBrain, enabled: true } : newStudyBrain() }))}><Play size={16} aria-hidden="true" />{memory ? t('ব্রেইন আবার চালু করো', 'Resume Study Brain') : t('লোকাল ব্রেইন চালু করো', 'Enable local Study Brain')}</button>{memory && <button type="button" className="button danger-outline" disabled={!storageOk} onClick={forget}><Trash2 size={16} aria-hidden="true" />{t('ব্রেইনের স্মৃতি মুছো', 'Forget brain memory')}</button>}</div>
        <small>{t('এই স্মৃতি JSON/Full backup-এও যাবে। PWA ও APK-র স্টোরেজ আলাদা; এটি encrypted বা cloud sync নয়।', 'This memory is included in JSON/full backups. PWA and APK storage are separate; this is not encryption or cloud sync.')}</small>
      </section> : <>
        {!storageOk && <p className="brain-notice" role="alert">{t('স্টোরেজে সেভ হচ্ছে না। নতুন স্মৃতি সেভ করা বন্ধ; আগে ব্যাকআপ/স্টোরেজ ঠিক করো।', 'Storage is not saving. New memory changes are disabled; review backup/storage first.')}</p>}
        <div className="brain-layout">
          <div className="brain-main">
            <BrainCheckInForm key={today} pair={brainCurrentPair(data, plan)} />
            <BrainRecommendation suggestion={suggestion} />
          </div>
          <aside className="card brain-panel brain-memory" id="brain-memory" aria-label={t('ব্রেইন কী মনে রেখেছে', 'What the brain remembers')}>
            <h2><ShieldCheck size={19} aria-hidden="true" />{t('তোমার হাতে স্মৃতি', 'Memory you control')}</h2>
            <dl className="brain-facts"><div><dt>{t('তোমার লক্ষ্য (প্ল্যান থেকে)', 'Goal (from your plan)')}</dt><dd>{data.personalRoutine ? t('শুধু নির্বাচিত S আগে; অন্য অধ্যায় চাপানো নয়।', 'Your selected S first; no extra chapters.') : t('আগের রুটিন—নিজে বদলানো পর্যন্ত অক্ষত।', 'Legacy routine, until you explicitly change it.')}</dd></div><div><dt>{t('আজকের দেওয়া সময়', 'Today’s saved availability')}</dt><dd>{data.personalRoutine ? weeklyWindows(data.personalRoutine, today).map(window => `${formatTime(window.startMinute)}–${formatTime(window.endMinute)}`).join(' · ') || t('এই বারে কোনো উইন্ডো নেই', 'No window on this weekday') : t('Settings-এ আছে; ব্রেইন বদলায়নি।', 'Kept in Settings; not changed by the brain.')}</dd></div></dl>
            <BrainFocusPreference />
            <h3>{t('যতটুকু তথ্য আছে', 'What the evidence can say')}</h3>
            <p>{suggestion.pattern.enough ? t(`গত ১৪ দিনে S-এ ${bn(suggestion.pattern.sessions)}টি সেভ করা সেশন, ${bn(suggestion.pattern.days)} দিনে। মাঝামাঝি সেশনের দৈর্ঘ্য ${bn(suggestion.pattern.median!)} মিনিট; ছোট ফোকাসে এটি একটি সীমা। শেখা বা ভিডিও শেষের প্রমাণ নয়।`, `${suggestion.pattern.sessions} saved S sessions across ${suggestion.pattern.days} days in the last 14 days. Median length ${suggestion.pattern.median} minutes is one limit on a smaller focus, not proof of learning or video completion.`) : t('পড়ার ধরন ধরার মতো তথ্য এখনো কম। অন্তত ২ দিনে ৩টি সেভ করা S সেশন না পাওয়া পর্যন্ত অনুমানভিত্তিক pace ধরব না।', 'Not enough data for a study-length pattern yet. At least 3 saved S sessions across 2 days are needed; no guessed pace.')}</p>
            <details><summary>{t('সাম্প্রতিক নিশ্চিত স্মৃতি', 'Recent confirmed memory')} ({bn(memory.checkIns.length)} / {bn(memory.feedback.length)})</summary>
              <p>{t('সর্বশেষ ৭টি করে দেখানো হচ্ছে। সর্বোচ্চ ৬০ দিনের চেক-ইন ও ১৮০টি দিন/অধ্যায়ের ফিডব্যাক থাকে; পুরোনোগুলো বাদ পড়ে। সম্পূর্ণ সংরক্ষিত অংশ ব্যাকআপে পাওয়া যায়।', 'Showing the latest 7 of each. At most 60 daily check-ins and 180 day/chapter feedback entries are kept; oldest entries expire. Backups contain the full retained memory.')}</p>
              {!memory.checkIns.length && !memory.feedback.length && <p>{t('এখনো কোনো চেক-ইন বা ফিডব্যাক রাখোনি।', 'No confirmed check-ins or feedback yet.')}</p>}
              <ul className="brain-memory-list">{memory.checkIns.slice(-7).reverse().map(item => <li key={item.date}><strong>{formatDate(item.date)}</strong><span>{energyLabel(item.energy)} · {item.availableMinutes === null ? t('সময় বলা হয়নি', 'time not specified') : `${bn(item.availableMinutes)} ${t('মিনিট', 'min')}`} · {obstacleLabel(item.obstacle)}</span>{item.chapterId && <small>{chapterById[item.chapterId].title}</small>}</li>)}{memory.feedback.slice(-7).reverse().map(item => <li key={`${item.date}:${item.chapterId}`}><strong>{chapterById[item.chapterId].title}</strong><span>{formatDate(item.date)} · {difficultyLabel(item.difficulty)}</span></li>)}</ul>
            </details>
            <p className="brain-privacy">{t('চ্যাটের লেখা রাখা হয় না। শুধু নিশ্চিত করা বাছাই থাকে। মূল পড়ার লগ থেকে pattern দেখা হয়; ব্রেইনের স্মৃতি মুছলেও মূল লগ মুছে যায় না।', 'Chat text is not retained. Only confirmed choices are stored. Patterns use original study logs; forgetting brain memory does not delete those logs.')}</p>
            <div className="brain-actions"><button type="button" className="button secondary" disabled={!storageOk} onClick={() => setData(current => current.studyBrain ? { ...current, studyBrain: { ...current.studyBrain, enabled: false } } : current)}><Pause size={15} aria-hidden="true" />{t('স্মৃতি রেখে বিরতি', 'Pause, keep memory')}</button><button type="button" className="button danger-outline" disabled={!storageOk} onClick={forget}><Trash2 size={15} aria-hidden="true" />{t('ব্রেইনের স্মৃতি মুছো', 'Forget brain memory')}</button></div>
            <button type="button" className="text-button" onClick={() => navigate('settings')}>{t('রুটিন / ব্যাকআপ নিজে নিয়ন্ত্রণ করো', 'Manage routine / backups')}</button>
          </aside>
        </div>
      </>}
    </>}
  </div>;
}

function BrainCheckInForm({ pair }: { pair: string[] }) {
  const { data, setData, today, now, storageOk, notify } = usePlanner();
  const saved = data.studyBrain?.checkIns.find(item => item.date === today);
  const [energy, setEnergy] = useState<BrainEnergy>(saved?.energy || 'okay');
  const [minutes, setMinutes] = useState(saved?.availableMinutes === null || saved?.availableMinutes === undefined ? '' : String(saved.availableMinutes));
  const [obstacle, setObstacle] = useState<BrainObstacle>(saved?.obstacle || 'none');
  const [chapterId, setChapterId] = useState(saved?.chapterId && pair.includes(saved.chapterId) ? saved.chapterId : '');
  const [message, setMessage] = useState(''), [reply, setReply] = useState(''), [error, setError] = useState('');
  const interpret = (event: FormEvent) => {
    event.preventDefault();
    const result = interpretBrainMessage(message, pair);
    setError('');
    if (result.kind === 'draft') {
      if (result.patch.energy) setEnergy(result.patch.energy);
      if (result.patch.availableMinutes !== undefined) setMinutes(String(result.patch.availableMinutes));
      if (result.patch.obstacle) setObstacle(result.patch.obstacle);
      if (result.patch.chapterId) setChapterId(result.patch.chapterId);
      setReply(t('বুঝে নিচের খসড়া বাছাই করেছি—এখনো সেভ হয়নি। মিলিয়ে “চেক-ইন মনে রাখো” চাপো।', 'I drafted the fields below—nothing saved yet. Review them, then tap “Remember check-in”.') + (result.outsidePair ? t(' বলা বিষয়টি এখনকার জোড়ায় নেই; নতুন অধ্যায় যোগ করিনি।', ' That subject is outside the current pair; no new chapter was added.') : ''));
    } else if (result.kind === 'next') { setReply(t('নিচে একই জোড়ার পরের কাজ ও কারণ দেখো। কিছু বদলাইনি।', 'Your next step and its reasons are below. Nothing was changed.')); scrollTo('brain-next-step'); }
    else if (result.kind === 'memory') { setReply(t('“তোমার হাতে স্মৃতি” অংশে কী রাখা আছে দেখো। চ্যাটের লেখা সেভ হয় না।', 'See “Memory you control” for retained choices. Chat text is not saved.')); scrollTo('brain-memory'); }
    else if (result.kind === 'invalid-time') setReply(t('সময়টা স্পষ্ট হয়নি। ০–৭২০ মিনিটের একটি সময় বলো; যেমন “আজ ৩০ মিনিট সময় আছে”। কোনো পরিবর্তন হয়নি।', 'The time is unclear. Give one duration from 0–720 minutes, for example “I have 30 minutes”. Nothing changed.'));
    else if (result.kind === 'unsupported') setReply(t('এ লেখা দিয়ে কাজ সম্পন্ন, লগ বা তথ্য মোছা হয় না। নির্দিষ্ট কাজের নিজস্ব নিয়ন্ত্রণ ব্যবহার করো।', 'Text cannot mark work complete, log a session or delete data. Use the specific task’s own controls.'));
    else setReply(t('পুরোটা বুঝিনি। “aj 30 min time ache”, “ক্লান্ত”, “ki porbo” বা নিচের বাছাইগুলো চেষ্টা করো। অচেনা কথা থেকে কিছু আন্দাজ করিনি।', 'I did not understand all of that. Try “aj 30 min time ache”, “tired”, “what next”, or the choices below. I did not guess from an unknown request.'));
    setMessage('');
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const availableMinutes = minutes.trim() === '' ? null : Number(minutes);
    if (availableMinutes !== null && (!Number.isInteger(availableMinutes) || availableMinutes < 0 || availableMinutes > 720)) { setError(t('০–৭২০ পূর্ণ মিনিট দাও, অথবা খালি রাখো।', 'Enter 0–720 whole minutes, or leave it blank.')); return; }
    const draft: BrainCheckInDraft = { energy, availableMinutes, obstacle, ...(pair.includes(chapterId) ? { chapterId } : {}) };
    setData(current => saveBrainCheckIn(current, draft, today, now.toISOString()));
    setError(''); setReply(t('চেক-ইন আপডেট হয়েছে। শুধু ব্রেইনের পরামর্শ বদলেছে—রুটিন বা সম্পন্ন কাজ নয়।', 'Check-in updated. Only brain suggestions change—not your routine or completed work.'));
    notify(t('চেক-ইন আপডেট হয়েছে; রুটিন অক্ষত।', 'Check-in updated; routine untouched.'));
  };
  return <section className="card brain-panel brain-check-in" aria-label={t('আজকের ব্রেইন চেক-ইন', 'Daily brain check-in')}>
    <h2><MessageCircle size={20} aria-hidden="true" />{t('আজ তোমার কী অবস্থা?', 'How is today feeling?')}</h2><p>{formatDate(today, 'long')} · {t('সেভ না করা পর্যন্ত সবটাই খসড়া।', 'Everything is a draft until you save.')}</p>
    <form className="brain-message" onSubmit={interpret}>
      <label htmlFor="brain-message">{t('ছোট করে বলো (বাংলা / Banglish / English)', 'Say it briefly (Bengali / Banglish / English)')}</label>
      <div><input id="brain-message" value={message} maxLength={BRAIN_LIMITS.message} autoComplete="off" placeholder={t('aj 30 min ache, onek tired', 'I have 30 min, feeling tired')} onChange={event => setMessage(event.target.value)} /><button type="submit" className="button secondary" disabled={!message.trim()}><Send size={16} aria-hidden="true" />{t('বুঝে দেখো', 'Interpret')}</button></div>
    </form>
    {reply && <p className="brain-reply" role="status">{reply}</p>}
    <form className="brain-check-in-form" onSubmit={save} noValidate>
      <fieldset disabled={!storageOk}><legend>{t('মিলিয়ে নাও, তারপর মনে রাখতে বলো', 'Review, then choose what to remember')}</legend>
        <label>{t('শক্তি কেমন?', 'Energy today')}<select aria-label={t('শক্তি কেমন?', 'Energy today')} value={energy} onChange={event => setEnergy(event.target.value as BrainEnergy)}>{(['low', 'okay', 'fresh'] as const).map(value => <option value={value} key={value}>{energyLabel(value)}</option>)}</select></label>
        <label>{t('এইবার সময় আছে (মিনিট)', 'Time for this focus (minutes)')}<input aria-label={t('এইবার সময় আছে (মিনিট)', 'Time for this focus (minutes)')} aria-describedby="brain-focus-time-help" type="number" min="0" max="720" step="1" inputMode="numeric" value={minutes} onChange={event => setMinutes(event.target.value)} /><small id="brain-focus-time-help">{t('খালি = বলোনি · ০ = বিরতি। সাপ্তাহিক availability বাড়ায় না।', 'Blank = not specified · 0 = a break. Never expands weekly availability.')}</small></label>
        <label>{t('কোথায় বাধা?', 'What is getting in the way?')}<select aria-label={t('কোথায় বাধা?', 'What is getting in the way?')} value={obstacle} onChange={event => setObstacle(event.target.value as BrainObstacle)}>{(['none', 'understanding', 'remembering', 'starting'] as const).map(value => <option value={value} key={value}>{obstacleLabel(value)}</option>)}</select></label>
        <label>{t('এই জোড়ার কোনটিতে সাহায্য দরকার?', 'Which chapter in this pair needs attention?')}<select aria-label={t('এই জোড়ার কোনটিতে সাহায্য দরকার?', 'Which chapter in this pair needs attention?')} value={chapterId} onChange={event => setChapterId(event.target.value)}><option value="">{t('প্ল্যান ও তথ্য দেখে বলো', 'Use the plan and evidence')}</option>{pair.map(id => <option value={id} key={id}>{chapterById[id].title}</option>)}</select></label>
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="button primary" disabled={!storageOk}><Check size={16} aria-hidden="true" />{t('চেক-ইন মনে রাখো', 'Remember check-in')}</button>
      <small>{t('আজকের এনার্জি/সময় আজকেই প্রযোজ্য। কাল নতুন করে বলবে।', 'Today’s energy and offered time apply only today. Check in again tomorrow.')}</small>
    </form>
  </section>;
}

function BrainFocusPreference() {
  const { data, setData, storageOk } = usePlanner();
  const [value, setValue] = useState(String(data.studyBrain!.focusMinutes));
  const [error, setError] = useState('');
  return <form className="brain-focus-preference" noValidate onSubmit={event => {
    event.preventDefault(); const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 90) { setError(t('৫–৯০ পূর্ণ মিনিট দাও।', 'Enter 5–90 whole minutes.')); return; }
    setData(current => current.studyBrain ? { ...current, studyBrain: parseStudyBrain({ ...current.studyBrain, focusMinutes: minutes }) } : current); setError('');
  }}><label>{t('ছোট ফোকাসের পছন্দ (মিনিট)', 'Preferred small focus (minutes)')}<input type="number" min="5" max="90" step="1" inputMode="numeric" value={value} onChange={event => setValue(event.target.value)} disabled={!storageOk} /></label><button type="submit" className="button secondary" disabled={!storageOk}><SlidersHorizontal size={15} aria-hidden="true" />{t('পছন্দ মনে রাখো', 'Remember preference')}</button><small>{t(`এখন মনে আছে ${bn(data.studyBrain!.focusMinutes)} মিনিট। এটি পুরো ক্লাস বা দৈনিক পড়ার সময় নয়।`, `Currently ${data.studyBrain!.focusMinutes} minutes. This is not a full class duration or a daily study target.`)}</small>{error && <p className="field-error" role="alert">{error}</p>}</form>;
}

function BrainRecommendation({ suggestion }: { suggestion: BrainSuggestion }) {
  const { data, setData, plan, now, today, navigate, startPresetTimer, timer, storageOk, notify } = usePlanner();
  const copy = brainStatusText(suggestion.status), task = suggestion.task;
  const stage = WORK_STAGES.find(item => item.id === task?.personalWork?.stage);
  const feedback = data.studyBrain?.feedback.find(item => item.date === today && item.chapterId === suggestion.chapterId);
  const timerBusy = timer.running || timer.accumulatedMs > 0;
  const start = () => {
    const fresh = studyBrainSuggestion(data, plan, new Date());
    if (!fresh.canStart || !fresh.task || !startPresetTimer || timerBusy || !storageOk) { notify(t('সময় বা বর্তমান কাজ বদলেছে। পরামর্শটি আবার দেখো।', 'The time or current work changed. Review the suggestion again.'), 'info'); return; }
    startPresetTimer({ subject: fresh.task.subject, chapterId: fresh.chapterId, durationMin: fresh.focusMinutes, taskId: fresh.timerTaskId, label: `${t('ব্রেইন ফোকাস', 'Brain focus')} · ${fresh.task.title}`.slice(0, 120) });
  };
  return <section className="card brain-panel brain-recommendation" id="brain-next-step" aria-label={t('ব্রেইনের পরের কাজ', 'Brain next step')}>
    <span className="eyebrow">{t('পরামর্শ, নতুন রুটিন নয়', 'A SUGGESTION, NOT A NEW ROUTINE')}</span><h2>{copy.title}</h2><p>{copy.body}</p>
    {suggestion.pair.length > 0 && <p className="brain-pair"><strong>{t('একই জোড়া', 'Same pair')}:</strong> {suggestion.pair.map(id => chapterById[id].title).join(' + ')}</p>}
    {task && <div className="brain-next-source"><small>{personalBookLabel(task.chapterIds[0])} · {stage ? t(stage.bn, stage.en) : ''}</small><h3>{chapterById[task.chapterIds[0]].title}</h3><p>{t('আসল বরাদ্দ', 'Actual allocation')}: {formatDate(task.date)} · {formatTime(task.startMinute)}–{formatTime(task.endMinute)}</p>{suggestion.range && <p className="brain-focus-length"><strong>{bn(suggestion.focusMinutes)}</strong> {t('মিনিট ছোট ফোকাস', 'minute small focus')}<span>{t('উৎসের বাকি অংশের ভেতর থেকে; পুরো কাজ নয়।', 'Within an uncovered source segment, not the entire task.')}</span></p>}
      {suggestion.range && task.personalWork && <small>{WORK_STAGES.find(item => item.id === task.personalWork!.stage)?.media ? t(`ভিডিও উৎসের প্রায় ${bn(Math.floor(suggestion.range.from / task.sourceMinutes! * task.personalWork.rawMinutes))}–${bn(Math.ceil(suggestion.range.to / task.sourceMinutes! * task.personalWork.rawMinutes))} মিনিট। চলার গতি বদলালেও পূর্ণ ভিডিও ছোট হয় না।`, `Approximately source-video minute ${Math.floor(suggestion.range.from / task.sourceMinutes! * task.personalWork.rawMinutes)}–${Math.ceil(suggestion.range.to / task.sourceMinutes! * task.personalWork.rawMinutes)}. Playback speed does not shorten the full source.`) : t(`কাজের ${bn(suggestion.range.from)}–${bn(suggestion.range.to)} মিনিটের অসমাপ্ত অংশ।`, `Uncovered work minute ${suggestion.range.from}–${suggestion.range.to}.`)}</small>}
    </div>}
    {suggestion.range && <details className="brain-reasons" open><summary>{t('কেন এই পরামর্শ?', 'Why this suggestion?')}</summary><ul><li>{t(`তোমার পছন্দ সর্বোচ্চ ${bn(data.studyBrain!.focusMinutes)} মিনিট; উৎসের বাকি অংশ ও আসল স্লটের সীমা মানা হয়েছে।`, `Your preferred maximum is ${data.studyBrain!.focusMinutes} minutes, bounded by the uncovered source and actual slot.`)}</li>{suggestion.checkIn && <li>{t('আজ তোমার বলা অবস্থা', 'Your check-in today')}: {energyLabel(suggestion.checkIn.energy)}{suggestion.checkIn.availableMinutes !== null ? ` · ${bn(suggestion.checkIn.availableMinutes)} ${t('মিনিট সময়', 'minutes offered')}` : ''} · {obstacleLabel(suggestion.checkIn.obstacle)}</li>}{suggestion.evidence?.feedback && <li>{t('তোমার সাম্প্রতিক ফিডব্যাক', 'Your recent feedback')}: {difficultyLabel(suggestion.evidence.feedback.difficulty)} ({formatDate(suggestion.evidence.feedback.date)})</li>}{suggestion.evidence?.weakFlag && <li>{t('তুমি নিজে এই অধ্যায় দুর্বল চিহ্নিত করেছ।', 'You explicitly flagged this chapter as weak.')}</li>}{!!suggestion.evidence?.mistakes && <li>{t(`এই অধ্যায়ে ${bn(suggestion.evidence.mistakes)}টি অমীমাংসিত ভুলের রেকর্ড আছে।`, `${suggestion.evidence.mistakes} unresolved mistake records are tagged to this chapter.`)}</li>}{suggestion.evidence && suggestion.evidence.mcq.answers >= 5 && <li>{t('গত ১৪ দিনের এই অধ্যায়ের সেভ করা MCQ উত্তর', 'Saved MCQ answers tagged to this chapter in the last 14 days')}: {bn(suggestion.evidence.mcq.correct)}/{bn(suggestion.evidence.mcq.answers)} · {t('আসল পরীক্ষার সম্ভাবনার হিসাব নয়।', 'not an exam-probability estimate.')}</li>}{suggestion.pattern.enough && <li>{t('সাম্প্রতিক সেভ করা সেশনের মাঝামাঝি দৈর্ঘ্যও সীমা হিসেবে ব্যবহার হয়েছে; এটি তোমার সামর্থ্যের বিচার নয়।', 'Recent median logged session length is another limit—not a judgement of your ability.')}</li>}</ul></details>}
    {suggestion.range && suggestion.checkIn?.obstacle !== undefined && suggestion.checkIn.obstacle !== 'none' && <p className="brain-notice">{suggestion.checkIn.obstacle === 'understanding' ? t('এই ফোকাসের মধ্যেই: যেটুকু বুঝছ না সেখানে থামো, নিজের ভাষায় একটি ছোট ব্যাখ্যা লেখো। না বুঝলে কঠিন ফিডব্যাক দাও; ক্লাস ছোট করে সম্পন্ন ধরা হবে না।', 'Within this focus: pause at the unclear idea and write a short explanation in your own words. Mark it hard if it is still unclear; no shortened class is certified.') : suggestion.checkIn.obstacle === 'remembering' ? t('এই ফোকাসের মধ্যেই: একটু পড়ে বই/ভিডিও বন্ধ করে মূল কথাটা মনে করার চেষ্টা করো, তারপর মিলিয়ে নাও। এটি ঐচ্ছিক কৌশল, নতুন বাধ্যতামূলক কাজ নয়।', 'Within this focus: close the book/video briefly, recall the main idea, then check it. An optional strategy, not another required task.') : t('শুরুটাই লক্ষ্য: ছোট ফোকাসটি নাও, তারপর কেমন লাগল জানাও। বাকি কাজ অক্ষত থাকবে।', 'Just start small, then tell the brain how it felt. All remaining work stays intact.')}</p>}
    <div className="brain-actions">{suggestion.canStart && <button type="button" className="button primary" disabled={!startPresetTimer || timerBusy || !storageOk} onClick={start}><Play size={16} aria-hidden="true" />{t(`${bn(suggestion.focusMinutes)} মিনিট ফোকাস শুরু`, `Start ${suggestion.focusMinutes}-minute focus`)}</button>}{task && <button type="button" className="button secondary" onClick={() => navigate('calendar', task.date)}><CalendarDays size={16} aria-hidden="true" />{t('আসল সেশন দেখো', 'Review original session')}</button>}{['setup', 'legacy', 'duration', 'missing', 'capacity'].includes(suggestion.status) && <button type="button" className="button secondary" onClick={() => navigate('settings')}>{t('সময় / রুটিন নিজে মিলিয়ে নাও', 'Review availability / routine')}</button>}{timerBusy && <button type="button" className="button secondary" onClick={() => navigate('timer')}>{t('আগের টাইমার আগে দেখো', 'Review existing timer first')}</button>}</div>
    {suggestion.chapterId && <div className="brain-feedback"><h3>{t('এই অধ্যায়ের সাম্প্রতিক পড়া কেমন হলো?', 'How did recent work on this chapter feel?')}</h3><p>{t('ফিডব্যাক শুধু ছোট ফোকাস/পরামর্শে কাজে লাগে। সেশন লগ, সময় বা অধ্যায় সম্পন্ন করে না।', 'Feedback only informs suggestions and focus length. It never logs a session, time or chapter completion.')}</p><div className="brain-actions">{(['hard', 'okay', 'easy'] as const).map(difficulty => <button type="button" className={`button secondary ${feedback?.difficulty === difficulty ? 'selected' : ''}`} key={difficulty} aria-pressed={feedback?.difficulty === difficulty} disabled={!storageOk} onClick={() => setData(current => saveBrainFeedback(current, suggestion.chapterId!, difficulty, today, now.toISOString()))}>{difficultyLabel(difficulty)}</button>)}</div></div>}
  </section>;
}
