import { useEffect, useState } from "react";
import { usePlanner } from "../context";
import { emptyAdvanced } from "../advanced";
import { dailyGoalDefaults, lockDailyGoals } from "../dailyGoals";
import { dailyPractice, weeklySubjects, weakChapters } from "../studyMetrics";
import { subjectById } from "../data";
import { t } from "../i18n";
export default function DailyGoals() {
  const { data, setData, today, navigate, openChapter } = usePlanner();
  const a = data.advanced || emptyAdvanced();
  const saved = a.dailyGoals?.[today];
  const [draft, setDraft] = useState(() => dailyGoalDefaults(data, today));
  const target = a.targets[today],
    override = data.dayOverrides[today]?.dailyHours;
  useEffect(() => {
    setDraft(dailyGoalDefaults(data, today));
  }, [
    today,
    saved,
    target,
    override,
    data.settings.dailyHours,
    data.settings.boostEnabled,
    data.settings.boostStartDate,
    data.settings.boostDailyHours,
  ]);
  const done = dailyPractice(data, today);
  const weak = weakChapters(data);
  const lock = () => setData((d) => lockDailyGoals(d, today, draft));
  return (
    <section className="study-panel">
      <h2>{t("আজকের অনুশীলনের লক্ষ্য", "Today’s practice targets")}</h2>
      <div className="daily-goals-grid">
        {(["mcq", "cq", "revision"] as const).map((k) => (
          <div key={k}>
            <strong>{k.toUpperCase()}</strong>
            <p>
              {done[k]} / {saved?.[k] ?? draft[k]}
            </p>
            <progress
              aria-label={`${k} daily target`}
              max={Math.max(1, saved?.[k] ?? draft[k])}
              value={done[k]}
            />
          </div>
        ))}
      </div>
      {!saved?.locked ? (
        <form
          className="goals-form"
          onSubmit={(e) => {
            e.preventDefault();
            lock();
          }}
        >
          {(["minutes", "mcq", "cq", "revision"] as const).map((k) => (
            <label key={k}>
              {k === "minutes"
                ? t("Daily minutes", "Daily minutes")
                : k.toUpperCase()}
              <input
                type="number"
                min={0}
                max={k === "minutes" ? 1440 : 10000}
                required
                value={draft[k]}
                onChange={(e) =>
                  setDraft((x) => ({ ...x, [k]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
          <button className="button secondary">
            {t("লক্ষ্য ঠিক করে lock করো", "Lock daily targets")}
          </button>
        </form>
      ) : (
        <p>
          {t(
            "আজকের লক্ষ্য locked—অগ্রগতি actual practice থেকে হিসাব হয়।",
            "Today’s targets are locked. Progress comes from actual practice.",
          )}
        </p>
      )}
      <div className="study-actions">
        <button
          className="button secondary small"
          onClick={() => navigate("practice")}
        >
          {t("MCQ / CQ অনুশীলন", "MCQ / CQ practice")}
        </button>
        <button
          className="button secondary small"
          onClick={() => navigate("revision")}
        >
          {t("Revision খোলো", "Open revision")}
        </button>
      </div>
      <details>
        <summary>
          {t("সাপ্তাহিক ফল ও দুর্বল অধ্যায়", "Weekly performance & weak chapters")}
        </summary>
        <div className="weekly-performance">
          {weeklySubjects(data, today).map((s) => (
            <div className="study-session" key={s.id}>
              <strong>{s.short}</strong>
              <span>
                {Math.round(s.minutes)} min · MCQ{" "}
                {s.accuracy === null ? "—" : `${s.accuracy}%`} ({s.attempts}) ·
                Δ{" "}
                {s.change === null
                  ? "—"
                  : `${s.change > 0 ? "+" : ""}${s.change}%`}{" "}
                · Test {s.testScore === null ? "—" : `${s.testScore}%`}
              </span>
            </div>
          ))}
        </div>
        <p className="tiny-muted">
          {t(
            "গত ৭ দিন বনাম আগের ৭ দিন। তথ্য না থাকলে — দেখায়; অনুমান করা হয় না।",
            "Last 7 days versus the previous 7 days. Missing evidence is shown as —, not guessed.",
          )}
        </p>
        {weak.length ? (
          weak.slice(0, 10).map((c) => (
            <button
              key={c.id}
              className="weak-chapter-button"
              onClick={() => openChapter(c)}
            >
              {subjectById[c.subject].short} · {c.title} · {c.wrong}/
              {c.attempts} MCQ mistakes · {c.lowCq} low CQ
            </button>
          ))
        ) : (
          <p>{t("পুনরাবৃত্ত ভুল শনাক্ত হয়নি।", "No repeated mistakes detected.")}</p>
        )}
      </details>
    </section>
  );
}
