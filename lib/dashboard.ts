import { crewName, eventLabourHours } from "./reporting.ts";
import { groupGangDayProductivity } from "./manDayProductivity.ts";
import type { ProgrammeActivity, SiteDay, TimelineEvent } from "@/types/site";

export type DashboardPeriod = "daily" | "weekly" | "monthly";
export type DashboardFilters = { building: string; elevation: string; level: string; activity: string; gang: string; unit: string; activityStatus: string; blockerCategory: string };
export type DatedDashboardEvent = { date: string; day: SiteDay; event: TimelineEvent };
export type DashboardBucket = { key: string; label: string; start: string; end: string };

export type DashboardActivityVariance = {
  id: string; activity: string; building: string; elevation: string; level: string; unit: string;
  expected: number; actual: number; variance: number; achievement: number | null; plannedFinish?: string; status: string; mainBlocker: string;
};

export type DashboardDetailRow = {
  id: string; date: string; gang: string; building: string; elevation: string; level: string; activity: string; activityId: string;
  quantity: number | null; unit: string; operatives: number; productiveHours: number; disruptionHours: number; productivity: number | null; manHourProductivity: number | null; blocker: string; voReference: string;
};

export type DashboardData = {
  unit: string;
  mixedUnits: boolean;
  warnings: string[];
  output: Array<{ label: string; start: string; end: string; expected: number; actual: number; achievement: number | null }>;
  cumulative: Array<{ label: string; planned: number; actual: number }>;
  productivity: Array<{ label: string; planned: number | null; actual: number | null }>;
  labour: Array<{ label: string; productive: number; disruption: number; variation: number; breakHours: number; utilisation: number | null }>;
  gangs: Array<{ key: string; date: string; gang: string; activity: string; unit: string; planned: number; actual: number; dailyOutput: number; gangSize: number; performance: number; status: string }>;
  blockers: Array<{ category: string; hours: number; events: number; activities: number; cumulative: number }>;
  behind: DashboardActivityVariance[];
  programmeStatus: Array<{ status: string; count: number }>;
  changes: Array<{ id: string; date: string; gang: string; activity: string; hours: number; quantity: number | null; status: string; reference: string }>;
  detailRows: DashboardDetailRow[];
  disruptionRows: DatedDashboardEvent[];
  kpis: {
    expected: number | null; achieved: number | null; achievement: number | null;
    plannedDailyGangOutput: number | null; actualDailyGangOutput: number | null;
    plannedRate: number | null; actualRate: number | null; productivityPerformance: number | null;
    operativesUsed: number | null; plannedGangSize: number | null; gangSizeVariance: number | null; manHourProductivity: number | null;
    productiveHours: number | null; lostHours: number | null; changeHours: number | null; behindCount: number; principalBlocker: string | null;
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

function selectedActivity(activity: ProgrammeActivity, filters: DashboardFilters, asOf = new Date().toISOString().slice(0, 10)): boolean {
  return (!filters.building || activity.building === filters.building) && (!filters.elevation || activity.elevation === filters.elevation) &&
    (!filters.level || activity.level === filters.level) && (!filters.activity || activity.programmeActivityId === filters.activity) && (!filters.unit || activity.unit === filters.unit) &&
    (!filters.activityStatus || dashboardActivityStatus(activity, asOf) === filters.activityStatus);
}

export function dashboardActivityStatus(activity: ProgrammeActivity, asOf: string): string {
  if (activity.missingFromLatestUpdate) return "Missing from Latest Update";
  if (activity.productivityBaselineComplete === false || !(activity.plannedQuantity > 0) || !activity.unit || !(Number(activity.plannedManDayProductivity) > 0) || !(Number(activity.assumedGangSize) > 0)) return "Productivity Baseline Incomplete";
  if (activity.actualFinish || (activity.physicalPercentComplete ?? 0) >= 100 || activity.activityStatus?.toLowerCase().includes("complete")) return "Completed";
  if (activity.actualStart || (activity.physicalPercentComplete ?? 0) > 0 || activity.activityStatus?.toLowerCase().includes("progress")) return "In Progress";
  if (activity.plannedFinish && activity.plannedFinish < asOf) return "Overdue";
  return "Not Started";
}

export function buildDashboardData(args: {
  period: DashboardPeriod; selectedDate: string; programme: ProgrammeActivity[]; events: DatedDashboardEvent[]; filters: DashboardFilters;
}): DashboardData {
  const { period, selectedDate, programme, events, filters } = args;
  const range = dashboardRange(period, selectedDate);
  const activityById = new Map(programme.map((activity) => [activity.programmeActivityId, activity]));
  const blockerActivityIds = new Set(events.filter(({ event }) => event.type === "disruption" && (!filters.blockerCategory || classifyDashboardBlocker(event) === filters.blockerCategory)).map(({ event }) => event.programmeActivityId).filter((id): id is string => Boolean(id)));
  let activities = programme.filter((activity) => selectedActivity(activity, filters, range.end) && (!filters.blockerCategory || blockerActivityIds.has(activity.programmeActivityId)));
  let filteredEvents = events.filter(({ day, event }) => {
    const activity = event.programmeActivityId ? activityById.get(event.programmeActivityId) : undefined;
    if (filters.gang && crewName(day.crews ?? [], event.crewId) !== filters.gang) return false;
    if (filters.blockerCategory && !((event.type === "disruption" && classifyDashboardBlocker(event) === filters.blockerCategory) || (event.programmeActivityId && blockerActivityIds.has(event.programmeActivityId)))) return false;
    const hasActivityFilter = Boolean(filters.building || filters.elevation || filters.level || filters.activity || filters.unit || filters.activityStatus);
    if (hasActivityFilter) return Boolean(activity && selectedActivity(activity, filters, range.end));
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
  if (activities.some((activity) => !(Number(activity.plannedManDayProductivity) > 0))) warnings.push("Man-day productivity baseline required for some activities. No hourly-rate conversion has been assumed.");

  const output = buckets.map((bucket) => {
    const expected = validActivities.reduce((sum, activity) => sum + (expectedBetween(activity, bucket.start, bucket.end) ?? 0), 0);
    const actual = filteredEvents.filter((row) => inBucket(row, bucket) && row.event.type === "work" && row.event.status === "completed").reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
    const adjustedExpected = period === "daily" ? expected / buckets.length : expected;
    return { label: bucket.label, start: bucket.start, end: bucket.end, expected: adjustedExpected, actual, achievement: adjustedExpected > 0 ? actual / adjustedExpected * 100 : null };
  });

  let cumulativePlanned = validActivities.reduce((sum, activity) => sum + (expectedThrough(activity, addDays(range.start, -1)) ?? 0), 0);
  let cumulativeActual = filteredEvents.filter(({ date, event }) => date < range.start && event.type === "work" && event.status === "completed").reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
  const cumulative = output.map((row) => ({ label: row.label, planned: cumulativePlanned += row.expected, actual: cumulativeActual += row.actual }));

  let productivity = buckets.map((bucket) => {
    const work = filteredEvents.filter((row) => inBucket(row, bucket) && row.event.type === "work" && row.event.status === "completed");
    const groups = groupGangDayProductivity(work.map(({ date, event }) => ({ date, event })));
    const quantity = groups.reduce((sum, group) => sum + group.quantity, 0);
    const manDays = groups.reduce((sum, group) => sum + group.operatives, 0);
    const plannedQuantityAtRate = groups.reduce((sum, group) => sum + group.operatives * Number(activityById.get(group.activityId)?.plannedManDayProductivity ?? 0), 0);
    const fallbackRates = activities.map((activity) => activity.plannedManDayProductivity).filter((value): value is number => Number(value) > 0);
    const planned = manDays > 0 ? plannedQuantityAtRate / manDays : fallbackRates.length ? fallbackRates.reduce((sum, value) => sum + value, 0) / fallbackRates.length : null;
    return { label: bucket.label, planned, actual: manDays > 0 ? quantity / manDays : null };
  });

  const labour = buckets.map((bucket) => {
    const bucketEvents = filteredEvents.filter((row) => inBucket(row, bucket)).map(({ event }) => event);
    const hours = (type: TimelineEvent["type"]) => bucketEvents.filter((event) => event.type === type).reduce((sum, event) => sum + eventLabourHours(event), 0);
    const productive = hours("work"), disruption = hours("disruption"), variation = hours("variation"), breakHours = hours("break");
    const total = productive + disruption + variation + breakHours;
    return { label: bucket.label, productive, disruption, variation, breakHours, utilisation: total > 0 ? productive / total * 100 : null };
  });

  const gangSource = filteredEvents.filter(({ date, event }) => date >= range.start && date <= range.end && event.type === "work" && event.status === "completed");
  const gangGroups = groupGangDayProductivity(gangSource.map(({ date, event }) => ({ date, event })));
  const gangs = gangGroups.flatMap((group) => {
    const activity = activityById.get(group.activityId); const planned = Number(activity?.plannedManDayProductivity ?? 0);
    if (!activity || !(planned > 0) || group.actualManDayProductivity === null) return [];
    const source = gangSource.find(({ date, event }) => date === group.date && event.programmeActivityId === group.activityId && (event.crewId ?? "unassigned") === group.gangId);
    const gang = crewName(source?.day.crews ?? [], group.gangId === "unassigned" ? undefined : group.gangId);
    const performance = group.actualManDayProductivity / planned * 100;
    return [{ key: group.key, date: group.date, gang, activity: activity.activity, unit: activity.unit, planned, actual: group.actualManDayProductivity, dailyOutput: group.quantity, gangSize: group.operatives, performance, status: performance >= 100 ? "On or Ahead" : performance >= 90 ? "Slightly Behind" : performance >= 75 ? "Behind" : "Critical Performance Variance" }];
  }).sort((a, b) => a.performance - b.performance);
  if (period === "daily") productivity = gangs.map((row) => ({ label: `${row.gang} · ${row.activity}`, planned: row.planned, actual: row.actual }));

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
    const achievement = expected > 0 ? actual / expected * 100 : null;
    return { id: activity.programmeActivityId, activity: activity.activity, building: activity.building, elevation: activity.elevation, level: activity.level, unit: activity.unit, expected, actual, variance: actual - expected, achievement, plannedFinish: activity.plannedFinish, status: achievement === null ? dashboardActivityStatus(activity, range.end) : achievement >= 100 ? "On/Ahead" : achievement >= 90 ? "Slightly Behind" : achievement >= 75 ? "Behind" : "Critical Performance Variance", mainBlocker: [...reasons].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—" };
  }).filter((row) => row.expected > 0 && row.variance < 0).sort((a, b) => a.variance - b.variance);

  const statusMap = new Map<string, number>();
  activities.forEach((activity) => { const status = dashboardActivityStatus(activity, range.end); statusMap.set(status, (statusMap.get(status) ?? 0) + 1); });
  const programmeStatus = ["Not Started", "In Progress", "Completed", "Overdue", "Missing from Latest Update", "Productivity Baseline Incomplete"].map((status) => ({ status, count: statusMap.get(status) ?? 0 }));
  const changes = filteredEvents.filter(({ date, event }) => date >= range.start && date <= range.end && event.type === "variation").map(({ date, day, event }) => ({ id: event.id, date, gang: crewName(day.crews ?? [], event.crewId), activity: activityById.get(event.programmeActivityId ?? "")?.activity ?? event.title, hours: eventLabourHours(event), quantity: typeof event.quantity === "number" ? event.quantity : null, status: event.status ?? "active", reference: event.instructionReference ?? event.drawingReference ?? "—" }));
  const detailRows = filteredEvents.filter(({ date }) => date >= range.start && date <= range.end).map(({ date, day, event }) => {
    const activity = activityById.get(event.programmeActivityId ?? "");
    const productiveHours = event.type === "work" ? eventLabourHours(event) : 0;
    const disruptionHours = event.type === "disruption" ? (event.lostLabourHours ?? eventLabourHours(event)) : 0;
    const operatives = new Set(event.affectedOperativeIds ?? []).size;
    return { id: event.id, date, gang: crewName(day.crews ?? [], event.crewId), building: activity?.building ?? "", elevation: activity?.elevation ?? "", level: activity?.level ?? "", activity: activity?.activity ?? event.title, activityId: event.programmeActivityId ?? "—", quantity: typeof event.quantity === "number" ? event.quantity : null, unit: activity?.unit ?? event.unit ?? "", operatives, productiveHours, disruptionHours, productivity: event.type === "work" && operatives > 0 && typeof event.quantity === "number" ? event.quantity / operatives : null, manHourProductivity: productiveHours > 0 && typeof event.quantity === "number" ? event.quantity / productiveHours : null, blocker: event.type === "disruption" ? classifyDashboardBlocker(event) : "—", voReference: event.type === "variation" ? (event.instructionReference ?? event.drawingReference ?? "—") : "—" };
  });

  const expected = output.reduce((sum, row) => sum + row.expected, 0), achieved = output.reduce((sum, row) => sum + row.actual, 0);
  const productiveHours = labour.reduce((sum, row) => sum + row.productive, 0), lostHours = blockers.reduce((sum, row) => sum + row.hours, 0);
  const plannedRateValues = productivity.map((row) => row.planned).filter((value): value is number => value !== null);
  const plannedRate = plannedRateValues.length ? plannedRateValues.reduce((sum, value) => sum + value, 0) / plannedRateValues.length : null;
  const periodGroups = groupGangDayProductivity(measuredPeriodWork.map(({ date, event }) => ({ date, event })));
  const operativeManDays = periodGroups.reduce((sum, group) => sum + group.operatives, 0);
  const actualRate = operativeManDays > 0 ? achieved / operativeManDays : null;
  const manHourProductivity = productiveHours > 0 ? achieved / productiveHours : null;
  const actualDailyGangOutput = periodGroups.length ? achieved / periodGroups.length : null;
  const baselineActivities = activities.filter((activity) => Number(activity.plannedManDayProductivity) > 0 && Number(activity.assumedGangSize) > 0);
  const plannedGangSize = baselineActivities.length ? baselineActivities.reduce((sum, activity) => sum + Number(activity.assumedGangSize), 0) / baselineActivities.length : null;
  const plannedDailyGangOutput = baselineActivities.length ? baselineActivities.reduce((sum, activity) => sum + Number(activity.plannedGangDailyOutput ?? Number(activity.plannedManDayProductivity) * Number(activity.assumedGangSize)), 0) / baselineActivities.length : null;
  const operativesUsed = periodGroups.length ? operativeManDays / periodGroups.length : null;
  const totalClassified = labour.reduce((sum, row) => sum + row.productive + row.disruption + row.variation + row.breakHours, 0);
  if (!periodWork.length) warnings.push("No measured work records exist for the selected period.");
  else if (!measuredPeriodWork.length) warnings.push("Work records exist, but actual quantity is missing; achieved output is not calculated.");
  if (!(operativeManDays > 0)) warnings.push("No operatives are linked to measured-work records; Actual Man-Day Productivity is not calculated.");
  if (!validActivities.length) warnings.push("No activities have a complete linear planned production baseline for the selected filters.");

  const changeHours = changes.reduce((sum, row) => sum + row.hours, 0);
  return { unit: dominantUnit, mixedUnits, warnings: [...new Set(warnings)], output, cumulative, productivity, labour, gangs, blockers, behind, programmeStatus, changes, detailRows, disruptionRows: disruptions,
    kpis: { expected: validActivities.length ? expected : null, achieved: measuredPeriodWork.length ? achieved : null, achievement: expected > 0 && measuredPeriodWork.length ? achieved / expected * 100 : null, plannedDailyGangOutput, actualDailyGangOutput, plannedRate, actualRate: measuredPeriodWork.length ? actualRate : null, productivityPerformance: plannedRate && actualRate !== null && measuredPeriodWork.length ? actualRate / plannedRate * 100 : null, operativesUsed, plannedGangSize, gangSizeVariance: operativesUsed !== null && plannedGangSize !== null ? operativesUsed - plannedGangSize : null, manHourProductivity, productiveHours: productiveHours > 0 ? productiveHours : null, lostHours: disruptions.length ? lostHours : null, changeHours: changes.length ? changeHours : null, behindCount: behind.length, principalBlocker: blockers[0]?.category ?? null, utilisation: totalClassified > 0 ? productiveHours / totalClassified * 100 : null } };
}
