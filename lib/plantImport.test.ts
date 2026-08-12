import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPlantImport,
  mapPlantRow,
  plantStableKey,
  suggestPlantMapping,
} from "./plantImport.ts";
test("maps common plant list columns", () => {
  const mapping = suggestPlantMapping([
    "Plant Type",
    "Hire Ref",
    "Task ID",
    "Required From",
  ]);
  assert.equal(mapping.hireReference, "Hire Ref");
  assert.equal(mapping.programmeActivityId, "Task ID");
});
test("stable hire/type key prevents duplicates and re-import finds updates", () => {
  const row = mapPlantRow(
    { Type: "MEWP", Ref: "H1", Qty: "2" },
    { plantType: "Type", hireReference: "Ref", quantity: "Qty" },
  );
  assert.equal(plantStableKey(row), "hire:H1|type:MEWP");
  assert.equal(classifyPlantImport(row, { ...row }), "UNCHANGED");
  assert.equal(classifyPlantImport(row, { ...row, quantity: 1 }), "UPDATED");
});
test("unmatched and invalid plant rows are explicit", () => {
  const row = mapPlantRow(
    { Type: "Hoist", Ref: "H2", Task: "OLD" },
    { plantType: "Type", hireReference: "Ref", programmeActivityId: "Task" },
  );
  assert.equal(classifyPlantImport(row, undefined, false), "UNMATCHED");
  assert.equal(classifyPlantImport({ ...row, hire_reference: "" }), "INVALID");
});
