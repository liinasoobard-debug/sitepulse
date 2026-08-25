import type { ProgrammeActivity } from "../types/site.ts";

export type CommonProgrammeField = "Activity_ID" | "Activity_Name" | "WBS" | "Area" | "Location" | "Activity_Type" | "Planned_Start" | "Planned_Finish" | "Actual_Start" | "Actual_Finish" | "Forecast_Finish" | "Activity_Status" | "Planned_Quantity" | "Unit" | "Budget_Labour_Hours" | "Budget_MD" | "Calendar_Hours_Per_Day" | "Total_Float" | "Data_Date";
export type ProgrammeColumnMapping = Partial<Record<CommonProgrammeField, string>>;
export type V2ImportIssue = { row: number; activityId?: string; kind: "missing" | "duplicate" | "invalid-date"; message: string };
export type V2ImportSummary = { valid: number; excluded: number; milestones: number; productivityReady: number; needsProductivitySetup: number; duplicates: number; invalidDates: number };

const REQUIRED: CommonProgrammeField[] = ["Activity_ID", "Activity_Name", "Planned_Start", "Planned_Finish"];
const aliases: Record<CommonProgrammeField, string[]> = {
  Activity_ID: ["activity id", "activity code", "task id", "task code", "id"], Activity_Name: ["activity name", "task name", "name", "description"], WBS: ["wbs", "wbs code", "wbs path"], Area: ["area", "elevation"], Location: ["location", "building", "level"], Activity_Type: ["activity type", "task type", "type"], Planned_Start: ["planned start", "start", "start date", "target start date", "early start"], Planned_Finish: ["planned finish", "finish", "finish date", "target end date", "early finish"], Actual_Start: ["actual start", "actual start date"], Actual_Finish: ["actual finish", "actual finish date"], Forecast_Finish: ["forecast finish", "remaining finish", "expected finish"], Activity_Status: ["activity status", "task status", "status"], Planned_Quantity: ["planned quantity", "quantity", "target quantity", "budgeted quantity"], Unit: ["unit", "uom", "unit of measure"], Budget_Labour_Hours: ["budget labour hours", "budget labor hours", "budgeted labour units", "budgeted labor units", "labour hours", "labor hours"], Budget_MD: ["budget md", "budget man days", "budgeted man days", "planned man days"], Calendar_Hours_Per_Day: ["calendar hours per day", "hours per man day", "hours per day"], Total_Float: ["total float", "total float days"], Data_Date: ["data date", "status date"]
};
const normal = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const text = (value: unknown) => String(value ?? "").trim();
const numeric = (value: unknown) => { const parsed = Number(text(value).replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : undefined; };
const isoDate = (value: unknown) => { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10); const raw = text(value); if (!raw) return undefined; const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10); };

export function suggestProgrammeMapping(headings: string[]): ProgrammeColumnMapping {
  const result: ProgrammeColumnMapping = {};
  (Object.keys(aliases) as CommonProgrammeField[]).forEach((field) => { result[field] = headings.find((heading) => aliases[field].includes(normal(heading))) ?? ""; });
  return result;
}

export function missingMandatoryMappings(mapping: ProgrammeColumnMapping) { return REQUIRED.filter((field) => !mapping[field]); }

export function parseSimpleProgrammeRows(rows: Record<string, unknown>[], mapping: ProgrammeColumnMapping, projectId: string, importId: string, projectHoursPerMd = 8) {
  const issues: V2ImportIssue[] = []; const seen = new Set<string>(); let dataDate: string | undefined;
  const activities = rows.flatMap((row, index): ProgrammeActivity[] => {
    const rowNumber = index + 2; const get = (field: CommonProgrammeField) => mapping[field] ? row[mapping[field]!] : undefined;
    const activityId = text(get("Activity_ID")); const name = text(get("Activity_Name")); const startRaw = get("Planned_Start"); const finishRaw = get("Planned_Finish"); const start = isoDate(startRaw); const finish = isoDate(finishRaw);
    const missing = [["Activity ID", activityId], ["Activity Name", name], ["Planned Start", text(startRaw)], ["Planned Finish", text(finishRaw)]].filter(([, value]) => !value).map(([label]) => label);
    if (missing.length) { issues.push({ row: rowNumber, activityId: activityId || undefined, kind: "missing", message: `Missing ${missing.join(", ")}.` }); return []; }
    if (!start || !finish) { issues.push({ row: rowNumber, activityId, kind: "invalid-date", message: "Planned Start or Planned Finish is not a valid date." }); return []; }
    const key = activityId.toLowerCase(); if (seen.has(key)) { issues.push({ row: rowNumber, activityId, kind: "duplicate", message: "Duplicate Activity ID." }); return []; } seen.add(key);
    const quantity = numeric(get("Planned_Quantity")) ?? 0; const unit = text(get("Unit")); const budgetHours = numeric(get("Budget_Labour_Hours")); const importedMd = numeric(get("Budget_MD")); const calendarHours = numeric(get("Calendar_Hours_Per_Day")); const conversionHours = calendarHours && calendarHours > 0 ? calendarHours : projectHoursPerMd;
    const budgetMd = budgetHours !== undefined && budgetHours > 0 && conversionHours > 0 ? budgetHours / conversionHours : importedMd && importedMd > 0 ? importedMd : undefined;
    const type = text(get("Activity_Type")); const milestone = /milestone/i.test(type) || start === finish && quantity <= 0; const ready = !milestone && quantity > 0 && Boolean(unit) && Boolean(budgetMd && budgetMd > 0);
    dataDate ??= isoDate(get("Data_Date")); const now = new Date().toISOString();
    return [{ id: `${importId}-${activityId}`, projectId, programmeActivityId: activityId, activityName: name, activity: name, wbsCode: text(get("WBS")), wbsPath: text(get("WBS")), building: text(get("Location")), elevation: text(get("Area")), level: "", unit, plannedQuantity: quantity, budgetLabourHours: budgetHours, plannedManDays: budgetMd, plannedManDayProductivity: ready ? quantity / budgetMd! : undefined, plannedStart: start, plannedFinish: finish, actualStart: isoDate(get("Actual_Start")), actualFinish: isoDate(get("Actual_Finish")), status: text(get("Activity_Status")), activityStatus: text(get("Activity_Status")), calendar: calendarHours ? `${calendarHours}h/day` : "", dataDate, productivityBaselineComplete: ready, activityType: type, forecastFinish: isoDate(get("Forecast_Finish")), totalFloat: numeric(get("Total_Float")), measurementClass: milestone ? "milestone" : ready ? "measurable" : "context", createdAt: now, updatedAt: now }];
  });
  const summary: V2ImportSummary = { valid: activities.length, excluded: issues.filter((item) => item.kind !== "duplicate").length + issues.filter((item) => item.kind === "duplicate").length, milestones: activities.filter((item) => item.measurementClass === "milestone").length, productivityReady: activities.filter((item) => item.measurementClass === "measurable").length, needsProductivitySetup: activities.filter((item) => item.measurementClass === "context").length, duplicates: issues.filter((item) => item.kind === "duplicate").length, invalidDates: issues.filter((item) => item.kind === "invalid-date").length };
  return { activities, issues, summary, dataDate };
}

export function preserveProductivityOnBlankReimport(existing: ProgrammeActivity, incoming: ProgrammeActivity): ProgrammeActivity { return { ...incoming, plannedQuantity: incoming.plannedQuantity || existing.plannedQuantity, unit: incoming.unit || existing.unit, budgetLabourHours: incoming.budgetLabourHours ?? existing.budgetLabourHours, plannedManDays: incoming.plannedManDays ?? existing.plannedManDays, plannedManDayProductivity: incoming.plannedManDayProductivity ?? existing.plannedManDayProductivity, productivityBaselineComplete: incoming.productivityBaselineComplete || existing.productivityBaselineComplete }; }
