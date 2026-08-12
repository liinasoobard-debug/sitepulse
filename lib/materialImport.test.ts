import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMaterialImport,
  mapMaterialRow,
  materialStableKey,
  suggestMaterialMapping,
} from "./materialImport.ts";
test("suggests configurable mappings for common order schedules", () => {
  const mapping = suggestMaterialMapping([
    "Item Code",
    "Item Description",
    "PO Number",
    "Task ID",
    "Qty",
  ]);
  assert.equal(mapping.materialCode, "Item Code");
  assert.equal(mapping.programmeActivityId, "Task ID");
});
test("maps an order row and creates stable activity/material key", () => {
  const row = mapMaterialRow(
    { Task: "A100", Code: "GL-01", Description: "Glass", Qty: "24" },
    {
      programmeActivityId: "Task",
      materialCode: "Code",
      description: "Description",
      quantity: "Qty",
    },
  );
  assert.equal(materialStableKey(row), "activity:A100|code:GL-01");
  assert.equal(row.quantity, 24);
});
test("re-import classifies updated and unchanged rows without duplication", () => {
  const row = mapMaterialRow(
    { Task: "A100", Code: "GL-01", Description: "Glass", Qty: "24" },
    {
      programmeActivityId: "Task",
      materialCode: "Code",
      description: "Description",
      quantity: "Qty",
    },
  );
  assert.equal(classifyMaterialImport(row, { ...row }), "UNCHANGED");
  assert.equal(
    classifyMaterialImport(row, { ...row, quantity: 20 }),
    "UPDATED",
  );
});
test("unmatched and invalid rows are retained as explicit classifications", () => {
  const valid = mapMaterialRow(
    { Task: "OLD", Code: "X", Description: "Panel", Qty: "2" },
    {
      programmeActivityId: "Task",
      materialCode: "Code",
      description: "Description",
      quantity: "Qty",
    },
  );
  assert.equal(classifyMaterialImport(valid, undefined, false), "UNMATCHED");
  assert.equal(classifyMaterialImport({ ...valid, material: "" }), "INVALID");
});
