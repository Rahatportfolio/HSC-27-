import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Award, CalendarDays, Check, ClipboardCheck, GraduationCap, Info, Pause, Play, Plus, RotateCcw, Target, Timer, Trash2, TrendingUp } from 'lucide-react';
import { usePlanner } from '../context';
import { CHAPTERS, PAPERS, SUBJECTS, SUBJECT_FULL_MARKS, subjectById } from '../data';
import type { SubjectId } from '../data';
import { bn, diffDays, formatDate, isValidDate, percent } from '../planner';
import { calculateGpa, gpaTargetLabel } from '../gpa';
import { goldenPlan, markGapLabel } from '../golden';
import type { GoldenPlan } from '../golden';
import { newId, nowIso } from '../storage';
import type { TestKind, TestRecord } from '../types';
import { EmptyState, Modal, PageHeading, ProgressBar, SubjectIcon } from '../components';
import { isEnglish, t } from '../i18n';
import { chapterPriority, chapterStage, isLearningComplete } from '../learning';
import { cadenceSlots, cadenceStats, nextCadenceSlot } from '../cadence';

const TEST_KIND_LABEL: Record<TestKind, string> = { chapter: 'অধ্যায় টেস্ট', subject: 'বিষয় টেস্ট', model: 'মডেল টেস্ট' };
function examClock(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return `${bn(String(h).padStart(2, '0'))}:${bn(String(m).padStart(2, '0'))}:${bn(String(s).padStart(2, '0'))}`;
}
export default function ExamsView() {
  const { data, setData, plan, today, openExam, navigate, confirm, notify } = usePlanner();
  const [testOpen, setTestOpen] = useState(false);
  const allTasks = plan.flatMap(day => day.tasks);
  const slots = cadenceSlots(data, today);
  const routine = cadenceStats(data, today);
  const nextSlot = nextCadenceSlot(data, today);
  const mocks = allTasks.filter(task => task.kind === 'exam');
  const results = Object.values(data.exams);
  const next = mocks.find(task => task.date >= today && !data.exams[task.paperId!]) || mocks.find(task => !data.exams[task.paperId!]);
  const gpa = calculateGpa(data.gpaMarks);
  const [goal, setGoal] = useState<GoldenPlan['goal']>('gpa5');
  const plan5 = goldenPlan(data.gpaMarks, goal);
  const customTests = [...data.tests].sort((a, b) => b.date.localeCompare(a.date));
  const testAverage = customTests.length ? Math.round(customTests.reduce((sum, test) => sum + test.score / test.total * 100, 0) / customTests.length) : 0;
  const bestTest = customTests.reduce((best, test) => Math.max(best, test.score / test.total * 100), 0);
  // Per-kind averages so model tests never hide inside one big mixed number.
  const kindAverage = (kind: TestKind) => {
    const list = customTests.filter(test => test.kind === kind);
    return list.length ? { count: list.length, avg: Math.round(list.reduce((sum, test) => sum + test.score / test.total * 100, 0) / list.length) } : null;
  };
  const chapterKind = kindAverage('chapter');
  const subjectKind = kindAverage('subject');
  const modelCustom = customTests.filter(test => test.kind === 'model');
  const modelKind = kindAverage('model');
  // The "model test average" covers BOTH the 13 scheduled papers and your own model tests.
  const modelScores = [...results.map(exam => exam.score / exam.total * 100), ...modelCustom.map(test => test.score / test.total * 100)];
  const modelAverage = modelScores.length ? Math.round(modelScores.reduce((sum, value) => sum + value, 0) / modelScores.length) : null;
  const priorityAChapters = CHAPTERS.filter(c => data.personalRoutine ? data.personalRoutine.chapterIds.includes(c.id) : chapterPriority(c, data) === 'A');
  const priorityADone = priorityAChapters.filter(c => isLearningComplete(chapterStage(c, data, plan))).length;
  const testDaysLeft = diffDays(today, data.settings.testExamDate);
  const hscDaysLeft = diffDays(today, data.settings.examDate);
  return <div className="view exams-view">
    <PageHeading eyebrow="TEST YOURSELF" title={t("ভুল হোক এখানেই।", "Let the mistakes happen here.")} titleEn="Make mistakes here." description="তোমার নির্ধারিত টেস্ট লক্ষ্য, অধ্যায় টেস্ট, মডেল টেস্ট ও GPA ট্র্যাকার—সব এক জায়গায়।" descriptionEn="Your test target, chapter tests, personal model tests and GPA tracker." action={<button className="button primary" onClick={() => setTestOpen(true)}><Plus size={17} />{t("নতুন টেস্ট", "New test")}</button>} />
    <div className="notice-box"><Info size={19} /><p><strong>{t("এগুলো তোমার ব্যক্তিগত টেস্ট ও লক্ষ্য ট্র্যাকার।", "Personal test & target tracker.")}</strong>{t(' চূড়ান্ত পরীক্ষার রুটিন তোমার কলেজ ও শিক্ষা বোর্ডের নোটিশ থেকে মিলিয়ে নাও।', ' Check the final exam routine against your college and education board notice.')}</p></div>
    <div className="exam-stats"><div className="card"><span className="stat-icon green"><ClipboardCheck size={21} /></span><div><span>{t("মডেল টেস্ট রেকর্ড", "Model test record")}</span><strong>{bn(results.length)} <small>{t("/ ১৩টি পত্র", "/ 13 papers")}</small></strong></div></div><div className="card"><span className="stat-icon lavender"><Target size={21} /></span><div><span>{t("মডেল টেস্টের গড়", "Model test average")}</span><strong>{modelAverage === null ? '—' : `${bn(modelAverage)}%`}</strong></div><small>{modelScores.length ? `${bn(modelScores.length)}টি মডেল টেস্ট · ১৩ পত্রের ${bn(results.length)}টি + তোমার নিজের ${bn(modelKind?.count ?? 0)}টি` : t('এখনও কোনো মডেল টেস্ট নেই — নম্বর যোগ করলে এখানে গড় দেখাবে', 'No model test yet — add marks and the average appears here')}</small></div><div className="card"><span className="stat-icon peach"><TrendingUp size={21} /></span><div><span>{t("সব টেস্টের গড়", "Average of all tests")}</span><strong>{customTests.length ? `${bn(testAverage)}%` : '—'}</strong></div><small>{bn(customTests.length)}{t('টি টেস্ট', ' tests')} · {t('সেরা', 'best')} {customTests.length ? `${bn(Math.round(bestTest))}%` : '—'}</small></div><div className="card next-exam-card"><span className="stat-icon blue"><Award size={21} /></span><div><span>{t("পরের মডেল টেস্ট", "Next model test")}</span><strong>{next ? subjectById[next.subject].short : data.personalRoutine ? t('বরাদ্দ করা হয়নি', 'Not allocated') : 'সব রেকর্ড আছে'}</strong><p>{next ? `${formatDate(next.date)} · ${next.paperId?.endsWith('-2') ? 'দ্বিতীয় পত্র' : 'প্রথম পত্র'}` : 'ভুলের খাতা ঝালাই করতে থাকো'}</p></div>{next && <button className="icon-button" aria-label={t("পরের টেস্টের রুটিন", "Next test routine")} onClick={() => navigate('today', next.date)}><CalendarDays size={18} /></button>}</div></div>

    {data.personalRoutine && <p className="personal-pair-note">{t('এই পাতার পরীক্ষা/GPA ফিচারগুলো ঐচ্ছিক। তোমার রুটিনের লক্ষ্য শুধু S-এর গুরুত্বপূর্ণ সিলেবাস; দৈনিক/সাপ্তাহিক পরীক্ষা বা সব ১৩টি পত্র শেষ করতে হবে না।', 'Exam/GPA tools here are optional. Your routine’s goal is the selected S syllabus, not taking daily/weekly tests or all 13 papers.')}</p>}
    <section className="card exams-routine-card">
      <div className="card-heading"><div><h2><Target size={19} />{t('পরীক্ষার রুটিন', 'Exam routine')}</h2><p>{t('দৈনিক · সাপ্তাহিক · মাসিক—তিনটি স্লট, সিমুলেটরেই সময় ধরে।', 'Daily · weekly · monthly — all three run timed in the simulator.')}</p></div>{nextSlot ? <button className="button primary small" onClick={() => navigate('examsim')}>{t('এখনই দাও', 'Take it now')}<ClipboardCheck size={15} /></button> : <span className="retry-pill">{t('সব স্লট শেষ', 'All slots done')}</span>}</div>
      <div className="exams-routine-row">{slots.map(slot => <div className={`exams-routine-item ${slot.due ? 'due' : ''}`} key={slot.cadence}><span className={`exam-cadence-dot ${slot.cadence}`} /><div><strong>{t(slot.label, slot.labelEn)}</strong><small>{slot.lastDate ? t(`শেষ: ${bn(slot.daysSince ?? 0)} দিন আগে${slot.lastScore !== null ? ` · ${bn(slot.lastScore)}%` : ''}`, `Last: ${slot.daysSince ?? 0} day(s) ago${slot.lastScore !== null ? ` · ${slot.lastScore}%` : ''}`) : t('এখনো দেওয়া হয়নি', 'Never taken')}</small></div><span className={`slot-state ${slot.due ? 'due' : ''}`}>{slot.due ? (slot.lateDays ? t(`${bn(slot.lateDays)} দিন দেরি`, `${slot.lateDays}d late`) : t('আজ', 'Today')) : t('ঠিক আছে', 'On track')}</span></div>)}</div>
      <p className="tiny-muted">{t(`শেষ ৭ দিনে ${bn(routine.taken7)}টি · ৩০ দিনে ${bn(routine.taken30)}টি · গড় ${bn(routine.average30)}% · ধারাবাহিকতা ${bn(routine.consistency)}%`, `${routine.taken7} in 7 days · ${routine.taken30} in 30 · average ${routine.average30}% · consistency ${routine.consistency}%`)}</p>
    </section>
    <section className="card test-exam-readiness-card">
      <div className="card-heading">
        <div>
          <h2><Target size={20} />{t('টেস্ট প্রস্তুতি ট্র্যাকার', 'Test readiness tracker')}</h2>
          <p>{t(`লক্ষ্য তারিখ: ${formatDate(data.settings.testExamDate, 'long')} (${testDaysLeft >= 0 ? `বাকি ${bn(testDaysLeft)} দিন` : 'সম্পন্ন'}) · HSC ’২৭ পরীক্ষা: ${formatDate(data.settings.examDate, 'long')} (${hscDaysLeft >= 0 ? `বাকি ${bn(hscDaysLeft)} দিন` : 'সম্পন্ন'})`, `Target: ${formatDate(data.settings.testExamDate, 'long')} · HSC '27: ${formatDate(data.settings.examDate, 'long')}`)}</p>
        </div>
        <div className="test-readiness-pill">
          <strong>{bn(percent(priorityADone, priorityAChapters.length))}%</strong>
          <small>{bn(priorityADone)}/{bn(priorityAChapters.length)} {data.personalRoutine ? t('S অধ্যায় শেষ', 'S chapters done') : t('অগ্রাধিকার A শেষ', 'Priority A done')}</small>
        </div>
      </div>
      <ProgressBar value={percent(priorityADone, priorityAChapters.length)} />
      <div className="test-readiness-subjects">
        {SUBJECTS.map(sub => {
          const subA = priorityAChapters.filter(c => c.subject === sub.id);
          const subDone = subA.filter(c => isLearningComplete(chapterStage(c, data, plan))).length;
          return <div className="test-readiness-row" key={sub.id}>
            <span style={{ color: sub.color }}>{sub.short}</span>
            <ProgressBar value={percent(subDone, subA.length)} color={sub.color} />
            <small>{bn(subDone)}/{bn(subA.length)}</small>
          </div>;
        })}
      </div>
    </section>

    <section className="card gpa-card">
      <div className="card-heading"><div><h2><GraduationCap size={21} />{t("GPA ও Golden A+ ট্র্যাকার", "GPA & Golden A+ tracker")}</h2><p>{t('প্রতিটি বিষয়ের দুই পত্রের মোট নম্বর লেখো। ICT-এর পূর্ণমান ১০০ (তত্ত্বীয় ৭৫ + ব্যবহারিক ২৫)। উচ্চতর গণিত চতুর্থ বিষয়ের নিয়মে গণনা হবে।', 'Enter the total of both papers for each subject. ICT is out of 100 (75 theory + 25 practical). Higher Mathematics counts as the fourth subject.')}</p></div><div className={`gpa-badge ${gpa.golden ? 'golden' : ''}`}><span>GPA</span><strong>{gpa.gpa === null ? '—' : bn(gpa.gpa.toFixed(2))}</strong><small>{gpaTargetLabel(gpa.gpa, gpa.golden)}</small></div></div>
      <div className="golden-strip">
        <div className="golden-head">
          <strong><Target size={17} />{t('পথ-হিসাব: লক্ষ্য পূরণে আর কত?', 'Path arithmetic: what is still missing?')}</strong>
          <div className="segmented small" role="group" aria-label={t('লক্ষ্য বাছো', 'Pick a goal')}>
            <button className={goal === 'gpa5' ? 'active' : ''} onClick={() => setGoal('gpa5')}>GPA 5.00</button>
            <button className={goal === 'golden' ? 'active' : ''} onClick={() => setGoal('golden')}>Golden A+</button>
          </div>
        </div>
        <p className={plan5.reached ? 'golden-verdict ok' : plan5.blocked ? 'golden-verdict bad' : 'golden-verdict'} data-golden-verdict>{isEnglish() ? plan5.verdictEn : plan5.verdictBn}<span className="golden-verdict-nums">{goal === 'golden'
          ? `${t('আর দরকার', 'Still needed')}: ${bn(markGapLabel(plan5.marksToGolden))} ${t('নম্বর', 'marks')}`
          : plan5.complete ? `${t('গ্রেড পয়েন্ট বাকি', 'Grade points missing')}: ${bn(plan5.pointsGap)}` : ''}</span></p>
        <div className="golden-facts">
          <div><span>{t('আবশ্যিক ৬ বিষয়ের পয়েন্ট', 'Points from 6 compulsory')}</span><strong>{bn(plan5.compulsoryPoints)}<small>{`/${bn(30)}`}</small></strong></div>
          <div><span>{t('৪র্থ বিষয়ের বোনাস', '4th-subject bonus')}</span><strong>{bn(plan5.bonus.toFixed(2))}</strong></div>
          <div><span>{t('আরও যে পয়েন্ট নষ্ট হতে পারে', 'Points still losable')}</span><strong>{plan5.deficitBudget === null ? '—' : bn(plan5.deficitBudget)}</strong></div>
          <div><span>{t('দরকারি গ্রেড পয়েন্ট', 'Grade points missing')}</span><strong>{plan5.complete ? bn(plan5.pointsGap) : '—'}</strong></div>
        </div>
        <div className="golden-rows">{plan5.rows.map(row => {
          const subject = subjectById[row.subject];
          const ratio = row.obtained === null ? 0 : Math.min(1, row.obtained / row.full);
          const need = goal === 'golden' ? (row.toAPlus ?? row.full) : 0;
          return <div className={`golden-row ${row.optional ? 'optional' : ''} ${row.grade === 'F' ? 'bad' : ''}`} key={row.subject} data-golden-row={row.subject}>
            <span className="golden-subject" style={{ color: subject.color }}>{subject.short}{row.optional && <em>{t('৪র্থ', '4th')}</em>}</span>
            <span className="golden-bar" aria-hidden="true"><i style={{ width: `${ratio * 100}%`, background: subject.color }} /><b style={{ left: '80%' }} /></span>
            <span className="golden-points">{row.point === null ? '—' : bn(row.point.toFixed(2))}<small>{t('পয়েন্ট', 'pt')}</small></span>
            <span className="golden-next">{row.grade === null
              ? t('নম্বর নেই', 'no marks')
              : row.toAPlus === 0
                ? t('A+ আছে', 'A+ reached')
                : goal === 'golden'
                  ? `${t('A+ পর্যন্ত', 'to A+')} ${bn(markGapLabel(need))}`
                  : row.nextGrade ? `${t(row.nextGrade, row.nextGrade)} ${t('পেতে', 'needs')} ${bn(markGapLabel(row.toNextGrade ?? 0))}` : '—'}</span>
          </div>;
        })}</div>
        <p className="golden-note">{t('এটি মোট নম্বরের ব্যক্তিগত হিসাব, বোর্ডের ফল নয়: ছয় আবশ্যিক বিষয়ে পাসের পর (পয়েন্টের যোগফল + ৪র্থ বিষয়ের ২-এর বেশি বোনাস) ÷ ৬, সর্বোচ্চ ৫। ঐচ্ছিক F শুধু বোনাস কমায়। তত্ত্বীয়/MCQ/ব্যবহারিকে আলাদা পাস এখানে যাচাই হয় না। Golden A+ এখানে সব বিষয়ে ৮০% পাওয়ার ব্যক্তিগত লক্ষ্য। নম্বর না থাকলে হিসাব বাকি দেখায়।', 'Combined-mark estimate, not a board result: after passing all six compulsory subjects, GPA = (their points + optional bonus above 2) ÷ 6, capped at 5. Optional F only removes the bonus. Separate theory/MCQ/practical passes are not checked here. Golden A+ is your personal target of 80% in every subject. Missing compulsory marks keep the GPA unknown.')}</p>
      </div>
      <div className="gpa-layout">
        <div className="gpa-inputs">{SUBJECTS.map(subject => { const row = gpa.rows.find(item => item.subject === subject.id)!; const full = SUBJECT_FULL_MARKS[subject.id]; return <div className={`gpa-row ${subject.optional ? 'optional' : ''}`} key={subject.id}><span className="gpa-subject" style={{ color: subject.color }}><span className="gpa-subject-icon" style={{ background: subject.tint }}><SubjectIcon subject={subject.id} size={16} /></span>{subject.name}{subject.optional && <em>{t("৪র্থ", "4th")}</em>}</span><div className="gpa-input"><input type="number" min={0} max={full} step="0.5" aria-label={`${subject.name} প্রাপ্ত নম্বর`} value={data.gpaMarks[subject.id] ?? ''} placeholder="—" onChange={e => { const raw = e.target.value; const value = raw === '' ? null : Math.min(full, Math.max(0, Number(raw))); setData(d => ({ ...d, gpaMarks: { ...d.gpaMarks, [subject.id]: value } })); }} /><span>/ {bn(full)}</span></div><span className={`gpa-grade grade-${(row.grade || 'none').replace('+', 'plus').replace('-', 'minus')}`}>{row.grade || '—'}</span></div>; })}</div>
        <div className="gpa-result-panel"><div className="gpa-target"><span>{t("লক্ষ্য", "Target")}</span><strong>GPA 5.00</strong><small>{t("Golden A+ = সব বিষয়ে A+", "Golden A+ = A+ in every subject")}</small></div><div className="gpa-meter"><ProgressBar value={gpa.gpa === null ? 0 : gpa.gpa / 5 * 100} /><div><span>{gpa.complete ? `${bn(gpa.gpa?.toFixed(2) || '0')} / ${isEnglish() ? '5.00' : '৫.০০'}` : `${bn(gpa.missing.length)} ${t('টি বিষয়ের নম্বর বাকি','subject(s) missing marks')}`}</span><span>{t('বোনাস','Bonus')} {bn(gpa.bonus.toFixed(2))}</span></div></div><div className="gpa-flags"><span className={gpa.golden ? 'on' : ''}><Check size={14} />Golden A+</span><span className={gpa.failed ? 'bad' : ''}>{gpa.failed ? t('আবশ্যিক বিষয়ে F আছে','Compulsory-subject F') : t('আবশ্যিক বিষয়ে F নেই','No compulsory-subject F')}</span></div>{gpa.complete && <p className="gpa-note">{t('গণনা: (ছয়টি আবশ্যিক বিষয়ের গ্রেড পয়েন্টের যোগফল + চতুর্থ বিষয়ের ২-এর বেশি বোনাস) ÷ ৬। আবশ্যিক বিষয়ে F থাকলে GPA ০। এটি মোট নম্বরের ব্যক্তিগত হিসাব; বোর্ডের ফল নয়।', 'Formula: (sum of six compulsory grade points + fourth-subject bonus above 2) ÷ 6. A compulsory F makes GPA 0. This combined-mark estimate is not an official board result.')}</p>}<button className="text-button" onClick={() => confirm({ title: 'GPA নম্বর মুছে ফেলবে?', message: 'সব বিষয়ের ট্র্যাক করা নম্বর মুছে যাবে। টেস্টের রেকর্ড থাকবে।', label: 'নম্বর মুছো', danger: true, action: () => { setData(d => ({ ...d, gpaMarks: {} })); notify(t('GPA নম্বর মুছে ফেলা হয়েছে।', 'GPA marks deleted.'), 'info'); } })}><RotateCcw size={14} />{t("নম্বর মুছো", "Delete marks")}</button></div>
      </div>
    </section>

    <div className="exam-split">
      <ExamClock />
      <section className="card custom-tests"><div className="card-heading"><div><h2>{t("টেস্টের ইতিহাস", "Test history")}</h2><p>{t('অধ্যায়, বিষয় বা পূর্ণ মডেল—নিজের মতো টেস্ট নাও।', 'Chapter, subject or full model — take any test you like.')}</p></div><button className="button secondary small" onClick={() => setTestOpen(true)}><Plus size={15} />{t("যোগ করো", "Add")}</button></div><div className="kind-averages" aria-label={t('ধরনভেদে গড়', 'Averages by test kind')}><span>{t('অধ্যায় টেস্টের গড়', 'Chapter avg')} <strong>{chapterKind ? `${bn(chapterKind.avg)}%` : '—'}</strong>{chapterKind && <small> · {bn(chapterKind.count)}{t('টি', '')}</small>}</span><span>{t('বিষয় টেস্টের গড়', 'Subject avg')} <strong>{subjectKind ? `${bn(subjectKind.avg)}%` : '—'}</strong>{subjectKind && <small> · {bn(subjectKind.count)}{t('টি', '')}</small>}</span><span className="highlight">{t('মডেল টেস্টের গড়', 'Model avg')} <strong>{modelKind ? `${bn(modelKind.avg)}%` : '—'}</strong>{modelKind && <small> · {bn(modelKind.count)}{t('টি', '')}</small>}</span></div>{customTests.length ? <div className="test-list">{customTests.slice(0, 12).map(test => { const score = Math.round(test.score / test.total * 100); return <div className={`test-row ${score < 50 ? 'weak' : ''}`} key={test.id}><span className={`test-kind ${test.kind}`}>{TEST_KIND_LABEL[test.kind]}</span><div><strong>{test.title}</strong><span>{formatDate(test.date)} · {test.subject ? subjectById[test.subject].short : t('মিশ্র', 'Mixed')} · {t(`${bn(test.durationMin)} মি.`, `${test.durationMin}m`)} {test.notes && `· ${test.notes}`}</span></div><strong className="test-score">{bn(test.score)}/{bn(test.total)} <small>{bn(score)}%</small></strong><button className="icon-button" aria-label={t("টেস্ট মুছো", "Delete test")} onClick={() => confirm({ title: t('টেস্ট রেকর্ড মুছে ফেলবে?', 'Delete this test record?'), message: test.title, danger: true, label: t('মুছে ফেলো', 'Delete'), action: () => { setData(d => ({ ...d, tests: d.tests.filter(item => item.id !== test.id) })); notify(t('টেস্ট রেকর্ড মুছে ফেলা হয়েছে।', 'Test record deleted.'), 'info'); } })}><Trash2 size={15} /></button></div>; })}</div> : <EmptyState title={t("এখনও নিজের টেস্ট নেই", "No test of your own yet")} description={t('একটি অধ্যায় শেষ করে ২০ নম্বরের ছোট টেস্ট দাও, নম্বর যোগ করো।', 'Finish a chapter, take a short 20-mark test and add the score.')} action={<button className="button primary" onClick={() => setTestOpen(true)}>{t("প্রথম টেস্ট যোগ করো", "Add the first test")}</button>} />}</section>
    </div>

    <section className="card model-tests"><div className="card-heading"><div><h2>{t("১৩টি পূর্ণ মডেল টেস্ট", "13 full model tests")}</h2><p>{data.personalRoutine ? t('ঐচ্ছিক নিজের নম্বরের খাতা; S রুটিনে এই টেস্ট চাপানো হয়নি।', 'Optional personal marks ledger; these tests are not imposed on the S routine.') : t('শেষ মাসের নির্ধারিত রুটিন। নম্বর দিলে পরের টেস্টের প্রস্তুতি স্পষ্ট হবে।', 'The last month’s fixed routine. Enter marks to see how ready the next test looks.')}</p></div><button className="text-button" onClick={() => navigate('calendar')}>{t("রুটিন দেখো", "See the routine")}<CalendarDays size={14} /></button></div>
      <div className="exam-grid">{PAPERS.map((paper, index) => { const task = mocks.find(item => item.paperId === paper.id); const result = data.exams[paper.id]; const subject = subjectById[paper.subject]; const status = result ? 'result-recorded' : task && task.date < today ? 'result-pending' : 'upcoming'; return <article className={`card exam-card ${status}`} key={paper.id}><div className="exam-card-top"><span className="exam-index">TEST {bn(String(index + 1).padStart(2, '0'))}</span><span className={`exam-status ${status}`}>{result ? t('নম্বর যোগ হয়েছে', 'Marks added') : task && task.date < today ? t('নম্বর যোগ করো', 'Add marks') : task ? t('নির্ধারিত আছে', 'Scheduled') : t('ঐচ্ছিক', 'Optional')}</span></div><div className="exam-subject"><span className="subject-large-icon" style={{ color: subject.color, background: subject.tint }}><SubjectIcon subject={paper.subject} size={23} /></span><div><h3>{subject.name}</h3><p>{paper.name.replace(subject.name, '').trim() || 'তত্ত্বীয় পূর্ণ পরীক্ষা'}</p></div></div><div className="exam-date"><CalendarDays size={15} /><span>{task ? formatDate(task.date) : t('তারিখ বরাদ্দ নয়', 'No date allocated')}</span><span>{bn(paper.maxScore)} নম্বর</span></div>{result ? <div className="exam-score"><div><strong>{bn(result.score)}<small>/{bn(result.total)}</small></strong><span>{bn(percent(result.score, result.total))}%</span></div><ProgressBar value={percent(result.score, result.total)} /><p>{result.mistakes || 'ভুলের কারণ লেখা হয়নি।'}</p></div> : <button className="button secondary full-width" onClick={() => openExam(paper.id)}>{t("নম্বর যোগ করো", "Add marks")}</button>}</article>; })}</div>
    </section>
    <div className="exam-footer-note"><Info size={17} /><p>{t('GPA হিসাব শুধু নিজের ট্র্যাকিংয়ের জন্য। বোর্ডের নিয়ম, নম্বর বণ্টন ও চতুর্থ বিষয়ের সিদ্ধান্ত তোমার প্রতিষ্ঠান/বোর্ডের নির্দেশনা অনুযায়ী চূড়ান্ত।', 'The GPA figure is only for your own tracking. Board rules, mark distribution and the fourth-subject decision follow your institution or board guidance.')}</p></div>
    {testOpen && <TestModal onClose={() => setTestOpen(false)} />}
  </div>;
}

function ExamClock() {
  const { notify } = usePlanner();
  const [saved] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem('hsc27-exam-clock-v1') || 'null');
      if (value && Number.isInteger(value.duration) && value.duration >= 1 && value.duration <= 720 && Number.isFinite(value.remaining) && value.remaining >= 0 && value.remaining <= 720 * 60 && (value.deadline === null || (Number.isFinite(value.deadline) && value.deadline > 0))) return value as { duration: number; remaining: number; deadline: number | null };
    } catch { /* use the default clock */ }
    return { duration: 180, remaining: 180 * 60, deadline: null };
  });
  const [duration, setDuration] = useState(saved.duration);
  const [remaining, setRemaining] = useState(saved.remaining);
  const [deadline, setDeadline] = useState<number | null>(saved.deadline);
  useEffect(() => { try { localStorage.setItem('hsc27-exam-clock-v1', JSON.stringify({ duration, remaining, deadline })); } catch { /* clock still works in memory */ } }, [duration, remaining, deadline]);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const update = () => setTick(Date.now());
    const id = setInterval(update, 500);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); };
  }, [deadline]);
  const secondsUntil = (now: number) => Math.min(duration * 60, Math.max(0, Math.ceil(((deadline || now) - now) / 1000)));
  const live = deadline ? secondsUntil(tick) : remaining;
  useEffect(() => {
    if (deadline && live === 0) {
      setDeadline(null); setRemaining(0);
      notify(t('পরীক্ষার সময় শেষ! এখন উত্তরপত্র মিলিয়ে নম্বর লেখো।', 'Exam time is up! Now check the answers and write your marks.'), 'info');
    }
  }, [deadline, live, notify]);
  const start = () => { const seconds = remaining || duration * 60; const now = Date.now(); setTick(now); setRemaining(seconds); setDeadline(now + seconds * 1000); };
  const pause = () => { const seconds = secondsUntil(Date.now()); setRemaining(seconds); setDeadline(null); if (seconds === 0) notify(t('পরীক্ষার সময় শেষ! এখন উত্তরপত্র মিলিয়ে নম্বর লেখো।', 'Exam time is up! Now check the answers and write your marks.'), 'info'); };
  const reset = (minutes = duration) => { setDuration(minutes); setRemaining(minutes * 60); setDeadline(null); };
  return <section className="card exam-clock-card"><div className="card-heading"><h3><Timer size={18} />{t("পরীক্ষার ঘড়ি", "Exam clock")}</h3><span className="tiny-muted">{t("পড়া হিসেবে গোনা হবে না", "Won’t count as study")}</span></div><div className={`exam-clock-display ${deadline ? 'running' : ''}`}>{examClock(live)}</div><div className="exam-clock-presets">{[30, 60, 90, 120, 180].map(minutes => <button key={minutes} className={duration === minutes ? 'active' : ''} disabled={!!deadline} onClick={() => reset(minutes)}>{t(`${bn(minutes)} মি.`, `${minutes}m`)}</button>)}</div><div className="exam-clock-actions"><button className="button primary" onClick={deadline ? pause : start}>{deadline ? <Pause size={16} /> : <Play size={16} />}{deadline ? t('বিরতি', 'Pause') : t('শুরু', 'Start')}</button><button className="button secondary" onClick={() => reset()}><RotateCcw size={16} />{t("রিসেট", "Reset")}</button></div><p className="tiny-muted">{t('অ্যাপে ফিরে এলে ঘড়ির হিসাবে বাকি সময় দেখা যাবে; এটি পড়ার সময় হিসেবে সেভ হয় না।', 'On return, remaining time is calculated from the clock; it is not saved as study time.')}</p></section>;
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
    if (!score.trim() || !total.trim() || !Number.isFinite(obtained) || !Number.isFinite(full) || full < 1 || full > 1000 || obtained < 0 || obtained > full) { setError(t('পূর্ণমান ১–১০০০ এবং প্রাপ্ত নম্বর ০ থেকে পূর্ণমানের মধ্যে হতে হবে।', 'Full marks must be 1–1000 and the obtained mark between 0 and full marks.')); return; }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) { setError(t('সময় ০–১৪৪০ মিনিটের মধ্যে হতে হবে।', 'Duration must be between 0 and 1440 minutes.')); return; }
    if (!isValidDate(date)) { setError(t('সঠিক তারিখ লেখো।', 'Enter a valid date.')); return; }
    if (data.tests.length >= 1000) { setError(t('সর্বোচ্চ ১০০০টি টেস্ট রাখা যায়।', 'You can keep at most 1000 tests.')); return; }
    const chapter = chapterId ? CHAPTERS.find(item => item.id === chapterId) : undefined;
    const resolvedTitle = title.trim() || (kind === 'chapter' && chapter ? chapter.title : kind === 'subject' ? `${subjectById[subject].name} টেস্ট` : 'মডেল টেস্ট');
    const record: TestRecord = { id: newId(), kind, title: resolvedTitle, subject, chapterIds: chapter ? [chapter.id] : [], score: obtained, total: full, durationMin: minutes, date, at: nowIso(), notes: notes.trim() };
    setData(d => ({ ...d, tests: [...d.tests, record] }));
    notify(t('টেস্টের নম্বর সেভ হয়েছে।', 'Test score saved.'), 'success'); onClose();
  };
  return <Modal title={t("নতুন টেস্টের রেকর্ড", "Record a new test")} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><label>{t("টেস্টের ধরন", "Test type")}<select value={kind} onChange={e => setKind(e.target.value as TestKind)}>{(['chapter', 'subject', 'model'] as const).map(item => <option key={item} value={item}>{TEST_KIND_LABEL[item]}</option>)}</select></label><label>{t("বিষয়", "Subject")}<select value={subject} onChange={e => { setSubject(e.target.value as SubjectId); setChapterId(''); }}>{SUBJECTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{kind === 'chapter' && <label>{t("অধ্যায়", "Chapter")}<select value={chapterId} onChange={e => setChapterId(e.target.value)}><option value="">{t("বাছো", "Choose")}</option>{CHAPTERS.filter(chapter => chapter.subject === subject).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>}<label>{t("শিরোনাম (ঐচ্ছিক)", "Title (optional)")}<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={t("যেমন: ভেক্টর টেস্ট ১", "e.g. vector test 1")} /></label><label>{t("তারিখ", "Date")}<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>{t("প্রাপ্ত নম্বর", "Marks obtained")}<input data-autofocus type="number" min={0} step="0.5" value={score} onChange={e => setScore(e.target.value)} required /></label><label>{t("পূর্ণমান", "Total marks")}<input type="number" min={1} max={1000} step="0.5" value={total} onChange={e => setTotal(e.target.value)} required /></label><label>{t("সময় (মিনিট)", "Time (min)")}<input type="number" min={0} max={1440} step={1} value={duration} onChange={e => setDuration(e.target.value)} /></label></div><label className="form-label">{t("ভুল ও শেখার নোট", "Mistakes & learning notes")}<textarea rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("কোন অংশে নম্বর হারালে…", "Where did you lose marks…")} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t("বাতিল", "Cancel")}</button><button className="button primary" type="submit"><Check size={16} />{t("সেভ করো", "Save")}</button></div></form></Modal>;
}
