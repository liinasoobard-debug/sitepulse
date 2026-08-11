import type { ProgrammeActivity } from "@/types/site";
import { plannedWorkingDaysBetween } from "./manDayProductivity.ts";
import type { CanonicalProgrammeImport, ImportIssue, WorkbookRow, WorkbookSheets } from "./programmeImport.ts";

export type ProgrammeImportSource = "sitepulse-template" | "p6-xlsx" | "asta-xlsx";

const fields = {
  activityId: ["programme activity id", "activity id", "activity id/code", "task id", "id"],
  building: ["building", "project building"], elevation: ["elevation", "area", "location"], level: ["level", "floor"],
  activity: ["activity", "activity name", "task name", "name"], productType: ["product type", "product", "facade product type"],
  unit: ["unit", "uom", "unit of measure"], quantity: ["planned quantity", "quantity", "budget quantity"],
  start: ["planned start", "start", "start date"], finish: ["planned finish", "finish", "finish date", "end date"],
  budgetHours: ["budget labour hours", "budget labor hours", "labour hours", "labor hours"],
  productionRate: ["planned production rate", "planned man-hour productivity", "production rate", "productivity target"], crewSize: ["planned crew size", "crew size", "no of men", "number of men"],
  manDayRate: ["planned man-day productivity", "planned man day productivity", "man-day productivity", "man day productivity"],
  gangDailyOutput: ["planned gang daily output", "daily gang output"], plannedManDays: ["planned man-days", "planned man days"],
  durationDays: ["planned duration days", "duration days"], assumedGangSize: ["assumed gang size", "typical gang size"],
  trade: ["trade", "trade name"], wbs: ["wbs", "wbs code"], status: ["status", "activity status"], calendar: ["calendar", "calendar name"],
} as const;

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
function cell(row: WorkbookRow, aliases: readonly string[]): unknown { const wanted = new Set(aliases.map(normalise)); return Object.entries(row).find(([key]) => wanted.has(normalise(key)))?.[1]; }
function numeric(value: unknown): number | undefined { const raw = text(value).replace(/,/g, ""); if (!raw) return undefined; const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : undefined; }
function isoDate(value: unknown): string | undefined { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10); const raw = text(value); if (!raw) return undefined; const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10); }
function identifier(): string { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `programme-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function workbookRows(sheets: WorkbookSheets, source: ProgrammeImportSource): { sheetName: string; rows: WorkbookRow[] } {
  const preferred = source === "sitepulse-template" ? ["SitePulse Programme", "Programme", "Activities"] : ["Activities", "Programme", "Tasks", "Task"];
  const key = preferred.map((name) => Object.keys(sheets).find((candidate) => normalise(candidate) === normalise(name))).find(Boolean) ?? Object.keys(sheets)[0];
  return { sheetName: key ?? "Programme", rows: key ? sheets[key] : [] };
}

export function mapToCanonicalProgramme(sheets: WorkbookSheets, projectId: string, importId: string, sourceType: Exclude<ProgrammeImportSource, "p6-xlsx">): CanonicalProgrammeImport {
  const { sheetName, rows } = workbookRows(sheets, sourceType);
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const activities = rows.flatMap((row, index): ProgrammeActivity[] => {
    const rowNumber = index + 2;
    if (Object.values(row).every((value) => !text(value))) return [];
    const activityId = text(cell(row, fields.activityId));
    const activity = text(cell(row, fields.activity));
    const building = text(cell(row, fields.building)), elevation = text(cell(row, fields.elevation)), level = text(cell(row, fields.level));
    const productType = text(cell(row, fields.productType)), unit = text(cell(row, fields.unit));
    const quantityRaw = cell(row, fields.quantity), startRaw = cell(row, fields.start), finishRaw = cell(row, fields.finish);
    const plannedQuantity = numeric(quantityRaw), plannedStart = isoDate(startRaw), plannedFinish = isoDate(finishRaw);
    const budgetRaw = cell(row, fields.budgetHours), rateRaw = cell(row, fields.productionRate), manDayRaw = cell(row, fields.manDayRate);
    let budgetLabourHours = numeric(budgetRaw), plannedProductionRate = numeric(rateRaw);
    const add = (severity: ImportIssue["severity"], message: string) => issues.push({ sheet: sheetName, rowNumber, activityId: activityId || undefined, severity, message });
    if (!activityId) add("error", "Programme Activity ID is required.");
    else if (seen.has(activityId.toLowerCase())) add("error", "Duplicate Activity ID.");
    if (activityId) seen.add(activityId.toLowerCase());
    if (!building) add("error", "Building is required for the Project → Building → Elevation → Level → Activity hierarchy.");
    if (!elevation) add("error", "Elevation is required for the programme hierarchy.");
    if (!level) add("error", "Level is required for the programme hierarchy.");
    if (!activity) add("error", "Activity is required.");
    if (!productType) add(sourceType === "sitepulse-template" ? "error" : "warning", "Product Type is missing.");
    if (plannedQuantity === undefined || plannedQuantity <= 0) add("error", text(quantityRaw) ? "Planned Quantity must be greater than zero." : "Planned Quantity is required.");
    if (!unit) add("error", "Unit is required.");
    else if (!/^[\p{L}\d²³%/._ -]{1,24}$/u.test(unit)) add("error", "Unit contains unsupported characters.");
    if (!plannedStart) add("error", text(startRaw) ? "Planned Start is not a valid date." : "Planned Start is required.");
    if (!plannedFinish) add("error", text(finishRaw) ? "Planned Finish is not a valid date." : "Planned Finish is required.");
    if (plannedStart && plannedFinish && plannedFinish < plannedStart) add("error", "Planned Finish cannot be earlier than Planned Start.");
    if (text(budgetRaw) && (budgetLabourHours === undefined || budgetLabourHours <= 0)) add("error", "Budget Labour Hours must be greater than zero.");
    if (text(rateRaw) && (plannedProductionRate === undefined || plannedProductionRate <= 0)) add("error", "Planned Production Rate must be greater than zero.");
    if (plannedQuantity && budgetLabourHours && !plannedProductionRate) plannedProductionRate = plannedQuantity / budgetLabourHours;
    if (plannedQuantity && plannedProductionRate && !budgetLabourHours) budgetLabourHours = plannedQuantity / plannedProductionRate;
    let plannedManDayProductivity = numeric(manDayRaw);
    if (text(manDayRaw) && (!plannedManDayProductivity || plannedManDayProductivity <= 0)) add("error", "Planned Man-Day Productivity must be greater than zero.");
    const plannedCrewSize = numeric(cell(row, fields.crewSize));
    const assumedGangSize = numeric(cell(row, fields.assumedGangSize)) ?? plannedCrewSize;
    if (plannedCrewSize !== undefined && plannedCrewSize <= 0) add("error", "Planned Crew Size must be greater than zero.");
    if (sourceType === "sitepulse-template" && (!assumedGangSize || assumedGangSize <= 0)) add("warning", "Assumed Gang Size is required for a complete measured-work baseline.");
    const plannedDurationDays = numeric(cell(row, fields.durationDays)) ?? plannedWorkingDaysBetween(plannedStart, plannedFinish);
    if (!plannedManDayProductivity && plannedQuantity && plannedDurationDays && plannedDurationDays > 0 && assumedGangSize && assumedGangSize > 0) {
      plannedManDayProductivity = plannedQuantity / (plannedDurationDays * assumedGangSize);
    }
    if (sourceType === "sitepulse-template" && !plannedManDayProductivity) add("warning", "Man-day productivity baseline required.");
    const plannedGangDailyOutput = plannedManDayProductivity && assumedGangSize ? plannedManDayProductivity * assumedGangSize : numeric(cell(row, fields.gangDailyOutput));
    const plannedManDays = plannedManDayProductivity && plannedQuantity ? plannedQuantity / plannedManDayProductivity : numeric(cell(row, fields.plannedManDays));
    if (!activityId || !activity) return [];
    const status = text(cell(row, fields.status));
    return [{ id: identifier(), projectId, programmeActivityId: activityId, activityName: activity, activity, workActivity: activity, building, elevation, level, productType, unit, plannedQuantity: plannedQuantity ?? 0, plannedStart, plannedFinish, budgetLabourHours, plannedProductionRate, plannedCrewSize, plannedManDayProductivity, assumedGangSize, plannedGangDailyOutput, plannedManDays, plannedDurationDays, trade: text(cell(row, fields.trade)), wbs: text(cell(row, fields.wbs)), wbsCode: text(cell(row, fields.wbs)), status, activityStatus: status, calendar: text(cell(row, fields.calendar)), sourceType, sourceImportId: importId, missingFromLatestUpdate: false, productivityBaselineComplete: Boolean(plannedQuantity && unit && plannedManDayProductivity && assumedGangSize), createdAt: now, updatedAt: now }];
  });
  if (!rows.length) issues.push({ sheet: sheetName, severity: "error", message: "No programme rows were found in the workbook." });
  return { sourceType, availableColumns: [...new Set(rows.flatMap((row) => Object.keys(row)))], columnLabels: {}, activities, relationships: [], resources: [], assignments: [], issues };
}

export function parseSitePulseTemplate(sheets: WorkbookSheets, projectId: string, importId: string): CanonicalProgrammeImport { return mapToCanonicalProgramme(sheets, projectId, importId, "sitepulse-template"); }
export function parseAstaWorkbook(sheets: WorkbookSheets, projectId: string, importId: string): CanonicalProgrammeImport { return mapToCanonicalProgramme(sheets, projectId, importId, "asta-xlsx"); }
