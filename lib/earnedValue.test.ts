import assert from "node:assert/strict";
import test from "node:test";
import { buildEarnedValueData, calculateEarnedValueMetrics } from "./earnedValue.ts";
import type { DashboardFilters } from "./dashboard.ts";
import type { ProgrammeActivity, SiteDay, TimelineEvent } from "../types/site.ts";

const filters: DashboardFilters = { building: "", elevation: "", level: "", activity: "", gang: "", unit: "", activityStatus: "", blockerCategory: "", productivityRag: "", productType: "" };
const activity = { id: "1", programmeActivityId: "A1", activity: "Panels", building: "B", elevation: "North", level: "1", unit: "m2", plannedQuantity: 100, budgetLabourHours: 1_000, plannedStart: "2026-08-03", plannedFinish: "2026-08-14", createdAt: "now" } satisfies ProgrammeActivity;
const day: SiteDay = { date: "2026-08-03", attendance: [], crews: [{ id: "g1", name: "Gang 1", operativeIds: ["o1"] }], events: [] };
const work = (id: string, date: string, quantity: number | undefined, hours: number, programmeActivityId: string | undefined = "A1") => ({ date, day: { ...day, date }, event: { id, programmeActivityId, crewId: "g1", time: "08:00", duration: hours * 60, title: "Work", type: "work", status: "completed", quantity, affectedOperativeIds: ["o1"] } satisfies TimelineEvent });

test("calculates the requested earned-value example and safe zero denominators", () => {
  assert.deepEqual(calculateEarnedValueMetrics(550, 500, 600), { plannedHours: 550, earnedHours: 500, actualHours: 600, productivityFactor: 500 / 600, schedulePerformance: 500 / 550, labourVariance: -100, programmeVariance: -50 });
  assert.equal(calculateEarnedValueMetrics(550, 500, 0).productivityFactor, null);
  assert.equal(calculateEarnedValueMetrics(0, 500, 600).schedulePerformance, null);
});

test("orders weekly points and accumulates planned, earned and allocated actual hours", () => {
  const result = buildEarnedValueData({ programme: [activity], events: [work("later", "2026-08-12", 30, 100), work("first", "2026-08-05", 20, 80)], reportingDate: "2026-08-14", filters });
  assert.deepEqual(result.points.map((point) => point.weekStart), ["2026-08-03", "2026-08-10"]);
  assert.equal(result.points[0].plannedHours, 500);
  assert.equal(result.points[0].earnedHours, 200);
  assert.equal(result.points[0].actualHours, 80);
  assert.deepEqual(result.metrics, { plannedHours: 1_000, earnedHours: 500, actualHours: 180, productivityFactor: 500 / 180, schedulePerformance: .5, labourVariance: 320, programmeVariance: -500 });
});

test("caps baseline earned progress at 100 percent", () => {
  const result = buildEarnedValueData({ programme: [activity], events: [work("over", "2026-08-14", 120, 40)], reportingDate: "2026-08-14", filters });
  assert.equal(result.metrics.earnedHours, 1_000);
});

test("excludes unallocated labour and reports its hours", () => {
  const unallocated = work("unallocated", "2026-08-05", undefined, 6);
  unallocated.event.programmeActivityId = undefined;
  const result = buildEarnedValueData({ programme: [activity], events: [work("allocated", "2026-08-05", 10, 8), unallocated], reportingDate: "2026-08-07", filters });
  assert.equal(result.metrics.actualHours, 8);
  assert.equal(result.unallocatedHours, 6);
});

test("reports incomplete inputs rather than presenting a zero-value graph", () => {
  const result = buildEarnedValueData({ programme: [{ ...activity, budgetLabourHours: undefined }], events: [], reportingDate: "2026-08-14", filters });
  assert.deepEqual(result.points, []);
  assert.deepEqual(result.missing, ["No planned labour budget", "No verified progress recorded", "No actual labour allocated"]);
});

test("missing quantity is actual labour but not verified progress", () => {
  const result = buildEarnedValueData({ programme: [activity], events: [work("hours-only", "2026-08-05", undefined, 8)], reportingDate: "2026-08-07", filters });
  assert.equal(result.metrics.actualHours, 8);
  assert.equal(result.metrics.earnedHours, null);
  assert.ok(result.missing.includes("No verified progress recorded"));
});
