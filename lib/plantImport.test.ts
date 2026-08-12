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
test("maps the operational template fields", () => {
  const mapping = suggestPlantMapping([
    "Record Kind",
    "Asset / Fleet Number",
    "Confirmed Delivery Date",
    "Weekly Hire Rate",
  ]);
  assert.equal(mapping.recordKind, "Record Kind");
  assert.equal(mapping.assetNumber, "Asset / Fleet Number");
  assert.equal(mapping.confirmedDeliveryDate, "Confirmed Delivery Date");
  assert.equal(mapping.weeklyHireRate, "Weekly Hire Rate");
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
test("requirements have a stable key without a hire reference", () => {
  const row = mapPlantRow(
    {
      Kind: "REQUIREMENT",
      Type: "MEWP",
      Activity: "A100",
      From: "2026-08-20",
    },
    {
      recordKind: "Kind",
      plantType: "Type",
      programmeActivityId: "Activity",
      requiredFrom: "From",
    },
  );
  assert.equal(
    plantStableKey(row),
    "requirement:A100|type:MEWP|from:2026-08-20",
  );
  assert.equal(classifyPlantImport(row), "NEW");
});
