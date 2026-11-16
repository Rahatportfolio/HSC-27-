import { emptyAdvanced } from "./advanced";
import { dailyTargetMinutes, isValidDate } from "./planner";
import type { AppData } from "./planner";
export interface DailyGoalDraft {
  minutes: number;
  mcq: number;
  cq: number;
  revision: number;
}
export function dailyGoalDefaults(data: AppData, date: string): DailyGoalDraft {
  const saved = data.advanced?.dailyGoals?.[date];
  return {
    minutes: dailyTargetMinutes(data, date),
    mcq: saved?.mcq ?? 25,
    cq: saved?.cq ?? 2,
    revision:
      saved?.revision ??
      data.revisions.filter((r) => !r.completedAt && r.dueDate <= date).length,
  };
}
/** A functional state update cannot silently replace a target locked in another tab. */
export function lockDailyGoals(
  data: AppData,
  date: string,
  draft: DailyGoalDraft,
): AppData {
  if (
    !isValidDate(date) ||
    !Number.isFinite(draft.minutes) ||
    draft.minutes < 0 ||
    draft.minutes > 1440 ||
    ![draft.mcq, draft.cq, draft.revision].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 10000,
    )
  )
    throw new Error("Invalid daily target");
  const a = data.advanced || emptyAdvanced();
  if (a.dailyGoals?.[date]?.locked) return data;
  return {
    ...data,
    advanced: {
      ...a,
      targets: { ...a.targets, [date]: a.targets[date] ?? draft.minutes },
      dailyGoals: {
        ...a.dailyGoals,
        [date]: {
          mcq: draft.mcq,
          cq: draft.cq,
          revision: draft.revision,
          locked: true,
        },
      },
    },
  };
}
