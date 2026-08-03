import type {
  ProgrammeActivity,
  ProgrammeProgress,
  TimelineEvent,
} from "@/types/site";

export function eventLabourHours(event: TimelineEvent): number {
  return ((event.duration ?? 0) / 60) *
    (event.affectedOperativeIds?.length ?? 0);
}

export function hasProductivityBaseline(
  activity: ProgrammeActivity
): boolean {
  return Boolean(
    activity.plannedQuantity > 0 &&
    (activity.budgetLabourHours ?? 0) > 0 &&
    (activity.plannedProductionRate ?? 0) > 0
  );
}

function divide(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function calculateProgrammeProgress(
  programmeActivity: ProgrammeActivity,
  events: TimelineEvent[]
): ProgrammeProgress {
  const completedEvents = events.filter(
    (event) =>
      event.type === "work" &&
      event.status === "completed" &&
      event.programmeActivityId === programmeActivity.programmeActivityId
  );

  const completedQuantity = completedEvents.reduce(
    (total, event) => total + (event.quantity ?? 0),
    0
  );
  const labourHours = completedEvents.reduce(
    (total, event) => total + eventLabourHours(event),
    0
  );
  const disruptionLabourHours = events
    .filter(
      (event) =>
        event.type === "disruption" &&
        event.programmeActivityId === programmeActivity.programmeActivityId
    )
    .reduce((total, event) => total + eventLabourHours(event), 0);
  const plannedQuantity = programmeActivity.plannedQuantity;
  const remainingQuantity = Math.max(plannedQuantity - completedQuantity, 0);
  const percentageComplete = plannedQuantity > 0
    ? Math.min((completedQuantity / plannedQuantity) * 100, 100)
    : 0;
  const productivity = labourHours > 0 ? completedQuantity / labourHours : 0;
  const baselineComplete = hasProductivityBaseline(programmeActivity);
  const plannedProductionRate = baselineComplete
    ? programmeActivity.plannedProductionRate ?? null
    : null;
  const actualProductionRate = divide(completedQuantity, labourHours);
  const overallProductionRate = divide(
    completedQuantity,
    labourHours + disruptionLabourHours
  );
  const earnedLabourHours = plannedProductionRate
    ? completedQuantity / plannedProductionRate
    : null;
  const labourProductivityIndex = earnedLabourHours === null
    ? null
    : divide(earnedLabourHours, labourHours);
  const overallLabourEfficiencyIndex = earnedLabourHours === null
    ? null
    : divide(earnedLabourHours, labourHours + disruptionLabourHours);
  const productivityPerformancePercentage =
    actualProductionRate !== null && plannedProductionRate
      ? (actualProductionRate / plannedProductionRate) * 100
      : null;

  return {
    plannedQuantity,
    completedQuantity,
    remainingQuantity,
    percentageComplete,
    labourHours,
    productivity,
    baselineComplete,
    plannedProductionRate,
    actualProductiveLabourHours: labourHours,
    actualDisruptionLabourHours: disruptionLabourHours,
    actualProductionRate,
    overallProductionRate,
    earnedLabourHours,
    labourProductivityIndex,
    overallLabourEfficiencyIndex,
    productivityPerformancePercentage,
  };
}
