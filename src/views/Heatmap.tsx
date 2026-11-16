import { useMemo, useState } from 'react';
import { ArrowRight, Grid3x3, Snowflake, Target, TrendingUp } from 'lucide-react';
import { usePlanner } from '../context';
import { subjectById } from '../data';
import { bn, formatDate, percent } from '../planner';
import { EmptyState, PageHeading, ProgressBar, SubjectBadge } from '../components';
import { HEAT_LABEL, HEAT_LEVELS, syllabusHeat } from '../heatmap';
import type { HeatCell } from '../heatmap';
import { t } from '../i18n';

/**
 * The syllabus heatmap. Every colour is derived from stored progress; the legend says
 * exactly what each colour means, and the "why" line under a chapter repeats the numbers
 * that produced it, so the map can be checked rather than trusted.
 */
export default function HeatmapView() {
  const { plan, data, today, openChapter, navigate } = usePlanner();
  const [horizon, setHorizon] = useState(7);
  const [onlyCold, setOnlyCold] = useState(false);
  const heat = useMemo(() => syllabusHeat(data, plan, { horizonDays: horizon }), [data, plan, horizon]);
  const total = heat.rows.reduce((sum, row) => sum + row.cells.length, 0);
  const cold = heat.counts[0] + heat.counts[1];

  const open = (cell: HeatCell) => openChapter(cell.chapter);

  return <div className="view heatmap-view">
    <PageHeading
      eyebrow="MAP THE SYLLABUS, NOT THE FEELING"
      title={t('কোন অধ্যায়ে কতটুকু বাকি—এক নজরে।', 'See exactly how much is left.')}
      titleEn="See exactly how much is left."
      description="প্রতিটি ঘর একটি অধ্যায়। রং আসে সত্যিকারের তথ্য থেকে—সম্পন্ন সেশন, অধ্যায়ের অবস্থা, MCQ/CQ চেষ্টা ও প্রস্তুতি। কোনো তথ্য না থাকলে ঘর ধূসর থাকে, সবুজ নয়।"
      descriptionEn="One cell per chapter. Colour comes from real stored progress, never from optimism."
      action={<div className="heatmap-head-stats">
        <span><Grid3x3 size={16} /><strong>{bn(total)}</strong>{t('অধ্যায়', 'chapters')}</span>
        <span className={cold ? 'warn' : ''}><Snowflake size={16} /><strong>{bn(cold)}</strong>{t('ঠান্ডা', 'cold')}</span>
        <span><TrendingUp size={16} /><strong>{bn(heat.overall)}%</strong>{t('প্রস্তুতি', 'ready')}</span>
      </div>}
    />

    <section className="card heat-legend-card">
      <div className="heat-legend">{HEAT_LEVELS.map(level => <span key={level} className={`heat-chip l${level}`}><i />{t(HEAT_LABEL[level].bn, HEAT_LABEL[level].en)}<small>{bn(heat.counts[level])}</small></span>)}</div>
      <div className="heat-controls">
        <label>{t('কত দিন সামনে দেখবে', 'Look ahead')}<select value={horizon} onChange={event => setHorizon(Number(event.target.value))}>{[7, 14, 30].map(days => <option key={days} value={days}>{bn(days)} {t('দিন', 'days')}</option>)}</select></label>
        <label className="check-line"><input type="checkbox" checked={onlyCold} onChange={event => setOnlyCold(event.target.checked)} />{t('শুধু ঠান্ডা অধ্যায়', 'Only cold chapters')}</label>
      </div>
    </section>

    {heat.focus.length > 0 && <section className="card heat-focus-card">
      <div className="card-heading"><div><h2><Target size={19} />{t('এখনই ধরো', 'Grab these now')}</h2><p>{t('A-প্রায়োরিটি আগে, তারপর যেটা সবচেয়ে পিছিয়ে।', 'Priority-A first, then the furthest behind.')}</p></div><button className="text-button" onClick={() => navigate('weakness')}>{t('দুর্বলতা স্ক্রিন', 'Weakness screen')}<ArrowRight size={14} /></button></div>
      <div className="heat-focus-list">{heat.focus.map(cell => <button key={cell.chapterId} className={`heat-focus-row l${cell.level}`} onClick={() => open(cell)}>
        <i className={`heat-dot l${cell.level}`} />
        <span className="heat-focus-title"><strong>{cell.chapter.number}. {cell.chapter.title}</strong><small>{cell.reason}</small></span>
        <span className="heat-focus-meta">{subjectById[cell.subject].short}<strong>{bn(cell.readiness)}%</strong>{(cell.nextDate ?? '') && <small>{formatDate(cell.nextDate!)}</small>}</span>
      </button>)}</div>
    </section>}

    <section className="card heat-grid-card">
      <div className="card-heading"><div><h2>{t('সিলেবাসের মানচিত্র', 'Syllabus map')}</h2><p>{t('ঘরে ক্লিক করলে অধ্যায় খুলবে। নিচের লেখা জানায় কেন ওই রং।', 'Click a cell to open the chapter; the line under it explains the colour.')}</p></div></div>
      {heat.rows.map(row => {
        const cells = onlyCold ? row.cells.filter(cell => cell.level <= 1) : row.cells;
        return <div className="heat-row" key={row.subject}>
          <div className="heat-row-head">
            <SubjectBadge subject={row.subject} />
            <span className="heat-row-progress"><ProgressBar value={row.readiness} /><small>{bn(row.readiness)}% · {bn(cells.length)}/{bn(row.cells.length)}</small></span>
            {row.cold > 0 && <span className="heat-cold">{t(`${bn(row.cold)}টি ঠান্ডা`, `${row.cold} cold`)}</span>}
          </div>
          {cells.length ? <div className="heat-grid">{cells.map(cell => <button
            key={cell.chapterId}
            className={`heat-cell l${cell.level}`}
            onClick={() => open(cell)}
            title={`${cell.chapter.title} — ${t(cell.reason, cell.reasonEn)}`}
            aria-label={`${cell.chapter.title} — ${t(HEAT_LABEL[cell.level].bn, HEAT_LABEL[cell.level].en)} ${cell.readiness}%`}
          >
            <strong>{cell.chapter.number}</strong>
            <span>{cell.chapter.title}</span>
            <i />
          </button>)}</div> : <p className="tiny-muted padded">{t('এই বিষয়ে ঠান্ডা অধ্যায় নেই।', 'No cold chapters in this subject.')}</p>}
        </div>;
      })}
    </section>

    {heat.slipped.length > 0 && <section className="card heat-slip-card">
      <div className="card-heading"><div><h2><Snowflake size={18} />{t('পিছলে যাচ্ছে', 'Slipping quietly')}</h2><p>{t('পরিকল্পনায় আর সামনে নেই, কিন্তু পরীক্ষার প্রস্তুতিও হয়নি।', 'Nothing is scheduled ahead, yet the chapter is not exam-ready either.')}</p></div></div>
      <div className="heat-slip-list">{heat.slipped.slice(0, 8).map(cell => <div key={cell.chapterId} className="heat-slip-row">
        <i className={`heat-dot l${cell.level}`} />
        <span><strong>{cell.chapter.title}</strong><small>{cell.reason}</small></span>
        <span className="heat-slip-stats">{bn(cell.done)}/{bn(cell.planned)} {t('সেশন', 'sessions')} · {bn(cell.readiness)}%</span>
        <button className="text-button" onClick={() => open(cell)}>{t('খোলো', 'Open')}<ArrowRight size={13} /></button>
      </div>)}</div>
    </section>}

    {!heat.rows.some(row => row.cells.some(cell => cell.level >= 2)) && <EmptyState
      title={t('মানচিত্র এখনো সাদা', 'The map is still blank')}
      description={t('আজকের একটি সেশন শেষ করো বা একটি অধ্যায় খুলে অবস্থা দাও—ঘর তখনই রং পাবে। কোনো কাজ না করলে সবুজ রং কখনো আসবে না।', 'Finish one session or set a chapter stage — colours only appear from real work.')}
    />}

    <p className="tiny-muted padded">{t('প্রস্তুতি = পরিকল্পিত সেশনের অগ্রগতি, অধ্যায়ের অবস্থা, প্রস্তুতির কভারেজ, MCQ/CQ চেষ্টা ও দুর্বলতার স্কোরের মিশ্রণ। দুর্বল অধ্যায় ৩৫%-এ সীমাবদ্ধ, আর পরীক্ষা ছাড়া কোনো অধ্যায় ৬৫%-এর বেশি "তৈরি" বলে দাবি করে না।', 'Readiness blends plan progress, chapter stage, coverage, MCQ/CQ attempts and the weakness score. Weak chapters are capped at 35%, and nothing is called ready above 65% without a test.')} · {t('আজ', 'Today')}: {formatDate(today)} · {percent(cold, Math.max(1, total))}% {t('এখনো ঠান্ডা', 'still cold')}</p>
  </div>;
}
