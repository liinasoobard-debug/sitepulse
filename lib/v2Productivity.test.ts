import assert from "node:assert/strict";
import test from "node:test";
import { plannedQuantityToDate, v2Productivity } from "./v2Productivity.ts";
import type { ProgrammeActivity } from "../types/site.ts";

test("V2 productivity uses earned man-days divided by actual man-days", () => {
  const result = v2Productivity({ plannedQuantity: 100, plannedManDays: 10 }, 20, 12, 8);
  assert.deepEqual(result, { targetProductivity: 10, earnedManDays: 2, actualManDays: 1.5, productivityFactor: 4 / 3 });
});

test("planned quantity is spread across inclusive working days", () => {
  const activity = { plannedStart: "2026-08-24", plannedFinish: "2026-08-28", plannedQuantity: 100 } as ProgrammeActivity;
  assert.equal(plannedQuantityToDate(activity, "2026-08-25"), 40);
  assert.equal(plannedQuantityToDate(activity, "2026-09-01"), 100);
});
