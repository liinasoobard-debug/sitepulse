import type {
  ProgrammeActivity,
  ProgrammeImportChange,
  ProgrammeRelationship,
  ProgrammeResource,
  ProgrammeResourceAssignment,
} from "@/types/site";

export type WorkbookRow = Record<string, unknown>;
export type WorkbookSheets = Record<string, WorkbookRow[]>;

export type HierarchyField = "building" | "elevation" | "level" | "gridline" | "workActivity";
export type HierarchyMapping = Record<HierarchyField, string>;

export interface ImportIssue {
  sheet: string;
  rowNumber?: number;
  activityId?: string;
  severity: "error" | "warning";
  message: string;
}

export interface ParsedP6Workbook {
  sourceType: "p6-xlsx";
  availableColumns: string[];
  columnLabels: Record<string, string>;
  activities: ProgrammeActivity[];
  relationships: ProgrammeRelationship[];
  resources: ProgrammeResource[];
  assignments: ProgrammeResourceAssignment[];
  issues: ImportIssue[];
  dataDate?: string;
}

const aliases = {
  activityId: ["activity id", "activityid", "activity_id", "task code", "task_code"],
  internalTaskId: ["task id", "task_id"],
  activityName: ["activity name", "activity_name", "task name", "task_name", "name"],
  status: ["activity status", "status", "status code", "status_code", "task status"],
  wbsCode: ["wbs code", "wbs_code", "wbs id", "wbs_id", "wbs"],
  wbsPath: ["wbs path", "wbs_path", "full wbs path"],
  originalDuration: ["original duration", "original_duration", "target drtn hr cnt", "target_drtn_hr_cnt"],
  remainingDuration: ["remaining duration", "remaining_duration", "remain drtn hr cnt", "remain_drtn_hr_cnt"],
  plannedStart: ["start", "start date", "start_date", "planned start", "planned_start", "target start date", "target_start_date", "early start date", "early_start_date"],
  plannedFinish: ["finish", "end date", "end_date", "planned finish", "planned_finish", "target end date", "target_end_date", "early end date", "early_end_date"],
  actualStart: ["actual start", "actual_start", "act start date", "act_start_date"],
  actualFinish: ["actual finish", "actual_finish", "act end date", "act_end_date"],
  percent: ["physical % complete", "physical percent complete", "physical_percent_complete", "phys complete pct", "phys_complete_pct", "activity % complete", "complete pct", "complete_pct"],
  primaryConstraint: ["primary constraint", "primary_constraint", "cstr type", "cstr_type"],
  secondaryConstraint: ["secondary constraint", "secondary_constraint", "cstr type2", "cstr_type2"],
  calendar: ["calendar", "calendar name", "calendar_name", "clndr id", "clndr_id"],
  resourceNames: ["resource names", "resource_names", "resource list", "resource_list"],
  dataDate: ["data date", "data_date", "last recal date", "last_recalc_date"],
  plannedQuantity: ["planned quantity", "planned_quantity", "quantity", "target qty", "target_qty"],
  unit: ["unit", "uom", "unit of measure", "unit_of_measure"],
  budgetHours: ["budget labour hours", "budget labor hours", "budget_labour_hours", "target work qty", "target_work_qty"],
  productionRate: ["planned production rate", "planned_production_rate", "production rate"],
  plannedCrewSize: ["no of men", "number of men", "no. of men", "planned crew size", "planned_crew_size", "crew size"],
  predId: ["predecessor activity id", "predecessor_activity_id", "pred task id", "pred_task_id", "pred activity id"],
  succId: ["successor activity id", "successor_activity_id", "task id", "task_id", "successor task id"],
  relationType: ["relationship type", "relationship_type", "pred type", "pred_type"],
  lag: ["lag", "lag hr cnt", "lag_hr_cnt"],
  resourceId: ["resource id", "resource_id", "rsrc id", "rsrc_id", "resource code", "rsrc_short_name"],
  resourceName: ["resource name", "resource_name", "rsrc name", "rsrc_name"],
  resourceType: ["resource type", "resource_type", "rsrc type", "rsrc_type"],
  parentResource: ["parent resource", "parent_resource", "parent rsrc id", "parent_rsrc_id"],
  assignmentStart: ["assignment start", "assignment_start", "start date", "start_date"],
  assignmentFinish: ["assignment finish", "assignment_finish", "end date", "end_date", "finish date"],
  budgetedUnits: ["budgeted labour units", "budgeted labor units", "budgeted_units", "target qty", "target_qty"],
  actualUnits: ["actual labour units", "actual labor units", "actual_units", "act reg qty", "act_reg_qty"],
  remainingUnits: ["remaining labour units", "remaining labor units", "remaining_units", "remain qty", "remain_qty"],
  atCompletionUnits: ["at completion units", "at_completion_units"],
} as const;

function isP6LabelRow(row: WorkbookRow): boolean {
  const values = Object.values(row).map((item) => text(item).toLowerCase());
  return values.includes("activity id") || values.includes("resource id") && values.includes("resource name") || values.includes("predecessor") && values.includes("successor");
}

function isDeletedRow(row: WorkbookRow): boolean {
  const marker = text(row.delete_record_flag).toLowerCase();
  return marker === "y" || marker === "yes" || marker === "true" || marker === "1" || marker === "delete";
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function sheet(sheets: WorkbookSheets, wanted: string): WorkbookRow[] | undefined {
  const key = Object.keys(sheets).find((name) => normalise(name).replace(/ /g, "") === wanted.toLowerCase());
  return key ? sheets[key] : undefined;
}

function value(row: WorkbookRow, names: readonly string[]): unknown {
  const wanted = new Set(names.map(normalise));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalise(key)));
  return entry?.[1];
}

function text(input: unknown): string {
  return input === null || input === undefined ? "" : String(input).trim();
}

function number(input: unknown): number | undefined {
  const cleaned = text(input).replace(/,/g, "").replace(/%$/, "");
  if (!cleaned) return undefined;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : undefined;
}

function date(input: unknown): string | undefined {
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString().slice(0, 10);
  const raw = text(input);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function id(prefix: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mappedHierarchy(row: WorkbookRow, mapping: HierarchyMapping, field: HierarchyField, wbsPath: string): string {
  const column = mapping[field];
  if (column.startsWith("__constant__:")) return column.slice("__constant__:".length).trim();
  if (column === "__wbs__") {
    const segments = wbsPath.split(/[>\\/|]/).map((part) => part.trim()).filter(Boolean);
    return field === "workActivity" ? segments.at(-1) ?? "" : segments[{ building: 0, elevation: 1, level: 2, gridline: 3, workActivity: 4 }[field]] ?? "";
  }
  return column ? text(row[column]) : "";
}

export function parseP6Workbook(sheets: WorkbookSheets, projectId: string, importId: string, mapping: HierarchyMapping, knownActivityIds: string[] = []): ParsedP6Workbook {
  const taskRows = sheet(sheets, "task");
  const issues: ImportIssue[] = [];
  if (!taskRows) {
    return { sourceType: "p6-xlsx", availableColumns: [], columnLabels: {}, activities: [], relationships: [], resources: [], assignments: [], issues: [{ sheet: "TASK", severity: "error", message: "Required TASK sheet is missing." }] };
  }
  const availableColumns = [...new Set(taskRows.flatMap((row) => Object.keys(row)))];
  const p6LabelRow = taskRows.find(isP6LabelRow);
  const columnLabels = Object.fromEntries(availableColumns.map((column) => [column, text(p6LabelRow?.[column]) || column]));
  const seen = new Set<string>();
  const internalToOfficial = new Map<string, string>();
  knownActivityIds.forEach((activityId) => internalToOfficial.set(activityId, activityId));
  let dataDate: string | undefined;
  const activities = taskRows.flatMap((row, index): ProgrammeActivity[] => {
    if (isP6LabelRow(row) || isDeletedRow(row)) return [];
    const activityId = text(value(row, aliases.activityId));
    const internalId = text(value(row, aliases.internalTaskId));
    const rowNumber = index + 2;
    if (!activityId) {
      issues.push({ sheet: "TASK", rowNumber, severity: "error", message: "Activity ID is required." });
      return [];
    }
    const key = activityId.toLowerCase();
    if (seen.has(key)) issues.push({ sheet: "TASK", rowNumber, activityId, severity: "error", message: "Duplicate Activity ID in TASK." });
    seen.add(key);
    if (internalId) internalToOfficial.set(internalId, activityId);
    internalToOfficial.set(activityId, activityId);
    const activityName = text(value(row, aliases.activityName));
    if (!activityName) issues.push({ sheet: "TASK", rowNumber, activityId, severity: "error", message: "Activity Name is required." });
    const invalidDateFields = [["Start", aliases.plannedStart], ["Finish", aliases.plannedFinish], ["Actual Start", aliases.actualStart], ["Actual Finish", aliases.actualFinish]] as const;
    invalidDateFields.forEach(([label, names]) => { const raw = value(row, names); if (text(raw) && !date(raw)) issues.push({ sheet: "TASK", rowNumber, activityId, severity: "error", message: `${label} is not a valid date.` }); });
    const durationFields = [["Original Duration", aliases.originalDuration], ["Remaining Duration", aliases.remainingDuration]] as const;
    durationFields.forEach(([label, names]) => { const raw = value(row, names); if (text(raw) && number(raw) === undefined) issues.push({ sheet: "TASK", rowNumber, activityId, severity: "error", message: `${label} is not numeric.` }); });
    const wbsCode = text(value(row, aliases.wbsCode));
    const wbsPath = text(value(row, aliases.wbsPath)) || wbsCode;
    const plannedQuantity = number(value(row, aliases.plannedQuantity)) ?? 0;
    const budgetLabourHours = number(value(row, aliases.budgetHours));
    const suppliedRate = number(value(row, aliases.productionRate));
    const calculatedRate = plannedQuantity > 0 && budgetLabourHours && budgetLabourHours > 0 ? plannedQuantity / budgetLabourHours : undefined;
    if (suppliedRate && calculatedRate && Math.abs(suppliedRate - calculatedRate) / calculatedRate > 0.02) issues.push({ sheet: "TASK", rowNumber, activityId, severity: "warning", message: "Supplied production rate differs from quantity / budget labour hours by more than 2%." });
    dataDate ??= date(value(row, aliases.dataDate));
    const now = new Date().toISOString();
    return [{ id: id("programme-activity"), projectId, programmeActivityId: activityId, activityName, activity: activityName || "Unnamed programme activity", workActivity: mappedHierarchy(row, mapping, "workActivity", wbsPath) || activityName, building: mappedHierarchy(row, mapping, "building", wbsPath), elevation: mappedHierarchy(row, mapping, "elevation", wbsPath), level: mappedHierarchy(row, mapping, "level", wbsPath), gridline: mappedHierarchy(row, mapping, "gridline", wbsPath), wbsCode, wbsPath, wbs: wbsCode, unit: text(value(row, aliases.unit)), plannedQuantity, budgetLabourHours, plannedProductionRate: calculatedRate ?? suppliedRate, plannedCrewSize: number(value(row, aliases.plannedCrewSize)), activityStatus: text(value(row, aliases.status)), originalDuration: number(value(row, aliases.originalDuration)), remainingDuration: number(value(row, aliases.remainingDuration)), plannedStart: date(value(row, aliases.plannedStart)), plannedFinish: date(value(row, aliases.plannedFinish)), actualStart: date(value(row, aliases.actualStart)), actualFinish: date(value(row, aliases.actualFinish)), physicalPercentComplete: number(value(row, aliases.percent)), primaryConstraint: text(value(row, aliases.primaryConstraint)), secondaryConstraint: text(value(row, aliases.secondaryConstraint)), calendar: text(value(row, aliases.calendar)), resourceNames: text(value(row, aliases.resourceNames)).split(/[;,]/).map((item) => item.trim()).filter(Boolean), dataDate, sourceType: "p6-xlsx", sourceImportId: importId, missingFromLatestUpdate: false, productivityBaselineComplete: plannedQuantity > 0 && Boolean(budgetLabourHours && budgetLabourHours > 0) && Boolean(text(value(row, aliases.unit))), createdAt: now, updatedAt: now }];
  });

  const resourceRows = sheet(sheets, "rsrc") ?? [];
  const resourceRefs = new Map<string, string>();
  const resources = resourceRows.flatMap((row, index): ProgrammeResource[] => {
    if (isP6LabelRow(row) || isDeletedRow(row)) return [];
    const resourceId = text(value(row, aliases.resourceId));
    if (!resourceId) { issues.push({ sheet: "RSRC", rowNumber: index + 2, severity: "error", message: "Resource ID is required." }); return []; }
    const official = text(row.rsrc_short_name) || resourceId;
    resourceRefs.set(resourceId, official); resourceRefs.set(official, official);
    return [{ id: id("programme-resource"), projectId, resourceId: official, resourceName: text(value(row, aliases.resourceName)) || official, resourceType: text(value(row, aliases.resourceType)), parentResourceId: text(value(row, aliases.parentResource)), unitOfMeasure: text(value(row, aliases.unit)), calendar: text(value(row, aliases.calendar)), sourceImportId: importId }];
  });

  const resolveActivity = (raw: unknown) => internalToOfficial.get(text(raw));
  const relationships = (sheet(sheets, "taskpred") ?? []).flatMap((row, index): ProgrammeRelationship[] => {
    if (isP6LabelRow(row) || isDeletedRow(row)) return [];
    const predecessorActivityId = resolveActivity(value(row, aliases.predId));
    const successorActivityId = resolveActivity(value(row, aliases.succId));
    if (!predecessorActivityId || !successorActivityId) { issues.push({ sheet: "TASKPRED", rowNumber: index + 2, severity: "error", message: "Relationship references an unknown predecessor or successor activity." }); return []; }
    return [{ id: id("programme-relationship"), projectId, predecessorActivityId, successorActivityId, relationshipType: text(value(row, aliases.relationType)) || "FS", lag: number(value(row, aliases.lag)), sourceImportId: importId }];
  });
  const assignments = (sheet(sheets, "taskrsrc") ?? []).flatMap((row, index): ProgrammeResourceAssignment[] => {
    if (isP6LabelRow(row) || isDeletedRow(row)) return [];
    const programmeActivityId = resolveActivity(value(row, aliases.internalTaskId)) ?? resolveActivity(value(row, aliases.activityId));
    const rawResource = text(value(row, aliases.resourceId));
    const resourceId = resourceRefs.get(rawResource);
    if (!programmeActivityId || !resourceId) { issues.push({ sheet: "TASKRSRC", rowNumber: index + 2, severity: "error", message: `Assignment references an unknown ${!programmeActivityId ? "activity" : "resource"}.` }); return []; }
    return [{ id: id("programme-assignment"), projectId, programmeActivityId, resourceId, resourceType: text(value(row, aliases.resourceType)), assignmentStart: date(value(row, aliases.assignmentStart)), assignmentFinish: date(value(row, aliases.assignmentFinish)), budgetedLabourUnits: number(value(row, aliases.budgetedUnits)), actualLabourUnits: number(value(row, aliases.actualUnits)), remainingLabourUnits: number(value(row, aliases.remainingUnits)), atCompletionUnits: number(value(row, aliases.atCompletionUnits)), sourceImportId: importId }];
  });
  return { sourceType: "p6-xlsx", availableColumns, columnLabels, activities, relationships, resources, assignments, issues, dataDate };
}

const comparedFields: (keyof ProgrammeActivity)[] = ["activityName", "wbsCode", "wbsPath", "building", "elevation", "level", "gridline", "workActivity", "activityStatus", "originalDuration", "remainingDuration", "plannedStart", "plannedFinish", "actualStart", "actualFinish", "physicalPercentComplete", "calendar", "budgetLabourHours", "plannedQuantity", "plannedCrewSize", "plannedProductionRate"];

export function classifyProgramme(existing: ProgrammeActivity[], incoming: ProgrammeActivity[]): ProgrammeImportChange[] {
  const old = new Map(existing.map((activity) => [activity.programmeActivityId.toLowerCase(), activity]));
  const changes = incoming.map((activity): ProgrammeImportChange => {
    const before = old.get(activity.programmeActivityId.toLowerCase());
    if (!before) return { programmeActivityId: activity.programmeActivityId, classification: "new", after: activity };
    const changedFields = comparedFields.filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(activity[field] ?? null));
    return { programmeActivityId: activity.programmeActivityId, classification: changedFields.length ? "updated" : "unchanged", before, after: activity, changedFields };
  });
  const incomingIds = new Set(incoming.map((activity) => activity.programmeActivityId.toLowerCase()));
  existing.filter((activity) => !incomingIds.has(activity.programmeActivityId.toLowerCase())).forEach((activity) => changes.push({ programmeActivityId: activity.programmeActivityId, classification: "missing", before: activity, changedFields: ["missingFromLatestUpdate"] }));
  return changes;
}
