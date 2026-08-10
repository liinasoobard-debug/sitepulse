import assert from "node:assert/strict";
import test from "node:test";
import { deriveProgrammeActuals, installedCompletionPercent } from "./progress.ts";

test("programme actuals use earliest work date and the date completion was first reached", () => {
  assert.deepEqual(deriveProgrammeActuals(100, [
    { date: "2026-08-12", quantity: 60, status: "completed" },
    { date: "2026-08-10", quantity: 40, status: "completed" },
    { date: "2026-08-09", status: "active" },
  ]), { actualStart: "2026-08-09", actualFinish: "2026-08-12", percentageComplete: 100 });
});

test("incomplete and empty histories do not have an actual finish", () => {
  assert.deepEqual(deriveProgrammeActuals(100, [{ date: "2026-08-10", quantity: 25, status: "completed" }]), {
    actualStart: "2026-08-10", actualFinish: undefined, percentageComplete: 25,
  });
  assert.deepEqual(deriveProgrammeActuals(100, []), { actualStart: undefined, actualFinish: undefined, percentageComplete: 0 });
});

test("completion percentage is bounded and invalid baselines return zero", () => {
  assert.equal(installedCompletionPercent(120, 100), 100);
  assert.equal(installedCompletionPercent(-10, 100), 0);
  assert.equal(installedCompletionPercent(10, 0), 0);
});
