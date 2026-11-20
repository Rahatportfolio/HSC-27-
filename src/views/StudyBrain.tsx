import { brainChapterGuide, studyBrainPlaybook } from '../studyBrainPlaybook';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Bot, BrainCircuit, CalendarDays, Check, ChevronRight, Download, Loader2, MessageCircle, Pause, Play, RotateCcw, Send, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PageHeading } from '../components';
import { usePlanner } from '../context';
import { chapterById } from '../data';
import { bn, formatDate, formatTime } from '../planner';
import { brainConsistency, brainEnergyOutput, brainPaceProjection, brainPreflight, brainTimeOfDay } from '../brainInsights';
import { personalBookLabel, weeklyWindows, WORK_STAGES } from '../personalRoutine';
import { BRAIN_LIMITS, brainCurrentPair, brainFocusMethod, brainRevisionQueue, brainReportDirection, brainWeeklyReview, forgetStudyBrain, newStudyBrain, parseStudyBrain, saveBrainCheckIn, saveBrainFeedback, studyBrainSuggestion } from '../studyBrain';
import { interpretBrainMessage } from '../studyBrainIntents';
import { answerAiQuestion, checkQuizAnswer, loadQuizQuestion, quizMessage } from '../aiBrain';
import { aiErrorMessage, chatWithAi, loadAiModel, unloadAiModel, AI_MODEL_SIZE_MB } from '../aiModel';
import type { QuizQuestion } from '../types';
import type { BrainSuggestion } from '../studyBrain';
import { brainStatusText } from '../studyBrainText';
import type { BrainCheckInDraft, BrainEnergy, BrainObstacle } from '../studyBrainTypes';
import { t, weekdayName } from '../i18n';

const energyLabel = (value: BrainEnergy) => value === 'low' ? t('ক্লান্ত / শক্তি কম', 'Tired / low energy') : value === 'fresh' ? t('বেশ চনমনে', 'Feeling fresh') : t('মোটামুটি', 'Doing okay');
const obstacleLabel = (value: BrainObstacle) => value === 'understanding' ? t('বুঝতে সমস্যা', 'Understanding') : value === 'remembering' ? t('মনে রাখতে সমস্যা', 'Remembering') : value === 'starting' ? t('শুরু করতে কষ্ট', 'Getting started') : t('নির্দিষ্ট বাধা নেই', 'No particular obstacle');
const difficultyLabel = (value: string) => value === 'hard' ? t('কঠিন লেগেছে', 'Felt hard') : value === 'easy' ? t('সহজ লেগেছে', 'Felt easy') : t('মোটামুটি হয়েছে', 'Felt okay');
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });

export default function StudyBrainView() {
  const { data, setData, routineSetupReady, storageOk, now, today, plan, navigate, confirm, notify } = usePlanner();
  const memory = data.studyBrain;
  const suggestion = useMemo(() => studyBrainSuggestion(data, plan, now), [data, plan, now]);
  const ready = routineSetupReady !== false;
  const revision = useMemo(() => ready && data.personalRoutine && !data.routineSetupRequired ? brainRevisionQueue(data, suggestion.pair, now) : [], [ready, data, suggestion.pair, now]);
  const forget = () => confirm({ title: t('শুধু ব্রেইনের স্মৃতি মুছবে?', 'Forget only the brain’s memory?'),
    message: t('ব্রেইনের পছন্দ, চেক-ইন ও কঠিন/সহজ ফিডব্যাক মুছবে, ব্রেইন বন্ধ হবে। পড়ার ইতিহাস, নোট, স্ক্যান, S তালিকা ও রুটিন অক্ষত থাকবে। পুরোনো ব্যাকআপে এই স্মৃতি থাকতে পারে; এটি encrypted vault নয়।', 'This removes brain preferences, check-ins and difficulty feedback, then turns the brain off. Study history, notes, scans, S selection and routine stay intact. Earlier backups may still contain this memory; it is not an encrypted vault.'),
    label: t('শুধু ব্রেইনের স্মৃতি মুছো', 'Forget brain memory only'), danger: true,
    action: () => { setData(current => forgetStudyBrain(current)); notify(t('ব্রেইনের স্মৃতি সরানো হয়েছে; পড়ার তথ্য রাখা আছে।', 'Brain memory removed; study data kept.')); } });
  return <div className="view brain-view">
    <PageHeading eyebrow="LOCAL STUDY BRAIN" title="একটু বলো, পরের কাজটা সহজ করি।" titleEn="A little context. A better next step."
      description="তোমার সময়, ক্লান্তি, ছোট ফিডব্যাক আর সংরক্ষিত পড়ার রেকর্ড মিলিয়ে পরামর্শ। তোমার হয়ে সিদ্ধান্ত নেওয়া নয়।"
      descriptionEn="Suggestions from your availability, energy, quick feedback and saved study records. You stay in charge."
      action={<span className="brain-local-badge"><ShieldCheck size={16} aria-hidden="true" />{t('ডিভাইসেই · AI', 'ON-DEVICE · AI')}</span>} />
    <div className="brain-boundary"><BrainCircuit size={21} aria-hidden="true" /><p>{t('স্মার্ট ব্রেইন অল্প কিছু বাংলা, Banglish ও English পড়াশোনার কথা বোঝে। চাইলে ~১৪০ MB AI মডেল ডাউনলোড করে খোলামেলা প্রশ্নও করতে পারো — মডেল ডিভাইসেই চলে, কোনো সার্ভারে তোমার লেখা/তথ্য পাঠায় না, নোট বা স্ক্যান পড়ে না। AI-এর উত্তর ভুল হতে পারে; ভিডিওর দৈর্ঘ্য বা পরীক্ষার নিশ্চয়তা যাচাই করো।', 'The smart brain recognises a small set of Bengali, Banglish and English study requests. Optionally download the ~140 MB AI model for open-ended questions — it runs on this device, sends no text or profile data to a server, and does not read notes or scans. AI answers can be wrong; verify claims about video durations or exam results.')}</p></div>
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
            <BrainCheckInForm key={today} pair={brainCurrentPair(data, plan)} reportAvailable={!!data.personalRoutine && !data.routineSetupRequired} />
            <AiAssistant />
            <BrainRecommendation suggestion={suggestion} />
            <BrainWeeklyReview />
            <BrainInsights />
            {suggestion.pair.length > 0 && data.personalRoutine && !data.routineSetupRequired && <BrainChapterGuides pair={suggestion.pair} />}
            <BrainPreflight />
            {revision.length > 0 && <section className="card brain-panel" aria-labelledby="brain-revision-title">
              <h2 id="brain-revision-title">{t('ঝালাইয়ের তালিকা', 'Revision queue')}</h2>
              <p>{t('বর্তমান জোড়ার রেকর্ড। বেশি অমীমাংসিত ভুল আগে, তারপর সাম্প্রতিক MCQ-তে ভুল। এটি নতুন রুটিন নয়।', 'Current pair only. Unresolved mistakes first, then recent MCQ misses. This does not add anything to your schedule.')}</p>
              <BrainReport rows={revision} resting={suggestion.status === 'rest'} />
              <ul className="brain-memory-list">{revision.map(row => <li key={row.chapterId}>
                <strong>{chapterById[row.chapterId].title}</strong>
                {row.oldestOpen && <span>{t(`${bn(row.open)}টি অমীমাংসিত ভুল · সবচেয়ে পুরোনো ${formatDate(row.oldestOpen)}`, `${row.open} unresolved mistakes · oldest ${formatDate(row.oldestOpen)}`)}</span>}
                <span>{row.sampled ? t(`গত ১৪ দিনে ${bn(row.sampled)}টি আলাদা MCQ-এর সর্বশেষ উত্তরে ${bn(row.misses)}টি ভুল।`, `Last 14 days: ${row.misses} misses across the latest answers to ${row.sampled} distinct MCQs.`) : t('গত ১৪ দিনে এই অধ্যায়ের সংযুক্ত MCQ উত্তর নেই।', 'No mapped MCQ answers for this chapter in the last 14 days.')}</span>
                <small>{row.comparison.matched ? t(
                  `আগের ৭ দিনের সঙ্গে শেষ ৭ দিন: একই ${bn(row.comparison.matched)}টি MCQ-তে ${bn(row.comparison.corrected)}টি ভুল থেকে ঠিক, ${bn(row.comparison.stillMistaken)}টি দুইবারই ভুল, ${bn(row.comparison.slipped)}টি ঠিক থেকে ভুল।`,
                  `Previous 7 days vs. latest 7 days: of ${row.comparison.matched} matched MCQs, ${row.comparison.corrected} went from wrong to right, ${row.comparison.stillMistaken} were wrong in both weeks, and ${row.comparison.slipped} went from right to wrong.`
                ) : t('দুই সপ্তাহে একই প্রশ্নের উত্তর না থাকায় তুলনা করা যাচ্ছে না।', 'No matching questions across the two weeks to compare.')}</small>
                {row.comparison.stillMistaken > 0 && <small>{t('ঝালাইয়ে আগে বারবার ভুল হওয়া প্রশ্নগুলোর সমাধান না দেখে চেষ্টা করো।', 'When you revise, try the recurring misses first without looking at the answer.')}</small>}
                {!row.open && !row.misses && <small>{t('ভুলের সংকেত নেই; শেখা শেষের প্রমাণ নয়।', 'No recorded miss to prioritise; not proof of mastery.')}</small>}
              </li>)}</ul>
            </section>}
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

function BrainCheckInForm({ pair, reportAvailable }: { pair: string[]; reportAvailable: boolean }) {
  const { data, setData, today, now, storageOk, notify, plan: brainPlan } = usePlanner();
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
    else if (result.kind === 'report') {
      setReply(reportAvailable ? t('নিচে সাপ্তাহিক রিপোর্ট ও ঝালাইয়ের নির্দেশনা দেখো। কিছু বদলাইনি।', 'See your weekly report and any available revision guidance below. Nothing was changed.') : t('রিপোর্টের আগে ব্যক্তিগত রুটিন সেটআপ শেষ করো।', 'Finish personal routine setup before opening the report.'));
      if (reportAvailable) scrollTo('brain-weekly-title');
    }
    else if (result.kind === 'pace') {
      const pace = reportAvailable ? brainPaceProjection(data, brainPlan, now) : null;
      setReply(pace?.enough && pace.projectedFinish
        ? t(`গত ২৮ পূর্ণ দিনের গতি ≈${bn(pace.minutesPerDay!)} মিনিট/দিন। এই গতিতে বাকি ≈${bn(pace.neededAfterToday)} মিনিট কাজ শেষ হতে পারে ≈${formatDate(pace.projectedFinish)} (${bn(pace.projectedDays!)} দিনে)। এটি রেকর্ড থেকে আনুমানিক; পরীক্ষার গ্যারান্টি নয়। রুটিন বদলাইনি।`, `At your recent pace (about ${pace.minutesPerDay} minutes per full day over 28 days), the remaining about ${pace.neededAfterToday} minutes could finish around ${formatDate(pace.projectedFinish)} (in ${pace.projectedDays} days). An estimate from saved records, not a guarantee; your routine is unchanged.`)
        : t('এখনো pace ধরার মতো তথ্য কম (অন্তত ≈৫ মিনিট/দিন গড় দরকার)। পরের সেশনগুলো সেভ হতে থাকুক; কিছু বদলাইনি।', 'Not enough saved data for a pace estimate yet (needs at least about 5 minutes per full day). Keep logging sessions; nothing changed.'));
      if (reportAvailable) scrollTo('brain-insights');
    }
    else if (result.kind === 'preflight') {
      const rows = reportAvailable ? brainPreflight(data, brainPlan, now) : [];
      setReply(rows.length
        ? t(`${bn(rows.length)}টি অগ্রাধিকার সাজিয়েছি—নিচে “আগে এগুলো ঠিক করো” অংশে দেখো। নতুন কোনো কাজ বা রুটিন যোগ করিনি।`, `I arranged ${rows.length} priorit${rows.length === 1 ? 'y' : 'ies'}—see “Fix these first” below. No new work or routine was added.`)
        : t('অমীমাংসিত ভুল বা বকেয়া ঝালাইয়ের রেকর্ড নেই। নতুন কিছু চাপাইনি; বর্তমান বরাদ্দ ধরে এগোও।', 'No unresolved-mistake or overdue-revision records. Nothing new was queued; keep the current allocation.'));
      scrollTo('brain-preflight');
    }
    else if (result.kind === 'consistency') {
      const streak = brainConsistency(data, now);
      setReply(t(`গত ২৮ দিনের মধ্যে ${bn(streak.activeDays)} দিনে মোট ≈${bn(streak.minutes)} মিনিট পড়েছ${streak.bestWeekday !== null ? `; সবচেয়ে ভালো ${weekdayName(streak.bestWeekday)}` : ''}। বর্তমান ধারা ${bn(streak.currentStreak)} দিন। পূর্ণ ছবি “২৮ দিনের পূর্ণ ছবি”-তে দেখো।`, `In the last 28 days you logged about ${streak.minutes} minutes across ${streak.activeDays} days${streak.bestWeekday !== null ? `; best on ${weekdayName(streak.bestWeekday)}` : ''}; current streak ${streak.currentStreak} days. See the full picture in “The full 28-day picture”.`));
      scrollTo('brain-insights');
    }
    else if (result.kind === 'memory') { setReply(t('“তোমার হাতে স্মৃতি” অংশে কী রাখা আছে দেখো। চ্যাটের লেখা সেভ হয় না।', 'See “Memory you control” for retained choices. Chat text is not saved.')); scrollTo('brain-memory'); }
    else if (result.kind === 'invalid-time') setReply(t('সময়টা স্পষ্ট হয়নি। ০–৭২০ মিনিটের একটি সময় বলো; যেমন “আজ ৩০ মিনিট সময় আছে”। কোনো পরিবর্তন হয়নি।', 'The time is unclear. Give one duration from 0–720 minutes, for example “I have 30 minutes”. Nothing changed.'));
    else if (result.kind === 'unsupported') setReply(t('এ লেখা দিয়ে কাজ সম্পন্ন, লগ বা তথ্য মোছা হয় না। নির্দিষ্ট কাজের নিজস্ব নিয়ন্ত্রণ ব্যবহার করো।', 'Text cannot mark work complete, log a session or delete data. Use the specific task’s own controls.'));
    else setReply(t('পুরোটা বুঝিনি। “aj 30 min time ache”, “ক্লান্ত”, “ki porbo”, “pace”, “ki age thik korbo” বা “streak” চেষ্টা করো। অচেনা কথা থেকে কিছু আন্দাজ করিনি।', 'I did not understand all of that. Try “aj 30 min time ache”, “tired”, “what next”, “pace”, “what should I fix first”, or “streak”. I did not guess from an unknown request.'));
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
      <div><input id="brain-message" value={message} maxLength={BRAIN_LIMITS.message} autoComplete="off" placeholder={t('aj 30 min ache, onek tired / pace / ki age thik korbo', 'I have 30 min, tired / pace / what should I fix first')} onChange={event => setMessage(event.target.value)} /><button type="submit" className="button secondary" disabled={!message.trim()}><Send size={16} aria-hidden="true" />{t('বুঝে দেখো', 'Interpret')}</button></div>
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
    {suggestion.range && <details className="brain-reasons" open><summary>{t('কেন এই পরামর্শ?', 'Why this suggestion?')}</summary><ul>{suggestion.liveSlotPreferred && <li>{t('একই দিনের এই স্লট এখন চলছে। অন্য অধ্যায়ের স্লট পরে; রুটিন বদলায়নি।', 'This slot is open now. The other chapter is scheduled later on the same day; your routine is unchanged.')}</li>}<li>{t(`তোমার পছন্দ সর্বোচ্চ ${bn(data.studyBrain!.focusMinutes)} মিনিট; উৎসের বাকি অংশ ও আসল স্লটের সীমা মানা হয়েছে।`, `Your preferred maximum is ${data.studyBrain!.focusMinutes} minutes, bounded by the uncovered source and actual slot.`)}</li>{suggestion.checkIn && <li>{t('আজ তোমার বলা অবস্থা', 'Your check-in today')}: {energyLabel(suggestion.checkIn.energy)}{suggestion.checkIn.availableMinutes !== null ? ` · ${bn(suggestion.checkIn.availableMinutes)} ${t('মিনিট সময়', 'minutes offered')}` : ''} · {obstacleLabel(suggestion.checkIn.obstacle)}</li>}{suggestion.evidence?.feedback && <li>{t('তোমার সাম্প্রতিক ফিডব্যাক', 'Your recent feedback')}: {difficultyLabel(suggestion.evidence.feedback.difficulty)} ({formatDate(suggestion.evidence.feedback.date)})</li>}{suggestion.evidence?.weakFlag && <li>{t('তুমি নিজে এই অধ্যায় দুর্বল চিহ্নিত করেছ।', 'You explicitly flagged this chapter as weak.')}</li>}{!!suggestion.evidence?.mistakes && <li>{t(`এই অধ্যায়ে ${bn(suggestion.evidence.mistakes)}টি অমীমাংসিত ভুলের রেকর্ড আছে।`, `${suggestion.evidence.mistakes} unresolved mistake records are tagged to this chapter.`)}</li>}{suggestion.evidence && suggestion.evidence.mcq.answers >= 5 && <li>{t('গত ১৪ দিনের এই অধ্যায়ের সেভ করা MCQ উত্তর', 'Saved MCQ answers tagged to this chapter in the last 14 days')}: {bn(suggestion.evidence.mcq.correct)}/{bn(suggestion.evidence.mcq.answers)} · {t('আসল পরীক্ষার সম্ভাবনার হিসাব নয়।', 'not an exam-probability estimate.')}</li>}{suggestion.pattern.enough && <li>{t('সাম্প্রতিক সেভ করা সেশনের মাঝামাঝি দৈর্ঘ্যও সীমা হিসেবে ব্যবহার হয়েছে; এটি তোমার সামর্থ্যের বিচার নয়।', 'Recent median logged session length is another limit—not a judgement of your ability.')}</li>}</ul></details>}
    <BrainCoach suggestion={suggestion} />
    <div className="brain-actions">{suggestion.canStart && <button type="button" className="button primary" disabled={!startPresetTimer || timerBusy || !storageOk} onClick={start}><Play size={16} aria-hidden="true" />{t(`${bn(suggestion.focusMinutes)} মিনিট ফোকাস শুরু`, `Start ${suggestion.focusMinutes}-minute focus`)}</button>}{task && <button type="button" className="button secondary" onClick={() => navigate('calendar', task.date)}><CalendarDays size={16} aria-hidden="true" />{t('আসল সেশন দেখো', 'Review original session')}</button>}{['setup', 'legacy', 'duration', 'missing', 'capacity'].includes(suggestion.status) && <button type="button" className="button secondary" onClick={() => navigate('settings')}>{t('সময় / রুটিন নিজে মিলিয়ে নাও', 'Review availability / routine')}</button>}{timerBusy && <button type="button" className="button secondary" onClick={() => navigate('timer')}>{t('আগের টাইমার আগে দেখো', 'Review existing timer first')}</button>}</div>
    {suggestion.chapterId && <div className="brain-feedback"><h3>{t('এই অধ্যায়ের সাম্প্রতিক পড়া কেমন হলো?', 'How did recent work on this chapter feel?')}</h3><p>{t('ফিডব্যাক শুধু ছোট ফোকাস/পরামর্শে কাজে লাগে। সেশন লগ, সময় বা অধ্যায় সম্পন্ন করে না।', 'Feedback only informs suggestions and focus length. It never logs a session, time or chapter completion.')}</p><div className="brain-actions">{(['hard', 'okay', 'easy'] as const).map(difficulty => <button type="button" className={`button secondary ${feedback?.difficulty === difficulty ? 'selected' : ''}`} key={difficulty} aria-pressed={feedback?.difficulty === difficulty} disabled={!storageOk} onClick={() => setData(current => saveBrainFeedback(current, suggestion.chapterId!, difficulty, today, now.toISOString()))}>{difficultyLabel(difficulty)}</button>)}</div></div>}
  </section>;
}

function BrainCoach({ suggestion }: { suggestion: BrainSuggestion }) {
  const method = brainFocusMethod(suggestion);
  if (!method) return null;
  const steps = {
    start: t('বরাদ্দ অংশের প্রথম উদাহরণ বা প্রশ্ন দিয়ে শুরু করো। আজ পুরো অংশ শেষ করার চাপ নেই।', 'Start with the first example or question in the allocated segment. No pressure to finish the whole segment now.'),
    explain: t('অস্পষ্ট ধারণায় থামো। নিজের ভাষায় এক বাক্যে বোঝাও, তারপর উৎসের সঙ্গে মিলিয়ে নাও।', 'Pause at the unclear idea. Explain it in one sentence in your own words, then check it against the source.'),
    recall: t('একটু পড়ে উৎস বন্ধ করো। মূল ধারণাটি মনে করে বলো, তারপর মিলিয়ে নাও।', 'After a short stretch, close the source, recall the main idea, then check it.'),
    retry: t('এই অংশের সঙ্গে মেলে এমন পুরোনো ভুল থাকলে উত্তর না দেখে আবার চেষ্টা করো। না মিললে বর্তমান অংশেই থাকো।', 'If an old mistake matches this segment, retry it without looking at the answer. Otherwise stick with the current segment.'),
    continue: t('বরাদ্দ অংশে এগিয়ে যাও। থামার আগে কী শিখলে এক বাক্যে মনে করো।', 'Work through the allocated segment. Before stopping, recall one thing you learned in a sentence.'),
  };
  const stage = suggestion.task?.personalWork?.stage;
  const play = stage && method !== 'start' ? studyBrainPlaybook[stage] : undefined;
  return <div className="brain-notice"><h3>{t('এই ফোকাসে কী করবে', 'How to use this focus')}</h3><p>{steps[method]}</p>{suggestion.evidence?.feedback?.difficulty === 'hard' && suggestion.evidence.recentHardDays >= 2 && <p>{t(`গত ১৪ দিনে ${bn(suggestion.evidence.recentHardDays)} দিন এই অধ্যায় কঠিন বলেছ। তাই ফোকাস সর্বোচ্চ ১০ মিনিট; এটি সামর্থ্যের বিচার নয়।`, `You reported difficulty in this chapter on ${suggestion.evidence.recentHardDays} days in the last 14 days. That caps this focus at 10 minutes; it is not a judgement of ability.`)}</p>}{play && <p><strong>{t('এই কাজের কৌশল', 'Strategy for this task')}:</strong> {t(...play)}</p>}<small>{t('সময় কমে গেলে শুধু প্রথম ধাপটি করো। এটি বরাদ্দ সময়ের ভেতরের ঐচ্ছিক কৌশল, বাড়তি কাজ নয়।', 'If time runs short, do just the first step. This is an optional strategy inside the focus, not extra work.')}</small></div>;
}

function BrainReport({ rows, resting }: { rows: ReturnType<typeof brainRevisionQueue>; resting: boolean }) {
  const direction = brainReportDirection(rows);
  const title = direction.chapterId ? chapterById[direction.chapterId].title : '';
  const advice = {
    recurring: [t(`${title}-এ বারবার ভুল হওয়া পুরোনো প্রশ্নটি পরের ঝালাইয়ে উত্তর না দেখে চেষ্টা করো।`, `At your next review of ${title}, retry a recurring miss without looking at the answer.`), t('শুধু সমাধান পড়ে পরের প্রশ্নে যেও না।', 'Do not just reread the solution and move on.'), t('কোন ধাপে আটকে গেলে তা বলো, তারপর ওই ধাপটা উৎসের সঙ্গে মিলিয়ে নাও।', 'Name the step where you got stuck, then check that step against the source.')],
    open: [t(`${title}-এর একটি অমীমাংসিত ভুল দিয়ে পরের ঝালাই শুরু করো।`, `Start your next review with one unresolved mistake in ${title}.`), t('এক বসায় সব ভুল ঠিক করতে যেও না।', 'Do not try to clear every mistake in one sitting.'), t('আগের উত্তর কেন ভুল ছিল নিজের ভাষায় বলো।', 'Explain in your own words why the previous answer was wrong.')],
    missed: [t(`${title}-এর আগে করা একটি ভুল MCQ আবার চেষ্টা করো।`, `Retry one previously missed MCQ from ${title}.`), t('একটি ভুল থেকে পুরো অধ্যায়কে দুর্বল ধরে নিও না।', 'Do not label the whole chapter weak from one miss.'), t('উত্তর মেলানোর আগে কোন নিয়ম ব্যবহার করেছ বলো।', 'Say which rule you used before checking the answer.')],
    steady: [t('বর্তমান রুটিন ধরে এগোও।', 'Keep going with the current routine.'), t('সঠিক উত্তরকে পুরো অধ্যায় শেখার প্রমাণ ভেবো না।', 'Do not treat correct answers as proof of mastery.'), t('পরের ঝালাইয়ে উৎস বন্ধ করে একটি ধারণা ব্যাখ্যা করো।', 'At your next review, explain one idea with the source closed.')],
    limited: [t('পরের বরাদ্দ ফোকাস দিয়ে শুরু করো।', 'Start with your next allocated focus.'), t('রেকর্ড কম বলে নিজেকে পিছিয়ে ধরে নিও না।', 'Do not take a lack of records as a sign you are behind.'), t('পরের সেশনের পরে কোন অংশ কঠিন লেগেছে জানাও।', 'After your next session, note what felt hard.')],
  }[direction.kind];
  return <div className="brain-notice">
    <h3>{t('রিপোর্ট থেকে পরের নির্দেশনা', 'What your report suggests')}</h3>
    <dl className="brain-facts">
      <div><dt>{t('এরপর কী করবে', 'What to do next')}</dt><dd>{resting ? t('আজ বিশ্রাম। পরের বরাদ্দ সময়ে: ', 'Rest today. At your next allocated time: ') : ''}{advice[0]}</dd></div>
      <div><dt>{t('কী এড়িয়ে চলবে', 'What to avoid')}</dt><dd>{advice[1]}</dd></div>
      <div><dt>{t('কীভাবে উন্নতি করবে', 'How to improve')}</dt><dd>{advice[2]}</dd></div>
    </dl>
  </div>;
}

function BrainWeeklyReview() {
  const { data, now } = usePlanner();
  const review = useMemo(() => brainWeeklyReview(data, now), [data, now]);
  if (!review) return null;
  const guidance = review.advice === 'restart'
    ? t('শেষ ৭ পূর্ণ দিনে সেভ করা সেশন নেই। এর মানে এই নয় যে তুমি পড়োনি। চাইলে পরের বরাদ্দ সময়ে ছোট করে আবার শুরু করো।', 'No saved sessions in the last 7 full days. That does not mean you did not study. If you need a restart, keep your next allocated focus short.')
    : review.advice === 'protect'
    ? t('আগের চেয়ে কম দিনে সেশন সেভ হয়েছে। সময়ের ঘাটতি মেটাতে একদিনে সব চাপিও না; পরের বরাদ্দ ফোকাসটুকু ধরে রাখো।', 'Sessions were saved on fewer days. Instead of cramming to make up the difference, protect your next allocated focus.')
    : t('পড়ার ছন্দ ধরে রাখো। বেশি মিনিটের পেছনে না ছুটে, পরের ফোকাস শেষে একটি ধারণা উৎস না দেখে মনে করো।', 'Keep the rhythm. Instead of chasing more minutes, recall one idea without the source at the end of your next focus.');
  return <section className="card brain-panel" aria-labelledby="brain-weekly-title">
    <h2 id="brain-weekly-title">{t('সাপ্তাহিক প্রস্তুতি রিপোর্ট', 'Weekly preparation report')}</h2>
    <p>{t('নির্বাচিত অধ্যায়ের সেভ করা সেশন। আজকের অসম্পূর্ণ দিন তুলনায় নেই।', 'Saved sessions for selected chapters. Today is excluded so both windows cover full days.')}</p>
    <dl className="brain-facts">
      <div><dt>{t('শেষ ৭ পূর্ণ দিন', 'Last 7 full days')}</dt><dd>{t(`${bn(review.latestDays)} দিনে ${bn(review.latestMinutes)} মিনিট`, `${review.latestMinutes} minutes across ${review.latestDays} days`)}</dd></div>
      <div><dt>{t('তার আগের ৭ দিন', 'Previous 7 days')}</dt><dd>{t(`${bn(review.previousDays)} দিনে ${bn(review.previousMinutes)} মিনিট`, `${review.previousMinutes} minutes across ${review.previousDays} days`)}</dd></div>
    </dl>
    <p className="brain-notice">{guidance}</p>
  </section>;
}

function BrainChapterGuides({ pair }: { pair: readonly string[] }) {
  return <section className="card brain-panel" aria-labelledby="brain-chapter-guides-title">
    <h2 id="brain-chapter-guides-title">{t('অধ্যায় প্রস্তুতি গাইড', 'Chapter preparation guides')}</h2>
    <p>{t('অধ্যায়ের ফোকাস ম্যাপ ও পড়ার কৌশল। নতুন কাজ বা পরীক্ষার পূর্বাভাস নয়।', 'Chapter focus and study methods. Not extra work or exam predictions.')}</p>
    {pair.map(id => {
      const guide = brainChapterGuide(id);
      return guide && <details key={id}>
        <summary>{guide.title}</summary>
        <p><strong>{t('অধ্যায়ের ফোকাস', 'Chapter focus')}:</strong> {guide.focus}</p>
        <p><strong>{t('কীভাবে অনুশীলন করবে', 'How to practise')}:</strong> {t(...guide.method)}</p>
      </details>;
    })}
  </section>;
}

const TIME_BUCKET_LABEL = (bucket: 'morning' | 'afternoon' | 'evening' | 'night') => ({
  morning: t('সকাল (৫–১২)', 'Morning (5–12)'), afternoon: t('দুপুর–বিকেল (১২–৫)', 'Afternoon (12–5)'),
  evening: t('সন্ধ্যা (৫–৯)', 'Evening (5–9)'), night: t('রাত (৯–৫)', 'Night (9–5)'),
}[bucket]);

function BrainInsights() {
  const { data, plan, now } = usePlanner();
  const consistency = useMemo(() => brainConsistency(data, now), [data, now]);
  const timeOfDay = useMemo(() => brainTimeOfDay(data, now), [data, now]);
  const energy = useMemo(() => brainEnergyOutput(data, now), [data, now]);
  const routineReady = !!data.personalRoutine && !data.routineSetupRequired;
  const pace = useMemo(() => routineReady ? brainPaceProjection(data, plan, now) : null, [routineReady, data, plan, now]);
  const maxBucket = Math.max(1, ...timeOfDay.rows.map(row => row.minutes));
  const weekdayLabel = consistency.bestWeekday !== null ? weekdayName(consistency.bestWeekday) : t('এখনও নেই', 'none yet');
  return <section className="card brain-panel" id="brain-insights" aria-labelledby="brain-insights-title">
    <h2 id="brain-insights-title">{t('২৮ দিনের পূর্ণ ছবি', 'The full 28-day picture')}</h2>
    <p>{t('শুধু সেভ করা S সেশন ও নিজের চেক-ইন। ঢাকার ঘড়ি অনুযায়ী সময়। পড়ার ধরন দেখায়—ক্ষমতার বিচার নয়।', 'From saved S sessions and your own check-ins, on the Dhaka clock. It shows your rhythm; it does not judge your ability.')}</p>
    <dl className="brain-facts">
      <div><dt>{t('সক্রিয় পড়ার দিন / মোট মিনিট', 'Study days / total minutes')}</dt><dd>{t(`২৮ দিনের মধ্যে ${bn(consistency.activeDays)} দিন · ≈${bn(consistency.minutes)} মিনিট`, `${consistency.activeDays} of 28 days · ≈${consistency.minutes} minutes`)}</dd></div>
      <div><dt>{t('সবচেয়ে শক্তিশালী দিন', 'Strongest weekday')}</dt><dd>{t(`${weekdayLabel} · ≈${bn(consistency.bestWeekdayMinutes)} মিনিট`, `${weekdayLabel} · ≈${consistency.bestWeekdayMinutes} minutes`)}</dd></div>
      <div><dt>{t('টানা পড়ার ধারা', 'Study streaks')}</dt><dd>{t(`বর্তমান ${bn(consistency.currentStreak)} দিন · দীর্ঘতম ${bn(consistency.longestStreak)} দিন`, `Current ${consistency.currentStreak} days · longest ${consistency.longestStreak} days`)}</dd></div>
    </dl>
    <h3>{t('কোন সময়ে পড়ো', 'When you study')}</h3>
    {timeOfDay.enough ? <ul className="brain-meter-list">{timeOfDay.rows.map(row => <li key={row.bucket} className="brain-meter-row">
      <span>{TIME_BUCKET_LABEL(row.bucket)}</span>
      <span className="brain-meter" aria-hidden="true"><span style={{ width: `${Math.round(row.minutes / maxBucket * 100)}%` }} /></span>
      <small>{t(`≈${bn(row.minutes)} মি · ${bn(row.sessions)} সেশন`, `≈${row.minutes} min · ${row.sessions} sessions`)}</small>
    </li>)}</ul>
      : <p className="brain-notice">{t(`সময়ের ধরন ধরতে অন্তত ৫টি সেভ করা সেশন লাগবে; এখন ${bn(timeOfDay.total.sessions)}টি। কিছু অনুমান করিনি।`, `At least 5 saved sessions are needed to show a time-of-day pattern; you have ${timeOfDay.total.sessions}. Nothing guessed.`)}</p>}
    <h3>{t('শক্তি বনাম আউটপুট', 'Energy vs output')}</h3>
    {energy.enough ? <ul className="brain-memory-list">{energy.rows.map(row => <li key={row.energy}>
      <strong>{row.energy === 'low' ? t('ক্লান্ত', 'Tired') : row.energy === 'fresh' ? t('চনমনে', 'Fresh') : t('মোটামুটি', 'Okay')}</strong>
      <span>{t(`${bn(row.days)}টি চেক-ইন দিনে ≈${bn(row.minutes)} মিনিট · গড়ে দিনে ≈${row.avgMinutes === null ? '—' : bn(row.avgMinutes)} মিনিট`, `${row.days} check-in days · ≈${row.minutes} minutes · ≈${row.avgMinutes ?? '—'} minutes per day`)}</span>
    </li>)}</ul>
      : <p className="brain-notice">{t(`শক্তির সাথে পড়ার যোগ দেখতে অন্তত ৪টি চেক-ইন দিন লাগবে; এখন ${bn(energy.joinedDays)}টি। কিছু অনুমান করিনি।`, `At least 4 check-in days are needed to join energy with output; you have ${energy.joinedDays}. Nothing guessed.`)}</p>}
    {pace && <><h3>{t('এই গতিতে কবে শেষ হতে পারে', 'Where this pace could take you')}</h3>
      {pace.enough && pace.projectedFinish
        ? <p className="brain-notice">{t(`গত ২৮ পূর্ণ দিনে গড়ে ≈${bn(pace.minutesPerDay!)} মিনিট/দিন। এই গতিতে বর্তমান S জোড়ার বাকি ≈${bn(pace.neededAfterToday)} মিনিট কাজ শেষ হতে পারে ≈${formatDate(pace.projectedFinish)} (${bn(pace.projectedDays!)} দিনে)। এটি তোমার রেকর্ড থেকে আনুমানিক—পরীক্ষার গ্যারান্টি নয়; রুটিন বদলাইনি।`, `About ${pace.minutesPerDay} minutes per full day over the last 28 days. At that pace the remaining about ${pace.neededAfterToday} minutes in the current S pair could finish around ${formatDate(pace.projectedFinish)} (in ${pace.projectedDays} days). An estimate from your records—not a guarantee; your routine is unchanged.`)}</p>
        : <p className="brain-notice">{t(`Pace ধরার মতো তথ্য কম (অন্তত ≈৫ মিনিট/দিন গড় ও বাকি কাজ লাগবে)। বাকি কাজ ≈${bn(pace.neededAfterToday)} মিনিট। কিছু চাপিয়ে দিইনি।`, `Not enough data for a pace estimate (needs at least about 5 minutes per full day plus remaining work). Remaining work ≈${pace.neededAfterToday} minutes. Nothing was promised.`)}</p>}
    </>}
    <small>{t('আজকের অসম্পূর্ণ দিন জোড়ে গণা হয়নি। ব্রেইনের স্মৃতি মুছলেও মূল পড়ার লগ থেকে এই হিসাব দেখা যায়।', 'Today’s open day is excluded. These calculations read the original study log, so forgetting brain memory does not erase them.')}</small>
  </section>;
}

const PRELIGHT_LABEL = (row: ReturnType<typeof brainPreflight>[number]) => ({
  recurring: t(`বারবার ভুল MCQ · ${bn(row.count)}`, `Recurring MCQ misses · ${row.count}`),
  'mcq-misses': t(`সাম্প্রতিক MCQ-তে ${bn(row.count)} ভুল`, `Recent MCQ misses · ${row.count}`),
  mistakes: t(`অমীমাংসিত ভুল · ${bn(row.count)}`, `Open mistake records · ${row.count}`),
  'revision-due': t(`বকেয়া ঝালাই · ${bn(row.count)} (${row.dueDate ? `${formatDate(row.dueDate)} থেকে` : ''})`, `Overdue revision · ${row.count}${row.dueDate ? ` (since ${formatDate(row.dueDate)})` : ''}`),
}[row.kind]);

function BrainPreflight() {
  const { data, plan, now, navigate } = usePlanner();
  const ready = !!data.personalRoutine && !data.routineSetupRequired;
  const rows = useMemo(() => ready ? brainPreflight(data, plan, now) : [], [ready, data, plan, now]);
  return <section className="card brain-panel" id="brain-preflight" aria-labelledby="brain-preflight-title">
    <h2 id="brain-preflight-title">{t('পরের ঝালাইয়ের আগে এগুলো ঠিক করো', 'Fix these before your next review')}</h2>
    <p>{t('বর্তমান S জোড়ার ভুল ও সব S তালিকার বকেয়া ঝালাই মিলিয়ে rule-based অগ্রাধিকার। নতুন কাজ/রুটিন তৈরি করে না।', 'Rule-based priorities merging current-pair mistakes with overdue revisions across your selected S list. Nothing is added to your schedule.')}</p>
    {rows.length ? <ol className="brain-preflight-list">{rows.map(row => <li key={row.key}>
      <span><strong>{chapterById[row.chapterId].title}</strong><small>{PRELIGHT_LABEL(row)}</small></span>
      <button type="button" className="button secondary" onClick={() => navigate(row.route)}>{t(row.route === 'practice' ? 'অনুশীলন খুলো' : row.route === 'weakness' ? 'দুর্বলতা ডিটেক্টর খুলো' : 'রিভিশন খুলো', row.route === 'practice' ? 'Open practice' : row.route === 'weakness' ? 'Open weakness detector' : 'Open revision')}<ChevronRight size={16} aria-hidden="true" /></button>
    </li>)}</ol>
      : <p className="brain-notice">{t('এখনকার রেকর্ডে জরুরি কিছু নেই। নতুন কাজ চাপানো হয়নি।', 'Nothing urgent in your records. No extra work was queued.')}</p>}
    <small>{t('ভুলের ইতিহাস গুণগত মানের প্রমাণ নয়; বারবার ভুল মানে আবার চেষ্টা করা, অধ্যায় বাদ দেওয়া নয়।', 'A miss history is not a judgement of quality; a recurring miss means retry it, not drop the chapter.')}</small>
  </section>;
}

type AiMode = 'brain' | 'model';
type AiMessage = { role: 'user' | 'assistant'; content: string };
type ModelState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * AI assistant: the instant built-in smart brain, plus an optional on-device
 * AI model (~140 MB, loaded on demand). Chat text is kept
 * only in this session — never saved, never sent to a server.
 */
function AiAssistant() {
  const { data } = usePlanner();
  const [mode, setMode] = useState<AiMode>('brain');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // The model can use substantial RAM. Release it when this panel unmounts.
  useEffect(() => () => unloadAiModel(), []);

  const switchMode = (next: AiMode) => {
    setMode(next);
    setError('');
    if (next === 'model') { setQuiz(null); setPicked(null); }
  };

  const downloadModel = async () => {
    setModelState('loading'); setError(''); setProgress(0);
    try {
      await loadAiModel(item => setProgress(Math.round(item.progress ?? 0)));
      setModelState('ready');
    } catch (cause) {
      setModelState('error');
      setError(aiErrorMessage(cause));
    }
  };

  const askQuiz = async () => {
    setBusy(true); setError('');
    try {
      const question = await loadQuizQuestion();
      setQuiz(question); setPicked(null);
      setMessages(current => [...current, { role: 'assistant', content: quizMessage(question) }]);
    } catch {
      setError(t('কুইজ লোড করা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করো।', 'Could not load the quiz. Check your connection and try again.'));
    } finally { setBusy(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput(''); setError('');
    if (mode === 'brain') {
      setMessages(current => [...current, { role: 'user', content: text }]);
      const answer = answerAiQuestion(text, data);
      if (answer.kind === 'quiz') {
        setBusy(true);
        try {
          const question = await loadQuizQuestion(answer.subject);
          setQuiz(question); setPicked(null);
          setMessages(current => [...current, { role: 'assistant', content: quizMessage(question) }]);
        } catch {
          setError(t('কুইজ লোড করা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করো।', 'Could not load the quiz. Check your connection and try again.'));
        } finally { setBusy(false); }
      } else {
        setMessages(current => [...current, { role: 'assistant', content: answer.text }]);
      }
      return;
    }
    const history: AiMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setBusy(true);
    try {
      const reply = await chatWithAi(history, item => setProgress(Math.round(item.progress ?? 0)));
      setMessages(current => [...current, { role: 'assistant', content: reply }]);
    } catch (cause) {
      setError(aiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const answerQuiz = (index: number) => {
    if (!quiz || picked !== null) return;
    setPicked(index);
    const result = checkQuizAnswer(quiz, index);
    setMessages(current => [...current, { role: 'assistant', content: result.text }]);
  };

  const modelReady = modelState === 'ready';
  return <section className="card brain-panel ai-panel" aria-labelledby="ai-title">
    <h2 id="ai-title"><Bot size={20} aria-hidden="true" />{t('ডিভাইস AI সহকারী', 'On-device AI assistant')}</h2>
    <p>{t('স্মার্ট ব্রেইন এখনই উত্তর দেয় — অধ্যায়, কুইজ, টিপস, অগ্রগতি। AI মডেল মোডে খোলামেলা প্রশ্ন করতে পারো; মডেল ডিভাইসে চলে, তবে আবার চালু করতে ইন্টারনেট লাগতে পারে। এটি ইংরেজিতে ভালো কাজ করতে পারে; ভুল উত্তর যাচাই করো। চ্যাটের লেখা সেভ হয় না।', 'The smart brain answers instantly — chapters, quizzes, tips, progress. In AI model mode you can ask open-ended questions; the model runs on your device, but restarting it may require internet. It works best in English and can make mistakes. Chat text is never saved.')}</p>
    <div className="ai-modes" role="group" aria-label={t('AI মোড', 'AI mode')}>
      <button type="button" className={`button secondary ${mode === 'brain' ? 'selected' : ''}`} aria-pressed={mode === 'brain'} onClick={() => switchMode('brain')}><BrainCircuit size={16} aria-hidden="true" />{t('স্মার্ট ব্রেইন', 'Smart brain')}</button>
      <button type="button" className={`button secondary ${mode === 'model' ? 'selected' : ''}`} aria-pressed={mode === 'model'} onClick={() => switchMode('model')}><Bot size={16} aria-hidden="true" />{t(`AI মডেল (~${bn(AI_MODEL_SIZE_MB)} MB)`, `AI model (~${AI_MODEL_SIZE_MB} MB)`)}</button>
    </div>

    {mode === 'model' && !modelReady && modelState !== 'loading' && <div className="ai-download">
      <p>{t(`প্রথমবার প্রায় ${bn(AI_MODEL_SIZE_MB)} MB মডেল এবং চালানোর ফাইল ডাউনলোড হবে (SmolLM2-135M, Q8)। ডিভাইস ও ক্যাশের ওপর নির্ভর করে পরে আবার ইন্টারনেট লাগতে পারে।`, `The first use downloads an approximately ${AI_MODEL_SIZE_MB} MB model plus runtime files (SmolLM2-135M, Q8). Depending on your device and cache, internet may be needed again.`)}</p>
      <button type="button" className="button primary" onClick={() => void downloadModel()}><Download size={16} aria-hidden="true" />{t('AI মডেল ডাউনলোড করো', 'Download AI model')}</button>
    </div>}

    {mode === 'model' && modelState === 'loading' && <div className="ai-download" role="status" aria-live="polite">
      <p>{t('AI মডেল ডাউনলোড ও চালু হচ্ছে… ইন্টারনেট বন্ধ কোরো না।', 'Downloading and starting the AI model… keep the internet on.')}</p>
      <div className="ai-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <small>{bn(progress)}%</small>
    </div>}

    {mode === 'model' && modelReady && <p className="ai-ready" role="status">{t('মডেল প্রস্তুত — প্রশ্ন পাঠালেই ডিভাইসেই উত্তর আসবে।', 'Model ready — send a question and the answer comes from this device.')}</p>}

    {messages.length > 0 && <div className="ai-messages" aria-live="polite">
      {messages.map((message, index) => <p key={index} className={`ai-message ${message.role}`}>{message.content}</p>)}
    </div>}

    {mode === 'brain' && quiz && picked === null && <div className="ai-quiz" role="group" aria-label={t('কুইজের অপশন', 'Quiz options')}>
      {quiz.options.map((option, index) => <button type="button" key={index} className="button secondary" onClick={() => answerQuiz(index)}>{option}</button>)}
    </div>}
    {mode === 'brain' && quiz && picked !== null && <div className="ai-quiz">
      <button type="button" className="button secondary" disabled={busy} onClick={() => void askQuiz()}><RotateCcw size={16} aria-hidden="true" />{t('আরেকটা কুইজ দাও', 'Give me another quiz')}</button>
    </div>}

    {error && <p className="field-error" role="alert">{error}</p>}

    <form className="ai-input" onSubmit={event => void send(event)}>
      <label htmlFor="ai-input">{mode === 'brain'
        ? t('জিজ্ঞেস করো — যেমন “পদার্থের অধ্যায়গুলো কী?”, “কুইজ দাও”, “আমার অগ্রগতি?”', 'Ask — for example “What are the Physics chapters?”, “Give me a quiz”, “My progress?”')
        : t('AI-কে জিজ্ঞেস করো (বাংলা / Banglish / English)', 'Ask the AI (Bengali / Banglish / English)')}</label>
      <div>
        <input id="ai-input" value={input} maxLength={500} autoComplete="off" disabled={busy || (mode === 'model' && !modelReady)} placeholder={t('এখানে লেখো…', 'Type here…')} onChange={event => setInput(event.target.value)} />
        <button type="submit" className="button primary" disabled={!input.trim() || busy || (mode === 'model' && !modelReady)}>
          {busy ? <Loader2 size={16} aria-hidden="true" className="ai-spin" /> : <Send size={16} aria-hidden="true" />}
          {t('পাঠাও', 'Send')}
        </button>
      </div>
    </form>
  </section>;
}
