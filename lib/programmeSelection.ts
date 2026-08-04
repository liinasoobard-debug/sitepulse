import type { ProgrammeActivity, ProgrammeImportData } from "@/types/site";

export const UNSPECIFIED_LOCATION = "__sitepulse_unspecified__";
export const LEGACY_PROGRAMME_VERSION = "__sitepulse_current_programme__";

export function locationValue(value?: string): string {
  return value?.trim() || UNSPECIFIED_LOCATION;
}

export function locationLabel(value: string): string {
  return value === UNSPECIFIED_LOCATION ? "Not specified in programme" : value;
}

export function uniqueLocations(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(locationValue))].sort((a, b) => locationLabel(a).localeCompare(locationLabel(b)));
}

export function activitiesForVersion(activities: ProgrammeActivity[], importData: ProgrammeImportData, importId: string): ProgrammeActivity[] {
  if (!importId || importId === LEGACY_PROGRAMME_VERSION) return activities;
  const snapshot = importData.snapshots.find((item) => item.id === importId);
  if (!snapshot) return activities.filter((activity) => activity.sourceImportId === importId || activity.missingFromLatestUpdate);
  return snapshot.changes.flatMap((change) => {
    const record = change.classification === "missing" ? change.before : change.after;
    return record?.programmeActivityId ? [record as ProgrammeActivity] : [];
  });
}

export function resourcesForActivity(activity: ProgrammeActivity, importData: ProgrammeImportData): string[] {
  const assignments = importData.assignments.filter((assignment) => assignment.programmeActivityId === activity.programmeActivityId);
  const resources = new Map(importData.resources.map((resource) => [resource.resourceId, resource.resourceName]));
  return [...new Set([...(activity.resourceNames ?? []), ...assignments.map((assignment) => resources.get(assignment.resourceId) || assignment.resourceId)].filter(Boolean))];
}

export function measuredWorkValidation(activity: ProgrammeActivity | undefined): string | null {
  if (!activity) return null;
  const missing: string[] = [];
  if (!activity.unit?.trim()) missing.push("unit of measure");
  if (!(Number(activity.plannedProductionRate) > 0)) missing.push("productivity target");
  return missing.length ? `This activity requires a unit and productivity target before it can be recorded as measured work. Missing: ${missing.join(" and ")}.` : null;
}
