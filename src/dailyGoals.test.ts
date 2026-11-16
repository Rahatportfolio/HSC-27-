import { describe, expect, it } from "vitest";
import { dailyGoalDefaults, lockDailyGoals } from "./dailyGoals";
import { freshData } from "./planner";
import { emptyAdvanced } from "./advanced";
import { parseBackup } from "./storage";
describe("safe daily target locking", () => {
  it("starts from an existing date override, not an unrelated global hours value", () => {
    const data = freshData();
    data.dayOverrides["2026-11-15"] = { dailyHours: 5 };
    expect(dailyGoalDefaults(data, "2026-11-15").minutes).toBe(300);
  });
  it("keeps a previously locked minute target and never replaces locked practice goals", () => {
    let data = freshData();
    data.advanced = { ...emptyAdvanced(), targets: { "2026-11-15": 90 } };
    data = lockDailyGoals(data, "2026-11-15", {
      minutes: 240,
      mcq: 20,
      cq: 2,
      revision: 1,
    });
    expect(data.advanced!.targets["2026-11-15"]).toBe(90);
    expect(
      lockDailyGoals(data, "2026-11-15", {
        minutes: 480,
        mcq: 100,
        cq: 10,
        revision: 10,
      }),
    ).toBe(data);
    expect(parseBackup(JSON.stringify(data)).advanced).toEqual(data.advanced);
  });
  it("supports an explicit rest day and rejects invalid progress-changing input", () => {
    const data = lockDailyGoals(freshData(), "2026-11-15", {
      minutes: 0,
      mcq: 0,
      cq: 0,
      revision: 0,
    });
    expect(dailyGoalDefaults(data, "2026-11-15").minutes).toBe(0);
    for (const minutes of [-1, Infinity, 1500])
      expect(() =>
        lockDailyGoals(freshData(), "2026-11-15", {
          minutes,
          mcq: 1,
          cq: 1,
          revision: 1,
        }),
      ).toThrow();
    expect(() =>
      lockDailyGoals(freshData(), "bad-date", {
        minutes: 90,
        mcq: 1,
        cq: 1,
        revision: 1,
      }),
    ).toThrow();
  });
});
