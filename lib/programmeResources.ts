import type { ProgrammeActivity, ProgrammeResource, ProgrammeResourceAssignment } from "../types/site.ts";
import { plannedWorkingDaysBetween } from "./manDayProductivity.ts";

// Confirmed by the planner: these are two labels for the same HVB workforce.
// Prefer the first resource when both are assigned; unrelated crews stay separate.
export const sharedP6Crews = [["HVB - F-INST", "HVB-INST-CLAD"]] as const;
export const isLabourResource = (type?: string) => /^(?:rt_)?labou?r$/i.test(type ?? "");
export const isPlantResource = (type?: string) => /^(?:rt_)?nonlabou?r$/i.test(type ?? "");
const hourUnit = (unit?: string) => /^(h|hr|hrs|hour|hours)$/i.test(unit?.trim() ?? "");
const personUnit = (unit?: string) => /^(men|people|persons|person|operatives)$/i.test(unit?.trim() ?? "");

export function physicalMaterial(resource: ProgrammeResource) {
  const unit = resource.unitOfMeasure?.trim();
  return /^(?:rt_)?mat(?:erial)?$/i.test(resource.resourceType ?? "") && Boolean(unit) &&
    !/^(lump\s*sum|ls|cost|value|£|gbp|usd|eur|\$)$/i.test(unit!) &&
    !/^(total\s+)?(cost|value)$/i.test(resource.resourceName.trim());
}

export function resourceCount(value: number | undefined, label: string, hoursPerDay?: number): number | undefined {
  if (value === undefined || value < 0) return undefined;
  if (/%/.test(label)) return value / 100;
  if (/\(\s*(?:d\/d|h\/h)\s*\)/i.test(label) || !label) return value;
  if (/\(\s*h\/d\s*\)/i.test(label) && hoursPerDay && hoursPerDay > 0) return value / hoursPerDay;
  return undefined;
}

// One calculation is used on import and after loading/saving the programme.
export function applyProgrammeResources(activity: ProgrammeActivity, resources: ProgrammeResource[], assignments: ProgrammeResourceAssignment[]): ProgrammeActivity {
  const byId = new Map(resources.map(resource => [resource.resourceId, resource]));
  const rows = assignments.filter(row => row.programmeActivityId === activity.programmeActivityId)
    .map(row => ({ row, resource: byId.get(row.resourceId) })).filter(entry => entry.resource !== undefined);
  const labour = rows.filter(({ row, resource }) => isLabourResource(resource!.resourceType) && !row.sharedCrewWith);
  const sumKnown = (values: Array<number | undefined>) => values.length && values.every(value => value !== undefined) ? values.reduce<number>((sum, value) => sum + value!, 0) : undefined;
  const hours = sumKnown(labour.map(({ row, resource }) => hourUnit(resource!.unitOfMeasure) ? row.budgetedLabourUnits : personUnit(resource!.unitOfMeasure) && activity.originalDuration ? (row.budgetedLabourUnits ?? 0) * activity.originalDuration : undefined));
  const manDays = sumKnown(labour.map(({ row }) => row.budgetedManDays));
  const actualManDays = sumKnown(labour.map(({ row }) => row.actualManDays));
  const crew = sumKnown(labour.map(({ row, resource }) => row.plannedResourceCount ?? (personUnit(resource!.unitOfMeasure) ? row.budgetedLabourUnits : hourUnit(resource!.unitOfMeasure) && activity.originalDuration && activity.originalDuration > 0 ? (row.budgetedLabourUnits ?? 0) / activity.originalDuration : undefined)));
  const materials = rows.filter(({ resource }) => physicalMaterial(resource!));
  // Do not add different products or measurement units into one activity quantity.
  const material = materials.length === 1 ? materials[0] : undefined;
  const plannedQuantity = activity.plannedQuantity || material?.row.budgetedLabourUnits || 0;
  const unit = activity.unit || material?.resource?.unitOfMeasure || "";
  const budgetLabourHours = hours && hours > 0 ? hours : activity.budgetLabourHours;
  const plannedCrewSize = crew && crew > 0 ? crew : activity.plannedCrewSize;
  const assumedGangSize = activity.assumedGangSize || plannedCrewSize;
  const plannedDurationDays = activity.plannedDurationDays ?? plannedWorkingDaysBetween(activity.plannedStart, activity.plannedFinish);
  const plannedManDays = manDays && manDays > 0 ? manDays : activity.importedLabourManDays || activity.plannedManDays;
  const plannedManDayProductivity = plannedQuantity > 0 && plannedManDays && plannedManDays > 0
    ? plannedQuantity / plannedManDays : activity.plannedManDayProductivity ||
      (manDays === undefined && plannedQuantity > 0 && plannedDurationDays && assumedGangSize ? plannedQuantity / (plannedDurationDays * assumedGangSize) : undefined);
  const plannedProductionRate = plannedQuantity > 0 && budgetLabourHours && budgetLabourHours > 0 ? plannedQuantity / budgetLabourHours : activity.plannedProductionRate;
  const names = (predicate: (resource: ProgrammeResource) => boolean) => [...new Set(rows.filter(({ resource }) => predicate(resource!)).map(({ resource, row }) => `${resource!.resourceName}${row.plannedResourceCount !== undefined ? ` (${row.plannedResourceCount})` : ""}${row.sharedCrewWith ? " — same crew" : ""}`))];
  return { ...activity, plannedQuantity, unit, budgetLabourHours, plannedCrewSize, assumedGangSize,
    importedLabourManDays: manDays ?? activity.importedLabourManDays,
    importedActualLabourManDays: actualManDays ?? activity.importedActualLabourManDays,
    plannedDurationDays, plannedManDays: plannedManDays ?? (plannedManDayProductivity ? plannedQuantity / plannedManDayProductivity : undefined), plannedManDayProductivity,
    plannedGangDailyOutput: plannedManDayProductivity && assumedGangSize ? plannedManDayProductivity * assumedGangSize : activity.plannedGangDailyOutput,
    plannedProductionRate,
    resourceNames: names(() => true), labourResourceNames: names(resource => isLabourResource(resource.resourceType)),
    plantResourceNames: names(resource => isPlantResource(resource.resourceType)), materialResourceNames: names(physicalMaterial),
    productivityBaselineComplete: Boolean(plannedQuantity > 0 && unit && (plannedManDayProductivity || plannedProductionRate)),
  };
}

export function quantityBaseline(activity: ProgrammeActivity, quantity: number, unit: string) {
  if (!Number.isFinite(quantity) || quantity <= 0 || !unit.trim()) throw new Error("Enter a positive quantity and its unit.");
  const days = activity.importedLabourManDays;
  const rate = days && days > 0 ? quantity / days : undefined;
  return { planned_quantity: quantity, unit: unit.trim(), planned_man_day_productivity: rate ?? null,
    planned_man_days: days ?? null, assumed_gang_size: activity.assumedGangSize ?? null,
    planned_gang_daily_output: rate && activity.assumedGangSize ? rate * activity.assumedGangSize : null,
    productivity_target: activity.budgetLabourHours && activity.budgetLabourHours > 0 ? quantity / activity.budgetLabourHours : null };
}

export function preserveManualQuantity(activity: ProgrammeActivity, previous?: Record<string, unknown>): ProgrammeActivity {
  if (activity.plannedQuantity > 0) return activity;
  const raw = previous?.raw_data as Record<string, unknown> | undefined;
  const manual = raw?.manualQuantity as { quantity?: number; unit?: string } | undefined;
  return manual && Number(manual.quantity) > 0 && manual.unit
    ? { ...activity, plannedQuantity: Number(manual.quantity), unit: manual.unit } : activity;
}

export function completedP6Productivity(activity: ProgrammeActivity): number | undefined {
  // A completed activity represents its full measured scope. Do not infer installed
  // quantities for in-progress activities from elapsed time or labour consumption.
  return activity.sourceType === "p6-xlsx" && /^(completed|tk_complete)$/i.test(activity.activityStatus ?? "") &&
    activity.plannedQuantity > 0 && activity.importedActualLabourManDays && activity.importedActualLabourManDays > 0
    ? activity.plannedQuantity / activity.importedActualLabourManDays : undefined;
}
