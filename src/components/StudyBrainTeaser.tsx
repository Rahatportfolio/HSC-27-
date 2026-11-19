import { BrainCircuit, ChevronRight, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { usePlanner } from '../context';
import { studyBrainSuggestion } from '../studyBrain';
import { brainStatusText } from '../studyBrainText';
import { t } from '../i18n';

export default function StudyBrainTeaser() {
  const { data, plan, now, navigate } = usePlanner();
  const suggestion = useMemo(() => studyBrainSuggestion(data, plan, now), [data, plan, now]);
  const copy = brainStatusText(suggestion.status);
  return <section className="card brain-teaser" aria-label={t('স্টাডি ব্রেইন', 'Study Brain')}>
    <span className="brain-mark" aria-hidden="true"><BrainCircuit size={25} /></span>
    <div><span className="eyebrow">{t('তোমার ছোট স্টাডি ব্রেইন', 'YOUR SMALL STUDY BRAIN')}</span><h2>{copy.title}</h2><p>{copy.body}</p><small><ShieldCheck size={14} aria-hidden="true" />{t('ডিভাইসেই চলে · কোনো API key নয় · চালু করা ঐচ্ছিক', 'On-device · no API key · optional')}</small></div>
    <button type="button" className="button secondary" onClick={() => navigate('brain')}>{t('ব্রেইনের সঙ্গে কথা বলো', 'Talk to Study Brain')}<ChevronRight size={17} aria-hidden="true" /></button>
  </section>;
}
