import assert from "node:assert/strict";
import test from "node:test";
import { forecastActivityType, forecastDiagnostics, forecastReadiness, latestRecordedDataDate } from "./forecastData.ts";
import type { ProgrammeActivity, TimelineEvent } from "../types/site.ts";

const activity = (overrides: Partial<ProgrammeActivity> = {}): ProgrammeActivity => ({
  id: "db-a1", programmeActivityId: "A1", building: "North", elevation: "East", level: "L01", activity: "Composite Cladding", unit: "m2", plannedQuantity: 1200, plannedStart: "2026-05-01", plannedFinish: "2026-06-30", plannedDurationDays: 42, plannedManDayProductivity: 6.8, plannedGangDailyOutput: 34, createdAt: "2026-01-01", ...overrides,
});
const event = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({ id: "e1", programmeActivityId: "A1", time: "08:00", title: "Composite Cladding", type: "work", status: "completed", quantity: 20, ...overrides });

test("classifies quantified programme work as production and zero-duration handover as milestone", () => {
  assert.equal(forecastActivityType(activity()), "production");
  assert.equal(forecastActivityType(activity({ activity: "Client handover - North", plannedQuantity: 0, unit: "", originalDuration: 0 })), "milestone");
});

test("readiness distinguishes complete baseline awaiting evidence from a genuinely incomplete baseline", () => {
  assert.equal(forecastReadiness(activity(), 2), "waiting-actuals");
  assert.equal(forecastReadiness(activity(), 6), "ready");
  assert.equal(forecastReadiness(activity({ plannedManDayProductivity: undefined }), 6), "baseline-incomplete");
});

test("data date uses the latest recorded project day unless explicitly selected", () => {
  const rows = [{ date: "2026-05-04", event: event() }, { date: "2026-05-12", event: event({ id: "e2" }) }];
  assert.equal(latestRecordedDataDate(rows), "2026-05-12");
  assert.equal(latestRecordedDataDate(rows, "2026-05-10"), "2026-05-10");
});

test("diagnostics match timeline records through stable external or database activity IDs", () => {
  const rows = [
    { date: "2026-05-04", event: event() },
    { date: "2026-05-05", event: event({ id: "e2", programmeActivityId: undefined, programmeActivityDatabaseId: "db-a1" }) },
    { date: "2026-05-06", event: event({ id: "orphan", programmeActivityId: "OLD" }) },
  ];
  const result = forecastDiagnostics([activity()], rows);
  assert.equal(result.timelineRecordsMatched, 2);
  assert.equal(result.unmatchedTimelineRecords, 1);
});
