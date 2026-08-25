import assert from "node:assert/strict";
import test from "node:test";
import { parseSimpleProgrammeRows, preserveProductivityOnBlankReimport, suggestProgrammeMapping } from "./programmeSimpleImport.ts";

const project = "project", imported = "import";
const parse = (rows: Record<string, unknown>[], hours = 8) => { const mapping = suggestProgrammeMapping(Object.keys(rows[0] ?? {})); return parseSimpleProgrammeRows(rows, mapping, project, imported, hours); };
const minimum = { "Activity ID": "A100", "Activity Name": "Install panels", "Planned Start": "2026-08-03", "Planned Finish": "2026-08-07" };

test("minimum four-column import populates the Gantt without productivity", () => { const result = parse([minimum]); assert.equal(result.activities.length, 1); assert.equal(result.summary.needsProductivitySetup, 1); assert.equal(result.activities[0].productivityBaselineComplete, false); });
test("P6 and Asta headings map to common fields", () => { assert.equal(suggestProgrammeMapping(["Task ID", "Task Name", "Start", "Finish"]).Activity_ID, "Task ID"); assert.equal(suggestProgrammeMapping(["Activity ID", "Activity Name", "Planned Start", "Planned Finish"]).Activity_Name, "Activity Name"); });
test("full productivity import calculates target productivity", () => { const result = parse([{ ...minimum, "Planned Quantity": 100, Unit: "m²", "Budget MD": 10 }]); assert.equal(result.activities[0].plannedManDayProductivity, 10); assert.equal(result.summary.productivityReady, 1); });
test("P6 labour hours convert using project hours per man-day", () => { const result = parse([{ ...minimum, "Planned Quantity": 100, Unit: "m²", "Budgeted Labor Units": 80 }], 8); assert.equal(result.activities[0].plannedManDays, 10); });
test("imported Budget MD is used when labour hours are absent", () => { assert.equal(parse([{ ...minimum, "Planned Quantity": 100, Unit: "m²", "Budget MD": 12 }]).activities[0].plannedManDays, 12); });
test("missing Activity ID excludes the row", () => { const result = parse([{ ...minimum, "Activity ID": "" }]); assert.equal(result.activities.length, 0); assert.equal(result.issues[0].kind, "missing"); });
test("duplicate Activity IDs are reported and excluded", () => { const result = parse([minimum, minimum]); assert.equal(result.activities.length, 1); assert.equal(result.summary.duplicates, 1); });
test("invalid dates are reported", () => { const result = parse([{ ...minimum, "Planned Start": "not a date" }]); assert.equal(result.summary.invalidDates, 1); });
test("milestone remains visible without productivity", () => { const result = parse([{ ...minimum, "Planned Finish": "2026-08-03", "Activity Type": "Milestone" }]); assert.equal(result.summary.milestones, 1); });
test("measurable activity missing quantity needs setup", () => { const result = parse([{ ...minimum, Unit: "m²", "Budget MD": 10 }]); assert.equal(result.summary.needsProductivitySetup, 1); });
test("updated import matches by Activity ID", () => { const first = parse([minimum]).activities[0]; const next = parse([{ ...minimum, "Planned Finish": "2026-08-10" }]).activities[0]; assert.equal(first.programmeActivityId, next.programmeActivityId); assert.notEqual(first.plannedFinish, next.plannedFinish); });
test("blank reimport values do not overwrite productivity setup", () => { const existing = parse([{ ...minimum, "Planned Quantity": 100, Unit: "m²", "Budget MD": 10 }]).activities[0]; const incoming = parse([minimum]).activities[0]; const merged = preserveProductivityOnBlankReimport(existing, incoming); assert.equal(merged.plannedQuantity, 100); assert.equal(merged.plannedManDays, 10); assert.equal(merged.unit, "m²"); });
