import assert from "node:assert/strict";
import test from "node:test";
import { deriveProgrammeActualDates } from "./programmeActuals.ts";

test("programme actual dates are always reconstructed from stable linked timeline evidence", () => {
  const result = deriveProgrammeActualDates([
    { date: "2026-05-03", quantity: 40, completed: true },
    { date: "2026-05-01", quantity: 20, completed: true },
    { date: "2026-05-02", quantity: 40, completed: true },
  ], 100);
  assert.deepEqual(result, { actualStart: "2026-05-01", actualFinish: "2026-05-03", installed: 100, percentComplete: 100 });
});

test("incomplete work retains actual start without manufacturing actual finish", () => {
  const result = deriveProgrammeActualDates([{ date: "2026-05-01", quantity: 30, completed: true }], 100);
  assert.equal(result.actualStart, "2026-05-01");
  assert.equal(result.actualFinish, undefined);
  assert.equal(result.percentComplete, 30);
});
