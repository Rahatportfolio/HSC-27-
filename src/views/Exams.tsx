import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Award, CalendarDays, Check, ClipboardCheck, GraduationCap, Info, Pause, Play, Plus, RotateCcw, Target, Timer, Trash2, TrendingUp } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, PAPERS, SUBJECTS, SUBJECT_FULL_MARKS, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, diffDays, formatDate, isChapterDone, percent } from '../planner';
import { calculateGpa, gpaTargetLabel } from '../gpa';
import { newId, nowIso } from '../storage';
import type { TestKind, TestRecord } from '../types';
import { EmptyState, Modal, PageHeading, ProgressBar, SubjectIcon } from '../components';
import { t } from '../i18n';

const TEST_KIND_LABEL: Record<TestKind, string> = { chapter: 'অধ্যায় টেস্ট', subject: 'বিষয় টেস্ট', model: 'মডেল টেস্ট' };
function examClock(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return `${bn(String(h).padStart(2, '0'))}:${bn(String(m).padStart(2, '0'))}:${bn(String(s).padStart(2, '0'))}`;
}
export default function ExamsView() {
  const { data, setData, plan, today, openExam, navigate, confirm, notify } = usePlanner();
  const [testOpen, setTestOpen] = useState(false);
  const allTasks = plan.flatMap(day => day.tasks);
  const mocks = allTasks.filter(task => task.kind === 'exam');
  const results = Object.values(data.exams);
  const average = results.length ? Math.round(results.reduce((sum, exam) => sum + exam.score / exam.total * 100, 0) / results.length) : 0;
  const next = mocks.find(task => task.date >= today && !data.exams[task.paperId!]) || mocks.find(task => !data.exams[task.paperId!]);
  const gpa = calculateGpa(data.gpaMarks);
  const customTests = [...data.tests].sort((a, b) => b.date.localeCompare(a.date));
  const testAverage = customTests.length ? Math.round(customTests.reduce((sum, test) => sum + test.score / test.total * 100, 0) / customTests.length) : 0;
  const bestTest = customTests.reduce((best, test) => Math.max(best, test.score / test.total * 100), 0);
  const priorityAChapters = CHAPTERS.filter(c => c.priority === 'A');
  const priorityADone = priorityAChapters.filter(c => isChapterDone(plan, c.id, data.completed)).length;
  const testDaysLeft = diffDays(today, data.settings.testExamDate);
  const hscDaysLeft = diffDays(today, data.settings.examDate);
  return <div className="view exams-view">
    <PageHeading eyebrow="TEST YOURSELF" title={t("ভুল হোক এখানেই।", "Let the mistakes happen here.")} titleEn="Make mistakes here." description="ফেব্রুয়ারি ২০২৭ টেস্ট পরীক্ষা, অধ্যায় টেস্ট, পূর্ণ মডেল টেস্ট ও GPA ট্র্যাকার—সব এক জায়গায়।" descriptionEn="February 2027 Test Exam readiness, chapter tests, full model tests and GPA tracker." action={<button className="button primary" onClick={() => setTestOpen(true)}><Plus size={17} />{t("নতুন টেস্ট", "New test")}</button>} />
    <div className="notice-box"><Info size={19} /><p><strong>{t("এগুলো তোমার ব্যক্তিগত টেস্ট ও লক্ষ্য ট্র্যাকার।", "Personal test & target tracker.")}</strong> চূড়ান্ত পরীক্ষার রুটিন তোমার কলেজ ও শিক্ষা বোর্ডের নোটিশ থেকে মিলিয়ে নাও।</p></div>
    <div className="exam-stats"><div className="card"><span className="stat-icon green"><ClipboardCheck size={21} /></span><div><span>{t("মডেল টেস্ট রেকর্ড", "Model test record")}</span><strong>{bn(results.length)} <small>{t("/ ১৩টি পত্র", "/ 13 papers")}</small></strong></div></div><div className="card"><span className="stat-icon lavender"><Target size={21} /></span><div><span>{t("মডেল টেস্টের গড়", "Model test average")}</span><strong>{results.length ? `${bn(average)}%` : '—'}</strong></div><small>{t("পূর্ণমান অনুযায়ী শতাংশ", "Percentage of total marks")}</small></div><div className="card"><span className="stat-icon peach"><TrendingUp size={21} /></span><div><span>{t("সব টেস্টের গড়", "Average of all tests")}</span><strong>{customTests.length ? `${bn(testAverage)}%` : '—'}</strong></div><small>{bn(customTests.length)}টি টেস্ট · সেরা {customTests.length ? `${bn(Math.round(bestTest))}%` : '—'}</small></div><div className="card next-exam-card"><span className="stat-icon blue"><Award size={21} /></span><div><span>{t("পরের মডেল টেস্ট", "Next model test")}</span><strong>{next ? subjectById[next.subject].short : 'সব রেকর্ড আছে'}</strong><p>{next ? `${formatDate(next.date)} · ${next.paperId?.endsWith('-2') ? 'দ্বিতীয় পত্র' : 'প্রথম পত্র'}` : 'ভুলের খাতা ঝালাই করতে থাকো'}</p></div>{next && <button className="icon-button" aria-label={t("পরের টেস্টের রুটিন", "Next test routine")} onClick={() => navigate('today', next.date)}><CalendarDays size={18} /></button>}</div></div>

    <section className="card test-exam-readiness-card">
      <div className="card-heading">
        <div>
          <h2><Target size={20} />{t('টেস্ট পরীক্ষা প্রস্তুতি ট্র্যাকার (ফেব্রুয়ারি ২০২৭)', 'Test Exam Readiness Tracker (February 2027)')}</h2>
          <p>{t(`লক্ষ্য তারিখ: ${formatDate(data.settings.testExamDate, 'long')} (${testDaysLeft >= 0 ? `বাকি ${bn(testDaysLeft)} দিন` : 'সম্পন্ন'}) · HSC ’২৭ পরীক্ষা: ${formatDate(data.settings.examDate, 'long')} (${hscDaysLeft >= 0 ? `বাকি ${bn(hscDaysLeft)} দিন` : 'সম্পন্ন'})`, `Target: ${formatDate(data.settings.testExamDate, 'long')} · HSC '27: ${formatDate(data.settings.examDate, 'long')}`)}</p>
        </div>
        <div className="test-readiness-pill">
          <strong>{bn(percent(priorityADone, priorityAChapters.length))}%</strong>
          <small>{bn(priorityADone)}/{bn(priorityAChapters.length)} {t('অগ্রাধিকার A শেষ', 'Priority A done')}</small>
        </div>
      </div>
      <ProgressBar value={percent(priorityADone, priorityAChapters.length)} />
      <div className="test-readiness-subjects">
        {SUBJECTS.map(sub => {
          const subA = priorityAChapters.filter(c => c.subject === sub.id);
          const subDone = subA.filter(c => isChapterDone(plan, c.id, data.completed)).length;
          return <div className="test-readiness-row" key={sub.id}>
            <span style={{ color: sub.color }}>{sub.short}</span>
            <ProgressBar value={percent(subDone, subA.length)} color={sub.color} />
            <small>{bn(subDone)}/{bn(subA.length)}</small>
          </div>;
        })}
      </div>
    </section>

    <section className="card gpa-card">
      <div className="card-heading"><div><h2><GraduationCap size={21} />{t("GPA ও Golden A+ ট্র্যাকার", "GPA & Golden A+ tracker")}</h2><p>প্রতিটি বিষয়ের দুই পত্রের মোট নম্বর লেখো। ICT-এর পূর্ণমান ১০০ (তত্ত্বীয় ৭৫ + ব্যবহারিক ২৫)। উচ্চতর গণিত চতুর্থ বিষয়ের নিয়মে গণনা হবে।</p></div><div className={`gpa-badge ${gpa.golden ? 'golden' : ''}`}><span>GPA</span><strong>{gpa.gpa === null ? '—' : bn(gpa.gpa.toFixed(2))}</strong><small>{gpaTargetLabel(gpa.gpa, gpa.golden)}</small></div></div>
      <div className="gpa-layout">
        <div className="gpa-inputs">{SUBJECTS.map(subject => { const row = gpa.rows.find(item => item.subject === subject.id)!; const full = SUBJECT_FULL_MARKS[subject.id]; return <div className={`gpa-row ${subject.optional ? 'optional' : ''}`} key={subject.id}><span className="gpa-subject" style={{ color: subject.color }}><span className="gpa-subject-icon" style={{ background: subject.tint }}><SubjectIcon subject={subject.id} size={16} /></span>{subject.name}{subject.optional && <em>{t("৪র্থ", "4th")}</em>}</span><div className="gpa-input"><input type="number" min={0} max={full} step="0.5" aria-label={`${subject.name} প্রাপ্ত নম্বর`} value={data.gpaMarks[subject.id] ?? ''} placeholder="—" onChange={e => { const raw = e.target.value; const value = raw === '' ? null : Math.min(full, Math.max(0, Number(raw))); setData(d => ({ ...d, gpaMarks: { ...d.gpaMarks, [subject.id]: value } })); }} /><span>/ {bn(full)}</span></div><span className={`gpa-grade grade-${(row.grade || 'none').replace('+', 'plus').replace('-', 'minus')}`}>{row.grade || '—'}</span></div>; })}</div>
        <div className="gpa-result-panel"><div className="gpa-target"><span>{t("লক্ষ্য", "Target")}</span><strong>GPA 5.00</strong><small>{t("Golden A+ = সব বিষয়ে A+", "Golden A+ = A+ in every subject")}</small></div><div className="gpa-meter"><ProgressBar value={gpa.gpa === null ? 0 : gpa.gpa / 5 * 100} /><div><span>{gpa.complete ? `${bn(gpa.gpa?.toFixed(2) || '0')} / ৫.০০` : `${bn(gpa.missing.length)}টি বিষয়ের নম্বর বাকি`}</span><span>বোনাস {bn(gpa.bonus.toFixed(2))}</span></div></div><div className="gpa-flags"><span className={gpa.golden ? 'on' : ''}><Check size={14} />Golden A+</span><span className={gpa.failed ? 'bad' : ''}>{gpa.failed ? 'কোনো বিষয়ে F আছে' : 'কোনো F নেই'}</span></div>{gpa.complete && <p className="gpa-note">গণনা: ছয়টি আবশ্যিক বিষয়ের গ্রেড পয়েন্ট + চতুর্থ বিষয়ের (২-এর বেশি হলে) বোনাস ÷ ৬। এটি নিজের হিসাব; বোর্ডের ফল নয়।</p>}<button className="text-button" onClick={() => confirm({ title: 'GPA নম্বর মুছে ফেলবে?', message: 'সব বিষয়ের ট্র্যাক করা নম্বর মুছে যাবে। টেস্টের রেকর্ড থাকবে।', label: 'নম্বর মুছো', danger: true, action: () => { setData(d => ({ ...d, gpaMarks: {} })); notify('GPA নম্বর মুছে ফেলা হয়েছে।', 'info'); } })}><RotateCcw size={14} />{t("নম্বর মুছো", "Delete marks")}</button></div>
      </div>
    </section>

    <div className="exam-split">
      <ExamClock />
      <section className="card custom-tests"><div className="card-heading"><div><h2>{t("টেস্টের ইতিহাস", "Test history")}</h2><p>অধ্যায়, বিষয় বা পূর্ণ মডেল—নিজের মতো টেস্ট নাও।</p></div><button className="button secondary small" onClick={() => setTestOpen(true)}><Plus size={15} />{t("যোগ করো", "Add")}</button></div>{customTests.length ? <div className="test-list">{customTests.slice(0, 12).map(test => { const score = Math.round(test.score / test.total * 100); return <div className={`test-row ${score < 50 ? 'weak' : ''}`} key={test.id}><span className={`test-kind ${test.kind}`}>{TEST_KIND_LABEL[test.kind]}</span><div><strong>{test.title}</strong><span>{formatDate(test.date)} · {test.subject ? subjectById[test.subject].short : 'মিশ্র'} · {bn(test.durationMin)} মি. {test.notes && `· ${test.notes}`}</span></div><strong className="test-score">{bn(test.score)}/{bn(test.total)} <small>{bn(score)}%</small></strong><button className="icon-button" aria-label={t("টেস্ট মুছো", "Delete test")} onClick={() => confirm({ title: 'টেস্ট রেকর্ড মুছে ফেলবে?', message: test.title, danger: true, label: 'মুছে ফেলো', action: () => { setData(d => ({ ...d, tests: d.tests.filter(item => item.id !== test.id) })); notify('টেস্ট রেকর্ড মুছে ফেলা হয়েছে।', 'info'); } })}><Trash2 size={15} /></button></div>; })}</div> : <EmptyState title={t("এখনও নিজের টেস্ট নেই", "No test of your own yet")} description="একটি অধ্যায় শেষ করে ২০ নম্বরের ছোট টেস্ট দাও, নম্বর যোগ করো।" action={<button className="button primary" onClick={() => setTestOpen(true)}>{t("প্রথম টেস্ট যোগ করো", "Add the first test")}</button>} />}</section>
    </div>

    <section className="card model-tests"><div className="card-heading"><div><h2>{t("১৩টি পূর্ণ মডেল টেস্ট", "13 full model tests")}</h2><p>শেষ মাসের নির্ধারিত রুটিন। নম্বর দিলে পরের টেস্টের প্রস্তুতি স্পষ্ট হবে।</p></div><button className="text-button" onClick={() => navigate('calendar')}>{t("রুটিন দেখো", "See the routine")}<CalendarDays size={14} /></button></div>
      <div className="exam-grid">{PAPERS.map((paper, index) => { const task = mocks.find(item => item.paperId === paper.id)!; const result = data.exams[paper.id]; const subject = subjectById[paper.subject]; const status = result ? 'result-recorded' : task.date < today ? 'result-pending' : 'upcoming'; return <article className={`card exam-card ${status}`} key={paper.id}><div className="exam-card-top"><span className="exam-index">TEST {bn(String(index + 1).padStart(2, '0'))}</span><span className={`exam-status ${status}`}>{result ? 'নম্বর যোগ হয়েছে' : task.date < today ? 'নম্বর যোগ করো' : 'নির্ধারিত আছে'}</span></div><div className="exam-subject"><span className="subject-large-icon" style={{ color: subject.color, background: subject.tint }}><SubjectIcon subject={paper.subject} size={23} /></span><div><h3>{subject.name}</h3><p>{paper.name.replace(subject.name, '').trim() || 'তত্ত্বীয় পূর্ণ পরীক্ষা'}</p></div></div><div className="exam-date"><CalendarDays size={15} /><span>{formatDate(task.date)}</span><span>{bn(paper.maxScore)} নম্বর</span></div>{result ? <div className="exam-score"><div><strong>{bn(result.score)}<small>/{bn(result.total)}</small></strong><span>{bn(percent(result.score, result.total))}%</span></div><ProgressBar value={percent(result.score, result.total)} /><p>{result.mistakes || 'ভুলের কারণ লেখা হয়নি।'}</p></div> : <button className="button secondary full-width" onClick={() => openExam(paper.id)}>{t("নম্বর যোগ করো", "Add marks")}</button>}</article>; })}</div>
    </section>
    <div className="exam-footer-note"><Info size={17} /><p>GPA হিসাব শুধু নিজের ট্র্যাকিংয়ের জন্য। বোর্ডের নিয়ম, নম্বর বণ্টন ও চতুর্থ বিষয়ের সিদ্ধান্ত তোমার প্রতিষ্ঠান/বোর্ডের নির্দেশনা অনুযায়ী চূড়ান্ত।</p></div>
    {testOpen && <TestModal onClose={() => setTestOpen(false)} />}
  </div>;
}

function ExamClock() {
  const { notify } = usePlanner();
  const [duration, setDuration] = useState(180);
  const [remaining, setRemaining] = useState(180 * 60);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { if (!deadline) return; const id = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(id); }, [deadline]);
  const live = deadline ? Math.max(0, Math.ceil((deadline - tick) / 1000)) : remaining;
  useEffect(() => {
    if (deadline && live === 0) {
      setDeadline(null); setRemaining(0);
      notify('পরীক্ষার সময় শেষ! এখন উত্তরপত্র মিলিয়ে নম্বর লেখো।', 'info');
    }
  }, [deadline, live, notify]);
  const start = () => { const seconds = live || duration * 60; setRemaining(seconds); setDeadline(Date.now() + seconds * 1000); };
  const pause = () => { setRemaining(live); setDeadline(null); };
  const reset = (minutes = duration) => { setDuration(minutes); setRemaining(minutes * 60); setDeadline(null); };
  return <section className="card exam-clock-card"><div className="card-heading"><h3><Timer size={18} />{t("পরীক্ষার ঘড়ি", "Exam clock")}</h3><span className="tiny-muted">{t("পড়া হিসেবে গোনা হবে না", "Won’t count as study")}</span></div><div className={`exam-clock-display ${deadline ? 'running' : ''}`}>{examClock(live)}</div><div className="exam-clock-presets">{[30, 60, 90, 120, 180].map(minutes => <button key={minutes} className={duration === minutes ? 'active' : ''} disabled={!!deadline} onClick={() => reset(minutes)}>{bn(minutes)} মি.</button>)}</div><div className="exam-clock-actions"><button className="button primary" onClick={deadline ? pause : start}>{deadline ? <Pause size={16} /> : <Play size={16} />}{deadline ? 'বিরতি' : 'শুরু'}</button><button className="button secondary" onClick={() => reset()}><RotateCcw size={16} />{t("রিসেট", "Reset")}</button></div><p className="tiny-muted">ঘড়ি চলাকালীন অ্যাপ বন্ধ করলেও সময় ঘড়ির হিসাবে চলবে।</p></section>;
}

function TestModal({ onClose }: { onClose: () => void }) {
  const { data, setData, today, notify } = usePlanner();
  const [kind, setKind] = useState<TestKind>('chapter');
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [chapterId, setChapterId] = useState('');
  const [title, setTitle] = useState('');
  const [score, setScore] = useState('');
  const [total, setTotal] = useState('100');
  const [duration, setDuration] = useState('60');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const obtained = Number(score), full = Number(total), minutes = Number(duration);
    if (!Number.isFinite(obtained) || !Number.isFinite(full) || full <= 0 || obtained < 0 || obtained > full) { setError('নম্বর ০ থেকে পূর্ণমানের মধ্যে হতে হবে।'); return; }
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) { setError('সময় ০–১৪৪০ মিনিটের মধ্যে হতে হবে।'); return; }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('সঠিক তারিখ লেখো।'); return; }
    if (data.tests.length >= 1000) { setError('সর্বোচ্চ ১০০০টি টেস্ট রাখা যায়।'); return; }
    const chapter = chapterId ? CHAPTERS.find(item => item.id === chapterId) : undefined;
    const resolvedTitle = title.trim() || (kind === 'chapter' && chapter ? chapter.title : kind === 'subject' ? `${subjectById[subject].name} টেস্ট` : 'মডেল টেস্ট');
    const record: TestRecord = { id: newId(), kind, title: resolvedTitle, subject, chapterIds: chapter ? [chapter.id] : [], score: obtained, total: full, durationMin: minutes, date, at: nowIso(), notes: notes.trim() };
    setData(d => ({ ...d, tests: [...d.tests, record] }));
    notify('টেস্টের নম্বর সেভ হয়েছে।', 'success'); onClose();
  };
  return <Modal title={t("নতুন টেস্টের রেকর্ড", "Record a new test")} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><label>{t("টেস্টের ধরন", "Test type")}<select value={kind} onChange={e => setKind(e.target.value as TestKind)}>{(['chapter', 'subject', 'model'] as const).map(item => <option key={item} value={item}>{TEST_KIND_LABEL[item]}</option>)}</select></label><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{kind === 'chapter' && <label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("বাছো", "Choose")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>}<label>{t("শিরোনাম (ঐচ্ছিক)", "Title (optional)")}<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={t("যেমন: ভেক্টর টেস্ট ১", "e.g. vector test 1")} /></label><label>{t("তারিখ", "Date")}<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>{t("প্রাপ্ত নম্বর", "Marks obtained")}<input data-autofocus type="number" min={0} step="0.5" value={score} onChange={e => setScore(e.target.value)} required /></label><label>{t("পূর্ণমান", "Total marks")}<input type="number" min={1} step="0.5" value={total} onChange={e => setTotal(e.target.value)} required /></label><label>{t("সময় (মিনিট)", "Time (min)")}<input type="number" min={0} max={1440} value={duration} onChange={e => setDuration(e.target.value)} /></label></div><label className="form-label">{t("ভুল ও শেখার নোট", "Mistakes & learning notes")}<textarea rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("কোন অংশে নম্বর হারালে…", "Where did you lose marks…")} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><Check size={16} />{t("সেভ করো", "Save")}</button></div></form></Modal>;
}
