import { crewName, eventLabourHours } from "./reporting.ts";
import type { ProgrammeActivity, SiteDay, TimelineEvent } from "@/types/site";

export type DashboardPeriod = "daily" | "weekly" | "monthly";
export type DashboardFilters = { building: string; elevation: string; level: string; activity: string; gang: string; unit: string };
export type DatedDashboardEvent = { date: string; day: SiteDay; event: TimelineEvent };
export type DashboardBucket = { key: string; label: string; start: string; end: string };

export type DashboardActivityVariance = {
  id: string; activity: string; building: string; elevation: string; level: string; unit: string;
  expected: number; actual: number; variance: number; achievement: number | null; plannedFinish?: string; mainBlocker: string;
};

export type DashboardData = {
  unit: string;
  mixedUnits: boolean;
  warnings: string[];
  output: Array<{ label: string; expected: number; actual: number; achievement: number | null }>;
  cumulative: Array<{ label: string; planned: number; actual: number }>;
  productivity: Array<{ label: string; planned: number | null; actual: number | null; overall: number | null }>;
  labour: Array<{ label: string; productive: number; disruption: number; variation: number; breakHours: number; utilisation: number | null }>;
  gangs: Array<{ key: string; gang: string; activity: string; unit: string; planned: number; actual: number; performance: number; status: string }>;
  blockers: Array<{ category: string; hours: number; events: number; activities: number; cumulative: number }>;
  behind: DashboardActivityVariance[];
  disruptionRows: DatedDashboardEvent[];
  kpis: {
    expected: number | null; achieved: number | null; achievement: number | null;
    plannedRate: number | null; actualRate: number | null; productivityPerformance: number | null;
    productiveHours: number | null; lostHours: number | null; behindCount: number; principalBlocker: string | null;
    utilisation: number | null;
  };
};

const DAY = 86_400_000;
const blockerMatchers: Array<[string, RegExp]> = [
  ["Access", /access|permit|scaffold|hoist/], ["Plant / Crane", /plant|crane|machine|equipment/],
  ["Design Information", /design|drawing|information|rfi/], ["Materials", /material|delivery|stock/],
  ["Preceding Trade", /preced|trade|handover|interface/], ["Client Instruction", /client|instruction|change/],
  ["Weather", /weather|rain|wind|snow|heat/], ["Quality / Rework", /quality|rework|remedial|snag/],
  ["Internal Labour", /labour|operative|manpower|staff/], ["Health and Safety", /health|safety|hse|incident/],
];

function dateValue(date: string): Date { return new Date(`${date}T12:00:00`); }
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(date: string, amount: number): string { const value = dateValue(date); value.setDate(value.getDate() + amount); return localDate(value); }
function mondayFor(date: string): string { const value = dateValue(date); const day = value.getDay(); value.setDate(value.getDate() - (day === 0 ? 6 : day - 1)); return localDate(value); }
function monthEnd(date: string): string { const value = dateValue(`${date.slice(0, 7)}-01`); value.setMonth(value.getMonth() + 1); value.setDate(0); return localDate(value); }
function shortDate(date: string): string { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(dateValue(date)); }
function workingDays(start: string, end: string): number {
  if (!start || !end || start > end) return 0;
  let count = 0;
  for (let cursor = dateValue(start); cursor <= dateValue(end); cursor = new Date(cursor.getTime() + DAY)) if (cursor.getDay() !== 0 && cursor.getDay() !== 6) count += 1;
  return count;
}

export function dashboardRange(period: DashboardPeriod, selectedDate: string): { start: string; end: string } {
  if (period === "daily") return { start: selectedDate, end: selectedDate };
  if (period === "weekly") { const start = mondayFor(selectedDate); return { start, end: addDays(start, 6) }; }
  return { start: `${selectedDate.slice(0, 7)}-01`, end: monthEnd(selectedDate) };
}

function bucketsFor(period: DashboardPeriod, start: string, end: string): DashboardBucket[] {
  if (period === "daily") return Array.from({ length: 10 }, (_, index) => ({ key: String(index + 8), label: `${String(index + 8).padStart(2, "0")}:00`, start, end }));
  if (period === "weekly") return Array.from({ length: 7 }, (_, index) => { const date = addDays(start, index); return { key: date, label: shortDate(date), start: date, end: date }; });
  const buckets: DashboardBucket[] = [];
  for (let cursor = start; cursor <= end;) { const bucketEnd = [addDays(cursor, 6), end].sort()[0]; buckets.push({ key: cursor, label: `${shortDate(cursor)}–${shortDate(bucketEnd)}`, start: cursor, end: bucketEnd }); cursor = addDays(bucketEnd, 1); }
  return buckets;
}

function expectedThrough(activity: ProgrammeActivity, date: string): number | null {
  if (!(activity.plannedQuantity > 0) || !activity.unit || !activity.plannedStart || !activity.plannedFinish) return null;
  if (date < activity.plannedStart) return 0;
  if (date >= activity.plannedFinish) return activity.plannedQuantity;
  const total = workingDays(activity.plannedStart, activity.plannedFinish);
  if (!total) return null;
  return activity.plannedQuantity * workingDays(activity.plannedStart, date) / total;
}

function expectedBetween(activity: ProgrammeActivity, start: string, end: string): number | null {
  const endValue = expectedThrough(activity, end);
  const beforeValue = expectedThrough(activity, addDays(start, -1));
  return endValue === null || beforeValue === null ? null : Math.max(endValue - beforeValue, 0);
}

export function classifyDashboardBlocker(event: TimelineEvent): string {
  const value = `${event.reason ?? ""} ${event.title} ${event.notes ?? ""}`.toLowerCase();
  return blockerMatchers.find(([, matcher]) => matcher.test(value))?.[0] ?? "Other";
}

function selectedActivity(activity: ProgrammeActivity, filters: DashboardFilters): boolean {
  return (!filters.building || activity.building === filters.building) && (!filters.elevation || activity.elevation === filters.elevation) &&
    (!filters.level || activity.level === filters.level) && (!filters.activity || activity.programmeActivityId === filters.activity) && (!filters.unit || activity.unit === filters.unit);
}

export function buildDashboardData(args: {
  period: DashboardPeriod; selectedDate: string; programme: ProgrammeActivity[]; events: DatedDashboardEvent[]; filters: DashboardFilters;
}): DashboardData {
  const { period, selectedDate, programme, events, filters } = args;
  const range = dashboardRange(period, selectedDate);
  const activityById = new Map(programme.map((activity) => [activity.programmeActivityId, activity]));
  let activities = programme.filter((activity) => selectedActivity(activity, filters));
  let filteredEvents = events.filter(({ day, event }) => {
    const activity = event.programmeActivityId ? activityById.get(event.programmeActivityId) : undefined;
    if (filters.gang && crewName(day.crews ?? [], event.crewId) !== filters.gang) return false;
    const hasActivityFilter = Boolean(filters.building || filters.elevation || filters.level || filters.activity || filters.unit);
    if (hasActivityFilter) return Boolean(activity && selectedActivity(activity, filters));
    return event.type !== "work" || Boolean(activity);
  });

  const periodWork = filteredEvents.filter(({ date, event }) => date >= range.start && date <= range.end && event.type === "work" && event.status === "completed");
  const measuredPeriodWork = periodWork.filter(({ event }) => typeof event.quantity === "number" && Number.isFinite(event.quantity));
  const unitTotals = new Map<string, number>();
  periodWork.forEach(({ event }) => { const unit = event.programmeActivityId ? activityById.get(event.programmeActivityId)?.unit : event.unit; if (unit) unitTotals.set(unit, (unitTotals.get(unit) ?? 0) + (event.quantity ?? 0)); });
  activities.forEach((activity) => { if (activity.unit && !unitTotals.has(activity.unit)) unitTotals.set(activity.unit, 0); });
  const dominantUnit = filters.unit || [...unitTotals].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const mixedUnits = unitTotals.size > 1 && !filters.unit;
  if (dominantUnit) {
    activities = activities.filter((activity) => activity.unit === dominantUnit);
    filteredEvents = filteredEvents.filter(({ event }) => event.type !== "work" || (event.programmeActivityId ? activityById.get(event.programmeActivityId)?.unit === dominantUnit : event.unit === dominantUnit));
  }

  const buckets = bucketsFor(period, range.start, range.end);
  const validActivities = activities.filter((activity) => expectedThrough(activity, range.end) !== null);
  const inBucket = ({ date, event }: DatedDashboardEvent, bucket: DashboardBucket) => date >= bucket.start && date <= bucket.end && (period !== "daily" || Number(event.startTime?.slice(0, 2) ?? event.time.slice(0, 2)) === Number(bucket.key));
  const warnings: string[] = [];
  const incomplete = activities.filter((activity) => expectedThrough(activity, range.end) === null);
  if (mixedUnits) warnings.push(`Multiple measured units exist. Quantity charts show the dominant unit (${dominantUnit || "not available"}) only.`);
  if (incomplete.length) warnings.push(`${incomplete.length} activit${incomplete.length === 1 ? "y has" : "ies have"} no complete planned quantity, unit, and date baseline; expected output excludes them.`);
  if (activities.some((activity) => !(Number(activity.budgetLabourHours) > 0))) warnings.push("Budget labour hours are missing for some activities. Labour-rate comparisons use the stored planned production rate where available.");

  const output = buckets.map((bucket) => {
    const expected = validActivities.reduce((sum, activity) => sum + (expectedBetween(activity, bucket.start, bucket.end) ?? 0), 0);
    const actual = filteredEvents.filter((row) => inBucket(row, bucket) && row.event.type === "work" && row.event.status === "completed").reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
    const adjustedExpected = period === "daily" ? expected / buckets.length : expected;
    return { label: bucket.label, expected: adjustedExpected, actual, achievement: adjustedExpected > 0 ? actual / adjustedExpected * 100 : null };
  });

  let cumulativePlanned = validActivities.reduce((sum, activity) => sum + (expectedThrough(activity, addDays(range.start, -1)) ?? 0), 0);
  let cumulativeActual = filteredEvents.filter(({ date, event }) => date < range.start && event.type === "work" && event.status === "completed").reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
  const cumulative = output.map((row) => ({ label: row.label, planned: cumulativePlanned += row.expected, actual: cumulativeActual += row.actual }));

  const productivity = buckets.map((bucket) => {
    const work = filteredEvents.filter((row) => inBucket(row, bucket) && row.event.type === "work" && row.event.status === "completed");
    const disruptions = filteredEvents.filter((row) => inBucket(row, bucket) && row.event.type === "disruption");
    const quantity = work.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
    const hours = work.reduce((sum, { event }) => sum + eventLabourHours(event), 0);
    const lost = disruptions.reduce((sum, { event }) => sum + (event.lostLabourHours ?? eventLabourHours(event)), 0);
    const plannedRates = activities.map((activity) => activity.plannedProductionRate).filter((value): value is number => Number(value) > 0);
    const planned = plannedRates.length ? plannedRates.reduce((sum, value) => sum + value, 0) / plannedRates.length : null;
    return { label: bucket.label, planned, actual: hours > 0 ? quantity / hours : null, overall: hours + lost > 0 ? quantity / (hours + lost) : null };
  });

  const labour = buckets.map((bucket) => {
    const bucketEvents = filteredEvents.filter((row) => inBucket(row, bucket)).map(({ event }) => event);
    const hours = (type: TimelineEvent["type"]) => bucketEvents.filter((event) => event.type === type).reduce((sum, event) => sum + eventLabourHours(event), 0);
    const productive = hours("work"), disruption = hours("disruption"), variation = hours("variation"), breakHours = hours("break");
    const total = productive + disruption + variation + breakHours;
    return { label: bucket.label, productive, disruption, variation, breakHours, utilisation: total > 0 ? productive / total * 100 : null };
  });

  const gangMap = new Map<string, { gang: string; activity: ProgrammeActivity; quantity: number; hours: number }>();
  filteredEvents.filter(({ date, event }) => date >= range.start && date <= range.end && event.type === "work" && event.status === "completed").forEach(({ day, event }) => {
    const activity = event.programmeActivityId ? activityById.get(event.programmeActivityId) : undefined; if (!activity?.plannedProductionRate) return;
    const gang = crewName(day.crews ?? [], event.crewId), key = `${gang}|${activity.programmeActivityId}`;
    const row = gangMap.get(key) ?? { gang, activity, quantity: 0, hours: 0 }; row.quantity += event.quantity ?? 0; row.hours += eventLabourHours(event); gangMap.set(key, row);
  });
  const gangs = [...gangMap].map(([key, row]) => { const actual = row.hours > 0 ? row.quantity / row.hours : 0; const performance = actual / row.activity.plannedProductionRate! * 100; return { key, gang: row.gang, activity: row.activity.activity, unit: row.activity.unit, planned: row.activity.plannedProductionRate!, actual, performance, status: performance >= 100 ? "On or Ahead" : performance >= 90 ? "Slightly Behind" : performance >= 75 ? "Behind" : "Critical Performance Variance" }; }).sort((a, b) => a.performance - b.performance);

  const disruptions = filteredEvents.filter(({ date, event }) => date >= range.start && date <= range.end && event.type === "disruption");
  const blockerMap = new Map<string, { hours: number; events: number; activities: Set<string> }>();
  disruptions.forEach(({ event }) => { const category = classifyDashboardBlocker(event); const row = blockerMap.get(category) ?? { hours: 0, events: 0, activities: new Set<string>() }; row.hours += event.lostLabourHours ?? eventLabourHours(event); row.events += 1; if (event.programmeActivityId) row.activities.add(event.programmeActivityId); blockerMap.set(category, row); });
  const blockerTotal = [...blockerMap.values()].reduce((sum, row) => sum + row.hours, 0); let cumulativePercent = 0;
  const blockers = [...blockerMap].map(([category, row]) => ({ category, hours: row.hours, events: row.events, activities: row.activities.size, cumulative: 0 })).sort((a, b) => b.hours - a.hours).map((row) => ({ ...row, cumulative: cumulativePercent += blockerTotal > 0 ? row.hours / blockerTotal * 100 : 0 }));

  const allThroughEnd = filteredEvents.filter(({ date, event }) => date <= range.end && event.type === "work" && event.status === "completed");
  const behind = validActivities.map((activity) => {
    const expected = expectedThrough(activity, range.end) ?? 0;
    const actual = allThroughEnd.filter(({ event }) => event.programmeActivityId === activity.programmeActivityId).reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
    const activityDisruptions = disruptions.filter(({ event }) => event.programmeActivityId === activity.programmeActivityId);
    const reasons = new Map<string, number>(); activityDisruptions.forEach(({ event }) => { const category = classifyDashboardBlocker(event); reasons.set(category, (reasons.get(category) ?? 0) + (event.lostLabourHours ?? eventLabourHours(event))); });
    return { id: activity.programmeActivityId, activity: activity.activity, building: activity.building, elevation: activity.elevation, level: activity.level, unit: activity.unit, expected, actual, variance: actual - expected, achievement: expected > 0 ? actual / expected * 100 : null, plannedFinish: activity.plannedFinish, mainBlocker: [...reasons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—" };
  }).filter((row) => row.expected > 0 && row.variance < 0).sort((a, b) => a.variance - b.variance);

  const expected = output.reduce((sum, row) => sum + row.expected, 0), achieved = output.reduce((sum, row) => sum + row.actual, 0);
  const productiveHours = labour.reduce((sum, row) => sum + row.productive, 0), lostHours = blockers.reduce((sum, row) => sum + row.hours, 0);
  const plannedRateValues = productivity.map((row) => row.planned).filter((value): value is number => value !== null);
  const plannedRate = plannedRateValues.length ? plannedRateValues.reduce((sum, value) => sum + value, 0) / plannedRateValues.length : null;
  const actualRate = productiveHours > 0 ? achieved / productiveHours : null;
  const totalClassified = labour.reduce((sum, row) => sum + row.productive + row.disruption + row.variation + row.breakHours, 0);
  if (!periodWork.length) warnings.push("No measured work records exist for the selected period.");
  else if (!measuredPeriodWork.length) warnings.push("Work records exist, but actual quantity is missing; achieved output is not calculated.");
  if (!(productiveHours > 0)) warnings.push("No productive labour hours exist for the selected period; actual productivity is not calculated.");
  if (!validActivities.length) warnings.push("No activities have a complete linear planned production baseline for the selected filters.");

  return { unit: dominantUnit, mixedUnits, warnings: [...new Set(warnings)], output, cumulative, productivity, labour, gangs, blockers, behind, disruptionRows: disruptions,
    kpis: { expected: validActivities.length ? expected : null, achieved: measuredPeriodWork.length ? achieved : null, achievement: expected > 0 && measuredPeriodWork.length ? achieved / expected * 100 : null, plannedRate, actualRate: measuredPeriodWork.length ? actualRate : null, productivityPerformance: plannedRate && actualRate !== null && measuredPeriodWork.length ? actualRate / plannedRate * 100 : null, productiveHours: productiveHours > 0 ? productiveHours : null, lostHours: disruptions.length ? lostHours : null, behindCount: behind.length, principalBlocker: blockers[0]?.category ?? null, utilisation: totalClassified > 0 ? productiveHours / totalClassified * 100 : null } };
}
