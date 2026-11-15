import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, NotebookPen, Search, Timer } from 'lucide-react';
import { CHAPTERS, PAPERS, SUBJECTS, subjectById } from './data';
import type { Chapter, SubjectId } from './data';
import { bn, chapterTasks, formatDate, formatDayOffset, formatTime, isChapterDone, percent, phaseName } from './planner';
import { MISTAKE_LIMIT, newId, nowIso } from './storage';
import { chapterMeta, updateChapterMeta } from './study';
import { scheduleFor } from './schedule';
import { BANGLA_LESSONS, classLinksFor } from './classLinks';
import { INTERVAL_LABEL } from './revision';
import { usePlanner } from './context';
import { ClassBlock, EmptyState, LessonList, Modal, ProgressBar, SubjectBadge } from './components';

const PRIORITY_LABEL: Record<string, string> = { A: 'আগে পড়ো', B: 'এরপর পড়ো', C: 'সময় থাকলে' };
const PREP_LABEL = { none: 'শুরু হয়নি', practicing: 'অনুশীলনে', ready: 'প্রস্তুত' } as const;

export function ChapterModal({ chapter: c, onClose }: { chapter: Chapter; onClose: () => void }) {
  const { plan, data, setData, navigate, toggleTask, startTimer } = usePlanner();
  const tasks = chapterTasks(plan, c.id), done = tasks.filter(task => data.completed[task.id]).length;
  const meta = chapterMeta(data, c.id);
  const revisions = data.revisions.filter(item => item.chapterId === c.id && !item.completedAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return <Modal title={c.title} onClose={onClose} wide>
    <div className="chapter-modal-meta"><SubjectBadge subject={c.subject} /><span>পত্র {bn(c.paper)} · পাঠ/অধ্যায় {bn(c.number)}</span><span className={`priority-badge ${c.priority.toLowerCase()}`}>{c.priority} · {PRIORITY_LABEL[c.priority]}</span>{meta.weak && <span className="weak-pill">দুর্বল</span>}</div>
    <p className="modal-description">{c.focus}</p>
    {(() => { const sch = scheduleFor(c.id); const links = classLinksFor(c.id); return <>
      {sch && <div className="chapter-plan-strip"><span className={`star-badge s${sch.star}`} aria-label={`গুরুত্ব ${sch.star} স্টার`}>{'★'.repeat(sch.star)}{'☆'.repeat(5 - sch.star)}</span><span><Clock3 size={14} />{bn(sch.hours)} ঘণ্টা</span><span>শেষ করতে হবে <strong>{formatDate(sch.end)}</strong></span></div>}
      {links && <ClassBlock classes={links} hint="দুই শিক্ষক, যেটা বেশি বোঝায় সেটাই খোলো — ভিডিও/প্লেলিস্ট লিংকগুলো YouTube-এ যাচাই করা।" />}
    {BANGLA_LESSONS[c.id] && <LessonList lessons={BANGLA_LESSONS[c.id]} />}
    </>; })()}
    {c.note && <div className="notice-box"><BookOpen size={18} /><p>{c.note}</p></div>}
    <div className="chapter-modal-progress"><span>{bn(done)}/{bn(tasks.length)} ধাপ শেষ · {isChapterDone(plan, c.id, data.completed) ? 'অধ্যায় সম্পন্ন' : 'প্রতিটি ধাপ আলাদাভাবে টিক দাও'}</span><ProgressBar value={percent(done, tasks.length)} /></div>
    <div className="chapter-session-list">{tasks.map(t => <div key={t.id} className="chapter-session"><button className={`task-check ${data.completed[t.id] ? 'checked' : ''}`} aria-pressed={!!data.completed[t.id]} aria-label={`${formatDate(t.date)} ধাপ সম্পন্ন`} onClick={() => toggleTask(t.id)}>{data.completed[t.id] && <Check size={16} />}</button><div><strong>{formatDate(t.date, 'long')} · ধাপ {bn(t.id.split('-').pop() || '1')}</strong><span>{formatTime(t.startMinute)}{formatDayOffset(t.startMinute)} – {formatTime(t.endMinute)}{formatDayOffset(t.endMinute)}</span><p>{t.detail}</p></div></div>)}</div>
    {!tasks.length && <EmptyState title="এই ইউনিটের তারিখ পাওয়া যায়নি" description="সেটিংস থেকে শুরুর তারিখ যাচাই করো।" />}
    <div className="chapter-tool-row">
      <button className="button secondary" onClick={() => { startTimer(c.subject, c.id); onClose(); }}><Timer size={16} />এই অধ্যায়ে টাইমার</button>
      <button className={`button secondary ${meta.weak ? 'selected' : ''}`} aria-pressed={meta.weak} onClick={() => setData(d => updateChapterMeta(d, c.id, { weak: !meta.weak }))}><NotebookPen size={16} />{meta.weak ? 'দুর্বল তালিকা থেকে সরাও' : 'দুর্বল হিসেবে রাখো'}</button>
      {tasks[0] && <button className="button secondary" onClick={() => { navigate('today', tasks[0].date); onClose(); }}>রুটিনে দেখো <ArrowRight size={16} /></button>}
    </div>
    <div className="prep-grid">
      {(['mcq', 'cq'] as const).map(kind => <div className="prep-row" key={kind}><strong>{kind === 'mcq' ? 'MCQ প্রস্তুতি' : 'CQ প্রস্তুতি'}</strong><div className="segmented small">{(['none', 'practicing', 'ready'] as const).map(level => <button key={level} className={meta[kind] === level ? 'active' : ''} aria-pressed={meta[kind] === level} onClick={() => setData(d => updateChapterMeta(d, c.id, { [kind]: level }))}>{PREP_LABEL[level]}</button>)}</div></div>)}
    </div>
    <label className="form-label">অধ্যায়ের নিজের নোট<textarea rows={4} maxLength={5000} value={meta.note} onChange={e => setData(d => updateChapterMeta(d, c.id, { note: e.target.value }))} placeholder="মূল সূত্র, বোঝার কৌশল, যেখানে আটকাও…" /></label>
    {revisions.length > 0 && <div className="chapter-revisions"><strong>এই অধ্যায়ের রিভিশন</strong>{revisions.map(item => <span key={item.id}>{INTERVAL_LABEL[item.interval]} · {formatDate(item.dueDate)}</span>)}</div>}
    <div className="confidence-section"><strong>এই অধ্যায়ে কতটা আত্মবিশ্বাসী?</strong><div>{(['weak', 'okay', 'confident'] as const).map((level, i) => <button key={level} className={`button secondary ${data.confidence[c.id] === level ? 'selected' : ''}`} aria-pressed={data.confidence[c.id] === level} onClick={() => setData(d => ({ ...d, confidence: { ...d.confidence, [c.id]: level } }))}>{['আবার দেখব', 'মোটামুটি বুঝি', 'আত্মবিশ্বাসী'][i]}</button>)}</div><small>এটি নিজের মূল্যায়ন; সম্পন্ন ধাপ বা MCQ স্কোর বদলায় না।</small></div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>বন্ধ করো</button></div>
  </Modal>;
}

export function ExamModal({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const { data, setData, plan, notify } = usePlanner();
  const paper = PAPERS.find(p => p.id === paperId)!;
  const existing = data.exams[paperId];
  const [score, setScore] = useState(existing ? String(existing.score) : '');
  const [mistakes, setMistakes] = useState(existing?.mistakes || '');
  const [error, setError] = useState('');
  const task = plan.flatMap(d => d.tasks).find(t => t.kind === 'exam' && t.paperId === paperId);
  const submit = (e: FormEvent) => {
    e.preventDefault(); const n = Number(score);
    if (!score.trim() || !Number.isFinite(n) || n < 0 || n > paper.maxScore) { setError(`০ থেকে ${bn(paper.maxScore)}-এর মধ্যে নম্বর লেখো।`); return; }
    setData(d => ({ ...d, exams: { ...d.exams, [paperId]: { score: n, total: paper.maxScore, at: nowIso(), mistakes: mistakes.trim() } }, completed: task && !d.completed[task.id] ? { ...d.completed, [task.id]: nowIso() } : d.completed }));
    notify('মডেল টেস্টের নম্বর সেভ হয়েছে। ভুলগুলো থেকে শেখা চালিয়ে যাও।'); onClose();
  };
  return <Modal title={`${paper.name} · নম্বর`} onClose={onClose}><div className="chapter-modal-meta"><SubjectBadge subject={paper.subject} /><span>{task && formatDate(task.date, 'long')}</span></div><p className="modal-description">নিজে মূল্যায়ন করা তত্ত্বীয় নম্বর লেখো। এটি বোর্ডের ফল বা GPA হিসাব নয়।</p><form onSubmit={submit}><div className="score-input-row"><label>তোমার নম্বর<input data-autofocus type="number" min={0} max={paper.maxScore} step="0.5" required value={score} onChange={e => { setScore(e.target.value); setError(''); }} placeholder="যেমন ৭২" /></label><span>/ {bn(paper.maxScore)}</span></div>{error && <p className="field-error" role="alert">{error}</p>}<label className="form-label">কোথায় নম্বর হারালে?<textarea value={mistakes} maxLength={5000} rows={5} onChange={e => setMistakes(e.target.value)} placeholder="অধ্যায়/টপিক, ভুলের কারণ, পরেরবার কী করবে…" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button type="submit" className="button primary"><Check size={16} />নম্বর সেভ করো</button></div></form></Modal>;
}

export function MistakeModal({ subject, initialText, onClose }: { subject: SubjectId; initialText: string; onClose: () => void }) {
  const { data, setData, today, notify } = usePlanner();
  const [s, setS] = useState(subject), [textValue, setTextValue] = useState(initialText), [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!textValue.trim()) { setError('কী ভুল হয়েছে, ছোট করে লেখো।'); return; }
    if (data.mistakes.length >= MISTAKE_LIMIT) { setError(`ভুলের খাতায় সর্বোচ্চ ${MISTAKE_LIMIT}টি নোট রাখা যায়। আগে কিছু নোট মুছে নাও।`); return; }
    setData(d => ({ ...d, mistakes: [...d.mistakes, { id: newId(), subject: s, text: textValue.trim(), date: today, resolved: false }] }));
    notify('ভুলের খাতায় যোগ হয়েছে। পরে শুধরে নিও।'); onClose();
  };
  return <Modal title="ভুল থেকেই শেখা" onClose={onClose}><p className="modal-description">একটি ভুল, তার কারণ, আর পরেরবার কী করবে—লিখে রাখো।</p><form onSubmit={submit}><label className="form-label">বিষয়<select value={s} onChange={e => setS(e.target.value as SubjectId)}>{SUBJECTS.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</select></label><label className="form-label">আমার নোট<textarea data-autofocus rows={5} maxLength={5000} value={textValue} onChange={e => { setTextValue(e.target.value); setError(''); }} placeholder="যেমন: ভেক্টরের ক্রস গুণে দিক ভুল করেছি। ডান হাতের নিয়ম আবার অনুশীলন করব।" /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>বাতিল</button><button className="button primary" type="submit"><NotebookPen size={16} />যোগ করো</button></div></form></Modal>;
}

export function SearchModal({ onClose, onChapter }: { onClose: () => void; onChapter: (c: Chapter) => void }) {
  const { plan, data, today, navigate, selectedDate } = usePlanner();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const chapters = (q ? CHAPTERS.filter(c => `${c.title} ${c.number} ${c.focus} ${subjectById[c.subject].name} ${subjectById[c.subject].english}`.toLowerCase().includes(q)) : CHAPTERS.filter(c => c.priority === 'A')).slice(0, 7);
  const tasks = (q ? plan.flatMap(d => d.tasks).filter(t => `${t.title} ${t.date} ${subjectById[t.subject].name}`.toLowerCase().includes(q)) : plan.find(d => d.date === selectedDate)?.tasks || []).slice(0, 8);
  const notes = (q ? data.libraryNotes.filter(note => `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(q)) : []).slice(0, 5);
  const videos = (q ? data.videos.filter(video => `${video.title} ${video.channel || ''}`.toLowerCase().includes(q)) : []).slice(0, 4);
  const questions = (q ? data.questions.filter(question => question.question.toLowerCase().includes(q)) : []).slice(0, 4);
  const formulas = (q ? data.formulas.filter(formula => `${formula.title} ${formula.body}`.toLowerCase().includes(q)) : []).slice(0, 4);
  const nothing = !chapters.length && !tasks.length && !notes.length && !videos.length && !questions.length && !formulas.length;
  return <Modal title="কী খুঁজছ?" onClose={onClose} wide><label className="search-field modal-search"><Search size={20} /><input data-autofocus value={query} onChange={e => setQuery(e.target.value)} placeholder="অধ্যায়, বিষয় বা তারিখ (YYYY-MM-DD)…" aria-label="অধ্যায় ও রুটিন খুঁজো" /><kbd>ESC</kbd></label><div className="search-results">
    {chapters.length > 0 && <><div className="search-group-label">অধ্যায় ও ইউনিট</div>{chapters.map(c => <button className="search-result" key={c.id} onClick={() => onChapter(c)}><span className="search-result-icon" style={{ color: subjectById[c.subject].color, background: subjectById[c.subject].tint } as CSSProperties}><BookOpen size={18} /></span><span><strong>{c.title}</strong><small>{subjectById[c.subject].name} · পত্র {bn(c.paper)} · অগ্রাধিকার {c.priority}</small></span><ChevronRight size={17} /></button>)}</>}
    {tasks.length > 0 && <><div className="search-group-label">{q ? 'রুটিনের সেশন' : `${formatDate(selectedDate)}-এর রুটিন`}</div>{tasks.map(t => <button className="search-result" key={t.id} onClick={() => { navigate('today', t.date); onClose(); }}><span className="search-result-icon"><CalendarDays size={18} /></span><span><strong>{t.title}</strong><small>{formatDate(t.date)} · {formatTime(t.startMinute)}{formatDayOffset(t.startMinute)} · {phaseName(t.phase)}{data.completed[t.id] ? ' · সম্পন্ন' : ''}</small></span><ArrowUpRight size={17} /></button>)}</>}
    {notes.length > 0 && <><div className="search-group-label">নোট লাইব্রেরি</div>{notes.map(note => <button className="search-result" key={note.id} onClick={() => { navigate('library'); onClose(); }}><span className="search-result-icon"><NotebookPen size={18} /></span><span><strong>{note.title}</strong><small>{note.body.slice(0, 90)}</small></span><ChevronRight size={17} /></button>)}</>}
    {questions.length > 0 && <><div className="search-group-label">প্রশ্নব্যাংক</div>{questions.map(question => <button className="search-result" key={question.id} onClick={() => { navigate('practice'); onClose(); }}><span className="search-result-icon"><BookOpen size={18} /></span><span><strong>{question.question}</strong><small>{subjectById[question.subject].name}</small></span><ChevronRight size={17} /></button>)}</>}
    {videos.length > 0 && <><div className="search-group-label">ভিডিও</div>{videos.map(video => <a className="search-result" key={video.id} href={video.url} target="_blank" rel="noreferrer"><span className="search-result-icon"><Clock3 size={18} /></span><span><strong>{video.title}</strong><small>{video.channel || 'YouTube'} · {subjectById[video.subject].name}</small></span><ArrowUpRight size={17} /></a>)}</>}
    {formulas.length > 0 && <><div className="search-group-label">সূত্র</div>{formulas.map(formula => <button className="search-result" key={formula.id} onClick={() => { navigate('library'); onClose(); }}><span className="search-result-icon"><BookOpen size={18} /></span><span><strong>{formula.title}</strong><small>{subjectById[formula.subject].name}</small></span><ChevronRight size={17} /></button>)}</>}
    {nothing && <EmptyState title="কিছু পাওয়া যায়নি" description="বিষয়ের নাম, অধ্যায়ের শব্দ বা তারিখ দিয়ে আবার খুঁজো।" />}
  </div><div className="search-footer"><span>{bn(CHAPTERS.length)} অধ্যায়/ইউনিট · {bn(plan.length)} দিন</span><button className="text-button" onClick={() => { navigate('calendar', today); onClose(); }}>ক্যালেন্ডার দেখো <ArrowRight size={14} /></button></div></Modal>;
}
