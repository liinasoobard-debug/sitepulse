import assert from "node:assert/strict";
import test from "node:test";
import { activityReadiness, requiresReadinessException, type ReadinessData } from "./readiness.ts";
import type { ProgrammeActivity } from "../types/site.ts";

const activity = (id: string, name = id): ProgrammeActivity => ({ id, programmeActivityId: id, activity: name, building: "B", elevation: "N", level: "04", unit: "m2", plannedQuantity: 10, plannedStart: "2026-08-17", plannedFinish: "2026-08-21", createdAt: "now" });
const empty: ReadinessData = { releases: [], releaseLinks: [], dependencies: [], completions: [], exceptions: [], evidence: [], audit: [] };

test("incomplete predecessor warns without changing programme fields", () => {
  const result = activityReadiness({ activity: activity("B", "Glazing"), activities: [activity("A", "Stick"), activity("B", "Glazing")], relationships: [{ predecessorId: "A", successorId: "B", type: "FS" }], data: empty, today: "2026-08-17" });
  assert.equal(result.status, "NOT READY"); assert.equal(requiresReadinessException(result), true); assert.match(result.blockers[0], /Stick/);
});

test("site complete predecessor releases successor operationally", () => {
  const data = { ...empty, completions: [{ id: "c", project_id: "p", programme_activity_external_id: "A", completed_at: "2026-08-17T12:00:00Z" }] };
  const result = activityReadiness({ activity: activity("B"), activities: [activity("A"), activity("B")], relationships: [{ predecessorId: "A", successorId: "B", type: "FS" }], data, today: "2026-08-17" });
  assert.equal(result.status, "READY");
});

test("partial release remains an auditable exception condition", () => {
  const data: ReadinessData = { ...empty, releases: [{ id: "r", project_id: "p", release_type: "Area Release", title: "North L04", area_zone: "N1-N6", status: "PARTIALLY RELEASED", created_at: "now", updated_at: "now" }], releaseLinks: [{ release_id: "r", project_id: "p", programme_activity_external_id: "B" }] };
  const result = activityReadiness({ activity: activity("B"), activities: [activity("B")], relationships: [], data, today: "2026-08-17" });
  assert.equal(result.status, "PARTIALLY RELEASED"); assert.equal(result.releaseStatus, "PARTIALLY RELEASED");
});

test("open red blocking constraint makes activity not ready", () => {
  const constraint = { id: "x", project_id: "p", category: "Access", description: "Access not released", source: "MANUAL", source_condition_key: "x", first_detected_date: "2026-08-01", calculated_required_date: "2026-08-17", status: "OPEN" as const, rag: "RED" as const, occurrence_count: 1, last_detected_date: "2026-08-17" };
  const result = activityReadiness({ activity: activity("B"), activities: [activity("B")], relationships: [], data: empty, constraints: [constraint], constraintLinks: [{ constraint_id: "x", project_id: "p", programme_activity_external_id: "B", blocking_relationship: "Blocking Start" }], today: "2026-08-17" });
  assert.equal(result.status, "NOT READY"); assert.match(result.blockers[0], /Access/);
});
