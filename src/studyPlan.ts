import { applyDayOverrides, applyRoutine, buildPlan } from './planner';
import type { AppData, Day } from './planner';
import { applyManualSchedule } from './scheduleEdit';
import { integrateStudyPlan } from './smartSchedule';
import { applyAdaptivePlan } from './adaptive';
import { weaknessReport } from './weakness';
import { reflowPersonalPlan } from './personalReflow';
import { buildPersonalStudyProjection } from './personalRoutine';

/** The underlying task identities and source durations before splitting or adaptation. */
export function buildOrdinaryStudyPlan(data: AppData): Day[] {
  if (data.personalRoutine) return applyManualSchedule(applyRoutine(buildPersonalStudyProjection(data).plan, data.routineBlocks), data);
  if (data.routineSetupRequired) return [];
  const generated = buildPlan(data.settings);
  const routine = applyRoutine(generated, data.routineBlocks);
  const edited = applyManualSchedule(routine, data);
  return applyDayOverrides(edited, data.dayOverrides, data.settings);
}

/** The same pure projection powers the app, Settings preview, exports and reminders.
 * Previewing a draft must not skip saved edits, custom hours, lectures or adaptation.
 * Actual completion/recall evidence stays in AppData and is never rewritten here.
 * Return the explanation together with the final plan so it cannot be double-adapted.
 */
export function buildStudyProjection(data: AppData, today: string) {
  // Neither legacy adaptive swaps nor the extra-media overlay may break S scope,
  // the two-day pair, actual source durations or explicit availability windows.
  if (data.personalRoutine || data.routineSetupRequired) {
    const baseline = buildOrdinaryStudyPlan(data);
    return { plan: data.personalRoutine ? reflowPersonalPlan(data, baseline, today) : baseline, adaptive: null };
  }
  const integrated = integrateStudyPlan(buildOrdinaryStudyPlan(data), data, today);
  const rows = data.settings.adaptiveEnabled ? weaknessReport(integrated, data, today) : [];
  const adaptive = rows.length ? applyAdaptivePlan(integrated, rows, data, today, {
    horizonDays: 3,
    minBlockMinutes: 45,
    bufferMinutes: data.settings.adaptiveBuffer,
  }) : null;
  // The UI must describe these actual changes, not adapt the final plan a second time.
  return { plan: adaptive?.plan || integrated, adaptive };
}

export function buildStudyPlan(data: AppData, today: string): Day[] {
  return buildStudyProjection(data, today).plan;
}
