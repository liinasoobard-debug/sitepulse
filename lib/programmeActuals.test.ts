import assert from "node:assert/strict";
import test from "node:test";
import { deriveProgrammeActualDates, resolveProgrammeActuals } from "./programmeActuals.ts";

test("programme actual dates are always reconstructed from stable linked timeline evidence", () => {
  const result = deriveProgrammeActualDates([
    { date: "2026-05-03", quantity: 40, completed: true },
    { date: "2026-05-01", quantity: 20, completed: true },
    { date: "2026-05-02", quantity: 40, completed: true },
  ], 100);
  assert.deepEqual(result, { actualStart: "2026-05-01", actualFinish: "2026-05-03", installed: 100, percentComplete: 100 });
});

test("publishing a completed P6 activity without daily records preserves its actuals", () => {
  assert.deepEqual(resolveProgrammeActuals([], 0, { actualStart: "2025-08-18", actualFinish: "2025-09-23", status: "Completed" }), {
    actualStart: "2025-08-18", actualFinish: "2025-09-23", percentComplete: 100, status: "Completed",
  });
});

test("partial daily records cannot clear P6 completion or replace its start", () => {
  const result = resolveProgrammeActuals([{ date: "2026-01-01", quantity: 10, completed: true }], 100,
    { actualStart: "2025-08-18", actualFinish: "2025-09-23", status: "Completed" });
  assert.equal(result.actualStart, "2025-08-18");
  assert.equal(result.actualFinish, "2025-09-23");
  assert.equal(result.percentComplete, 100);
});

test("a completed start milestone stays completed without inventing a finish", () => {
  const result = resolveProgrammeActuals([], 0, { actualStart: "2025-09-22", status: "Completed" });
  assert.equal(result.status, "Completed");
  assert.equal(result.actualFinish, undefined);
});

test("timeline progress fills missing source actuals and can be corrected", () => {
  const source = { status: "Not Started" };
  assert.equal(resolveProgrammeActuals([{ date: "2026-05-01", quantity: 100, completed: true }], 100, source).status, "Completed");
  assert.deepEqual(resolveProgrammeActuals([], 100, source), { actualStart: undefined, actualFinish: undefined, percentComplete: 0, status: "Not Started" });
});

test("incomplete work retains actual start without manufacturing actual finish", () => {
  const result = deriveProgrammeActualDates([{ date: "2026-05-01", quantity: 30, completed: true }], 100);
  assert.equal(result.actualStart, "2026-05-01");
  assert.equal(result.actualFinish, undefined);
  assert.equal(result.percentComplete, 30);
});
