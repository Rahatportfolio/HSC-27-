import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck2, FileWarning, Link2, ShieldAlert } from 'lucide-react';
import { usePlanner } from '../context';
import { PageHeading } from '../components';
import { auditHeadline, bnNum, selfAudit } from '../selfAudit';
import { weakestSourcedChapters } from '../sources';
import { isEnglish, t } from '../i18n';

const TONE: Record<'ok' | 'warn' | 'fail', string> = { ok: 'ok', warn: 'warn', fail: 'fail' };

/** The self-audit screen: every number re-counted from the source, limits stated plainly. */
export default function AuditView() {
  const { data, today, navigate } = usePlanner();
  const report = useMemo(() => selfAudit(data, today), [data, today]);
  const headline = auditHeadline(report);
  const thinSources = useMemo(() => weakestSourcedChapters(report.sources, 12), [report.sources]);

  return <div className="view audit-view">
    <PageHeading
      eyebrow="CHECK THE APP, NOT THE MARKETING"
      title={t('প্রতিটি সংখ্যা আবার গোনা হয়েছে।', 'Every number, counted again.')}
      titleEn="Every number, counted again."
      description="এই পেজ নিজের অ্যাপের সঙ্গে সৎ থাকার জায়গা—প্রশ্নব্যাংক, জেনারেটর, সীমা আর যেগুলো এখনো হয়নি, সব এখানে সংখ্যা-সহ। কোনো পরীক্ষা ব্যর্থ হলে সেটাও লেখা থাকবে।"
      descriptionEn="This page re-counts the app's own claims from their sources and states the limits out loud."
      action={<button className="button secondary" onClick={() => navigate('settings')}>{t('ব্যাকআপ নাও', 'Take a backup')}</button>}
    />

    <section className={`card audit-headline ${TONE[headline.status]}`}>
      {headline.status === 'ok' ? <CheckCircle2 size={22} /> : headline.status === 'warn' ? <AlertTriangle size={22} /> : <ShieldAlert size={22} />}
      <div><strong>{t(headline.bn, headline.en)}</strong><span>{t('সর্বশেষ গোনা', 'Counted')} · {bnNum(new Date(report.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span></div>
    </section>

    <div className="audit-grid">
      {report.checks.map(check => <section key={check.key} className={`card audit-check ${TONE[check.status]}`}>
        <div className="audit-check-top">
          <span className="audit-check-label">{t(check.labelBn, check.labelEn)}</span>
          {check.status === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        </div>
        <strong className="audit-check-value">{isEnglish() && check.valueEn ? check.valueEn : check.value}</strong>
        <p>{t(check.detailBn, check.detailEn)}</p>
      </section>)}
    </div>

    <section className="card audit-counts">
      <div className="card-heading"><div><h2><FileCheck2 size={19} />{t('ইঞ্জিনের ভেতরের হিসাব', 'Inside the engines')}</h2><p>{t('প্রতিটি সংখ্যা সরাসরি উৎস থেকে—UI-এর কোনো লেখা এখানে ব্যবহার হয়নি।', 'Every figure is read from the source, not from what the UI happens to display.')}</p></div></div>
      <div className="audit-count-grid">
        <div><span>{t('ব্যাংকের প্রশ্ন', 'Banked questions')}</span><strong>{bnNum(report.counts.bankQuestions)}</strong></div>
        <div><span>{t('প্রতি অধ্যায়ে', 'Per chapter')}</span><strong>{bnNum(report.counts.banksPerChapter.min)}–{bnNum(report.counts.banksPerChapter.max)}</strong></div>
        <div><span>{t('তথ্যভিত্তিক প্রশ্ন', 'Fact questions')}</span><strong>{bnNum(report.counts.factQuestions)}</strong></div>
        <div><span>{t('সূত্র-প্রশ্ন', 'Formula questions')}</span><strong>{bnNum(report.counts.numericQuestions)}</strong></div>
        <div className={report.counts.verifyIssues ? 'warn' : ''}><span>{t('যাচাই-ত্রুটি', 'Verification issues')}</span><strong>{bnNum(report.counts.verifyIssues)}</strong></div>
        <div className={report.counts.duplicates ? 'warn' : ''}><span>{t('ডুপ্লিকেট প্রশ্ন', 'Duplicate prompts')}</span><strong>{bnNum(report.counts.duplicates)}</strong></div>
      </div>
    </section>

    {report.thin.length > 0 && <section className="card audit-thin">
      <div className="card-heading"><div><h2><AlertTriangle size={19} />{t('যেসব অধ্যায়ে এখনো ১০ প্রশ্ন হয় না', 'Chapters that cannot fill ten questions yet')}</h2><p>{t('এগুলো দুর্বল অধ্যায় নয়—প্রশ্ন কম, এই যা। সিমুলেটর এখন পরীক্ষা শুরুর আগেই সত্যি সংখ্যা বলে দেয়।', 'These are not weak chapters — just thin pools. The simulator now states the real size before the start.')}</p></div><span className="tiny-muted">{bnNum(report.thin.length)} {t('টি', '')}</span></div>
      <div className="audit-thin-list">{report.thin.slice(0, 24).map(entry => <div key={entry.chapterId} className="audit-thin-row">
        <span><strong>{entry.title}</strong><small>{entry.subject} · {t('অগ্রাধিকার', 'priority')} {entry.priority}</small></span>
        <span className="audit-thin-numbers"><small>{t('তথ্য', 'facts')} {bnNum(entry.facts)}</small><small>{t('সূত্র', 'formula')} {bnNum(entry.numeric)}</small><small className={entry.pool < 5 ? 'warn' : ''}>{t('পুল', 'pool')} {bnNum(entry.pool)}</small></span>
      </div>)}</div>
    </section>}


    <section className="card audit-sources">
      <div className="card-heading"><div><h2><Link2 size={19} />{t('প্রশ্ন কোথা থেকে আসছে', 'Where the questions come from')}</h2><p>{t('ভিডিও, ব্যাংক আর জেনারেটর—তিনটে আলাদা করে গোনা। একটাকে দিয়ে অন্যটার দাবি মেটানো হয় না।', 'Videos, the bank and the generator are counted separately; one never stands in for another.')}</p></div><span className="tiny-muted">{t('বোর্ড ভিডিও', 'board videos')} {bnNum(report.sources.totals.chaptersWithBoardVideo)}/{bnNum(report.counts.chapters)}</span></div>
      <p className="audit-source-verdict">{t(report.sources.verdictBn, report.sources.verdictEn)}</p>
      <div className="audit-count-grid">
        <div><span>{t('যাচাই করা ক্লাস লিংক', 'Verified class links')}</span><strong>{bnNum(report.sources.totals.verifiedLinks)}</strong></div>
        <div><span>{t('সার্চ-লিংক (শুধু সার্চ)', 'Search-only links')}</span><strong>{bnNum(report.sources.totals.searchLinks)}</strong></div>
        <div><span>{t('প্রতি অধ্যায়ে প্রশ্ন', 'Questions per chapter')}</span><strong>{bnNum(report.sources.totals.averageBank)}</strong></div>
        <div className={report.sources.totals.chaptersWithBoardQuestion ? '' : 'warn'}><span>{t('ভিডিও থেকে পাওয়া বোর্ড প্রশ্ন', 'Board questions from videos')}</span><strong>{bnNum(report.sources.totals.boardQuestions)} · {bnNum(report.sources.totals.chaptersWithBoardQuestion)} {t('অধ্যায়', 'ch.')}</strong></div>
        <div className="warn"><span>{t('বোর্ড প্লেলিস্ট নেই', 'No board playlist')}</span><strong>{bnNum(report.counts.chapters - report.sources.totals.chaptersWithBoardVideo)}</strong></div>
      </div>
      <div className="audit-thin-list">{thinSources.map(entry => <div key={entry.chapterId} className="audit-source-row">
        <span><strong>{entry.title}</strong><small>{t(entry.subject, entry.subjectEn)} · {t('ভিডিও', 'videos')} {bnNum(entry.verifiedLinks)} · {t('প্রশ্ন', 'MCQs')} {bnNum(entry.bank)}</small></span>
        <span className="audit-source-gaps">{entry.gaps.map(gap => <small key={gap} className="warn"><FileWarning size={12} />{t(
          gap === 'no-board-video' ? 'বোর্ড প্লেলিস্ট নেই' : gap === 'no-direct-class' ? 'সরাসরি ক্লাস নেই' : gap === 'no-board-question' ? 'বোর্ড প্রশ্ন নেই' : 'প্রশ্ন কম',
          gap === 'no-board-video' ? 'no board playlist' : gap === 'no-direct-class' ? 'no direct class' : gap === 'no-board-question' ? 'no board question' : 'few MCQs',
        )}</small>)}</span>
      </div>)}</div>
    </section>
    <section className="card audit-limits">
      <div className="card-heading"><div><h2><ShieldAlert size={19} />{t('যা এই অ্যাপ ইচ্ছে করে করে না', 'What this app deliberately does not do')}</h2><p>{t('সীমা লুকালে ভরসা কমে; তাই এখানেই লেখা।', 'Hiding a limit costs trust, so the limits live here.')}</p></div></div>
      <ul>{report.limits.map(limit => <li key={limit.en}>{t(limit.bn, limit.en)}</li>)}</ul>
    </section>
  </div>;
}
