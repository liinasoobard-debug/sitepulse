import { eventLabourHours } from "./reporting.ts";
import type { DatedDashboardEvent } from "./dashboard.ts";
import type { TimelineEvent } from "../types/site.ts";

export type WorkBreakdownGranularity = "day" | "week" | "month";
export type WorkBreakdownCategory = "measuredWork" | "change" | "standingTime" | "disruption";

export type WorkBreakdownPoint = {
  key: string;
  label: string;
  measuredWork: number;
  change: number;
  standingTime: number;
  disruption: number;
  total: number;
};

export type WorkBreakdownCategorySummary = { available: boolean; hours: number; percent: number };

export type WorkBreakdownData = {
  points: WorkBreakdownPoint[];
  summary: Record<WorkBreakdownCategory, WorkBreakdownCategorySummary>;
  totalHours: number;
};

const DAY = 86_400_000;
const dateValue = (date: string) => new Date(`${date}T12:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => isoDate(new Date(dateValue(date).getTime() + days * DAY));

function mondayFor(date: string): string {
  const weekday = dateValue(date).getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

// Canonical SitePulse event.type classification. Categories are mutually exclusive
// by construction (each event has exactly one type), which prevents double-counting.
// non_measured_work / plant events are intentionally excluded from all four buckets.
function categoryFor(type: TimelineEvent["type"]): WorkBreakdownCategory | null {
  if (type === "work") return "measuredWork";
  if (type === "variation") return "change";
  if (type === "disruption") return "disruption";
  if (type === "waiting" || type === "delay" || type === "break") return "standingTime";
  return null;
}

function hoursFor(category: WorkBreakdownCategory, event: TimelineEvent): number {
  if (category === "disruption") return event.lostLabourHours ?? eventLabourHours(event);
  return eventLabourHours(event);
}

function bucketKey(date: string, granularity: WorkBreakdownGranularity): { key: string; label: string } {
  if (granularity === "week") {
    const start = mondayFor(date);
    const end = addDays(start, 6);
    const format = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dateValue(value));
    return { key: start, label: `${format(start)}–${format(end)}` };
  }
  if (granularity === "month") {
    const key = date.slice(0, 7);
    return { key, label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(dateValue(`${key}-01`)) };
  }
  return { key: date, label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dateValue(date)) };
}

export function buildWorkBreakdown(
  events: DatedDashboardEvent[],
  range: { start: string; end: string },
  granularity: WorkBreakdownGranularity
): WorkBreakdownData {
  const relevant = events.filter(({ date }) => date >= range.start && date <= range.end);
  const buckets = new Map<string, WorkBreakdownPoint>();
  const categoryTotals: Record<WorkBreakdownCategory, { hours: number; count: number }> = {
    measuredWork: { hours: 0, count: 0 },
    change: { hours: 0, count: 0 },
    standingTime: { hours: 0, count: 0 },
    disruption: { hours: 0, count: 0 },
  };

  relevant.forEach(({ date, event }) => {
    const category = categoryFor(event.type);
    if (!category) return;
    const hours = hoursFor(category, event);
    categoryTotals[category].hours += hours;
    categoryTotals[category].count += 1;

    const { key, label } = bucketKey(date, granularity);
    const point = buckets.get(key) ?? { key, label, measuredWork: 0, change: 0, standingTime: 0, disruption: 0, total: 0 };
    point[category] += hours;
    point.total += hours;
    buckets.set(key, point);
  });

  const points = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  const summary = (Object.keys(categoryTotals) as WorkBreakdownCategory[]).reduce((acc, category) => {
    const { hours, count } = categoryTotals[category];
    acc[category] = { available: count > 0, hours, percent: 0 };
    return acc;
  }, {} as Record<WorkBreakdownCategory, WorkBreakdownCategorySummary>);

  const totalHours = (Object.keys(summary) as WorkBreakdownCategory[]).reduce(
    (sum, category) => sum + (summary[category].available ? summary[category].hours : 0),
    0
  );
  (Object.keys(summary) as WorkBreakdownCategory[]).forEach((category) => {
    if (summary[category].available) summary[category].percent = totalHours > 0 ? (summary[category].hours / totalHours) * 100 : 0;
  });

  return { points, summary, totalHours };
}
