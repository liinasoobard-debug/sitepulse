import assert from "node:assert/strict";
import test from "node:test";
import { parseP6Workbook, type WorkbookSheets } from "./programmeImport.ts";
import { applyProgrammeResources, completedP6Productivity, preserveManualQuantity, quantityBaseline, resourceCount } from "./programmeResources.ts";

const mapping = { building: "", elevation: "", level: "", gridline: "", workActivity: "" };
function source(): WorkbookSheets {
  return {
    TASK: [{ task_code: "Activity ID", task_name: "Activity Name" }, { task_code: "EAST", task_name: "Brackets East", status_code: "Completed", act_start_date: "2025-08-18", act_end_date: "2025-09-23" }],
    RSRC: [
      { rsrc_short_name: "HVB - F-INST", rsrc_type: "Labor", rsrc_name: "Facade Installers", unit_id: "" },
      { rsrc_short_name: "HVB-INST-CLAD", rsrc_type: "Labor", rsrc_name: "Cladders", unit_id: "" },
      { rsrc_short_name: "CRANE", rsrc_type: "Nonlabor", rsrc_name: "Merlo 360", unit_id: "" },
      { rsrc_short_name: "VALUE", rsrc_type: "Material", rsrc_name: "TOTAL VALUE", unit_id: "" },
    ],
    TASKRSRC: [
      { task_id: "Activity ID", rsrc_id: "Resource ID", target_qty_per_hr: "(*)Budgeted Units / Time(d/d)", target_qty: "Budgeted Units(d)", act_qty: "Actual Units(d)" },
      { task_id: "EAST", rsrc_id: "HVB - F-INST", target_qty_per_hr: "3", target_qty: "24", act_qty: "30", remain_qty: "0" },
      { task_id: "EAST", rsrc_id: "HVB-INST-CLAD", target_qty_per_hr: "3", target_qty: "24", act_qty: "30", remain_qty: "0" },
      { task_id: "EAST", rsrc_id: "CRANE", target_qty_per_hr: "1", target_qty: "8", act_qty: "9", remain_qty: "0" },
      { task_id: "EAST", rsrc_id: "VALUE", target_qty: "1", act_qty: "1" },
    ],
  };
}

test("P6 shared crew is counted once; plant is separate and monetary resources are not quantities", () => {
  const parsed = parseP6Workbook(source(), "project", "import", mapping, [], 8);
  const a = parsed.activities[0];
  assert.equal(a.assumedGangSize, 3);
  assert.equal(a.budgetLabourHours, 192);
  assert.equal(a.importedLabourManDays, 24);
  assert.equal(a.importedActualLabourManDays, 30);
  assert.equal(parsed.assignments[0].actualLabourUnits, 240);
  assert.equal(parsed.assignments[2].actualLabourUnits, 9);
  assert.deepEqual(a.plantResourceNames, ["Merlo 360 (1)"]);
  assert.equal(a.plannedQuantity, 0);
  assert.deepEqual(a.materialResourceNames, []);
  assert.equal(a.actualFinish, "2025-09-23");
});

test("entering quantity is sufficient to derive productivity from imported man-days", () => {
  const parsed = parseP6Workbook(source(), "project", "import", mapping, [], 8);
  const a = parsed.activities[0];
  const saved = quantityBaseline(a, 120, "m²");
  assert.equal(saved.planned_man_day_productivity, 5);
  assert.equal(saved.planned_gang_daily_output, 15);
  assert.equal(saved.planned_man_days, 24);
  const restored = applyProgrammeResources({ ...a, plannedQuantity: saved.planned_quantity, unit: saved.unit }, parsed.resources, JSON.parse(JSON.stringify(parsed.assignments)));
  assert.equal(restored.plannedManDayProductivity, 5);
  assert.equal(restored.assumedGangSize, 3);
  assert.equal(restored.importedActualLabourManDays, 30);
  assert.equal(quantityBaseline(restored, 240, "m²").planned_man_day_productivity, 10);
  assert.equal(completedP6Productivity(restored), 4);
  assert.equal(completedP6Productivity({ ...restored, activityStatus: "In Progress" }), undefined);
  assert.equal(completedP6Productivity({ ...restored, importedActualLabourManDays: 0 }), undefined);
});

test("manual quantities survive a new import while new source quantities take precedence", () => {
  const parsed = parseP6Workbook(source(), "project", "import", mapping, [], 8);
  const previous = { raw_data: { manualQuantity: { quantity: 120, unit: "m²" } } };
  const a = applyProgrammeResources(preserveManualQuantity(parsed.activities[0], previous), parsed.resources, parsed.assignments);
  assert.equal(a.plannedQuantity, 120);
  assert.equal(a.plannedManDayProductivity, 5);
  assert.equal(preserveManualQuantity({ ...a, plannedQuantity: 200 }, previous).plannedQuantity, 200);
});

test("two independent equal crews are not deduplicated", () => {
  const sheets = source();
  sheets.RSRC[1].rsrc_short_name = "OTHER-CREW";
  sheets.TASKRSRC[2].rsrc_id = "OTHER-CREW";
  const a = parseP6Workbook(sheets, "project", "import", mapping, [], 8).activities[0];
  assert.equal(a.assumedGangSize, 6);
  assert.equal(a.importedLabourManDays, 48);
});

test("conflicting labels for the confirmed shared crew raise a warning", () => {
  const sheets = source(); sheets.TASKRSRC[2].target_qty_per_hr = "1";
  const parsed = parseP6Workbook(sheets, "project", "import", mapping, [], 8);
  assert.equal(parsed.activities[0].assumedGangSize, 3);
  assert.ok(parsed.issues.some(issue => issue.message.includes("Same-crew resources")));
});

test("resource allocation formats convert to people without mistaking effort for headcount", () => {
  assert.equal(resourceCount(3, "Budgeted Units / Time(d/d)", 8), 3);
  assert.equal(resourceCount(24, "Budgeted Units / Time(h/d)", 8), 3);
  assert.equal(resourceCount(300, "Budgeted Units / Time(%)", 8), 3);
  assert.equal(resourceCount(24, "Unknown units", 8), undefined);
  const sheets = source(); delete sheets.TASKRSRC[1].target_qty_per_hr;
  assert.equal(parseP6Workbook(sheets, "project", "import", mapping, [], 8).activities[0].assumedGangSize, undefined);
});

test("quantities with different material units are not added together", () => {
  const sheets = source();
  sheets.RSRC.push({ rsrc_short_name: "PANELS", rsrc_type: "Material", rsrc_name: "Panels", unit_id: "m²" });
  sheets.TASKRSRC.push({ task_id: "EAST", rsrc_id: "PANELS", target_qty: "120" });
  assert.equal(parseP6Workbook(sheets, "project", "import", mapping, [], 8).activities[0].plannedQuantity, 120);
  sheets.RSRC.push({ rsrc_short_name: "FIXINGS", rsrc_type: "Material", rsrc_name: "Fixings", unit_id: "nr" });
  sheets.TASKRSRC.push({ task_id: "EAST", rsrc_id: "FIXINGS", target_qty: "600" });
  assert.equal(parseP6Workbook(sheets, "project", "import", mapping, [], 8).activities[0].plannedQuantity, 0);
});
