import { describe, expect, it } from "vitest";
import { buildPlan, freshData } from "./planner";
import type { Day, Task } from "./planner";
import { emptyAdvanced, videoWeek } from "./advanced";
import { integrateStudyPlan, remainingTaskMinutes } from "./smartSchedule";
import { setTaskCompletion } from "./study";
import { CHAPTERS } from "./data";
const today = "2026-11-15";
const task = (id: string, minutes: number): Task => ({
  id,
  title: id,
  date: today,
  dayIndex: 1,
  phase: "learn",
  subject: "physics",
  kind: "learn",
  detail: "",
  chapterIds: [CHAPTERS[0].id],
  startMinute: 480,
  endMinute: 480 + minutes,
});
const base = (tasks: Task[]): Day[] => [
  { date: today, index: 1, phase: "learn", isCatchup: false, tasks },
];
const setup = () => {
  const d = freshData();
  d.settings.dailyHours = 4;
  d.advanced = {
    ...emptyAdvanced(),
    classes: [
      {
        id: "video",
        title: "7 hour lecture",
        url: "https://example.org/a.mp4",
        chapterId: CHAPTERS[0].id,
        teacher: "T",
        duration: 25200,
        watched: 0,
        position: 0,
        speed: 1,
        permitted: true,
        note: "",
      },
    ],
  };
  return d;
};
describe("integrated duration-aware routine", () => {
  it("places classes in a full routine and carries ordinary tasks without losing minutes", () => {
    const d = setup();
    const original = base([task("a", 240), task("b", 240)]);
    const before = JSON.stringify(original);
    const plan = integrateStudyPlan(original, d, today);
    expect(plan[0].tasks.some((t) => t.video)).toBe(true);
    expect(
      plan
        .flatMap((d) => d.tasks)
        .filter((t) => !t.video)
        .reduce((s, t) => s + t.endMinute - t.startMinute, 0),
    ).toBe(480);
    expect(JSON.stringify(original)).toBe(before);
    for (const day of plan)
      expect(
        day.tasks.reduce((s, t) => s + t.endMinute - t.startMinute, 0),
      ).toBeLessThanOrEqual(240.001);
    expect(
      plan
        .flatMap((d) => d.tasks)
        .filter((t) => t.video)
        .reduce((s, t) => s + t.video!.to - t.video!.from, 0),
    ).toBeCloseTo(25200);
  });
  it("persists completed split ranges and never reassigns them after rebuild", () => {
    const d = setup();
    const original = base([task("a", 240)]);
    const plan = integrateStudyPlan(original, d, today);
    const part = plan[0].tasks.find((t) => !t.video)!;
    const done = setTaskCompletion(d, [part.id], true);
    expect(
      remainingTaskMinutes(original[0].tasks[0], done).reduce(
        (s, r) => s + r.to - r.from,
        0,
      ),
    ).toBe(240 - (part.endMinute - part.startMinute));
    expect(
      integrateStudyPlan(original, done, today)
        .flatMap((d) => d.tasks)
        .filter((t) => !t.video && !done.completed[t.id])
        .reduce((s, t) => s + t.endMinute - t.startMinute, 0),
    ).toBeCloseTo(90);
  });
  it("does not schedule watched gaps or allow a timer checkbox to fake lecture completion", () => {
    const d = setup();
    d.advanced!.classes[0].ranges = [
      [0, 60],
      [120, 180],
    ];
    d.advanced!.classes[0].watched = 120;
    const plan = integrateStudyPlan(base([]), d, today);
    const first = plan[0].tasks[0];
    expect(first.video!.from).toBe(60);
    expect(first.video!.to).toBe(120);
    expect(
      setTaskCompletion(d, [first.id], true).completed[first.id],
    ).toBeUndefined();
    d.advanced!.classes[0].ranges = [[0, 180]];
    d.advanced!.classes[0].watched = 180;
    expect(
      setTaskCompletion(d, [first.id], true).completed[first.id],
    ).toBeTruthy();
  });
  it("uses integrated sessions in the workload view instead of generating a second plan", () => {
    const d = setup();
    const plan = integrateStudyPlan(base([task("a", 240)]), d, today);
    const week = videoWeek(d, plan, today);
    expect(week[0].sessions.map((s) => s.from)).toEqual(
      plan[0].tasks.filter((t) => t.video).map((t) => t.video!.from),
    );
  });
  it("keeps completed legacy records and locked dates unchanged", () => {
    const d = setup();
    const original = base([task("a", 240)]);
    d.lockedDates = [today];
    expect(integrateStudyPlan(original, d, today)[0]).toBe(original[0]);
    delete d.advanced;
    expect(integrateStudyPlan(original, d, today)).toBe(original);
  });
  it("works with the production routine without unbounded daily workloads", () => {
    const d = setup();
    const original = buildPlan(d.settings);
    const plan = integrateStudyPlan(original, d, today);
    for (const day of plan.filter((p) => p.date >= today))
      expect(
        day.tasks
          .filter((t) => !d.completed[t.id])
          .reduce((s, t) => s + t.endMinute - t.startMinute, 0),
      ).toBeLessThanOrEqual(
        (d.settings.boostEnabled && day.date >= d.settings.boostStartDate
          ? d.settings.boostDailyHours
          : d.settings.dailyHours) *
          60 +
          0.001,
      );
  });
});
