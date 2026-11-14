import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookMarked, BookOpen, Download, ExternalLink, FileText, Filter, Link2, NotebookPen, Pin, Plus, Search, Star, Trash2, Youtube } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, SUBJECTS, chapterById, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, formatDate } from '../planner';
import { STARTER_FORMULAS } from '../quiz-data';
import { newId, nowIso } from '../storage';
import { downloadText } from '../exports';
import type { BoardQuestion, FormulaEntry, PersonalNote, VideoLink } from '../types';
import { EmptyState, Modal, PageHeading, SubjectBadge } from '../components';

type Tab = 'notes' | 'videos' | 'formulas' | 'boards';
const TABS: { id: Tab; label: string }[] = [
  { id: 'notes', label: 'নোট' }, { id: 'videos', label: 'YouTube' }, { id: 'formulas', label: 'সূত্র' }, { id: 'boards', label: 'বোর্ড প্রশ্ন' },
];
export default function LibraryView() {
  const { data } = usePlanner();
  const [tab, setTab] = useState<Tab>('notes');
  const counts: Record<Tab, number> = { notes: data.libraryNotes.length, videos: data.videos.length, formulas: STARTER_FORMULAS.length + data.formulas.length, boards: data.boardQuestions.length };
  return <div className="view library-view">
    <PageHeading eyebrow="YOUR OWN SHELF" title="নিজের সংগ্রহ, নিজের হাতে।" description="নোট, ভিডিও, সূত্র আর বোর্ড প্রশ্ন—সব এক জায়গায়। ইন্টারনেট লাগবে শুধু ভিডিও দেখতে; বাকি সব অফলাইনে থাকে।" action={<div className="library-total"><strong>{bn(Object.values(counts).reduce((sum, value) => sum + value, 0))}</strong><span>টি সংগ্রহ<br />এই ডিভাইসে</span></div>} />
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
    <div className="card-heading"><div><h2><NotebookPen size={20} />নোট লাইব্রেরি</h2><p>দিনের নোটের বাইরে বড় নোট, সূত্র-ব্যাখ্যা বা ভাবনা লিখে রাখো।</p></div><div className="heading-actions"><button className="button secondary small" onClick={exportNotes}><Download size={15} />Markdown</button><button className="button primary" onClick={() => setOpen('new')}><Plus size={16} />নোট লেখো</button></div></div>
    <label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="নোট, ট্যাগ বা অধ্যায় খুঁজো…" aria-label="নোট খুঁজো" /></label>
    {notes.length ? <div className="note-grid">{notes.map(note => <article className={`card personal-note ${note.pinned ? 'pinned' : ''}`} key={note.id}><div className="personal-note-top"><SubjectBadge subject={note.subject || 'physics'} small />{note.pinned && <span className="pin-pill"><Pin size={11} />পিন</span>}<button className={`icon-button ${note.pinned ? 'active' : ''}`} aria-label={note.pinned ? 'পিন সরাও' : 'পিন করো'} onClick={() => setData(d => ({ ...d, libraryNotes: d.libraryNotes.map(item => item.id === note.id ? { ...item, pinned: !item.pinned, updatedAt: nowIso() } : item) }))}><Pin size={14} /></button></div><h3>{note.title}</h3><p className="note-preview">{note.body}</p><div className="note-tags">{note.tags.map(tag => <span key={tag}>{tag}</span>)}{note.chapterId && chapterById[note.chapterId] && <span className="chapter-tag">{chapterById[note.chapterId].title}</span>}</div><div className="personal-note-foot"><span>{formatDate(note.updatedAt.slice(0, 10))}</span><div><button className="text-button" onClick={() => setOpen(note)}>সম্পাদনা</button><button className="icon-button delete-button" aria-label="নোট মুছো" onClick={() => confirm({ title: 'নোটটি মুছে ফেলবে?', message: note.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, libraryNotes: d.libraryNotes.filter(item => item.id !== note.id) })); notify('নোট মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={14} /></button></div></div></article>)}</div> : <EmptyState title={query ? 'মিলে যাওয়া নোট নেই' : 'প্রথম নোটটি লেখো'} description={query ? 'অন্য শব্দ দিয়ে খুঁজো।' : 'অধ্যায়ের মূল ধারণা নিজের ভাষায় লিখলে মনে থাকে অনেক বেশি।'} action={!query && <button className="button primary" onClick={() => setOpen('new')}>নোট লেখো</button>} />}
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
    const stamp = nowIso();
    const entry: PersonalNote = { id: note?.id || newId(), title: title.trim(), body, subject: subject || undefined, chapterId: chapterId || undefined, tags: tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 10), pinned, createdAt: note?.createdAt || stamp, updatedAt: stamp };
    setData(d => ({ ...d, libraryNotes: note ? d.libraryNotes.map(item => item.id === note.id ? entry : item) : [...d.libraryNotes, entry] }));
    notify(note ? 'নোট আপডেট হয়েছে।' : 'নোট সেভ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={note ? 'নোট সম্পাদনা' : 'নতুন নোট'} onClose={onClose} wide><form onSubmit={submit}><div className="form-grid"><label>শিরোনাম<input data-autofocus value={title} maxLength={200} onChange={e => setTitle(e.target.value)} required /></label><label>বিষয়<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId | ''); setChapterId(''); }}><option value="">সাধারণ</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>অধ্যায়<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">ঐচ্ছিক</option>{CHAPTERS.filter(chapter => !subject || chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>ট্যাগ<input value={tags} maxLength={200} onChange={e => setTags(e.target.value)} placeholder="কমা দিয়ে আলাদা করো" /></label></div><label className="form-label">নোট<textarea rows={8} maxLength={20000} value={body} onChange={e => setBody(e.target.value)} placeholder="নিজের ভাষায় লেখো…" /></label><label className="check-line"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />উপরে পিন করো</label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button className="button primary" type="submit"><NotebookPen size={16} />সেভ করো</button></div></form></Modal>;
}

function VideosTab() {
  const { data, setData, confirm, notify } = usePlanner();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<SubjectId | 'all'>('all');
  const [open, setOpen] = useState(false);
  const videos = data.videos.filter(video => (subject === 'all' || video.subject === subject) && `${video.title} ${video.channel || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt.localeCompare(a.createdAt));
  return <section className="card library-panel">
    <div className="card-heading"><div><h2><Youtube size={20} />YouTube লাইব্রেরি</h2><p>পছন্দের ক্লাস/প্লেলিস্টের লিংক রাখো। ভিডিও দেখতে ইন্টারনেট লাগবে; বাকি অ্যাপ অফলাইনে চলবে।</p></div><button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />ভিডিও যোগ করো</button></div>
    <div className="filter-bar"><label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ভিডিও বা চ্যানেল খুঁজো…" aria-label="ভিডিও খুঁজো" /></label><select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">সব বিষয়</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {videos.length ? <div className="video-grid">{videos.map(video => <article key={video.id} className={`card video-card ${video.watched ? 'watched' : ''}`}><div className="video-top"><span className="video-icon" style={{ color: subjectById[video.subject].color, background: subjectById[video.subject].tint }}><Youtube size={18} /></span><div><h3>{video.title}</h3><p>{video.channel || 'YouTube'} · {subjectById[video.subject].name}</p></div><button className={`icon-button ${video.favorite ? 'active' : ''}`} aria-label={video.favorite ? 'প্রিয় থেকে সরাও' : 'প্রিয়তে রাখো'} onClick={() => setData(d => ({ ...d, videos: d.videos.map(item => item.id === video.id ? { ...item, favorite: !item.favorite } : item) }))}><Star size={16} fill={video.favorite ? 'currentColor' : 'none'} /></button></div>{video.chapterId && chapterById[video.chapterId] && <p className="video-chapter">{chapterById[video.chapterId].title}</p>}<div className="video-actions"><a className="button secondary small" href={video.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />দেখো</a><button className={`button ${video.watched ? 'ghost' : 'secondary'} small`} onClick={() => setData(d => ({ ...d, videos: d.videos.map(item => item.id === video.id ? { ...item, watched: !item.watched } : item) }))}>{video.watched ? 'দেখা হয়েছে' : 'দেখা হয়নি'}</button><button className="icon-button delete-button" aria-label="ভিডিও মুছো" onClick={() => confirm({ title: 'ভিডিওর লিংক মুছে ফেলবে?', message: video.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, videos: d.videos.filter(item => item.id !== video.id) })); notify('ভিডিও মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={15} /></button></div></article>)}</div> : <EmptyState title="ভিডিও লাইব্রেরি খালি" description="বিষয়ভিত্তিক ক্লাস, প্লেলিস্ট বা শিক্ষকের চ্যানেলের লিংক যোগ করো।" action={<button className="button primary" onClick={() => setOpen(true)}>প্রথম ভিডিও যোগ করো</button>} />}
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
    const entry: VideoLink = { id: newId(), title: title.trim(), url: url.trim(), subject, chapterId: chapterId || undefined, channel: channel.trim() || undefined, watched: false, favorite: false, createdAt: nowIso() };
    setData(d => ({ ...d, videos: [...d.videos, entry] }));
    notify('ভিডিও লাইব্রেরিতে যোগ হয়েছে।', 'success'); onClose();
  };
  return <Modal title="YouTube লিংক যোগ করো" onClose={onClose}><form onSubmit={submit} className="form-grid"><label>শিরোনাম<input data-autofocus value={title} maxLength={300} onChange={e => setTitle(e.target.value)} required /></label><label>লিংক<input type="url" value={url} maxLength={2000} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/…" required /></label><label>বিষয়<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>অধ্যায়<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">ঐচ্ছিক</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>চ্যানেল/শিক্ষক<input value={channel} maxLength={120} onChange={e => setChannel(e.target.value)} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button className="button primary" type="submit"><Link2 size={16} />যোগ করো</button></div></form></Modal>;
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
    <div className="card-heading"><div><h2><BookOpen size={20} />সূত্র ও সংজ্ঞা</h2><p>প্রাথমিক সূত্রের তালিকা সঙ্গে দেওয়া; নিজের সূত্র শিটও যোগ করতে পারো। পাঠ্যবই ও শিক্ষকের নির্দেশনা চূড়ান্ত।</p></div><button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />সূত্র যোগ করো</button></div>
    <div className="filter-bar"><label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="সূত্র খুঁজো…" aria-label="সূত্র খুঁজো" /></label><select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">সব বিষয়</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className={`button ${data.formulaFavorites.length ? 'secondary' : 'ghost'} small`} onClick={() => setData(d => ({ ...d, formulaFavorites: [] }))}><Filter size={15} />প্রিয় ({bn(data.formulaFavorites.length)})</button></div>
    {visible.length ? <div className="formula-grid">{visible.map(formula => <article key={formula.id} className="card formula-card"><div className="formula-top"><span className="formula-subject" style={{ color: subjectById[formula.subject].color }}>{subjectById[formula.subject].short}</span><button className={`icon-button ${data.formulaFavorites.includes(formula.id) ? 'active' : ''}`} aria-label="প্রিয় সূত্র" onClick={() => toggleFavorite(formula.id)}><Star size={15} fill={data.formulaFavorites.includes(formula.id) ? 'currentColor' : 'none'} /></button></div><h3>{formula.title}</h3><pre>{formula.body}</pre>{formula.chapterId && chapterById[formula.chapterId] && <p className="formula-chapter">{chapterById[formula.chapterId].title}</p>}{formula.custom && <button className="text-button delete-link" onClick={() => confirm({ title: 'সূত্রটি মুছে ফেলবে?', message: formula.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, formulas: d.formulas.filter(item => item.id !== formula.id) })); notify('সূত্র মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={13} />মুছো</button>}</article>)}</div> : <EmptyState title="সূত্র পাওয়া যায়নি" description="অন্য শব্দ বা বিষয় দিয়ে খুঁজো।" />}
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
  return <Modal title="নিজের সূত্র যোগ করো" onClose={onClose}><form onSubmit={submit} className="form-grid"><label>বিষয়<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>অধ্যায়<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">ঐচ্ছিক</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>শিরোনাম<input data-autofocus value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="যেমন: লব্ধি নির্ণয়" /></label><label className="full-span">সূত্র / বিবরণ<textarea rows={5} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} placeholder="R = √(P² + Q² + 2PQ cosθ)" /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button className="button primary" type="submit"><BookOpen size={16} />সেভ করো</button></div></form></Modal>;
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
    <div className="card-heading"><div><h2><BookMarked size={20} />বোর্ড প্রশ্ন লাইব্রেরি</h2><p>নিজে দেখা/সংগ্রহ করা বোর্ড প্রশ্নের নোট এখানে রাখো। প্রশ্নের পূর্ণ টেক্সট নিজে লিখে যোগ করো; অ্যাপ কোনো বোর্ডের কপিরাইট করা প্রশ্নপত্র সংযুক্ত করে না।</p></div><button className="button primary" onClick={() => setOpen(true)}><Plus size={16} />প্রশ্ন যোগ করো</button></div>
    <div className="filter-bar"><label className="search-field"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="প্রশ্ন, বোর্ড বা সাল খুঁজো…" aria-label="বোর্ড প্রশ্ন খুঁজো" /></label><select value={subject} onChange={e => setSubject(e.target.value as SubjectId | 'all')}><option value="all">সব বিষয়</option>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="segmented small">{(['all', 'CQ', 'MCQ'] as const).map(value => <button key={value} className={type === value ? 'active' : ''} onClick={() => setType(value)}>{value === 'all' ? 'সব' : value}</button>)}</div><button className={`button ${onlyMarked ? 'primary' : 'secondary'} small`} onClick={() => setOnlyMarked(!onlyMarked)}><Star size={14} />গুরুত্বপূর্ণ</button></div>
    {questions.length ? <div className="board-list">{questions.map(question => <article key={question.id} className={`board-card ${question.bookmarked ? 'marked' : ''}`}><div className="board-top"><span className="board-meta">{question.board} · {bn(question.year)} · {question.type} · {bn(question.marks)} নম্বর</span><SubjectBadge subject={question.subject} small /><button className={`icon-button ${question.bookmarked ? 'active' : ''}`} aria-label="গুরুত্বপূর্ণ চিহ্নিত করো" onClick={() => setData(d => ({ ...d, boardQuestions: d.boardQuestions.map(item => item.id === question.id ? { ...item, bookmarked: !item.bookmarked } : item) }))}><Star size={15} fill={question.bookmarked ? 'currentColor' : 'none'} /></button></div><p>{question.text}</p>{question.chapterId && chapterById[question.chapterId] && <span className="board-chapter">{chapterById[question.chapterId].title}</span>}<button className="text-button delete-link" onClick={() => confirm({ title: 'প্রশ্নটি মুছে ফেলবে?', message: question.text, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, boardQuestions: d.boardQuestions.filter(item => item.id !== question.id) })); notify('প্রশ্ন মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={13} />মুছো</button></article>)}</div> : <EmptyState title="প্রশ্ন লাইব্রেরি খালি" description="বিগত বোর্ডের গুরুত্বপূর্ণ প্রশ্ন, বছর ও অধ্যায়সহ যোগ করো।" action={<button className="button primary" onClick={() => setOpen(true)}>প্রথম প্রশ্ন যোগ করো</button>} />}
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
  return <Modal title="বোর্ড প্রশ্ন যোগ করো" onClose={onClose} wide><form onSubmit={submit}><div className="form-grid"><label>বোর্ড<input value={board} maxLength={60} onChange={e => setBoard(e.target.value)} /></label><label>সাল<input type="number" min={1990} max={2041} value={year} onChange={e => setYear(e.target.value)} /></label><label>বিষয়<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>অধ্যায়<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">ঐচ্ছিক</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label><label>ধরন<select value={type} onChange={e => setType(e.target.value as 'CQ' | 'MCQ')}><option value="CQ">CQ</option><option value="MCQ">MCQ</option></select></label><label>নম্বর<input type="number" min={0} max={100} value={marks} onChange={e => setMarks(e.target.value)} /></label></div><label className="form-label">প্রশ্ন<textarea data-autofocus rows={5} maxLength={5000} value={text} onChange={e => setText(e.target.value)} placeholder="প্রশ্নটি লিখো…" /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button className="button primary" type="submit"><FileText size={16} />সেভ করো</button></div></form></Modal>;
}
