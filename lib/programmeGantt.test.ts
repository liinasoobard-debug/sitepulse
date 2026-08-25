import assert from "node:assert/strict";
import test from "node:test";
import { deriveProgrammeGanttStatus, isAvailableNow } from "./programmeGantt.ts";
import type { ProgrammeActivity } from "../types/site.ts";

const activity = (patch: Partial<ProgrammeActivity> = {}): ProgrammeActivity => ({
  id: "db-1", programmeActivityId: "A100", activityName: "Curtain wall", activity: "Curtain wall",
  building: "B1", elevation: "North", level: "L02", unit: "m2", plannedQuantity: 100,
  plannedStart: "2026-08-01", plannedFinish: "2026-08-30", createdAt: "2026-01-01", ...patch,
});

test("derives restrained operational statuses from imported dates and actual progress", () => {
  assert.equal(deriveProgrammeGanttStatus(activity(), "2026-08-25"), "available-not-started");
  assert.equal(deriveProgrammeGanttStatus(activity({ actualStart: "2026-08-20", physicalPercentComplete: 20 }), "2026-08-25"), "available-working");
  assert.equal(deriveProgrammeGanttStatus(activity({ plannedStart: "2026-09-01" }), "2026-08-25"), "future");
  assert.equal(deriveProgrammeGanttStatus(activity({ physicalPercentComplete: 100 }), "2026-08-25"), "completed");
  assert.equal(deriveProgrammeGanttStatus(activity(), "2026-08-25", [{ id: "c1" } as never]), "constrained");
  assert.equal(isAvailableNow("available-working"), true);
  assert.equal(isAvailableNow("constrained"), false);
});
