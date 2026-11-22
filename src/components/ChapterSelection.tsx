import { CHAPTERS, SUBJECTS } from '../data';
import type { PersonalRoutine } from '../personalRoutine';
import { personalBookLabel, RECOMMENDED_S_IDS } from '../personalRoutine';
import { bn } from '../planner';
import { t } from '../i18n';

/** Nothing is selected implicitly. Each selected chapter belongs to exactly one category. */
export default function ChapterSelection({ routine, onChange, suggestedS = RECOMMENDED_S_IDS }: {
  routine: PersonalRoutine;
  onChange: (routine: PersonalRoutine) => void;
  suggestedS?: string[];
}) {
  const categories = routine.categories || {};
  const setCategory = (id: string, category?: 'S' | 'A' | 'B') => {
    const next = { ...categories };
    if (category) next[id] = category; else delete next[id];
    onChange({ ...routine, categories: next, chapterIds: CHAPTERS.filter(chapter => next[chapter.id]).map(chapter => chapter.id) });
  };
  return <section className="selected-chapters" aria-label={t('অধ্যায় বাছাই', 'Choose chapters')}>
    <h2>{t('তুমি যেসব অধ্যায় পড়বে, শুধু সেগুলো বাছো', 'Choose only the chapters you want to study')}</h2>
    <p>{t('শুধু টিক দেওয়া অধ্যায় পড়বে। S → A → B ক্রমে পড়বে; বাদ দেওয়া অধ্যায় রুটিনে আসবে না। S হলো A থেকে নিজের বাছাই, সরকারি সাজেশন নয়।', 'Only checked chapters are selected. Study S → A → B; unchecked chapters are not scheduled. S is your shortlist within A, not an official prediction.')}</p>
    <p role="status">{t('নির্বাচিত', 'Selected')}: {bn(routine.chapterIds.length)} · S {bn(Object.values(categories).filter(c => c === 'S').length)} · A {bn(Object.values(categories).filter(c => c === 'A').length)} · B {bn(Object.values(categories).filter(c => c === 'B').length)}</p>
    {SUBJECTS.map(subject => {
      const chapters = CHAPTERS.filter(chapter => chapter.subject === subject.id && (chapter.priority === 'A' || chapter.priority === 'B'));
      if (!chapters.length) return null;
      return <details key={subject.id} className="selected-subject"><summary>{subject.name} · {bn(chapters.filter(chapter => categories[chapter.id]).length)} {t('নির্বাচিত', 'selected')}</summary>
        <div className="personal-chapter-choices">{chapters.map(chapter => {
          const category = categories[chapter.id];
          const label = `${chapter.title} · ${personalBookLabel(chapter.id)}`;
          return <div className="selected-chapter" data-chapter-id={chapter.id} key={chapter.id}>
            <label><input type="checkbox" checked={!!category} aria-label={label} onChange={event => setCategory(chapter.id, event.target.checked ? chapter.priority === 'B' ? 'B' : suggestedS.includes(chapter.id) ? 'S' : 'A' : undefined)} /><span>{label} · {category || (chapter.priority === 'A' && suggestedS.includes(chapter.id) ? t('প্রস্তাবিত S', 'Suggested S') : chapter.priority)}</span></label>
            {category && chapter.priority === 'A' && <label>{t('ক্যাটাগরি', 'Category')} <select aria-label={`${label} ${t('ক্যাটাগরি', 'category')}`} value={category} onChange={event => setCategory(chapter.id, event.target.value as 'S' | 'A')}><option value="S">S</option><option value="A">A</option></select></label>}
          </div>;
        })}</div>
      </details>;
    })}
  </section>;
}
