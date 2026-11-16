import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookMarked, BookOpen, Download, ExternalLink, FileText, Filter, Link2, NotebookPen, Pin, Plus, Search, Star, Trash2, Youtube } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate } from '../planner';
import { STARTER_FORMULAS } from '../quiz-data';
import { BANGLA_LESSONS, CHAPTER_CLASSES } from '../classLinks';
import { classProgress, isWatched, toggleClassWatched } from '../classes';
import { newId, nowIso } from '../storage';
import { downloadText } from '../exports';
import type { BoardQuestion, FormulaEntry, PersonalNote, VideoLink } from '../types';
import { ClassBlock, EmptyState, LessonList, Modal, PageHeading, SubjectBadge } from '../components';
import { t } from '../i18n';

type Tab = 'notes' | 'videos' | 'formulas' | 'boards';
const TABS: { id: Tab; label: string }[] = [
  { id: 'notes', label: 'নোট' }, { id: 'videos', label: 'YouTube' }, { id: 'formulas', label: 'সূত্র' }, { id: 'boards', label: 'বোর্ড প্রশ্ন' },
];
export default function LibraryView() {
  const { data } = usePlanner();
  const [tab, setTab] = useState<Tab>('notes');
  const builtInVideos = classProgress(data).total;
  const counts: Record<Tab, number> = { notes: data.libraryNotes.length, videos: builtInVideos + data.videos.length, formulas: STARTER_FORMULAS.length + data.formulas.length, boards: data.boardQuestions.length };
  return <div className="view library-view">
    <PageHeading eyebrow="YOUR OWN SHELF" title={t("নিজের সংগ্রহ, নিজের হাতে।", "Your collection, in your hands.")} titleEn="Your own shelf, in your hands." description="নোট, ভিডিও, সূত্র আর বোর্ড প্রশ্ন—সব এক জায়গায়। ইন্টারনেট লাগবে শুধু ভিডিও দেখতে; বাকি সব অফলাইনে থাকে।" descriptionEn="Notes, videos, formulas and board questions in one place. Only video playback needs internet." action={<div className="library-total"><strong>{bn(Object.values(counts).reduce((sum, value) => sum + value, 0))}</strong><span>{t("টি সংগ্রহ", " items")}<br />{t("এই ডিভাইসে", "on this device")}</span></div>} />
    <div className="notice-box"><p>{t('বিদ্যমান ভিডিও লিংক, শিক্ষক ও অধ্যায়ের মিল যাচাই করা হয়নি। ভিডিও দেখতে ইন্টারনেট দরকার; অ্যাপ YouTube ভিডিও ডাউনলোড করে না। যাচাইকৃত PDF সংগ্রহ এখনো যুক্ত করা হয়নি।', 'Existing video links, teachers and chapter matches are unverified. Video playback requires internet; the app does not download YouTube videos. A verified PDF collection has not yet been added.')}</p></div>
    <div className="segmented library-tabs">{TABS.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label} <span className="tab-count">{bn(counts[item.id])}</span></button>)}</div>
    {tab === 'notes' && <NotesTab />}
    {tab === 'videos' && <VideosTab />}
    {tab === 'formulas' && <FormulasTab />}
    {tab === 'boards' && <BoardsTab />}
  </div>;
}

function NotesTab() {
  const { data, setData, confirm, notify } = usePlanner();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<PersonalNote | 'new' | null>(null);
  const notes = data.libraryNotes.filter(note => `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const exportNotes = () => {
    const markdown = data.libraryNotes.map(note => `## ${note.title}\n\n${note.subject ? `বিষয়: ${subjectById[note.subject].name}\n\n` : ''}${note.chapterId && chapterById[note.chapterId] ? `অধ্যায়: ${chapterById[note.chapterId].title}\n\n` : ''}${note.tags.length ? `ট্যাগ: ${note.tags.join(', ')}\n\n` : ''}${note.body}`).join('\n\n---\n\n');
    if (!markdown) { notify('ডাউনলোড করার নোট নেই।', 'info'); return; }
    downloadText(`# আমার নোট\n\n${markdown}`, `prostuti-notes-${new Date().toISOString().slice(0, 10)}.md`, 'text/markdown;charset=utf-8');
    notify('নোট Markdown ফাইলে ডাউনলোড হয়েছে।', 'success');
  };
  return <section className="card library-panel">
    <div className="card-heading"><div><h2><NotebookPen size={20} />{t("নোট লাইব্রেরি", "Notes library")}</h2><p>দিনের নোটের বাইরে বড় নোট, সূত্র-ব্যাখ্যা বা ভাবনা লিখে রাখো।</p></div><div className="heading-actions"><button className="button secondary small" onClick={exportNotes}><Download size={15} />Markdown</button><button className="button primary" onClick={() => setOpen('new')}><Plus size={16} />{t("নোট লেখো", "Write a note")}</button></div></div>
    <label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("নোট, ট্যাগ বা অধ্যায় খুঁজো…", "Search notes, tags or chapter…")} aria-label={t("নোট খুঁজো", "Search notes")} /></label>
    {notes.length ? <div className="note-grid">{notes.map(note => <article className={`card personal-note ${note.pinned ? 'pinned' : ''}`} key={note.id}><div className="personal-note-top"><SubjectBadge subject={note.subject || 'physics'} small />{note.pinned && <span className="pin-pill"><Pin size={11} />{t("পিন", "Pin")}</span>}<button className={`icon-button ${note.pinned ? 'active' : ''}`} aria-label={note.pinned ? 'পিন সরাও' : 'পিন করো'} onClick={() => setData(d => ({ ...d, libraryNotes: d.libraryNotes.map(item => item.id === note.id ? { ...item, pinned: !item.pinned, updatedAt: nowIso() } : item) }))}><Pin size={14} /></button></div><h3>{note.title}</h3><p className="note-preview">{note.body}</p><div className="note-tags">{note.tags.map(tag => <span key={tag}>{tag}</span>)}{note.chapterId && chapterById[note.chapterId] && <span className="chapter-tag">{chapterById[note.chapterId].title}</span>}</div><div className="personal-note-foot"><span>{formatDate(note.updatedAt.slice(0, 10))}</span><div><button className="text-button" onClick={() => setOpen(note)}>{t("সম্পাদনা", "Edit")}</button><button className="icon-button delete-button" aria-label={t("নোট মুছো", "Delete note")} onClick={() => confirm({ title: 'নোটটি মুছে ফেলবে?', message: note.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, libraryNotes: d.libraryNotes.filter(item => item.id !== note.id) })); notify('নোট মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={14} /></button></div></div></article>)}</div> : <EmptyState title={query ? 'মিলে যাওয়া নোট নেই' : 'প্রথম নোটটি লেখো'} description={query ? 'অন্য শব্দ দিয়ে খুঁজো।' : 'অধ্যায়ের মূল ধারণা নিজের ভাষায় লিখলে মনে থাকে অনেক বেশি।'} action={!query && <button className="button primary" onClick={() => setOpen('new')}>{t("নোট লেখো", "Write a note")}</button>} />}
    {open && <NoteModal note={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
  </section>;
}

function NoteModal({ note, onClose }: { note: PersonalNote | null; onClose: () => void }) {
  const { data, setData, notify } = usePlanner();
  const [title, setTitle] = useState(note?.title || '');
  const [body, setBody] = useState(note?.body || '');
  const [subject, setSubject] = useState<SubjectId | ''>(note?.subject || '');
  const [chapterId, setChapterId] = useState(note?.chapterId || '');
  const [tags, setTags] = useState(note?.tags.join(', ') || '');
  const [pinned, setPinned] = useState(note?.pinned || false);
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError('নোটের শিরোনাম লেখো।'); return; }
    if (data.libraryNotes.length >= 1000 && !note) { setError('সর্বোচ্চ ১০০০টি নোট রাখা যায়।'); return; }
    const tagList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    if (tagList.length > 10) { setError('সর্বোচ্চ ১০টি ট্যাগ রাখা যায়।'); return; }
    const stamp = nowIso();
    const entry: PersonalNote = { id: note?.id || newId(), title: title.trim(), body, subject: subject || undefined, chapterId: chapterId || undefined, tags: tagList, pinned, createdAt: note?.createdAt || stamp, updatedAt: stamp };
    setData(d => ({ ...d, libraryNotes: note ? d.libraryNotes.map(item => item.id === note.id ? entry : item) : [...d.libraryNotes, entry] }));
    notify(note ? 'নোট আপডেট হয়েছে।' : 'নোট সেভ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={note ? 'নোট সম্পাদনা' : 'নতুন নোট'} onClose={onClose} wide><form onSubmit={submit}><div className="form-grid"><label>{t("শিরোনাম", "Title")}<input data-autofocus value={title} maxLength={200} onChange={e => setTitle(e.target.value)} required /></label><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId | ''); setChapterId(''); }}><option value="">{t("সাধারণ", "General")}</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => !subject || chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>{t("ট্যাগ", "Tags")}<input value={tags} maxLength={200} onChange={e => setTags(e.target.value)} placeholder={t("কমা দিয়ে আলাদা করো", "Separate with commas")} /></label></div><label className="form-label">{t("নোট", "Notes")}<textarea rows={8} maxLength={20000} value={body} onChange={e => setBody(e.target.value)} placeholder={t("নিজের ভাষায় লেখো…", "Write in your own words…")} /></label><label className="check-line"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />{t("উপরে পিন করো", "Pin to top")}</label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><NotebookPen size={16} />{t("সেভ করো", "Save")}</button></div></form></Modal>;
}

function VideosTab() {
  const { data, setData, confirm, notify, openChapter } = usePlanner();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'oneShot' | 'cq' | 'mcq'>('all');
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);
  const [open, setOpen] = useState(false);

  const videos = data.videos
    .filter(video => (subject === 'all' || video.subject === subject) && `${video.title} ${video.channel || ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt.localeCompare(a.createdAt));

  const q = query.trim().toLowerCase();
  const archiveChapters = CHAPTERS.filter(chapter => {
    if (subject !== 'all' && chapter.subject !== subject) return false;
    const links = CHAPTER_CLASSES[chapter.id];
    if (!links) return false;
    const pool = kindFilter === 'all' ? [...links.oneShot, ...links.cq, ...links.mcq] : links[kindFilter];
    if (unwatchedOnly && !pool.some(opt => !isWatched(data, opt.url))) return false;
    if (!q) return true;
    const teachers = pool.map(opt => opt.channel).join(' ');
    const lessons = (BANGLA_LESSONS[chapter.id] || []).map(l => `${l.title} ${l.channel || ''}`).join(' ');
    return `${chapter.title} ${chapter.focus} ${subjectById[chapter.subject].name} ${teachers} ${lessons}`.toLowerCase().includes(q);
  });

  const overall = classProgress(data);

  return <section className="card library-panel">
    <div className="card-heading">
      <div>
        <h2><Youtube size={20} />{t("YouTube ক্লাস ভান্ডার ও সংরক্ষিত লিংক", "YouTube class archive & saved links")}</h2>
        <p>{t(`সব ৭টি বিষয়ের ১১৪টি অধ্যায়ের যাচাইকৃত সরাসরি ক্লাস (${bn(overall.watched)}/${bn(overall.total)}টি দেখা হয়েছে) এবং তোমার নিজের যোগ করা ভিডিও।`, `Verified direct classes across all 7 subjects & 114 chapters (${overall.watched}/${overall.total} watched) plus your own saved links.`)}</p>
      </div>
      <button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />{t("ভিডিও যোগ করো", "Add a video")}</button>
    </div>

    <div className="filter-bar">
      <label className="search-field">
        <Search size={17} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("অধ্যায়, শিক্ষক বা চ্যানেল খুঁজো (যেমন: মাশরুর, জৈব রসায়ন, সমাস)…", "Search chapter, teacher or channel…")} aria-label={t("ভিডিও খুঁজো", "Search videos")} />
      </label>
      <select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')} aria-label={t("বিষয় ফিল্টার", "Subject filter")}>
        <option value="all">{t("সব বিষয়", "All subjects")}</option>
        {SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="segmented small">
        {(['all', 'oneShot', 'cq', 'mcq'] as const).map(k => (
          <button key={k} type="button" className={kindFilter === k ? 'active' : ''} onClick={() => setKindFilter(k)}>
            {k === 'all' ? t('সব ব্লক', 'All') : k === 'oneShot' ? t('ওয়ান শট', 'One-Shot') : k === 'cq' ? t('CQ সলভিং', 'CQ') : t('MCQ সলভিং', 'MCQ')}
          </button>
        ))}
      </div>
      <button type="button" className={`button ${unwatchedOnly ? 'primary' : 'secondary'} small`} aria-pressed={unwatchedOnly} onClick={() => setUnwatchedOnly(v => !v)}>
        {t('শুধু দেখা বাকি', 'Unwatched only')}
      </button>
    </div>

    {videos.length > 0 && (
      <div className="saved-videos-section">
        <h3 className="archive-section-heading">{t(`আমার যোগ করা লিংক (${bn(videos.length)}টি)`, `My saved links (${videos.length})`)}</h3>
        <div className="video-grid">
          {videos.map(video => <article key={video.id} className={`card video-card ${video.watched ? 'watched' : ''}`}>
            <div className="video-top"><span className="video-icon" style={{ color: subjectById[video.subject].color, background: subjectById[video.subject].tint }}><Youtube size={18} /></span><div><h3>{video.title}</h3><p>{video.channel || 'YouTube'} · {subjectById[video.subject].name}</p></div><button className={`icon-button ${video.favorite ? 'active' : ''}`} aria-label={video.favorite ? 'প্রিয় থেকে সরাও' : 'প্রিয়তে রাখো'} onClick={() => setData(d => ({ ...d, videos: d.videos.map(item => item.id === video.id ? { ...item, favorite: !item.favorite } : item) }))}><Star size={16} fill={video.favorite ? 'currentColor' : 'none'} /></button></div>
            {video.chapterId && chapterById[video.chapterId] && <p className="video-chapter">{chapterById[video.chapterId].title}</p>}
            <div className="video-actions"><a className="button secondary small" href={video.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t("দেখো", "Open")}</a><button className={`button ${video.watched ? 'ghost' : 'secondary'} small`} onClick={() => setData(d => ({ ...d, videos: d.videos.map(item => item.id === video.id ? { ...item, watched: !item.watched } : item) }))}>{video.watched ? 'দেখা হয়েছে' : 'দেখা হয়নি'}</button><button className="icon-button delete-button" aria-label={t("ভিডিও মুছো", "Delete video")} onClick={() => confirm({ title: 'ভিডিওর লিংক মুছে ফেলবে?', message: video.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, videos: d.videos.filter(item => item.id !== video.id) })); notify('ভিডিও মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={15} /></button></div>
          </article>)}
        </div>
      </div>
    )}

    <div className="builtin-archive-section">
      <div className="archive-section-bar">
        <h3 className="archive-section-heading">{t(`অধ্যায়ভিত্তিক সরাসরি ক্লাস আর্কাইভ (${bn(archiveChapters.length)}টি অধ্যায়)`, `Chapter-wise direct class archive (${archiveChapters.length} chapters)`)}</h3>
        <span className="tiny-muted">{t('এক ক্লিকে ওয়ান শট · CQ · MCQ ক্লাস', '1-click One-Shot · CQ · MCQ classes')}</span>
      </div>

      {archiveChapters.length > 0 ? (
        <div className="archive-chapter-list">
          {archiveChapters.map(chapter => {
            const full = CHAPTER_CLASSES[chapter.id];
            const filtered = kindFilter === 'all' ? full : {
              oneShot: kindFilter === 'oneShot' ? full.oneShot : [],
              cq: kindFilter === 'cq' ? full.cq : [],
              mcq: kindFilter === 'mcq' ? full.mcq : [],
            };
            const lessons = BANGLA_LESSONS[chapter.id];
            return (
              <article key={chapter.id} className="archive-chapter-card">
                <div className="archive-chapter-head">
                  <div className="archive-chapter-meta">
                    <SubjectBadge subject={chapter.subject} small />
                    <span className="paper-chip">{chapter.paper === 1 ? t('১ম পত্র', '1st Paper') : t('২য় পত্র', '2nd Paper')} · {t('পাঠ/অধ্যায়', 'Ch.')} {bn(chapter.number)}</span>
                    {chapter.priority === 'A' && <span className="priority-badge a">A</span>}
                  </div>
                  <button type="button" className="archive-chapter-title" onClick={() => openChapter(chapter)}>
                    <strong>{chapter.title}</strong>
                  </button>
                </div>
                {kindFilter === 'all' ? (
                  <ClassBlock classes={filtered} compact />
                ) : (
                  <div className="class-link-row">
                    {filtered[kindFilter].map(opt => {
                      const watched = isWatched(data, opt.url);
                      return <span key={opt.url} className={`class-pill ${watched ? 'watched' : ''}`}>
                        <a className="class-link real" href={opt.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} className="class-play-icon" />
                          <span className="class-channel">{opt.channel}</span>
                        </a>
                        <button type="button" className={`class-watch ${watched ? 'on' : ''}`} aria-pressed={watched} onClick={() => setData(d => toggleClassWatched(d, opt.url))} aria-label={`${opt.channel} দেখা টগল`}>
                          ✓
                        </button>
                      </span>;
                    })}
                  </div>
                )}
                {kindFilter === 'all' && lessons && lessons.length > 0 && <LessonList lessons={lessons} />}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title={t("মিলে যাওয়া ক্লাস নেই", "No matching classes")} description={t("ফিল্টার বা সার্চ শব্দ বদলে আবার চেষ্টা করো।", "Try changing the subject filter or search keyword.")} />
      )}
    </div>

    {open && <VideoModal onClose={() => setOpen(false)} />}
  </section>;
}

function VideoModal({ onClose }: { onClose: () => void }) {
  const { data, setData, notify } = usePlanner();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [channel, setChannel] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !/^https?:\/\//i.test(url.trim())) { setError('শিরোনাম আর http(s) লিংক দাও।'); return; }
    if (data.videos.length >= 1000) { setError('সর্বোচ্চ ১০০০টি ভিডিও রাখা যায়।'); return; }
    const entry: VideoLink = { id: newId(), title: title.trim(), url: url.trim(), subject, chapterId: chapterId || undefined, channel: channel.trim() || undefined, watched: false, favorite: false, downloaded: false, watchedPositionSec: 0, watchedPercent: 0, playbackSpeed: 1, completed: false, createdAt: nowIso() };
    setData(d => ({ ...d, videos: [...d.videos, entry] }));
    notify('ভিডিও লাইব্রেরিতে যোগ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={t("YouTube লিংক যোগ করো", "Add a YouTube link")} onClose={onClose}><form onSubmit={submit} className="form-grid"><label>{t("শিরোনাম", "Title")}<input data-autofocus value={title} maxLength={300} onChange={e => setTitle(e.target.value)} required /></label><label>{t("লিংক", "Link")}<input type="url" value={url} maxLength={2000} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/…" required /></label><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>{t("চ্যানেল/শিক্ষক", "Channel / teacher")}<input value={channel} maxLength={120} onChange={e => setChannel(e.target.value)} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><Link2 size={16} />{t("যোগ করো", "Add")}</button></div></form></Modal>;
}

function FormulasTab() {
  const { data, setData, confirm, notify } = usePlanner();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [open, setOpen] = useState(false);
  const formulas = [...STARTER_FORMULAS.map(item => ({ ...item, custom: false })), ...data.formulas.map(item => ({ ...item, custom: true }))];
  const visible = formulas.filter(item => (subject === 'all' || item.subject === subject) && `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase()));
  const toggleFavorite = (id: string) => setData(d => ({ ...d, formulaFavorites: d.formulaFavorites.includes(id) ? d.formulaFavorites.filter(item => item !== id) : [...d.formulaFavorites, id].slice(-1000) }));
  return <section className="card library-panel">
    <div className="card-heading"><div><h2><BookOpen size={20} />{t("সূত্র ও সংজ্ঞা", "Formulas & definitions")}</h2><p>প্রাথমিক সূত্রের তালিকা সঙ্গে দেওয়া; নিজের সূত্র শিটও যোগ করতে পারো। পাঠ্যবই ও শিক্ষকের নির্দেশনা চূড়ান্ত।</p></div><button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />{t("সূত্র যোগ করো", "Add a formula")}</button></div>
    <div className="filter-bar"><label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("সূত্র খুঁজো…", "Search formulas…")} aria-label={t("সূত্র খুঁজো", "Search formulas")} /></label><select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">{t("সব বিষয়", "All subjects")}</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className={`button ${data.formulaFavorites.length ? 'secondary' : 'ghost'} small`} onClick={() => setData(d => ({ ...d, formulaFavorites: [] }))}><Filter size={15} />প্রিয় ({bn(data.formulaFavorites.length)})</button></div>
    {visible.length ? <div className="formula-grid">{visible.map(formula => <article key={formula.id} className="card formula-card"><div className="formula-top"><span className="formula-subject" style={{ color: subjectById[formula.subject].color }}>{subjectById[formula.subject].short}</span><button className={`icon-button ${data.formulaFavorites.includes(formula.id) ? 'active' : ''}`} aria-label={t("প্রিয় সূত্র", "Favourite formulas")} onClick={() => toggleFavorite(formula.id)}><Star size={15} fill={data.formulaFavorites.includes(formula.id) ? 'currentColor' : 'none'} /></button></div><h3>{formula.title}</h3><pre>{formula.body}</pre>{formula.chapterId && chapterById[formula.chapterId] && <p className="formula-chapter">{chapterById[formula.chapterId].title}</p>}{formula.custom && <button className="text-button delete-link" onClick={() => confirm({ title: 'সূত্রটি মুছে ফেলবে?', message: formula.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, formulas: d.formulas.filter(item => item.id !== formula.id) })); notify('সূত্র মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={13} />{t("মুছো", "Delete")}</button>}</article>)}</div> : <EmptyState title={t("সূত্র পাওয়া যায়নি", "No formula found")} description="অন্য শব্দ বা বিষয় দিয়ে খুঁজো।" />}
    {open && <FormulaModal onClose={() => setOpen(false)} />}
  </section>;
}

function FormulaModal({ onClose }: { onClose: () => void }) {
  const { data, setData, notify } = usePlanner();
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) { setError('সূত্রের নাম ও বিবরণ লেখো।'); return; }
    if (data.formulas.length >= 1000) { setError('সর্বোচ্চ ১০০০টি নিজের সূত্র রাখা যায়।'); return; }
    const entry: FormulaEntry = { id: newId(), subject, chapterId: chapterId || undefined, title: title.trim(), body: body.trim(), favorite: false, createdAt: nowIso() };
    setData(d => ({ ...d, formulas: [...d.formulas, entry] }));
    notify('সূত্র যোগ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={t("নিজের সূত্র যোগ করো", "Add your own formula")} onClose={onClose}><form onSubmit={submit} className="form-grid"><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>{t("শিরোনাম", "Title")}<input data-autofocus value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={t("যেমন: লব্ধি নির্ণয়", "e.g. find the resultant")} /></label><label className="full-span">{t("সূত্র / বিবরণ", "Formula / details")}<textarea rows={5} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} placeholder="R = √(P² + Q² + 2PQ cosθ)" /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><BookOpen size={16} />{t("সেভ করো", "Save")}</button></div></form></Modal>;
}

function BoardsTab() {
  const { data, setData, confirm, notify } = usePlanner();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [type, setType] = useState<'all' | 'CQ' | 'MCQ'>('all');
  const [open, setOpen] = useState(false);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const questions = data.boardQuestions.filter(question => (subject === 'all' || question.subject === subject) && (type === 'all' || question.type === type) && (!onlyMarked || question.bookmarked) && `${question.text} ${question.board} ${question.year}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.bookmarked) - Number(a.bookmarked) || b.year - a.year);
  return <section className="card library-panel">
    <div className="card-heading"><div><h2><BookMarked size={20} />{t("বোর্ড প্রশ্ন লাইব্রেরি", "Board question library")}</h2><p>নিজে দেখা/সংগ্রহ করা বোর্ড প্রশ্নের নোট এখানে রাখো। প্রশ্নের পূর্ণ টেক্সট নিজে লিখে যোগ করো; অ্যাপ কোনো বোর্ডের কপিরাইট করা প্রশ্নপত্র সংযুক্ত করে না।</p></div><button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />{t("প্রশ্ন যোগ করো", "Add a question")}</button></div>
    <div className="filter-bar"><label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("প্রশ্ন, বোর্ড বা সাল খুঁজো…", "Search question, board or year…")} aria-label={t("বোর্ড প্রশ্ন খুঁজো", "Search board questions")} /></label><select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">{t("সব বিষয়", "All subjects")}</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="segmented small">{(['all', 'CQ', 'MCQ'] as const).map(value => <button key={value} className={type === value ? 'active' : ''} onClick={() => setType(value)}>{value === 'all' ? 'সব' : value}</button>)}</div><button className={`button ${onlyMarked ? 'primary' : 'secondary'} small`} onClick={() => setOnlyMarked(!onlyMarked)}><Star size={14} />{t("গুরুত্বপূর্ণ", "Important")}</button></div>
    {questions.length ? <div className="board-list">{questions.map(question => <article key={question.id} className={`board-card ${question.bookmarked ? 'marked' : ''}`}><div className="board-top"><span className="board-meta">{question.board} · {bn(question.year)} · {question.type} · {bn(question.marks)} নম্বর</span><SubjectBadge subject={question.subject} small /><button className={`icon-button ${question.bookmarked ? 'active' : ''}`} aria-label={t("গুরুত্বপূর্ণ চিহ্নিত করো", "Mark as important")} onClick={() => setData(d => ({ ...d, boardQuestions: d.boardQuestions.map(item => item.id === question.id ? { ...item, bookmarked: !item.bookmarked } : item) }))}><Star size={15} fill={question.bookmarked ? 'currentColor' : 'none'} /></button></div><p>{question.text}</p>{question.chapterId && chapterById[question.chapterId] && <span className="board-chapter">{chapterById[question.chapterId].title}</span>}<button className="text-button delete-link" onClick={() => confirm({ title: 'প্রশ্নটি মুছে ফেলবে?', message: question.text, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, boardQuestions: d.boardQuestions.filter(item => item.id !== question.id) })); notify('প্রশ্ন মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={13} />{t("মুছো", "Delete")}</button></article>)}</div> : <EmptyState title={t("প্রশ্ন লাইব্রেরি খালি", "The question library is empty")} description="বিগত বোর্ডের গুরুত্বপূর্ণ প্রশ্ন, বছর ও অধ্যায়সহ যোগ করো।" action={<button className="button primary" onClick={() => setOpen(true)}>{t("প্রথম প্রশ্ন যোগ করো", "Add the first question")}</button>} />}
    {open && <BoardModal onClose={() => setOpen(false)} />}
  </section>;
}

function BoardModal({ onClose }: { onClose: () => void }) {
  const { data, setData, notify } = usePlanner();
  const [board, setBoard] = useState('ঢাকা');
  const [year, setYear] = useState('2025');
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [type, setType] = useState<'CQ' | 'MCQ'>('CQ');
  const [text, setText] = useState('');
  const [marks, setMarks] = useState('10');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const marksValue = Number(marks);
    const yearValue = Number(year);
    if (!text.trim() || !Number.isFinite(marksValue) || marksValue < 0 || marksValue > 100) { setError('প্রশ্ন ও সঠিক নম্বর লেখো।'); return; }
    if (!Number.isSafeInteger(yearValue) || yearValue < 1990 || yearValue > 2041) { setError('সাল ১৯৯০ থেকে ২০৪১-এর মধ্যে হতে হবে।'); return; }
    if (data.boardQuestions.length >= 2000) { setError('সর্বোচ্চ ২০০০টি প্রশ্ন রাখা যায়।'); return; }
    const entry: BoardQuestion = { id: newId(), board: board.trim() || 'বোর্ড', year: yearValue, subject, chapterId: chapterId || undefined, type, text: text.trim(), marks: marksValue, bookmarked: false, createdAt: nowIso() };
    setData(d => ({ ...d, boardQuestions: [...d.boardQuestions, entry] }));
    notify('বোর্ড প্রশ্ন লাইব্রেরিতে যোগ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={t("বোর্ড প্রশ্ন যোগ করো", "Add a board question")} onClose={onClose} wide><form onSubmit={submit}><div className="form-grid"><label>{t("বোর্ড", "Board")}<input value={board} maxLength={60} onChange={e => setBoard(e.target.value)} /></label><label>{t("সাল", "Year")}<input type="number" min={1990} max={2041} value={year} onChange={e => setYear(e.target.value)} /></label><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("ঐচ্ছিক", "Optional")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>{t("ধরন", "Type")}<select value={type} onChange={e => setType(e.target.value as 'CQ' | 'MCQ')}><option value="CQ">CQ</option><option value="MCQ">MCQ</option></select></label><label>{t("নম্বর", "Marks")}<input type="number" min={0} max={100} value={marks} onChange={e => setMarks(e.target.value)} /></label></div><label className="form-label">{t("প্রশ্ন", "Question")}<textarea data-autofocus rows={5} maxLength={5000} value={text} onChange={e => setText(e.target.value)} placeholder={t("প্রশ্নটি লিখো…", "Write the question…")} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><FileText size={16} />{t("সেভ করো", "Save")}</button></div></form></Modal>;
}
