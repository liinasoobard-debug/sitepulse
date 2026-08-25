import type { ConstraintActivityLink, ConstraintRecord } from "@/lib/constraints";
import type { ProgrammeActivity } from "@/types/site";

export type ProgrammeGanttStatus =
  | "available-working"
  | "available-not-started"
  | "constrained"
  | "completed"
  | "future";

export const programmeGanttStatusLabels: Record<ProgrammeGanttStatus, string> = {
  "available-working": "Available & being worked",
  "available-not-started": "Available but not started",
  constrained: "Constrained / unavailable",
  completed: "Completed",
  future: "Future work",
};

const completedStatus = (activity: ProgrammeActivity) =>
  Boolean(activity.actualFinish) || Number(activity.physicalPercentComplete ?? 0) >= 100 || /complete|finished/i.test(activity.activityStatus ?? activity.status ?? "");

export function openConstraintsForActivity(
  activityId: string,
  constraints: ConstraintRecord[],
  links: ConstraintActivityLink[],
) {
  const linkedIds = new Set(links.filter((link) => link.programme_activity_external_id === activityId).map((link) => link.constraint_id));
  return constraints.filter((row) =>
    (linkedIds.has(row.id) || row.programme_activity_external_id === activityId) &&
    ["OPEN", "ACTIONED / MONITORING"].includes(row.status),
  );
}

export function deriveProgrammeGanttStatus(
  activity: ProgrammeActivity,
  dataDate: string,
  openConstraints: ConstraintRecord[] = [],
): ProgrammeGanttStatus {
  if (completedStatus(activity)) return "completed";
  if (openConstraints.length || /constraint|blocked|suspend|unavailable/i.test(activity.activityStatus ?? activity.status ?? "")) return "constrained";
  if (activity.plannedStart && activity.plannedStart.slice(0, 10) > dataDate) return "future";
  if (activity.actualStart || Number(activity.physicalPercentComplete ?? 0) > 0 || /progress|started|active/i.test(activity.activityStatus ?? activity.status ?? "")) return "available-working";
  return "available-not-started";
}

export function isAvailableNow(status: ProgrammeGanttStatus) {
  return status === "available-working" || status === "available-not-started";
}
