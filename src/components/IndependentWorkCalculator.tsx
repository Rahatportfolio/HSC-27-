import { useState } from 'react';
import { t } from '../i18n';
import { formatDurationBn } from '../planner';
import { independentWorkMinutes } from '../personalRoutine';
import type { WorkBudget, WorkCalculation, WorkStage } from '../personalRoutine';

export default function IndependentWorkCalculator({ stage, budget, onCalculated }: { stage: WorkStage; budget: WorkBudget; onCalculated: (budget: WorkBudget) => void }) {
  const [quantity, setQuantity] = useState(budget.calculation ? String(budget.calculation.quantity) : '');
  const [unitMinutes, setUnitMinutes] = useState(budget.calculation ? String(budget.calculation.unitMinutes) : '');
  const [difficulty, setDifficulty] = useState<WorkCalculation['difficulty']>(budget.calculation?.difficulty || 'normal');
  const [reviewed, setReviewed] = useState(String(budget.calculation?.reviewedPercent || 0));
  const [error, setError] = useState('');
  const label = stage === 'reading' ? t('বইয়ের পৃষ্ঠা', 'Textbook pages') : stage === 'notes' ? t('নোটের টপিক/অংশ', 'Note topics/sections') : stage === 'mcqPractice' ? t('MCQ প্রশ্নসংখ্যা', 'MCQ question count') : stage === 'cqPractice' ? t('CQ প্রশ্নসংখ্যা', 'CQ question count') : t('রিভিশনের টপিক/অংশ', 'Revision topics/sections');
  const rateLabel = stage === 'reading' ? t('প্রতি পৃষ্ঠা পড়ার মিনিট', 'Reading minutes per page') : stage === 'notes' ? t('প্রতি অংশে নোট তৈরির মিনিট', 'Note-making minutes per section') : stage === 'mcqPractice' ? t('প্রতি MCQ-এর মিনিট', 'Minutes per MCQ') : stage === 'cqPractice' ? t('প্রতি CQ লেখার মিনিট', 'Writing minutes per CQ') : t('প্রতি অংশ রিভিশনের মিনিট', 'Revision minutes per section');
  return <div className="independent-calculator">
    <p className="tiny-muted">{t('নিজের কাজের পরিমাণ দিয়ে হিসাব করো, অথবা নিচে নিজের আলাদা বাজেট লেখো। এটি পরিকল্পনার আনুমানিক সময়, শেষ হওয়ার প্রমাণ নয়।', 'Calculate from your workload, or enter your own separate budget below. This is a planning estimate, not evidence of completion.')}</p>
    <div className="form-grid"><label>{label}<input type="number" min="0.01" max="100000" step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label>{rateLabel}<input type="number" min="0.01" max="1440" step="any" value={unitMinutes} onChange={event => setUnitMinutes(event.target.value)} /></label><label>{t('কাজের কঠিনতা', 'Work difficulty')}<select value={difficulty} onChange={event => setDifficulty(event.target.value as WorkCalculation['difficulty'])}><option value="easy">{t('সহজ · ০.৮ গুণ', 'Easy · ×0.8')}</option><option value="normal">{t('মাঝারি · ১ গুণ', 'Normal · ×1')}</option><option value="hard">{t('কঠিন · ১.৪ গুণ', 'Hard · ×1.4')}</option></select></label>
      {stage === 'revision' && <label>{t('আগে রিভিশন হয়েছে (%)', 'Previously reviewed (%)')}<input type="number" min="0" max="100" step="any" value={reviewed} onChange={event => setReviewed(event.target.value)} /><small>{t('১০০% হলেও নতুন রিভিশনের অর্ধেক সময় থাকবে; আগের রিভিশন মানেই এখন পুরো প্রস্তুত নয়।', 'Even 100% keeps half the new review budget; prior review is not current mastery.')}</small></label>}
    </div>
    <button className="button secondary small" type="button" onClick={() => {
      try {
        const calculation: WorkCalculation = { quantity: Number(quantity), unitMinutes: Number(unitMinutes), difficulty, ...(stage === 'revision' ? { reviewedPercent: Number(reviewed) } : {}) };
        const minutes = independentWorkMinutes(stage, calculation);
        onCalculated({ minutes, source: 'planned', calculation }); setError('');
      } catch { setError(t('পরিমাণ ও প্রতি এককের সঠিক মিনিট দাও; মোট সময় সর্বোচ্চ ১০,০৮০ মিনিট হতে পারে।', 'Enter a valid quantity and minutes per unit; the total may not exceed 10,080 minutes.')); }
    }}>{t('পরিমাণ দিয়ে সময় হিসাব করো', 'Calculate workload time')}</button>
    {budget.calculation && <p className="tiny-muted">{budget.calculation.quantity} × {budget.calculation.unitMinutes} × {{ easy: .8, normal: 1, hard: 1.4 }[budget.calculation.difficulty]}{stage === 'revision' ? ` × ${(1 - (budget.calculation.reviewedPercent || 0) / 200).toFixed(2)}` : ''} → {formatDurationBn(budget.minutes || 0)} · {t('ভিডিওর গতি প্রযোজ্য নয়', 'Playback speed does not apply')}</p>}
    {error && <p className="personal-warning" role="alert">{error}</p>}
  </div>;
}
