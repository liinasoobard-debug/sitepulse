import assert from "node:assert/strict";
import test from "node:test";
import {
  indicativeIdleExposure,
  plantUtilisation,
  workingDaysBetween,
} from "./plantOperations.ts";

test("idle working days exclude weekends", () => {
  assert.equal(workingDaysBetween("2026-08-07", "2026-08-10"), 1);
  assert.equal(workingDaysBetween("2026-08-10", "2026-08-14"), 4);
});

test("utilisation uses Timeline evidence and configurable amber/red boundaries", () => {
  assert.equal(plantUtilisation({ onHireDate: "2026-08-03", lastUsedDate: "2026-08-07", today: "2026-08-12", hasCurrentOrFutureAllocation: true }).rag, "AMBER");
  const red = plantUtilisation({ onHireDate: "2026-08-03", lastUsedDate: "2026-08-05", today: "2026-08-12", hasCurrentOrFutureAllocation: true });
  assert.equal(red.rag, "RED");
  assert.equal(red.offHireReview, true);
});

test("allocation alone is not usage and completed work triggers review", () => {
  const result = plantUtilisation({ onHireDate: "2026-08-12", today: "2026-08-12", activityComplete: true, hasCurrentOrFutureAllocation: true });
  assert.equal(result.offHireReview, true);
  assert.match(result.reason ?? "", /complete/);
});

test("idle exposure uses daily rate first, otherwise five-day weekly rate", () => {
  assert.equal(indicativeIdleExposure({ idleWorkingDays: 7, dailyRate: 100, weeklyRate: 850 }), 700);
  assert.equal(indicativeIdleExposure({ idleWorkingDays: 7, weeklyRate: 850 }), 1190);
  assert.equal(indicativeIdleExposure({ idleWorkingDays: 7 }), null);
});
