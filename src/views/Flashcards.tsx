import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CSSProperties } from 'react';
import { BookOpen, List, Plus } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, chapterById, SUBJECTS } from '../data';
import type { SubjectId } from '../data';
import type { FlashcardCategory } from '../types';
import { bn } from '../planner';
import {
  createFlashcard, deleteFlashcard, dueCount, dueFlashcards, flashcardTotals, reviewFlashcard,
} from '../flashcards';
import { FLASHCARD_CATEGORY_LABEL } from '../flashcards';
import { EmptyState, Modal, PageHeading, ProgressBar, SubjectBadge } from '../components';
import { t } from '../i18n';

type CardRating = 'again' | 'hard' | 'good' | 'easy';
const RATING_LABEL: Record<CardRating, string> = { again: 'আবার', hard: 'কঠিন', good: 'ভালো', easy: 'সহজ' };
const RATING_COLOR: Record<CardRating, string> = { again: '#dc2626', hard: '#ca8a04', good: '#15803d', easy: '#15803d' };

function formatInterval(card: { interval: number }): string {
  return bn(card.interval) + ' দিন';
}

export default function FlashcardsView() {
  const { data, setData, today, notify } = usePlanner();
  const [showForm, setShowForm] = useState(false);
  const [cardOpen, setCardOpen] = useState<string | null>(null);
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const [subjectFilter, setSubjectFilter] = useState<'all' | SubjectId>('all');
  const [query, setQuery] = useState('');

  const cards = useMemo(() => {
    let list = dueFlashcards(data, today);
    if (subjectFilter !== 'all') list = list.filter(card => card.subject === subjectFilter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(card => card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q));
    }
    return list;
  }, [data, today, subjectFilter, query]);

  const { total, learned } = flashcardTotals(data);
  const due = dueCount(data, today);

  const addCard = (form: { subject: SubjectId; chapterId?: string; front: string; back: string; category: string }) => {
    setData(d => createFlashcard(d, {
      subject: form.subject,
      chapterId: form.chapterId || undefined,
      front: form.front,
      back: form.back,
      category: form.category as FlashcardCategory,
    }));
    notify(t('ফ্ল্যাশকার্ড যোগ করা হয়েছে। রিভিশনের দিনে এটি ফেরত আসবে।', 'Flashcard added. It will return on its revision day.'));
    setShowForm(false);
  };

  const handleRating = (id: string, rating: CardRating) => {
    setData(d => {
      const result = reviewFlashcard(d, id, rating, today);
      return result.data;
    });
    notify(`✅ ${RATING_LABEL[rating]}`);
    setCardOpen(null);
    setFlip({});
  };

  const removeCard = (id: string) => {
    setData(d => deleteFlashcard(d, id));
    notify(t('ফ্ল্যাশকার্ড মুছে ফেলা হয়েছে।', 'Flashcard removed.'));
    setCardOpen(null);
  };

  const duePercent = total ? Math.round((due / total) * 100) : 0;

  return (
    <div className="view flashcards-view">
      <PageHeading
        eyebrow={t('স্মার্ট ফ্ল্যাশকার্ড', 'Smart flashcards')}
        title={t('ফ্ল্যাশকার্ড রিভিশন', 'Flashcard revision')}
        titleEn="Flashcard revision"
        description={t('সূত্র, সংজ্ঞা, প্রতিক্রিয়া ও শব্দ—যা মনে রাখা জরুরি, তা ফ্ল্যাশকার্ডে রেখে স্পেসড রিপিটিশনে রিভিশন করো।', 'Formulas, definitions, reactions and vocabulary—keep what must be memorized in flashcards and revise with spaced repetition.')}
        descriptionEn=""
      />
      <div className="stat-row">
        <div className="stat-card"><div className="stat-value">{bn(total)}</div><div className="stat-label">{t('মোট কার্ড', 'Total cards')}</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#dc2626' }}>{bn(due)}</div><div className="stat-label">{t('আজ রিভিশনের মতো', 'Due today')}</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#15803d' }}>{bn(learned)}</div><div className="stat-label">{t('অতিবার পর্যালোচিত', 'Reviewed before')}</div></div>
        <div className="stat-card"><div className="stat-value">{bn(duePercent)}%</div><div className="stat-label">{t('অগ্রগতি', 'Progress')}</div></div>
      </div>
      <ProgressBar value={duePercent} />
      <div className="filters">
        <button type="button" className={`filter-pill ${subjectFilter === 'all' ? 'active' : ''}`} onClick={() => setSubjectFilter('all')}>{t('সব বিষয়', 'All subjects')}</button>
        {SUBJECTS.map(subject => (
          <button key={subject.id} type="button" className={`filter-pill ${subjectFilter === subject.id ? 'active' : ''}`} style={{ '--subject': subject.color } as CSSProperties} onClick={() => setSubjectFilter(subjectFilter === subject.id ? 'all' : subject.id)}>
            <span className="subject-dot" style={{ background: subject.color }} />
            {subject.short}
          </button>
        ))}
        <button type="button" className="icon-button" onClick={() => setShowForm(true)}><Plus size={18} />{t('নতুন কার্ড', 'New card')}</button>
      </div>
      <label className="search-field"><List size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('ফ্ল্যাশকার্ড খুঁজো…', 'Search flashcards…')} /></label>

      {cards.length === 0 && (
        <EmptyState
          title={due === 0 && total > 0 ? t('আজ কোনো রিভিশন নেই', 'Nothing due today') : t('এখনও কোনো ফ্ল্যাশকার্ড নেই', 'No flashcards yet')}
          description={due === 0 && total > 0
            ? t('সব কার্ড বর্তমানে আপ-টু-ডেট। আবার আসবে রিভিশনের দিনে।', 'All cards are up to date. They will return on their revision days.')
            : t('নতুন কার্ড যোগ করো এবং দৈনিক রিভিশন দিয়ে শুরু করো।', 'Add new cards and start with daily revision.')}
          action={
            <button className="button primary" onClick={() => setShowForm(true)}><Plus size={15} />{t('নতুন কার্ড যোগ করো', 'Add a new card')}</button>
          }
        />
      )}
      {cards.map(card => {
        const chapter = card.chapterId ? chapterById[card.chapterId] : undefined;
        const isOpen = cardOpen === card.id;
        return (
          <div key={card.id} className="flashcard-row">
            <div className="flashcard-head">
              <div className="flashcard-copy">
                <div className="flashcard-front">{card.front}</div>
                <div className="flashcard-meta"><SubjectBadge subject={card.subject} /><span>{chapter ? chapter.title : t('অন্যান্য', 'General')}</span><span>{FLASHCARD_CATEGORY_LABEL[card.category]}</span><span>{t('প্রতি', 'Every')} {formatInterval(card)}</span></div>
              </div>
              <button type="button" className={`flip-btn ${flip[card.id] ? 'flipped' : ''}`} onClick={() => setFlip({ ...flip, [card.id]: !flip[card.id] })}>{t('উত্তর দেখো', 'Show answer')}</button>
            </div>
            {flip[card.id] && <div className="flashcard-back"><BookOpen size={18} strokeWidth={1.6} /> <strong>{card.back}</strong></div>}
            <div className="flashcard-actions">
              {isOpen ? (
                <>
                  <button type="button" className="rating-btn" style={{ color: RATING_COLOR.again }} onClick={() => handleRating(card.id, 'again')}>{RATING_LABEL.again}</button>
                  <button type="button" className="rating-btn" style={{ color: RATING_COLOR.hard }} onClick={() => handleRating(card.id, 'hard')}>{RATING_LABEL.hard}</button>
                  <button type="button" className="rating-btn" style={{ color: RATING_COLOR.good }} onClick={() => handleRating(card.id, 'good')}>{RATING_LABEL.good}</button>
                  <button type="button" className="rating-btn" style={{ color: RATING_COLOR.easy }} onClick={() => handleRating(card.id, 'easy')}>{RATING_LABEL.easy}</button>
                  <button type="button" className="text-button danger" onClick={() => removeCard(card.id)}>{t('মুছো', 'Delete')}</button>
                </>
              ) : (
                <button type="button" className="button secondary answer-btn" onClick={() => setCardOpen(card.id)}>{t('উত্তর দিয়ে রেটিং দাও', 'Answer & rate')}</button>
              )}
            </div>
          </div>
        );
      })}

      {showForm && (
        <Modal title={t('নতুন ফ্ল্যাশকার্ড', 'New flashcard')} onClose={() => setShowForm(false)} wide>
          <AddCardForm onAdd={addCard} onClose={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}

function AddCardForm({ onAdd, onClose }: { onAdd: (form: { subject: SubjectId; chapterId?: string; front: string; back: string; category: string }) => void; onClose: () => void }) {
  const [form, setForm] = useState({ subject: 'physics' as SubjectId, chapterId: '', front: '', back: '', category: 'definition' as FlashcardCategory });
  const [error, setError] = useState('');

  const chaptersBySubject = Object.fromEntries(SUBJECTS.map(subject => [subject.id, CHAPTERS.filter(c => c.subject === subject.id)])) as Record<SubjectId, typeof CHAPTERS>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.front.trim() || !form.back.trim()) { setError('সামনা ও উত্তর দুটিই লিখলেই কার্ড তৈরি হবে।'); return; }
    onAdd({ subject: form.subject, chapterId: form.chapterId || undefined, front: form.front.trim(), back: form.back.trim(), category: form.category });
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <label className="form-label">{t('বিষয়', 'Subject')}<select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value as SubjectId, chapterId: '' })}>{SUBJECTS.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      <label className="form-label">{t('অধ্যায় (ঐচ্ছিক)', 'Chapter (optional)')}<select value={form.chapterId} onChange={e => setForm({ ...form, chapterId: e.target.value })}>
        <option value="">{t('কোনো অধ্যায় নেই', 'No chapter')}</option>
        {chaptersBySubject[form.subject].map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
      <label className="form-label">{t('সামনা (প্রশ্ন)', 'Front / question')}<textarea data-autofocus rows={3} value={form.front} onChange={e => { setForm({ ...form, front: e.target.value }); setError(''); }} placeholder={t('যেমন: বৃত্তের ক্ষেত্রফলের সূত্র', 'e.g. Area of a circle')}/></label>
      <label className="form-label">{t('উত্তর (পেছন)', 'Back / answer')}<textarea rows={4} value={form.back} onChange={e => setForm({ ...form, back: e.target.value })} placeholder={t('যেমন: πr²', 'e.g. πr²')}/></label>
      <label className="form-label">{t('কার্ডের ধরন', 'Card type')}<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as FlashcardCategory })}>
        <option value="definition">{FLASHCARD_CATEGORY_LABEL.definition}</option>
        <option value="formula">{FLASHCARD_CATEGORY_LABEL.formula}</option>
        <option value="reaction">{FLASHCARD_CATEGORY_LABEL.reaction}</option>
        <option value="terminology">{FLASHCARD_CATEGORY_LABEL.terminology}</option>
        <option value="identity">{FLASHCARD_CATEGORY_LABEL.identity}</option>
        <option value="vocabulary">{FLASHCARD_CATEGORY_LABEL.vocabulary}</option>
        <option value="other">{FLASHCARD_CATEGORY_LABEL.other}</option>
      </select></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t('বাতিল', 'Cancel')}</button><button className="button primary" type="submit"><Plus size={16} />{t('কার্ড যোগ করো', 'Add card')}</button></div>
    </form>
  );
}
