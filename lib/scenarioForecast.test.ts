import assert from "node:assert/strict";
import test from "node:test";
import { downstreamImpact, floatAssessment, forecastScenario, historicalDisruptionStatistics, recentActuals, recoveryRequirement } from "./scenarioForecast.ts";

const activity = { id: "A1", name: "Panels", plannedQuantity: 100, plannedFinish: "2026-05-22", plannedManDayProductivity: 5, assumedGangSize: 4 };
const base = { name: "Current Trend", productivityChangePercent: 0, gangSize: 4, disruptionExposurePercent: 0, weekendWorking: false };

test("current trend forecasts activities ahead and late", () => {
  assert.ok((forecastScenario(activity, "2026-05-11", 60, 5, base).daysEarlyLate ?? 0) < 0);
  assert.ok((forecastScenario(activity, "2026-05-11", 0, 2, base).daysEarlyLate ?? 0) > 0);
});
test("productivity, gang and disruption scenarios change forecast deterministically", () => {
  const current = forecastScenario(activity, "2026-05-11", 20, 4, { ...base, disruptionExposurePercent: 30 });
  const productivity = forecastScenario(activity, "2026-05-11", 20, 4, { ...base, productivityChangePercent: 25 });
  const gang = forecastScenario(activity, "2026-05-11", 20, 4, { ...base, gangSize: 6 });
  const reducedDisruption = forecastScenario(activity, "2026-05-11", 20, 4, { ...base, disruptionExposurePercent: 10 });
  const downside = forecastScenario(activity, "2026-05-11", 20, 4, { ...base, disruptionExposurePercent: 50 });
  assert.ok(productivity.forecastFinish! < current.forecastFinish!);
  assert.ok(gang.forecastFinish! < current.forecastFinish!);
  assert.ok(reducedDisruption.forecastFinish! < current.forecastFinish!);
  assert.ok(downside.forecastFinish! > current.forecastFinish!);
});
test("complete and insufficient activities are handled without division by zero", () => {
  assert.equal(forecastScenario(activity, "2026-05-11", 100, 5, base).forecastWorkingDays, 0);
  assert.equal(forecastScenario({ id: "A2", name: "Missing" }, "2026-05-11", 0, null, base).available, false);
});
test("recent productivity is weighted by operative man-days", () => assert.equal(recentActuals([{ date: "2026-05-10", quantity: 10, operatives: 2 }, { date: "2026-05-11", quantity: 30, operatives: 3 }]).productivity, 8));
test("historical disruption labels occurrence and exposes insufficient samples", () => {
  assert.deepEqual(historicalDisruptionStatistics([], undefined, "2026-05-11"), []);
  const [row] = historicalDisruptionStatistics([{ date: "2026-05-04", category: "Crane", lostLabourHours: 4 }, { date: "2026-05-04", category: "Crane", lostLabourHours: 2 }], "2026-05-04", "2026-05-08");
  assert.equal(row.affectedWorkingDays, 1); assert.equal(row.relevantWorkingDays, 5); assert.equal(row.events, 2); assert.equal(row.occurrenceRate, .2);
});
test("recovery requirement reports productivity and rounded operational gang", () => {
  const result = recoveryRequirement({ ...activity, plannedFinish: "2026-05-13" }, "2026-05-11", 80, 4, 4, 0);
  assert.equal(result.available, true); assert.ok((result.requiredImprovementPercent ?? 0) > 0); assert.equal(result.operationalGangSize, Math.ceil(result.requiredAverageGangSize!));
});
test("relationship propagation is limited to valid direct finish-to-start logic", () => {
  assert.equal(downstreamImpact("A1", "2026-05-20", []).length, 0);
  assert.equal(downstreamImpact("A1", "2026-05-20", [{ predecessorId: "A1", successorId: "A2", type: "FS", lag: 0, successorPlannedStart: "2026-05-18" }])[0].affected, true);
  assert.equal(downstreamImpact("A1", "2026-05-20", [{ predecessorId: "A1", successorId: "A2", type: "SS", lag: 0 }])[0].validFinishToStart, false);
});
test("float is assessed only when supplied", () => {
  assert.equal(floatAssessment(5).available, false);
  assert.equal(floatAssessment(5, 3).exceeds, true);
  assert.equal(floatAssessment(2, 3).exceeds, false);
});
