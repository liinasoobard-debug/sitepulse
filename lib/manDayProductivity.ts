import type { ProgrammeActivity, TimelineEvent } from "@/types/site";

export type DatedWorkEvent = { date: string; event: TimelineEvent };

export type ManDayBaseline = {
  plannedGangDailyOutput: number | null;
  plannedManDays: number | null;
  requiredAverageGangSize: number | null;
  remainingQuantity: number;
  remainingManDays: number | null;
  requiredRemainingGangSize: number | null;
};

export function calculateManDayBaseline(
  activity: Pick<ProgrammeActivity, "plannedQuantity" | "plannedManDayProductivity" | "assumedGangSize" | "plannedDurationDays">,
  completedQuantity = 0,
  remainingWorkingDays?: number
): ManDayBaseline {
  const rate = Number(activity.plannedManDayProductivity);
  const gangSize = Number(activity.assumedGangSize);
  const duration = Number(activity.plannedDurationDays);
  const validRate = Number.isFinite(rate) && rate > 0;
  const remainingQuantity = Math.max(Number(activity.plannedQuantity || 0) - completedQuantity, 0);
  const plannedManDays = validRate ? Number(activity.plannedQuantity || 0) / rate : null;
  const remainingManDays = validRate ? remainingQuantity / rate : null;
  return {
    plannedGangDailyOutput: validRate && Number.isFinite(gangSize) && gangSize > 0 ? rate * gangSize : null,
    plannedManDays,
    requiredAverageGangSize: plannedManDays !== null && Number.isFinite(duration) && duration > 0 ? plannedManDays / duration : null,
    remainingQuantity,
    remainingManDays,
    requiredRemainingGangSize: remainingManDays !== null && remainingWorkingDays !== undefined && remainingWorkingDays > 0 ? remainingManDays / remainingWorkingDays : null,
  };
}

export function distinctContributors(events: TimelineEvent[]): number {
  return new Set(events.flatMap((event) => event.affectedOperativeIds ?? []).map(String)).size;
}

export function actualManDayProductivity(quantity: number, operatives: number): number | null {
  return operatives > 0 ? quantity / operatives : null;
}

export type GangDayProductivity = {
  key: string;
  date: string;
  activityId: string;
  gangId: string;
  quantity: number;
  operatives: number;
  productiveHours: number;
  actualManDayProductivity: number | null;
};

export function groupGangDayProductivity(rows: DatedWorkEvent[]): GangDayProductivity[] {
  const groups = new Map<string, { date: string; activityId: string; gangId: string; events: TimelineEvent[] }>();
  rows.filter(({ event }) => event.type === "work" && event.status === "completed" && Boolean(event.programmeActivityId)).forEach(({ date, event }) => {
    const activityId = event.programmeActivityId!;
    const gangId = event.crewId ?? "unassigned";
    const key = `${date}|${activityId}|${gangId}`;
    const group = groups.get(key) ?? { date, activityId, gangId, events: [] };
    group.events.push(event);
    groups.set(key, group);
  });
  return [...groups].map(([key, group]) => {
    const quantity = group.events.reduce((sum, event) => sum + Number(event.quantity ?? 0), 0);
    const operatives = distinctContributors(group.events);
    const productiveHours = group.events.reduce((sum, event) => sum + ((event.duration ?? 0) / 60) * (event.affectedOperativeIds?.length ?? 0), 0);
    return { key, date: group.date, activityId: group.activityId, gangId: group.gangId, quantity, operatives, productiveHours, actualManDayProductivity: actualManDayProductivity(quantity, operatives) };
  });
}
