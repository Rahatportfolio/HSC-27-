import { describe, expect, it } from "vitest";
import { CHAPTERS } from "./data";
import { freshData } from "./planner";
import {
  canonicalUrl,
  collectLinks,
  resourceKey,
  directVideo,
  emptyAdvanced,
  mergeWatched,
  parseAdvanced,
  PREPARATION,
  readiness,
  videoWeek,
} from "./advanced";
import type { StudyClass } from "./advanced";
import { parseBackup } from "./storage";
import { ensureRevisions } from "./revision";
import { chapterStage } from "./learning";
const item = (): StudyClass => ({
  id: "test",
  title: "Seven hour class",
  url: "https://example.org/class.mp4",
  chapterId: CHAPTERS[0].id,
  teacher: "Teacher",
  duration: 25200,
  position: 0,
  watched: 0,
  speed: 1,
  permitted: true,
  note: "",
});
const setup = () => {
  const data = freshData();
  data.advanced = { ...emptyAdvanced(), classes: [item()] };
  return data;
};
describe("duration-aware study system", () => {
  it("collects pasted public links without scraping and detects Drive aliases", () => {
    expect(
      collectLinks(
        "Notes: https://example.org/a.pdf. duplicate https://example.org/a.pdf#x",
      ),
    ).toEqual(["https://example.org/a.pdf"]);
    expect(
      resourceKey("https://drive.google.com/file/d/abc_123/view?usp=sharing"),
    ).toBe(resourceKey("https://drive.google.com/open?id=abc_123"));
  });
  it("splits seven hours across days and accounts for overhead and playback speed", () => {
    const d = setup();
    d.settings.dailyHours = 4;
    const week = videoWeek(d, [], "2026-11-15");
    expect(week[0].sessions.reduce((s, c) => s + c.minutes, 0)).toBeCloseTo(90);
    expect(week[0].sessions.reduce((s, c) => s + c.to - c.from, 0)).toBeCloseTo(
      3600,
    );
    expect(week.filter((x) => x.sessions.length)).toHaveLength(7);
    d.advanced!.classes[0].speed = 2;
    expect(
      videoWeek(d, [], "2026-11-15").filter((x) => x.sessions.length),
    ).toHaveLength(4);
  });
  it("respects locked targets, measured time and existing workload", () => {
    const d = setup();
    d.advanced!.targets["2026-11-15"] = 60;
    d.studySessions = [
      {
        id: "s",
        date: "2026-11-15",
        at: "2026-11-15T00:00:00Z",
        subject: "physics",
        minutes: 45,
        mode: "stopwatch",
      },
    ];
    expect(
      videoWeek(d, [], "2026-11-15")[0].sessions.reduce(
        (s, x) => s + x.minutes,
        0,
      ),
    ).toBeCloseTo(15);
    d.advanced!.targets["2026-11-15"] = 30;
    expect(videoWeek(d, [], "2026-11-15")[0].sessions).toHaveLength(0);
  });
  it("rolls missed work forward from actual watch progress without changing prior dates", () => {
    const d = setup();
    const first = videoWeek(d, [], "2026-11-15")[0];
    expect(videoWeek(d, [], "2026-11-16")[0].sessions[0].from).toBe(0);
    d.advanced!.classes[0].watched = first.sessions.at(-1)!.to;
    expect(videoWeek(d, [], "2026-11-16")[0].sessions[0].from).toBe(
      first.sessions.at(-1)!.to,
    );
  });
  it("separates coverage and readiness and blocks premature chapter completion", () => {
    const d = setup();
    const id = CHAPTERS[0].id;
    d.chapterMeta[id] = {
      stage: "completed",
      note: "",
      weak: false,
      cq: "none",
      mcq: "none",
      updatedAt: "2026-11-15T00:00:00Z",
    };
    expect(chapterStage(CHAPTERS[0], d, [])).toBe("inProgress");
    d.advanced!.classes[0].watched = 25200;
    expect(readiness(d, id).readiness).toBe(11);
    d.advanced!.preparation[id] = Object.fromEntries(
      PREPARATION.map((k) => [k, true]),
    );
    expect(readiness(d, id).readiness).toBe(100);
    expect(chapterStage(CHAPTERS[0], d, [])).toBe("fullyRevised");
  });
  it("anchors spaced revision to real coverage, not a legacy task checkbox", () => {
    let d = setup();
    const id = CHAPTERS[0].id;
    expect(ensureRevisions([], d).revisions).toHaveLength(0);
    d.advanced!.classes[0].watched = 25200;
    d.advanced!.preparation[id] = { textbook: true };
    d = ensureRevisions([], d);
    expect(d.revisions.map((r) => r.interval)).toEqual([1, 3, 7, 14, 30]);
    const again = ensureRevisions([], d);
    expect(again).toBe(d);
    const revision = d.revisions[0];
    revision.completedAt = "2026-11-15T00:00:00Z";
    d.advanced!.classes[0].watched = 0;
    expect(ensureRevisions([], d).revisions).toEqual([revision]);
  });
  it("deduplicates actual playback ranges instead of counting repeated viewing", () => {
    let r = mergeWatched([], [0, 60], 100);
    r = mergeWatched(r, [0, 60], 100);
    r = mergeWatched(r, [50, 150], 100);
    expect(r).toEqual([[0, 100]]);
  });
  it("restores additions without resetting legacy progress and rejects unsafe backups", () => {
    const d = setup();
    d.completed.old = "2026-11-15T00:00:00Z";
    const restored = parseBackup(JSON.stringify(d));
    expect(restored.advanced).toEqual(d.advanced);
    expect(restored.completed.old).toBe(d.completed.old);
    expect(parseAdvanced(undefined)).toEqual(emptyAdvanced());
    expect(() =>
      parseAdvanced({
        ...d.advanced,
        classes: [{ ...item(), url: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      parseAdvanced({ ...d.advanced, classes: [{ ...item(), duration: -1 }] }),
    ).toThrow();
    expect(() =>
      parseAdvanced({ ...d.advanced, classes: [item(), item()] }),
    ).toThrow();
  });
  it("permits only direct file candidates, never platform extraction", () => {
    expect(directVideo("https://youtube.com/watch?v=abc")).toBe(false);
    expect(directVideo("https://youtube.com/a.mp4")).toBe(false);
    expect(directVideo(item().url)).toBe(true);
    expect(canonicalUrl("https://example.org/a?b=2&a=1#x")).toBe(
      "https://example.org/a?a=1&b=2",
    );
    expect(() => canonicalUrl("javascript:alert(1)")).toThrow();
  });
});
