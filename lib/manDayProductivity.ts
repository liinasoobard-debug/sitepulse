import type { ProgrammeActivity, TimelineEvent } from "@/types/site";

export type DatedWorkEvent = { date: string; event: TimelineEvent };

export type ProductivityFactorThresholds = { greenMax: number; amberMax: number };
export const DEFAULT_PRODUCTIVITY_FACTOR_THRESHOLDS: ProductivityFactorThresholds = { greenMax: 1, amberMax: 1.1 };
export function normaliseProductivityFactorThresholds(value?: Partial<ProductivityFactorThresholds> | null): ProductivityFactorThresholds {
  const greenMax = Number(value?.greenMax);
  const amberMax = Number(value?.amberMax);
  return Number.isFinite(greenMax) && greenMax > 0 && Number.isFinite(amberMax) && amberMax >= greenMax ? { greenMax, amberMax } : DEFAULT_PRODUCTIVITY_FACTOR_THRESHOLDS;
}
export type ProductivityFactorRag = "green" | "amber" | "red" | "baseline-missing" | "no-actuals";
export type ProductivityFactorMetrics = {
  quantity: number;
  earnedManDays: number | null;
  actualManDays: number | null;
  manDayVariance: number | null;
  productivityFactor: number | null;
  rag: ProductivityFactorRag;
};

export function productivityFactorRag(factor: number | null, thresholds: ProductivityFactorThresholds = DEFAULT_PRODUCTIVITY_FACTOR_THRESHOLDS): ProductivityFactorRag {
  if (factor === null || !Number.isFinite(factor)) return "no-actuals";
  if (factor <= thresholds.greenMax) return "green";
  if (factor <= thresholds.amberMax) return "amber";
  return "red";
}

export function calculateProductivityFactor(quantity: number, plannedManDayProductivity?: number | null, actualManDays?: number | null, thresholds: ProductivityFactorThresholds = DEFAULT_PRODUCTIVITY_FACTOR_THRESHOLDS): ProductivityFactorMetrics {
  const planned = Number(plannedManDayProductivity);
  const actual = Number(actualManDays);
  if (!(planned > 0)) return { quantity, earnedManDays: null, actualManDays: Number.isFinite(actual) && actual >= 0 ? actual : null, manDayVariance: null, productivityFactor: null, rag: "baseline-missing" };
  const earnedManDays = quantity / planned;
  if (!Number.isFinite(actual) || actual < 0 || earnedManDays <= 0) return { quantity, earnedManDays, actualManDays: null, manDayVariance: null, productivityFactor: null, rag: "no-actuals" };
  const productivityFactor = actual / earnedManDays;
  return { quantity, earnedManDays, actualManDays: actual, manDayVariance: actual - earnedManDays, productivityFactor, rag: productivityFactorRag(productivityFactor, thresholds) };
}

export function aggregateProductivityFactors(rows: Array<Pick<ProductivityFactorMetrics, "quantity" | "earnedManDays" | "actualManDays">>, thresholds: ProductivityFactorThresholds = DEFAULT_PRODUCTIVITY_FACTOR_THRESHOLDS): ProductivityFactorMetrics {
  const valid = rows.filter((row) => row.earnedManDays !== null && row.actualManDays !== null);
  const quantity = valid.reduce((sum, row) => sum + row.quantity, 0);
  const earnedManDays = valid.reduce((sum, row) => sum + row.earnedManDays!, 0);
  const actualManDays = valid.reduce((sum, row) => sum + row.actualManDays!, 0);
  if (!valid.length || earnedManDays <= 0) return { quantity, earnedManDays: null, actualManDays: null, manDayVariance: null, productivityFactor: null, rag: rows.length ? "baseline-missing" : "no-actuals" };
  const productivityFactor = actualManDays / earnedManDays;
  return { quantity, earnedManDays, actualManDays, manDayVariance: actualManDays - earnedManDays, productivityFactor, rag: productivityFactorRag(productivityFactor, thresholds) };
}

export type ManDayBaseline = {
  plannedGangDailyOutput: number | null;
  plannedManDays: number | null;
  requiredAverageGangSize: number | null;
  remainingQuantity: number;
  remainingManDays: number | null;
  requiredRemainingGangSize: number | null;
};

export function plannedWorkingDaysBetween(start?: string, finish?: string): number | undefined {
  if (!start || !finish) return undefined;
  const first = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const last = new Date(`${finish.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return undefined;
  let days = 0;
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days || undefined;
}

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
