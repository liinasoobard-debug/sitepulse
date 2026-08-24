import { eventLabourHours } from "./reporting.ts";
import type { ProgrammeActivity } from "../types/site.ts";
import type { DashboardFilters, DatedDashboardEvent } from "./dashboard.ts";

export type EarnedValuePoint = {
  weekStart: string;
  weekEnd: string;
  reportingDate: string;
  label: string;
  plannedHours: number;
  earnedHours: number;
  actualHours: number;
};

export type EarnedValueMetrics = {
  plannedHours: number | null;
  earnedHours: number | null;
  actualHours: number | null;
  productivityFactor: number | null;
  schedulePerformance: number | null;
  labourVariance: number | null;
  programmeVariance: number | null;
};

export type EarnedValueData = {
  points: EarnedValuePoint[];
  metrics: EarnedValueMetrics;
  missing: string[];
  unallocatedHours: number;
};

const DAY = 86_400_000;
const dateValue = (date: string) => new Date(`${date}T12:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => isoDate(new Date(dateValue(date).getTime() + days * DAY));

function mondayFor(date: string): string {
  const value = dateValue(date);
  const weekday = value.getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

function workingDays(start: string, end: string): number {
  if (!start || !end || start > end) return 0;
  let total = 0;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const weekday = dateValue(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) total += 1;
  }
  return total;
}

function plannedThrough(activity: ProgrammeActivity, reportingDate: string): number {
  const budget = Number(activity.budgetLabourHours);
  if (!(budget > 0) || !activity.plannedStart || !activity.plannedFinish) return 0;
  if (reportingDate < activity.plannedStart) return 0;
  if (reportingDate >= activity.plannedFinish) return budget;
  const totalDays = workingDays(activity.plannedStart, activity.plannedFinish);
  if (!totalDays) return 0;
  return budget * workingDays(activity.plannedStart, reportingDate) / totalDays;
}

function activityMatches(activity: ProgrammeActivity, filters: DashboardFilters): boolean {
  return (!filters.building || activity.building === filters.building) &&
    (!filters.elevation || activity.elevation === filters.elevation) &&
    (!filters.level || activity.level === filters.level) &&
    (!filters.activity || activity.programmeActivityId === filters.activity) &&
    (!filters.unit || activity.unit === filters.unit) &&
    (!filters.productType || activity.productType === filters.productType);
}

function eventMatchesGang(row: DatedDashboardEvent, gang: string): boolean {
  if (!gang) return true;
  return row.day.crews?.find((crew) => crew.id === row.event.crewId)?.name === gang;
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
}

export function calculateEarnedValueMetrics(plannedHours: number | null, earnedHours: number | null, actualHours: number | null): EarnedValueMetrics {
  return {
    plannedHours,
    earnedHours,
    actualHours,
    productivityFactor: safeRatio(earnedHours, actualHours),
    schedulePerformance: safeRatio(earnedHours, plannedHours),
    labourVariance: earnedHours !== null && actualHours !== null ? earnedHours - actualHours : null,
    programmeVariance: earnedHours !== null && plannedHours !== null ? earnedHours - plannedHours : null,
  };
}

export function buildEarnedValueData(args: {
  programme: ProgrammeActivity[];
  events: DatedDashboardEvent[];
  reportingDate: string;
  filters: DashboardFilters;
}): EarnedValueData {
  const activities = args.programme.filter((activity) => activityMatches(activity, args.filters));
  const activityIds = new Set(activities.map((activity) => activity.programmeActivityId));
  const budgetedActivities = activities.filter((activity) => Number(activity.budgetLabourHours) > 0 && activity.plannedStart && activity.plannedFinish);
  const relevantEvents = args.events.filter((row) => row.date <= args.reportingDate && eventMatchesGang(row, args.filters.gang));
  const allocatedWork = relevantEvents.filter(({ event }) => event.type === "work" && event.status === "completed" && Boolean(event.programmeActivityId) && activityIds.has(event.programmeActivityId!));
  const measuredWork = allocatedWork.filter(({ event }) => Number.isFinite(Number(event.quantity)) && Number(event.quantity) > 0);
  const unallocatedHours = relevantEvents
    .filter(({ event }) => event.type === "work" && event.status === "completed" && (!event.programmeActivityId || !args.programme.some((activity) => activity.programmeActivityId === event.programmeActivityId)))
    .reduce((sum, { event }) => sum + eventLabourHours(event), 0);

  const projectStart = [...budgetedActivities.map((activity) => activity.plannedStart!), ...allocatedWork.map((row) => row.date)].sort()[0];
  const missing: string[] = [];
  if (!budgetedActivities.length) missing.push("No planned labour budget");
  if (!measuredWork.length) missing.push("No verified progress recorded");
  if (!allocatedWork.length) missing.push("No actual labour allocated");
  if (!projectStart) return { points: [], metrics: calculateEarnedValueMetrics(null, null, null), missing, unallocatedHours };

  const points: EarnedValuePoint[] = [];
  for (let weekStart = mondayFor(projectStart); weekStart <= args.reportingDate; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 6);
    const reportingDate = weekEnd < args.reportingDate ? weekEnd : args.reportingDate;
    let earnedHours = 0;
    for (const activity of budgetedActivities) {
      const completed = measuredWork
        .filter(({ date, event }) => date <= reportingDate && event.programmeActivityId === activity.programmeActivityId)
        .reduce((sum, { event }) => sum + Number(event.quantity), 0);
      const progress = activity.plannedQuantity > 0 ? Math.min(completed / activity.plannedQuantity, 1) : 0;
      earnedHours += Number(activity.budgetLabourHours) * progress;
    }
    points.push({
      weekStart,
      weekEnd,
      reportingDate,
      label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dateValue(reportingDate)),
      plannedHours: budgetedActivities.reduce((sum, activity) => sum + plannedThrough(activity, reportingDate), 0),
      earnedHours,
      actualHours: allocatedWork.filter((row) => row.date <= reportingDate).reduce((sum, { event }) => sum + eventLabourHours(event), 0),
    });
  }

  const latest = points.at(-1);
  return {
    points,
    metrics: calculateEarnedValueMetrics(
      budgetedActivities.length ? latest?.plannedHours ?? 0 : null,
      measuredWork.length && budgetedActivities.length ? latest?.earnedHours ?? 0 : null,
      allocatedWork.length ? latest?.actualHours ?? 0 : null,
    ),
    missing,
    unallocatedHours,
  };
}
