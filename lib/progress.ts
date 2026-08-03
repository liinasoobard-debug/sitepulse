import type {
  ProgrammeActivity,
  ProgrammeProgress,
  TimelineEvent,
} from "@/types/site";

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
  const labourHours = completedEvents.reduce((total, event) => {
    const operativeCount = event.affectedOperativeIds?.length ?? 0;
    return total + ((event.duration ?? 0) / 60) * operativeCount;
  }, 0);
  const plannedQuantity = programmeActivity.plannedQuantity;
  const remainingQuantity = Math.max(plannedQuantity - completedQuantity, 0);
  const percentageComplete = plannedQuantity > 0
    ? Math.min((completedQuantity / plannedQuantity) * 100, 100)
    : 0;
  const productivity = labourHours > 0 ? completedQuantity / labourHours : 0;

  return {
    plannedQuantity,
    completedQuantity,
    remainingQuantity,
    percentageComplete,
    labourHours,
    productivity,
  };
}
