import assert from "node:assert/strict";
import test from "node:test";
import { classifyConstraintImport } from "./constraintImport.ts";
import type { ProgrammeActivity } from "../types/site.ts";
const activity = (id: string, name = "Glazing") => ({ programmeActivityId: id, activity: name } as ProgrammeActivity);
test("constraint import prefers stable activity ID", () => {
  const result = classifyConstraintImport({ "Constraint ID": "C1", Category: "Access", Description: "No access", "Programme Activity ID": "A1" }, [activity("A1")], new Set());
  assert.equal(result.classification, "NEW");
  assert.deepEqual(result.activityIds, ["A1"]);
});
test("ambiguous activity names are never silently linked", () => {
  const result = classifyConstraintImport({ Category: "Access", Description: "No access", Activity: "Glazing" }, [activity("A1"), activity("A2")], new Set());
  assert.equal(result.classification, "UNMATCHED ACTIVITY");
  assert.match(result.error, /ambiguous/);
});
test("constraint reference classifies an update", () => {
  const result = classifyConstraintImport({ "Constraint ID": "C1", Category: "Plant", Description: "Crane", "Programme Activity ID": "A1" }, [activity("A1")], new Set(["C1"]));
  assert.equal(result.classification, "UPDATED");
});
