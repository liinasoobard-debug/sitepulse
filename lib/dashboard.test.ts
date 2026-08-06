import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardData, dashboardRange } from "./dashboard.ts";
import type { ProgrammeActivity, SiteDay } from "../types/site.ts";

const activity = { id: "1", programmeActivityId: "A1", activity: "Panels", activityName: "Panels", building: "B1", elevation: "North", level: "01", unit: "m2", plannedQuantity: 100, plannedStart: "2026-08-03", plannedFinish: "2026-08-07", plannedProductionRate: 2, plannedCrewSize: 4, createdAt: "now" } satisfies ProgrammeActivity;
const day: SiteDay = { date: "2026-08-03", attendance: [], crews: [{ id: "g1", name: "Gang 1", operativeIds: ["o1", "o2"] }], events: [] };

test("dashboard periods use calendar boundaries", () => {
  assert.deepEqual(dashboardRange("weekly", "2026-08-06"), { start: "2026-08-03", end: "2026-08-09" });
  assert.deepEqual(dashboardRange("monthly", "2026-08-06"), { start: "2026-08-01", end: "2026-08-31" });
});

test("linear profile and measured work use existing labour hours", () => {
  const event = { id: "e1", programmeActivityId: "A1", crewId: "g1", time: "08:00", startTime: "08:00", finishTime: "10:00", duration: 120, title: "Panels", type: "work" as const, status: "completed" as const, quantity: 16, affectedOperativeIds: ["o1", "o2"] };
  const result = buildDashboardData({ period: "daily", selectedDate: "2026-08-03", programme: [activity], events: [{ date: day.date, day, event }], filters: { building: "", elevation: "", level: "", activity: "", gang: "", unit: "" } });
  assert.equal(result.kpis.expected, 20);
  assert.equal(result.kpis.achieved, 16);
  assert.equal(result.kpis.actualRate, 4);
  assert.equal(result.kpis.achievement, 80);
});

test("incomplete baselines warn instead of returning false expected output", () => {
  const result = buildDashboardData({ period: "weekly", selectedDate: "2026-08-03", programme: [{ ...activity, plannedStart: undefined }], events: [], filters: { building: "", elevation: "", level: "", activity: "", gang: "", unit: "" } });
  assert.equal(result.kpis.expected, null);
  assert.match(result.warnings.join(" "), /complete planned quantity/);
});
