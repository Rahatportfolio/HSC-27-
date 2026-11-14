import { ArrowRight, Award, CalendarDays, ClipboardCheck, Info, PencilLine, Target } from 'lucide-react';
import { usePlanner } from '../context';
import { PAPERS, subjectById } from '../data';
import { bn, formatDate, percent, taskStart } from '../planner';
import { PageHeading, ProgressBar, SubjectIcon } from '../components';

export default function ExamsView() {
  const { plan, data, today, openExam, navigate } = usePlanner();
  const allTasks = plan.flatMap(d => d.tasks);
  const mocks = allTasks.filter(t => t.kind === 'exam');
  const results = Object.values(data.exams);
  const average = results.length ? Math.round(results.reduce((n, e) => n + e.score / e.total * 100, 0) / results.length) : 0;
  const next = mocks.find(t => taskStart(t).date >= today && !data.exams[t.paperId!]) || mocks.find(t => !data.exams[t.paperId!]);
  return <div className="view"><PageHeading eyebrow="TEST YOURSELF" title="ভুল হোক এখানেই।" description="১৩টি পূর্ণ মডেল টেস্ট, তারপর ভুল সংশোধন। নম্বর নয়, শেখার জায়গাগুলো খুঁজে বের করো।" />
    <div className="notice-box"><Info size={19} /><p><strong>এগুলো তোমার ব্যক্তিগত মডেল টেস্ট।</strong> বোর্ড পরীক্ষার তারিখ বা সময়সূচি নয়। প্রকৃত পরীক্ষার রুটিন বোর্ডের নোটিশ থেকে আলাদাভাবে যাচাই করো।</p></div>
    <div className="exam-stats"><div className="card"><span className="stat-icon green"><ClipboardCheck size={21} /></span><div><span>নম্বর যোগ করা হয়েছে</span><strong>{bn(results.length)} <small>/ ১৩টি পত্র</small></strong></div></div><div className="card"><span className="stat-icon lavender"><Target size={21} /></span><div><span>গড় স্কোর</span><strong>{results.length ? `${bn(average)}%` : '—'}</strong></div><small>বিভিন্ন পূর্ণমানকে শতাংশে ধরা হয়েছে</small></div><div className="card next-exam-card"><span className="stat-icon peach"><Award size={21} /></span><div><span>পরের মডেল টেস্ট</span><strong>{next ? subjectById[next.subject].short : 'সব টেস্টের রেকর্ড আছে'}</strong><p>{next ? `${formatDate(next.date)} · ${next.paperId?.endsWith('-2') ? 'দ্বিতীয় পত্র' : 'প্রথম পত্র'}` : 'ভুলের খাতা ঝালাই করতে থাকো'}</p></div>{next && <button className="icon-button" aria-label="পরের টেস্টের রুটিন" onClick={() => navigate('today', next.date)}><ArrowRight size={19} /></button>}</div></div>
    <div className="exam-grid">{PAPERS.map((p, i) => {
      const task = mocks.find(t => t.paperId === p.id)!, result = data.exams[p.id], s = subjectById[p.subject];
      const status = result ? 'result-recorded' : taskStart(task).date < today ? 'result-pending' : 'upcoming';
      return <article className={`card exam-card ${status}`} key={p.id}><div className="exam-card-top"><span className="exam-index">TEST {String(i + 1).padStart(2, '0')}</span><span className={`exam-status ${status}`}>{result ? 'নম্বর যোগ হয়েছে' : taskStart(task).date < today ? 'নম্বর যোগ করো' : 'নির্ধারিত আছে'}</span></div><div className="exam-subject"><span className="subject-large-icon" style={{ color: s.color, background: s.tint }}><SubjectIcon subject={p.subject} size={23} /></span><div><h3>{s.name}</h3><p>{p.name.replace(s.name, '').trim() || 'তত্ত্বীয় পূর্ণ পরীক্ষা'}</p></div></div><div className="exam-date"><CalendarDays size={15} />{formatDate(task.date, 'long')}<span>· ৩ ঘণ্টা</span></div><div className="exam-score">{result ? <><strong>{bn(result.score)}<small> / {bn(result.total)}</small></strong><ProgressBar value={percent(result.score, result.total)} color={s.color} /></> : <p>পূর্ণমান {bn(p.maxScore)} · {p.subject === 'ict' ? 'ব্যবহারিক আলাদা' : 'বই বন্ধ করে পরীক্ষা'}</p>}</div><div className="exam-actions"><button className="text-button" onClick={() => navigate('today', task.date)}>সেদিনের রুটিন <ArrowRight size={14} /></button><button className="button secondary small" onClick={() => openExam(p.id)}><PencilLine size={14} />{result ? 'নম্বর সম্পাদনা' : 'নম্বর যোগ করো'}</button></div></article>;
    })}</div>
  </div>;
}
