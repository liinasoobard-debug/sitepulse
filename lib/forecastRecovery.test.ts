import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceForecast, dailyObservations, directSuccessorImpact, evidenceRates, floatExposure } from "./forecastRecovery.ts";

const activity = { id: "A", name: "Panels", plannedQuantity: 200, plannedFinish: "2026-05-29", plannedManDayProductivity: 5, plannedDailyGangOutput: 25 };
const records = (outputs: number[]) => outputs.map((quantity, index) => ({ date: `2026-05-${String(index + 1).padStart(2, "0")}`, quantity, operatives: 5 }));

test("consistent above-plan and below-plan performance produce evidence-led forecasts", () => {
  assert.ok((buildEvidenceForecast(activity, "2026-05-12", records([30,30,31,29,30,30]), []).productivityPerformance ?? 0) > 100);
  assert.ok((buildEvidenceForecast({ ...activity, plannedFinish: "2026-05-20" }, "2026-05-12", records([15,15,16,14,15,15]), []).likely.variance ?? 0) > 0);
});
test("upper/lower quartiles resist isolated extreme high and low days", () => {
  const normal = evidenceRates(records([20,21,19,20,20,21,19,20]));
  const outliers = evidenceRates(records([1,19,20,20,20,21,21,200]));
  assert.ok((outliers.bestDailyOutput ?? 0) < 30); assert.ok((outliers.worstDailyOutput ?? 0) > 10); assert.ok(Math.abs((normal.likelyDailyOutput ?? 0) - (outliers.likelyDailyOutput ?? 0)) < 2);
});
test("less than six days does not manufacture a best/worst range", () => { const result = evidenceRates(records([10,20,30])); assert.equal(result.confidence, "Low"); assert.equal(result.bestDailyOutput, result.likelyDailyOutput); assert.equal(result.worstDailyOutput, result.likelyDailyOutput); });
test("repeated disruption is measured without converting lost hours into output", () => {
  const production = records([30,10,30,10,30,10]).map((row, index) => ({ ...row, disrupted: index % 2 === 1 }));
  const result = buildEvidenceForecast(activity, "2026-05-12", production, [{ date: "2026-05-02", category: "Crane", lostLabourHours: 5 }, { date: "2026-05-04", category: "Crane", lostLabourHours: 3 }]);
  assert.equal(result.mainDisruption?.category, "Crane"); assert.equal(result.totalLostHours, 8); assert.ok((result.productionOnly.rate ?? 0) > (result.likely.rate ?? 0));
});
test("no disruption leaves production-only and likely rates aligned", () => { const result = buildEvidenceForecast(activity, "2026-05-12", records([20,21,19,20,21,19]), []); assert.equal(result.disruptionStats.length, 0); assert.equal(result.productionOnly.rate, result.likely.rate); });
test("recovery is classified by demonstrated sustained output", () => {
  const achievable = buildEvidenceForecast({ ...activity, plannedQuantity: 348, plannedFinish: "2026-05-20" }, "2026-05-12", records([20,30,28,31,29,30]), []);
  assert.equal(achievable.recoveryStatus, "demonstrated");
  const notYet = buildEvidenceForecast({ ...activity, plannedQuantity: 300, plannedFinish: "2026-05-15" }, "2026-05-12", records([20,21,19,20,21,19]), []);
  assert.equal(notYet.recoveryStatus, "not-yet-demonstrated");
});
test("float distinguishes delay within float and beyond float", () => { assert.equal(floatExposure(2, 3).beyondFloat, 0); assert.equal(floatExposure(6, 2).beyondFloat, 4); assert.equal(floatExposure(2).available, false); });
test("insufficient and completed activities have honest results", () => { const insufficient = buildEvidenceForecast(activity, "2026-05-12", [], []); assert.equal(insufficient.likely.available, false); assert.equal(insufficient.rates.confidence, "Very Low"); const complete = buildEvidenceForecast({ ...activity, plannedQuantity: 20 }, "2026-05-12", records([10,10]), []); assert.equal(complete.remainingQuantity, 0); assert.equal(complete.likely.workingDaysRemaining, 0); });
test("multiple gangs are aggregated once per activity day", () => { const [day] = dailyObservations([{ date: "2026-05-01", quantity: 10, operatives: 2 }, { date: "2026-05-01", quantity: 15, operatives: 3 }]); assert.equal(day.dailyOutput, 25); assert.equal(day.manDayProductivity, 5); });
test("missing relationships and valid direct successors are handled without CPM claims", () => { assert.deepEqual(directSuccessorImpact("A", "2026-05-20", []), []); const [impact] = directSuccessorImpact("A", "2026-05-20", [{ predecessorId: "A", successorId: "B", type: "FS", lag: 0, successorPlannedStart: "2026-05-19" }]); assert.equal(impact.exposed, true); assert.equal(impact.label, "Potential downstream impact"); });
