import assert from "node:assert/strict";
import test from "node:test";
import { classifyProgramme, parseP6Workbook, type WorkbookSheets } from "./programmeImport.ts";

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

test("applies one confirmed building value to every imported row", () => {
  const result = parseP6Workbook(fixture(), "project", "import", { ...mapping, building: "__constant__:HBX" });
  assert.ok(result.activities.every((activity) => activity.building === "HBX"));
});
