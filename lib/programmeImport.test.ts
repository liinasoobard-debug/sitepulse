import assert from "node:assert/strict";
import test from "node:test";
import { classifyProgramme, hierarchyFromActivityDescription, parseP6Workbook, type WorkbookSheets } from "./programmeImport.ts";
import { parseAstaWorkbook, parseSitePulseTemplate } from "./programmeImportAdapters.ts";

const mapping = { building: "Building", elevation: "Elevation", level: "Level", gridline: "Gridline", workActivity: "Activity Name" };

function fixture(): WorkbookSheets {
  return {
    TASK: [
      { task_code: "Activity ID", task_name: "Activity Name" },
      { task_id: "1", task_code: "A1000", task_name: "Install panels", status_code: "TK_Active", wbs_id: "1.2", Building: "Block A", Elevation: "North", Level: "01", "Planned Quantity": 100, Unit: "m²", "Budget Labour Hours": 50, target_start_date: "2026-08-03", target_end_date: "2026-08-14" },
      { task_id: "2", task_code: "A1010", task_name: "Seal panels", Building: "Block A", Elevation: "North", Level: "01" },
    ],
    TASKPRED: [{ pred_task_id: "1", task_id: "2", pred_type: "PR_FS", lag_hr_cnt: 0 }],
    RSRC: [{ rsrc_id: "10", rsrc_short_name: "LAB-01", rsrc_name: "Facade gang", rsrc_type: "RT_Labor" }, { rsrc_id: "11", rsrc_short_name: "CRANE", rsrc_name: "Tower crane" }],
    TASKRSRC: [{ task_id: "1", rsrc_id: "10", target_qty: 40 }, { task_id: "1", rsrc_id: "11", target_qty: 8 }],
  };
}

test("imports TASK, TASKPRED, RSRC and multiple TASKRSRC assignments", () => {
  const result = parseP6Workbook(fixture(), "project", "import", mapping);
  assert.equal(result.activities.length, 2);
  assert.equal(result.activities[0].programmeActivityId, "A1000");
  assert.equal(result.relationships[0].predecessorActivityId, "A1000");
  assert.equal(result.relationships[0].successorActivityId, "A1010");
  assert.equal(result.resources.length, 2);
  assert.equal(result.assignments.filter((item) => item.programmeActivityId === "A1000").length, 2);
  assert.equal(result.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("reports duplicate Activity IDs and missing relationship identifiers", () => {
  const sheets = fixture();
  sheets.TASK.push({ task_id: "3", task_code: "A1000", task_name: "Duplicate" });
  sheets.TASKPRED.push({ pred_task_id: "", task_id: "2" });
  const result = parseP6Workbook(sheets, "project", "import", mapping);
  assert.ok(result.issues.some((issue) => issue.message.includes("Duplicate Activity ID")));
  assert.ok(result.issues.some((issue) => issue.sheet === "TASKPRED" && issue.severity === "error"));
});

test("preserves relationship and assignment IDs outside a filtered workbook", () => {
  const sheets = fixture();
  sheets.TASKPRED.push({ pred_task_id: "EXTERNAL-10", task_id: "A1000", pred_type: "PR_FS" });
  sheets.TASKRSRC.push({ task_id: "EXTERNAL-10", rsrc_id: "EXTERNAL-RSRC" });
  const result = parseP6Workbook(sheets, "project", "import", mapping);
  assert.ok(result.relationships.some((item) => item.predecessorActivityId === "EXTERNAL-10"));
  assert.ok(result.assignments.some((item) => item.programmeActivityId === "EXTERNAL-10" && item.resourceId === "EXTERNAL-RSRC"));
  assert.equal(result.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("consolidates duplicate resources by official P6 Resource ID", () => {
  const sheets = fixture();
  sheets.RSRC.push({ rsrc_id: "12", rsrc_short_name: "LAB-01", rsrc_name: "Duplicate facade gang" });
  const result = parseP6Workbook(sheets, "project", "import", mapping);
  assert.equal(result.resources.filter((item) => item.resourceId === "LAB-01").length, 1);
  assert.ok(result.issues.some((issue) => issue.sheet === "RSRC" && issue.severity === "warning" && issue.message.includes("duplicate resource")));
  assert.equal(result.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("classifies changed dates, new rows and activities missing from an update", () => {
  const first = parseP6Workbook(fixture(), "project", "first", mapping).activities;
  const nextSheets = fixture();
  nextSheets.TASK[1].target_end_date = "2026-08-21";
  nextSheets.TASK.pop();
  nextSheets.TASK.push({ task_id: "3", task_code: "A1020", task_name: "New work" });
  const next = parseP6Workbook(nextSheets, "project", "next", mapping).activities;
  const changes = classifyProgramme(first, next);
  assert.equal(changes.find((item) => item.programmeActivityId === "A1000")?.classification, "updated");
  assert.equal(changes.find((item) => item.programmeActivityId === "A1020")?.classification, "new");
  assert.equal(changes.find((item) => item.programmeActivityId === "A1010")?.classification, "missing");
});

test("imports activities with incomplete productivity baselines", () => {
  const result = parseP6Workbook(fixture(), "project", "import", mapping);
  assert.equal(result.activities.find((item) => item.programmeActivityId === "A1010")?.productivityBaselineComplete, false);
  assert.equal(result.activities.find((item) => item.programmeActivityId === "A1000")?.plannedProductionRate, 2);
});

test("derives the activity baseline from P6 labour and material assignments", () => {
  const sheets = fixture();
  sheets.TASK[1] = { task_id: "1", task_code: "A1000", task_name: "Install panels", target_drtn_hr_cnt: 40 };
  sheets.RSRC = [
    { rsrc_id: "10", rsrc_short_name: "LAB-01", rsrc_name: "Facade gang", rsrc_type: "RT_Labor", unit: "h" },
    { rsrc_id: "11", rsrc_short_name: "MAT-01", rsrc_name: "Panels", rsrc_type: "RT_Mat", unit: "m²" },
  ];
  sheets.TASKRSRC = [
    { task_id: "1", rsrc_id: "10", target_qty: 160 },
    { task_id: "1", rsrc_id: "11", target_qty: 75 },
  ];
  const activity = parseP6Workbook(sheets, "project", "import", mapping).activities[0];
  assert.equal(activity.plannedQuantity, 75);
  assert.equal(activity.unit, "m²");
  assert.equal(activity.budgetLabourHours, 160);
  assert.equal(activity.plannedCrewSize, 4);
  assert.equal(activity.plannedProductionRate, 75 / 160);
  assert.equal(activity.productivityBaselineComplete, true);
});

test("treats a non-hour labour assignment as crew size", () => {
  const sheets = fixture();
  sheets.TASK[1] = { task_id: "1", task_code: "A1000", task_name: "Install panels", target_drtn_hr_cnt: 40 };
  sheets.RSRC = [
    { rsrc_id: "10", rsrc_short_name: "LAB-QTY", rsrc_name: "Labour QTY", rsrc_type: "RT_Labor", unit: "men" },
    { rsrc_id: "11", rsrc_short_name: "MAT-QTY", rsrc_name: "CW QTY", rsrc_type: "RT_Mat", unit: "m²" },
  ];
  sheets.TASKRSRC = [
    { task_id: "1", rsrc_id: "10", "Budgeted Units": 4 },
    { task_id: "1", rsrc_id: "11", "Budgeted Material Units": 75 },
  ];
  const activity = parseP6Workbook(sheets, "project", "import", mapping).activities[0];
  assert.equal(activity.plannedQuantity, 75);
  assert.equal(activity.unit, "m²");
  assert.equal(activity.plannedCrewSize, 4);
  assert.equal(activity.budgetLabourHours, 160);
  assert.equal(activity.plannedProductionRate, 75 / 160);
});

test("programme comparison is isolated from SitePulse actual records", () => {
  const activities = parseP6Workbook(fixture(), "project", "first", mapping).activities;
  const siteActuals = [{ id: "event-1", programmeActivityId: "A1000", quantity: 12 }];
  classifyProgramme(activities, parseP6Workbook(fixture(), "project", "next", mapping).activities);
  assert.deepEqual(siteActuals, [{ id: "event-1", programmeActivityId: "A1000", quantity: 12 }]);
});

test("filtered weekly exports can resolve references against the existing programme", () => {
  const sheets = fixture();
  sheets.TASK = [sheets.TASK[0], sheets.TASK[1]];
  sheets.TASKPRED = [{ pred_task_id: "A1000", task_id: "A1010", pred_type: "PR_FS" }];
  const result = parseP6Workbook(sheets, "project", "update", mapping, ["A1000", "A1010"]);
  assert.equal(result.activities.length, 1);
  assert.equal(result.relationships.length, 1);
  assert.equal(result.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("uses P6 row-two descriptions while mapping machine-key hierarchy columns", () => {
  const sheets = fixture();
  sheets.TASK[0] = { task_code: "Activity ID", task_name: "Activity Name", actv_code_elevation_id: "ALUMET - ELEVATION", actv_code_floors_id: "HBX-ALS-FLOORS" };
  sheets.TASK[1].actv_code_elevation_id = "EAST";
  sheets.TASK[1].actv_code_floors_id = "L20";
  const result = parseP6Workbook(sheets, "project", "import", { ...mapping, elevation: "actv_code_elevation_id", level: "actv_code_floors_id" });
  assert.equal(result.columnLabels.actv_code_elevation_id, "ALUMET - ELEVATION");
  assert.equal(result.activities[0].elevation, "EAST");
  assert.equal(result.activities[0].level, "L20");
});

test("extracts hierarchy and product type from a structured activity description", () => {
  assert.deepEqual(hierarchyFromActivityDescription("North, L01 - Install - CW Wall"), {
    elevation: "North",
    level: "L01",
    workActivity: "Install",
    productType: "CW Wall",
  });
  const sheets = fixture();
  sheets.TASK[1] = { task_id: "1", task_code: "A1000", task_name: "North, L01 - Install - CW Wall" };
  const activity = parseP6Workbook(sheets, "project", "import", { ...mapping, elevation: "", level: "", workActivity: "" }).activities[0];
  assert.equal(activity.elevation, "North");
  assert.equal(activity.level, "L01");
  assert.equal(activity.workActivity, "Install");
  assert.equal(activity.productType, "CW Wall");
});

test("applies one confirmed building value to every imported row", () => {
  const result = parseP6Workbook(fixture(), "project", "import", { ...mapping, building: "__constant__:HBX" });
  assert.ok(result.activities.every((activity) => activity.building === "HBX"));
});

test("SitePulse template calculates interchangeable productivity baseline fields", () => {
  const result = parseSitePulseTemplate({ "SitePulse Programme": [{ "Programme Activity ID": "SP-1", Building: "B1", Elevation: "East", Level: "02", Activity: "Install glazing", "Product Type": "CW Stick Glazing", Unit: "m2", "Planned Quantity": 120, "Planned Start": "2026-08-10", "Planned Finish": "2026-08-21", "Budget Labour Hours": 60 }] }, "project", "import");
  assert.equal(result.issues.filter((issue) => issue.severity === "error").length, 0);
  assert.equal(result.activities[0].plannedProductionRate, 2);
  assert.equal(result.activities[0].budgetLabourHours, 60);
  assert.equal(result.activities[0].productType, "CW Stick Glazing");
  assert.equal(result.activities[0].sourceType, "sitepulse-template");
});

test("Asta and SitePulse sources map equivalent rows into the same canonical fields", () => {
  const standard = parseSitePulseTemplate({ Programme: [{ "Programme Activity ID": "A-1", Building: "B1", Elevation: "West", Level: "03", Activity: "Install panels", "Product Type": "Composite Panels", Unit: "m2", "Planned Quantity": 80, "Planned Start": "2026-08-10", "Planned Finish": "2026-08-20", "Planned Production Rate": 4, Trade: "Facades", Status: "Not Started" }] }, "project", "one").activities[0];
  const asta = parseAstaWorkbook({ Activities: [{ "Task ID": "A-1", Building: "B1", Area: "West", Floor: "03", "Task Name": "Install panels", Product: "Composite Panels", UOM: "m2", Quantity: 80, Start: "2026-08-10", Finish: "2026-08-20", "Production Rate": 4, Trade: "Facades", Status: "Not Started" }] }, "project", "two").activities[0];
  const canonical = (activity: typeof standard) => ({ programmeActivityId: activity.programmeActivityId, building: activity.building, elevation: activity.elevation, level: activity.level, activity: activity.activity, productType: activity.productType, unit: activity.unit, plannedQuantity: activity.plannedQuantity, plannedStart: activity.plannedStart, plannedFinish: activity.plannedFinish, plannedProductionRate: activity.plannedProductionRate, budgetLabourHours: activity.budgetLabourHours, trade: activity.trade, status: activity.status });
  assert.deepEqual(canonical(asta), canonical(standard));
});

test("standard template returns row-level hierarchy and baseline validation", () => {
  const result = parseSitePulseTemplate({ Programme: [{ "Programme Activity ID": "SP-2", Activity: "Incomplete" }] }, "project", "import");
  assert.ok(result.issues.some((issue) => issue.rowNumber === 2 && issue.message.includes("Building")));
  assert.ok(result.issues.some((issue) => issue.rowNumber === 2 && issue.message.includes("Product Type")));
  assert.ok(result.issues.some((issue) => issue.rowNumber === 2 && issue.message.includes("Man-day productivity baseline required")));
});
