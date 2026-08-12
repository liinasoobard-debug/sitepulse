import assert from "node:assert/strict";
import test from "node:test";
import {
  constraintMovement,
  constraintRag,
  daysOpen,
  materialRiskSuggestion,
  mergeSuggestions,
  recurringDisruptionSuggestions,
  type ConstraintRecord,
} from "./constraints.ts";
import type { ProgrammeActivity, TimelineEvent } from "../types/site.ts";
test("material red produces one suggested constraint and unchanged duplicate is prevented", () => {
  const suggestion = materialRiskSuggestion(
    {
      activityId: "A1",
      activityName: "Glazing",
      rag: "RED",
      reason: "delivery unconfirmed",
      sourceId: "M1",
    },
    "2026-05-10",
  )!;
  assert.ok(suggestion);
  const existing = [
    {
      ...suggestion,
      id: "C1",
      project_id: "P",
      status: "OPEN" as const,
      raised_date: "2026-05-10",
    },
  ];
  assert.equal(mergeSuggestions([suggestion], existing).length, 0);
});
test("recurring plant disruption creates evidence-led suggestion", () => {
  const activity = {
    id: "db",
    programmeActivityId: "A1",
    activity: "Glazing",
    building: "",
    elevation: "",
    level: "",
    unit: "m2",
    plannedQuantity: 1,
    createdAt: "",
  } as ProgrammeActivity;
  const events = [1, 2, 3].map((n) => ({
    date: `2026-05-0${n}`,
    event: {
      id: String(n),
      programmeActivityId: "A1",
      time: "08:00",
      title: "Crane",
      reason: "Crane availability",
      type: "disruption",
      status: "completed",
      lostLabourHours: 8,
    } as TimelineEvent,
  }));
  const result = recurringDisruptionSuggestions(
    events,
    [activity],
    "2026-05-04",
  );
  assert.equal(result[0].category, "Plant");
  assert.equal(result[0].occurrence_count, 3);
});
test("constraint urgency, closing, days open and weekly movement remain separate", () => {
  assert.equal(constraintRag("2026-05-12", "2026-05-10"), "RED");
  assert.equal(
    daysOpen(
      { first_detected_date: "2026-05-01", closed_date: "2026-05-06" },
      "2026-05-20",
    ),
    5,
  );
  const row = {
    id: "1",
    project_id: "p",
    category: "Materials",
    description: "x",
    source: "MATERIALS",
    source_condition_key: "x",
    first_detected_date: "2026-05-01",
    raised_date: "2026-05-08",
    status: "OPEN",
    rag: "AMBER",
    occurrence_count: 1,
    last_detected_date: "2026-05-08",
  } as ConstraintRecord;
  const movement = constraintMovement([row], "2026-05-04", "2026-05-10");
  assert.equal(movement.newRows.length, 1);
  assert.equal(movement.open.length, 1);
});
test("clean project has no constraint movement", () => {
  assert.equal(
    constraintMovement([], "2026-05-01", "2026-05-07").open.length,
    0,
  );
});
