import type { ProgrammeActivity, TimelineEvent } from "@/types/site";

export type ForecastActivityType = "production" | "milestone" | "support";
export type ForecastReadiness = "ready" | "waiting-actuals" | "baseline-incomplete" | "non-production";
export type ForecastDatedEvent = { date: string; event: TimelineEvent };

const MILESTONE_WORDS = /\b(milestone|handover|completion|complete|sectional completion|key date)\b/i;

export function forecastActivityType(activity: ProgrammeActivity): ForecastActivityType {
  const nameAndStatus = `${activity.activity} ${activity.activityStatus ?? ""} ${activity.status ?? ""}`;
  if (activity.originalDuration === 0 || activity.plannedDurationDays === 0 || MILESTONE_WORDS.test(nameAndStatus)) return "milestone";
  if (activity.plannedQuantity > 0 && Boolean(activity.unit?.trim())) return "production";
  return "support";
}

export function eventMatchesActivity(event: TimelineEvent, activity: ProgrammeActivity): boolean {
  return event.programmeActivityId === activity.programmeActivityId || event.programmeActivityDatabaseId === activity.id;
}

export function validProductionEvents(events: ForecastDatedEvent[], activity: ProgrammeActivity, dataDate: string) {
  return events.filter(({ date, event }) => date <= dataDate && event.type === "work" && event.status === "completed" && eventMatchesActivity(event, activity) && typeof event.quantity === "number" && Number.isFinite(event.quantity) && event.quantity > 0);
}

export function forecastReadiness(activity: ProgrammeActivity, validProductionDayCount: number): ForecastReadiness {
  if (forecastActivityType(activity) !== "production") return "non-production";
  if (!(activity.plannedQuantity > 0) || !activity.unit?.trim() || !activity.plannedFinish || !(Number(activity.plannedManDayProductivity) > 0) || !(Number(activity.plannedGangDailyOutput) > 0)) return "baseline-incomplete";
  return validProductionDayCount < 6 ? "waiting-actuals" : "ready";
}

export function latestRecordedDataDate(events: ForecastDatedEvent[], explicitDate?: string | null): string {
  if (explicitDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) return explicitDate;
  return events.reduce((latest, row) => row.date > latest ? row.date : latest, "");
}

export function forecastDiagnostics(activities: ProgrammeActivity[], events: ForecastDatedEvent[]) {
  const externalIds = new Set(activities.map((activity) => activity.programmeActivityId));
  const databaseIds = new Set(activities.map((activity) => activity.id));
  const matched = events.filter(({ event }) => (Boolean(event.programmeActivityId) && externalIds.has(event.programmeActivityId!)) || (Boolean(event.programmeActivityDatabaseId) && databaseIds.has(event.programmeActivityDatabaseId!)));
  return {
    programmeActivities: activities.length,
    measuredProductionActivities: activities.filter((activity) => forecastActivityType(activity) === "production").length,
    activitiesWithQuantity: activities.filter((activity) => activity.plannedQuantity > 0).length,
    activitiesWithPlannedFinish: activities.filter((activity) => Boolean(activity.plannedFinish)).length,
    activitiesWithProductivityBaseline: activities.filter((activity) => Number(activity.plannedManDayProductivity) > 0).length,
    timelineRecordsMatched: matched.length,
    unmatchedTimelineRecords: events.length - matched.length,
  };
}
