/** Home summary kept separate from the optional media workspace. */
import { usePlanner } from '../context';
import { emptyAdvanced, priorityChapters, readiness, videoWeek } from '../advanced';
import { subjectById } from '../data';
import { diffDays, formatDate } from '../planner';
import { t } from '../i18n';

export function StudyOverview() {
  const { data, plan, today, navigate } = usePlanner();
  if (today < data.settings.startDate) return (
    <section className="study-panel" aria-label={t('পরিকল্পনা এখনো শুরু হয়নি', 'Plan has not started')}>
      <h2>{t('রুটিন শুরু', 'Routine starts')} · {formatDate(data.settings.startDate, 'long')}</h2>
      <p>{t('শুরুর আগে কোনো রুটিন সেশন নির্ধারিত নেই। নিচে তারিখ বেছে দিনের পূর্বরূপ দেখতে পারো; চাইলে এখনো নিজের অনুশীলন বা পড়ার সময় লিখে রাখতে পারো।', 'No routine sessions are assigned before the start. Use the date picker below to preview a planned day; optional practice and study logging remain available.')}</p>
      <button className="button secondary" onClick={() => navigate('calendar', data.settings.startDate)}>{t('প্রথম দিনের পরিকল্পনা দেখো', 'Preview the first day')}</button>
    </section>
  );
  const week = videoWeek(data, plan, today);
  const a = data.advanced || emptyAdvanced();
  const priorities = priorityChapters(data, today)
    .filter((c) => readiness(data, c.id).readiness < 100)
    .slice(0, 3);
  const studied = data.studySessions
    .filter((s) => s.date === today)
    .reduce((s, c) => s + c.minutes, 0);
  return (
    <section className="study-panel">
      <div className="study-session">
        <h2>{t("আজকের স্মার্ট লক্ষ্য", "Today’s smart target")}</h2>
        <button
          className="button secondary"
          onClick={() => navigate("studySystem")}
        >
          {t("Study workspace খোলো", "Open study workspace")}
        </button>
      </div>
      <p>
        {t("লক্ষ্য / পড়েছি / বাকি", "Target / studied / remaining")}:{" "}
        {(week[0].capacity / 60).toFixed(1)}h / {(studied / 60).toFixed(1)}h /{" "}
        {(Math.max(0, week[0].capacity - studied) / 60).toFixed(1)}h
      </p>
      <p>
        {week[0].sessions.length} video sessions ·{" "}
        {a.classes.filter((c) => c.watched < c.duration * 0.98).length}{" "}
        unfinished · Test Exam:{" "}
        {Math.max(0, diffDays(today, data.settings.testExamDate))} days · HSC:{" "}
        {Math.max(0, diffDays(today, data.settings.examDate))} days
      </p>
      <details>
        <summary>
          {t("আগামী ৭ দিন ও অগ্রাধিকার", "Next 7 days & priorities")}
        </summary>
        {priorities.map((c) => (
          <p key={c.id}>
            {subjectById[c.subject].short} · {c.title} · readiness{" "}
            {readiness(data, c.id).readiness}%
          </p>
        ))}
        <div className="study-week-strip">
          {week.map((d) => (
            <div key={d.date}>
              <small>{d.date.slice(5)}</small>
              <strong>
                {Math.ceil(
                  d.reserved + d.sessions.reduce((n, s) => n + s.minutes, 0),
                )}{" "}
                min
              </strong>
              <span>{d.sessions.length} sessions</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
