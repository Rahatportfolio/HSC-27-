import DailyGoals from "../components/DailyGoals";
import { useEffect, useRef, useState } from "react";
import { usePlanner } from "../context";
import { CHAPTERS, SUBJECTS, chapterById, subjectById } from "../data";
import {
  canonicalUrl,
  mergeWatched,
  directVideo,
  emptyAdvanced,
  PREPARATION,
  priorityChapters,
  readiness,
  subjectReadiness,
  videoWeek,
} from "../advanced";
import type { StudyClass, PreparationStep, AdvancedData } from "../advanced";
import {
  deleteFile,
  downloadToFile,
  playableFile,
  storageEstimate,
} from "../files";
import { newId } from "../storage";
import { Modal, PageHeading } from "../components";
import { formatBytes } from "../pdfCatalog";
import { t } from "../i18n";
import { diffDays, todayKey } from "../planner";

const labels: Record<PreparationStep, string> = {
  lecture: "Lecture completed",
  textbook: "Textbook completed",
  notes: "Notes completed",
  mcq: "MCQ practice",
  cq: "CQ practice",
  revision1: "First revision",
  revision2: "Second revision",
  modelTest: "Model test",
  examReady: "Exam-ready",
};
function ClassPlayer({ item, close }: { item: StudyClass; close: () => void }) {
  const { setData, notify, startPresetTimer } = usePlanner();
  const [src, setSrc] = useState(item.local ? "" : item.url);
  const video = useRef<HTMLVideoElement>(null);
  const anchor = useRef<number | null>(null);
  const pending = useRef<[number, number][]>([]);
  const lastSave = useRef(0);
  const lastPosition = useRef(item.position);
  const lastDuration = useRef(item.duration);
  const flush = () => {
    const played = pending.current;
    pending.current = [];
    const position = lastPosition.current,
      duration = lastDuration.current;
    setData((d) => {
      const a = d.advanced || emptyAdvanced();
      return {
        ...d,
        advanced: {
          ...a,
          ...(played.length
            ? {
                activityDates: [
                  ...new Set([...(a.activityDates || []), todayKey()]),
                ].slice(-10000),
              }
            : {}),
          classes: a.classes.map((c) => {
            if (c.id !== item.id) return c;
            const base = mergeWatched(
              c.ranges || (c.watched ? [[0, c.watched]] : []),
              [0, 0],
              duration,
            );
            const ranges = played.reduce<[number, number][]>(
              (r, p) => mergeWatched(r, p, duration),
              base,
            );
            return {
              ...c,
              position: Math.min(duration, position),
              duration,
              ranges,
              watched: ranges.reduce((s, [a, b]) => s + b - a, 0),
            };
          }),
        },
      };
    });
  };
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [item.id]);
  useEffect(() => {
    let revoke = () => {};
    let active = true;
    if (item.local)
      void playableFile(item.id).then((f) => {
        if (!active) {
          f?.revoke();
          return;
        }
        if (!f) {
          notify("অফলাইন ফাইল পাওয়া যায়নি — পুনরায় ডাউনলোড করো।", "error");
          return;
        }
        revoke = f.revoke;
        setSrc(f.url);
      });
    return () => {
      active = false;
      flush();
      revoke();
    };
  }, [item.id]);
  return (
    <Modal title={item.title} onClose={close} wide>
      {directVideo(item.url) ? (
        <video
          ref={video}
          className="study-video"
          controls
          src={src || undefined}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (Number.isFinite(v.duration) && v.duration > 0)
              lastDuration.current = v.duration;
            v.currentTime = Math.min(item.position, lastDuration.current);
            v.playbackRate = item.speed;
            anchor.current = null;
          }}
          onSeeking={() => {
            anchor.current = null;
          }}
          onSeeked={() => {
            anchor.current = null;
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            const now = performance.now();
            if (anchor.current !== null && !v.paused && !v.seeking)
              pending.current.push([
                Math.max(
                  0,
                  v.currentTime -
                    Math.min(2, Math.max(0, (now - anchor.current) / 1000)) *
                      v.playbackRate,
                ),
                v.currentTime,
              ]);
            anchor.current = now;
            lastPosition.current = v.currentTime;
            if (now - lastSave.current > 5000) {
              flush();
              lastSave.current = now;
            }
          }}
          onPlay={() => {
            anchor.current = performance.now();
          }}
          onPause={() => {
            anchor.current = null;
            flush();
          }}
          onEnded={flush}
          onError={() =>
            notify("ভিডিও খোলা যায়নি। ফাইল/নেটওয়ার্ক পরীক্ষা করো।", "error")
          }
        />
      ) : (
        <p>
          এই প্ল্যাটফর্মে স্বয়ংক্রিয় watch tracking নেই।{" "}
          <a href={item.url} target="_blank" rel="noreferrer">
            {t("মূল ক্লাস খোলো", "Open original class")}
          </a>{" "}
          {t("এবং নিচে নিজের অগ্রগতি লেখো।", "Then record your progress below.")}
        </p>
      )}
      {startPresetTimer && (
        <button
          className="button secondary"
          onClick={() =>
            startPresetTimer({
              subject: chapterById[item.chapterId].subject,
              chapterId: item.chapterId,
              label: item.title,
              durationMin: 30,
            })
          }
        >
          {t("৩০ মিনিট Focus timer", "30-minute focus timer")}
        </button>
      )}
      <label>
        Playback speed{" "}
        <select
          defaultValue={item.speed}
          onChange={(e) => {
            const speed = Number(e.target.value);
            if (video.current) video.current.playbackRate = speed;
            setData((d) => {
              const a = d.advanced || emptyAdvanced();
              return {
                ...d,
                advanced: {
                  ...a,
                  classes: a.classes.map((c) =>
                    c.id === item.id ? { ...c, speed } : c,
                  ),
                },
              };
            });
          }}
        >
          {[1, 1.25, 1.5, 2].map((s) => (
            <option key={s} value={s}>
              {s}× · {Math.ceil((item.duration - item.watched) / 60 / s)} min
              remaining
            </option>
          ))}
        </select>
      </label>
      {!directVideo(item.url) && (
        <label>
          {t("দেখা শেষ (মিনিট)", "Watched minutes")}{" "}
          <input
            type="number"
            min="0"
            max={item.duration / 60}
            defaultValue={Math.floor(item.watched / 60)}
            onBlur={(e) => {
              const watched = Math.min(
                item.duration,
                Math.max(0, Number(e.target.value) * 60),
              );
              if (!Number.isFinite(watched)) return;
              lastPosition.current = watched;
              setData((d) => {
                const a = d.advanced || emptyAdvanced();
                return {
                  ...d,
                  advanced: {
                    ...a,
                    ...(watched > item.watched
                      ? {
                          activityDates: [
                            ...new Set([
                              ...(a.activityDates || []),
                              todayKey(),
                            ]),
                          ].slice(-10000),
                        }
                      : {}),
                    classes: a.classes.map((c) =>
                      c.id === item.id
                        ? {
                            ...c,
                            watched,
                            position: watched,
                            ranges: watched ? [[0, watched]] : [],
                          }
                        : c,
                    ),
                  },
                };
              });
            }}
          />
        </label>
      )}
      <label>
        Quick notes
        <textarea
          maxLength={20000}
          defaultValue={item.note}
          onChange={(e) => {
            const note = e.target.value;
            setData((d) => {
              const a = d.advanced || emptyAdvanced();
              return {
                ...d,
                advanced: {
                  ...a,
                  classes: a.classes.map((c) =>
                    c.id === item.id ? { ...c, note } : c,
                  ),
                },
              };
            });
          }}
        />
      </label>
      <p className="tiny-muted">
        ভিডিও progress সংরক্ষিত হয়। Study hours-এর জন্য Focus timer ব্যবহার করো;
        একই সময় দুইবার যোগ হয় না।
      </p>
    </Modal>
  );
}
export function StudyOverview() {
  const { data, plan, today, navigate } = usePlanner();
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
        {t("লক্ষ্য / পড়েছি / বাকি", "Target / studied / remaining")}:{" "}
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
export default function StudySystem() {
  const { data, setData, plan, today, notify, confirm } = usePlanner();
  const a = data.advanced || emptyAdvanced();
  const change = (fn: (a: AdvancedData) => AdvancedData) =>
    setData((d) => ({ ...d, advanced: fn(d.advanced || emptyAdvanced()) }));
  const [tab, setTab] = useState("classes");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [paperFilter, setPaperFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [chapter, setChapter] = useState(CHAPTERS[0].id);
  const [active, setActive] = useState<string | null>(() =>
    new URLSearchParams(window.location.hash.split("?")[1] || "").get("class"),
  );
  useEffect(() => {
    const sync = () =>
      setActive(
        new URLSearchParams(window.location.hash.split("?")[1] || "").get(
          "class",
        ),
      );
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const [progress, setProgress] = useState<
    Record<string, { loaded: number; total: number }>
  >({});
  const [estimate, setEstimate] = useState<{
    usage: number;
    quota: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const week = videoWeek(data, plan, today);
  const storageVersion = a.classes
    .map((c) => `${c.id}:${c.local}:${c.size}`)
    .join("|");
  useEffect(() => {
    void storageEstimate().then(setEstimate);
  }, [storageVersion]);
  const add = (form: HTMLFormElement) => {
    try {
      const f = new FormData(form);
      const url = canonicalUrl(String(f.get("url")));
      if (!String(f.get("title")).trim())
        throw new Error("Class title required");
      const duration = Number(f.get("duration")) * 60;
      if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 7 * 24 * 3600
      )
        throw new Error("সঠিক duration দাও");
      if (a.classes.some((c) => canonicalUrl(c.url) === url))
        throw new Error("ক্লাসটি আগেই যোগ করা আছে");
      if (a.classes.length >= 1000) throw new Error("Class limit reached");
      const permitted = f.get("permission") === "on";
      if (permitted && !directVideo(url))
        throw new Error(
          "Offline-এর জন্য অনুমোদিত direct MP4/WebM file প্রয়োজন। YouTube download করা হয় না।",
        );
      change((a) => ({
        ...a,
        classes: [
          ...a.classes,
          {
            id: newId(),
            title: String(f.get("title")).trim(),
            url,
            chapterId: String(f.get("chapter")),
            teacher: String(f.get("teacher")),
            duration,
            position: 0,
            watched: 0,
            speed: 1,
            permitted,
            note: "",
          },
        ],
      }));
      form.reset();
      notify("ক্লাস যোগ হয়েছে");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };
  const download = async (c: StudyClass) => {
    if (!c.permitted || !directVideo(c.url) || busy) return;
    setBusy(true);
    setProgress((p) => ({ ...p, [c.id]: { loaded: 0, total: 0 } }));
    const result = await downloadToFile(
      c.url,
      c.id,
      c.title,
      (loaded, total) =>
        setProgress((p) => ({ ...p, [c.id]: { loaded, total } })),
      "video",
    );
    setBusy(false);
    setProgress((p) => {
      const n = { ...p };
      delete n[c.id];
      return n;
    });
    if (result.ok) {
      change((a) => ({
        ...a,
        classes: a.classes.map((x) =>
          x.id === c.id ? { ...x, local: true, size: result.size } : x,
        ),
      }));
      void navigator.storage?.persist?.().catch(() => false);
      notify("অফলাইন ক্লাস সেভ হয়েছে");
    } else
      notify(
        `ডাউনলোড ব্যর্থ: ${result.error}. CORS, storage বা connection পরীক্ষা করো।`,
        "error",
      );
  };
  const todayMinutes = data.studySessions
    .filter((s) => s.date === today)
    .reduce((n, s) => n + s.minutes, 0);
  const selected = active ? a.classes.find((c) => c.id === active) : undefined;
  const r = readiness(data, chapter);
  const current = a.preparation[chapter] || {};
  const updateStep = (step: PreparationStep, value: boolean) =>
    change((a) => ({
      ...a,
      preparation: {
        ...a.preparation,
        [chapter]: { ...a.preparation[chapter], [step]: value },
      },
    }));
  return (
    <div className="view study-workspace">
      <PageHeading
        eyebrow="PROSTUTI HSC27"
        title={t("স্মার্ট স্টাডি সিস্টেম", "Smart study system")}
        description="Actual duration · Offline classes · Exam readiness"
      />
      <nav className="study-tabs" aria-label="Study workspace">
        {[
          ["classes", "ক্লাস"],
          ["offline", "Offline library"],
          ["plan", "Workload"],
          ["preparation", "প্রস্তুতি"],
        ].map(([id, label]) => (
          <button
            className={`button ${tab === id ? "primary" : "secondary"}`}
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {(tab === "classes" || tab === "offline") && (
        <>
          <section className="study-panel">
            <h2>
              {tab === "offline" ? "Offline Classes Library" : t("আমার ক্লাস", "My classes")}
            </h2>
            <input
              aria-label="Search classes"
              placeholder="Subject, paper, chapter, teacher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="goals-form">
              <label>
                Subject
                <select
                  value={subjectFilter}
                  onChange={(e) => {
                    setSubjectFilter(e.target.value);
                    setChapterFilter("");
                  }}
                >
                  <option value="">All subjects</option>
                  {SUBJECTS.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Paper
                <select
                  value={paperFilter}
                  onChange={(e) => {
                    setPaperFilter(e.target.value);
                    setChapterFilter("");
                  }}
                >
                  <option value="">All papers</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              <label>
                Chapter filter
                <select
                  value={chapterFilter}
                  onChange={(e) => setChapterFilter(e.target.value)}
                >
                  <option value="">All chapters</option>
                  {CHAPTERS.filter(
                    (c) =>
                      (!subjectFilter || c.subject === subjectFilter) &&
                      (!paperFilter || String(c.paper) === paperFilter),
                  ).map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Teacher filter
                <select
                  value={teacherFilter}
                  onChange={(e) => setTeacherFilter(e.target.value)}
                >
                  <option value="">All teachers</option>
                  {[...new Set(a.classes.map((c) => c.teacher).filter(Boolean))]
                    .sort()
                    .map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                </select>
              </label>
            </div>
            <p className="tiny-muted">
              {formatBytes(
                a.classes.reduce((s, c) => s + (c.local ? c.size || 0 : 0), 0),
              )}{" "}
              video storage{" "}
              {estimate &&
                ` · Device: ${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`}
            </p>
            <p className="tiny-muted">
              Android-এ private device files এবং web/PWA-তে IndexedDB ব্যবহৃত হয়।
              Settings-এর full backup-এ media-সহ রপ্তানি করা যায়। App data
              clear/uninstall-এর আগে backup রাখো।
            </p>
            {a.classes
              .filter(
                (c) =>
                  (tab !== "offline" || c.local) &&
                  (!subjectFilter ||
                    chapterById[c.chapterId].subject === subjectFilter) &&
                  (!paperFilter ||
                    String(chapterById[c.chapterId].paper) === paperFilter) &&
                  (!chapterFilter || c.chapterId === chapterFilter) &&
                  (!teacherFilter || c.teacher === teacherFilter) &&
                  `${c.title} ${c.teacher} ${chapterById[c.chapterId]?.title} ${subjectById[chapterById[c.chapterId].subject].name} paper ${chapterById[c.chapterId].paper}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .sort(
                (x, y) =>
                  chapterById[x.chapterId].subject.localeCompare(
                    chapterById[y.chapterId].subject,
                  ) ||
                  chapterById[x.chapterId].paper -
                    chapterById[y.chapterId].paper ||
                  x.chapterId.localeCompare(y.chapterId) ||
                  x.teacher.localeCompare(y.teacher),
              )
              .map((c) => (
                <article className="study-class" key={c.id}>
                  <h3>{c.title}</h3>
                  <p>
                    {subjectById[chapterById[c.chapterId].subject].name} · Paper{" "}
                    {chapterById[c.chapterId].paper} ·{" "}
                    {chapterById[c.chapterId].title} · {c.teacher}
                  </p>
                  <progress
                    aria-label={`${c.title} watched`}
                    max={c.duration}
                    value={c.watched}
                  />
                  <p>
                    {Math.round((c.watched / c.duration) * 100)}% watched ·{" "}
                    {Math.ceil(c.duration / 60)} min ·{" "}
                    {c.size ? formatBytes(c.size) : ""}
                  </p>
                  <div className="study-actions">
                    <button
                      className="button primary"
                      onClick={() => setActive(c.id)}
                    >
                      Resume · {Math.floor(c.position / 60)} min
                    </button>
                    {c.permitted && !c.local && (
                      <button
                        disabled={busy}
                        className="button secondary"
                        onClick={() => void download(c)}
                      >
                        {progress[c.id]
                          ? `${formatBytes(progress[c.id].loaded)}${progress[c.id].total ? ` / ${formatBytes(progress[c.id].total)}` : ""}`
                          : "Save offline"}
                      </button>
                    )}
                    {!c.permitted && (
                      <span className="tiny-muted">
                        Bookmark only · restricted platform download করা হয় না
                      </span>
                    )}
                    <button
                      className="button ghost"
                      onClick={() =>
                        confirm({
                          title: "ক্লাস সরাবে?",
                          message: "Progress ও notes-সহ এই entry মুছে যাবে।",
                          danger: true,
                          action: () => {
                            void (async () => {
                              if (c.local && !(await deleteFile(c.id))) {
                                notify("ফাইল মুছতে ব্যর্থ", "error");
                                return;
                              }
                              change((a) => ({
                                ...a,
                                classes: a.classes.filter((x) => x.id !== c.id),
                              }));
                            })();
                          },
                        })
                      }
                    >
                      Delete
                    </button>
                    {c.local && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          void (async () => {
                            if (await deleteFile(c.id))
                              change((a) => ({
                                ...a,
                                classes: a.classes.map((x) =>
                                  x.id === c.id
                                    ? { ...x, local: false, size: undefined }
                                    : x,
                                ),
                              }));
                            else notify("ফাইল মুছতে ব্যর্থ", "error");
                          })()
                        }
                      >
                        Remove download only
                      </button>
                    )}
                  </div>
                </article>
              ))}
            {!a.classes.some((c) => tab !== "offline" || c.local) && (
              <p>
                এখনো কোনো ক্লাস নেই। অনুমোদিত direct file অথবা bookmark যোগ করো।
              </p>
            )}
          </section>
          {tab === "classes" && (
            <form
              className="study-panel study-form"
              onSubmit={(e) => {
                e.preventDefault();
                add(e.currentTarget);
              }}
            >
              <h2>{t("ক্লাস যোগ করো", "Add class")}</h2>
              <label>
                {t("ক্লাসের নাম", "Class name")}
                <input name="title" required maxLength={300} />
              </label>
              <label>
                {t("লিংক", "URL")}
                <input name="url" type="url" required maxLength={2000} />
              </label>
              <label>
                {t("অধ্যায়", "Chapter")}
                <select name="chapter">
                  {CHAPTERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {subjectById[c.subject].short} {c.paper} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("শিক্ষক", "Teacher")}
                <input name="teacher" maxLength={200} />
              </label>
              <label>
                {t("প্রকৃত duration (minutes)", "Actual duration (minutes)")}
                <input
                  name="duration"
                  type="number"
                  required
                  min="1"
                  max="10080"
                  step="0.1"
                />
              </label>
              <label className="check-line">
                <input name="permission" type="checkbox" />{" "}
                {t("মালিক এই direct video file download করার অনুমতি দিয়েছেন", "The owner allows downloading this direct video file")}
              </label>
              <button className="button primary">{t("ক্লাস যোগ করো / বুকমার্ক", "Add class / bookmark")}</button>
            </form>
          )}
        </>
      )}
      {tab === "plan" && (
        <>
          <DailyGoals key={today} />
          <section className="study-panel">
            <h2>Daily target</h2>
            <p>
              আজ {todayMinutes.toFixed(0)} / {week[0].capacity} min · বাকি{" "}
              {Math.max(0, week[0].capacity - todayMinutes).toFixed(0)} min
            </p>
            {a.targets[today] !== undefined && (
              <p>{t("আজকের target locked ✓", "Today’s target locked ✓")}</p>
            )}
            <label>
              প্রতি subject-এ daily video workload limit (min)
              <input
                type="number"
                min="1"
                max="1440"
                value={a.subjectMinutes}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 1 && n <= 1440)
                    change((a) => ({ ...a, subjectMinutes: n }));
                }}
              />
            </label>
            <p>
              ভিডিও session মূল routine-এই বসে। দিনের সর্বোচ্চ অর্ধেক video
              workload; প্রতি subject-এর limit মানা হয়। বাকি textbook/practice
              কাজ পরের খালি slot-এ থাকে—মুছে যায় না। Video workload-এ ⅔ video + ⅓
              breaks/notes/practice/revision। অসমাপ্ত ক্লাস actual progress থেকে
              আবার ভাগ হয়।
            </p>
          </section>
          {week.map((d) => (
            <section className="study-panel" key={d.date}>
              <h3>
                {d.date} ·{" "}
                {Math.ceil(d.sessions.reduce((s, c) => s + c.minutes, 0))} min
                new classes
              </h3>
              <p>
                {d.reserved.toFixed(0)} min existing plan ·{" "}
                {d.logged.toFixed(0)} logged · {d.capacity} min limit
              </p>
              {d.reserved + d.logged > d.capacity && (
                <p role="status">
                  Existing schedule exceeds available time. No extra classes
                  added.
                </p>
              )}
              {d.sessions.map((s, i) => (
                <div className="study-session" key={`${s.id}-${i}`}>
                  <span>
                    {s.title} · {Math.floor(s.from / 60)}–{Math.ceil(s.to / 60)}{" "}
                    min of video
                  </span>
                  <strong>{Math.ceil(s.minutes)} min incl. overhead</strong>
                  <button
                    className="button ghost"
                    onClick={() => setActive(s.id)}
                  >
                    Open
                  </button>
                </div>
              ))}
              {!d.sessions.length && (
                <p className="tiny-muted">
                  No spare capacity or no pending classes.
                </p>
              )}
            </section>
          ))}
          {!!plan.at(-1)?.deferredMinutes && (
            <p role="alert">
              Scheduling horizon reached.{" "}
              {Math.ceil(plan.at(-1)!.deferredMinutes!)} min remains
              unscheduled; increase available time. No source tasks were
              deleted.
            </p>
          )}
          <section className="study-panel">
            <h2>Smart priority</h2>
            {priorityChapters(data, today)
              .slice(0, 5)
              .map((c) => (
                <p key={c.id}>
                  {subjectById[c.subject].short} · {c.title} · readiness{" "}
                  {readiness(data, c.id).readiness}%
                </p>
              ))}
          </section>
        </>
      )}
      {tab === "preparation" && (
        <section className="study-panel">
          <h2>Coverage ≠ Exam readiness</h2>
          <label>
            Chapter
            <select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
            >
              {CHAPTERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {subjectById[c.subject].short} {c.paper} · {c.title}
                </option>
              ))}
            </select>
          </label>
          <p>
            Video watched {r.watched}% · Coverage {r.coverage}% · Exam readiness{" "}
            {r.readiness}%
          </p>
          <div className="study-checklist">
            {PREPARATION.map((step) => (
              <label className="check-line" key={step}>
                <input
                  type="checkbox"
                  checked={
                    step === "lecture"
                      ? r.lectures
                      : step === "revision1"
                        ? !!current[step] ||
                          data.revisions.some(
                            (x) =>
                              x.chapterId === chapter &&
                              x.interval === 1 &&
                              x.completedAt &&
                              !x.sourceTaskId?.startsWith("auto-"),
                          )
                        : step === "revision2"
                          ? !!current[step] ||
                            data.revisions.some(
                              (x) =>
                                x.chapterId === chapter &&
                                x.interval === 3 &&
                                x.completedAt &&
                                !x.sourceTaskId?.startsWith("auto-"),
                            )
                          : !!current[step]
                  }
                  disabled={
                    step === "lecture" &&
                    a.classes.some((c) => c.chapterId === chapter)
                  }
                  onChange={(e) => updateStep(step, e.target.checked)}
                />
                {labels[step]}
              </label>
            ))}
          </div>
          <p className="tiny-muted">
            যুক্ত ক্লাস না দেখে Lecture completed হবে না। Exam-ready কার্যকর হতে
            আগের সব ধাপ সম্পন্ন হওয়া দরকার। পুরোনো task progress অপরিবর্তিত থাকে।
          </p>
          <h3>Subject readiness</h3>
          {subjectReadiness(data).map((s) => (
            <div className="study-session" key={s.id}>
              <span>{s.name}</span>
              <progress max="100" value={s.percent} aria-label={s.name} />
              <strong>{s.percent}%</strong>
            </div>
          ))}
        </section>
      )}
      {selected && (
        <ClassPlayer item={selected} close={() => setActive(null)} />
      )}
    </div>
  );
}
