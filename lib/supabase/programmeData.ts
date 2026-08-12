"use client";

import { createClient } from "@/lib/supabase/client";
import { plannedWorkingDaysBetween } from "@/lib/manDayProductivity";
import type { ProgrammeActivity } from "@/types/site";

type DbActivity = {
  id: string; project_id: string; programme_import_id: string; external_activity_id: string;
  activity_name: string; activity_status: string | null; wbs_code: string | null; wbs_name: string | null;
  building: string | null; area: string | null; level: string | null; gridline: string | null; location: string | null;
  planned_start: string | null; planned_finish: string | null; actual_start: string | null; actual_finish: string | null;
  original_duration: number | null; remaining_duration: number | null; percent_complete: number | null;
  planned_quantity: number | null; unit: string | null; productivity_target: number | null;
  planned_man_day_productivity: number | null; assumed_gang_size: number | null; planned_gang_daily_output: number | null;
  planned_man_days: number | null; planned_duration_days: number | null;
  product_type: string | null; programme_status: string | null; budget_labour_hours: number | null; source_type: string | null;
  raw_data?: Record<string, unknown> | null;
  planned_crew_size: number | null; calendar_name: string | null; is_missing_from_latest: boolean;
  created_at: string; updated_at: string;
};

export function programmeActivityFromDb(row: DbActivity, source?: { source_type?: string; source_filename?: string; imported_at?: string; imported_by?: string }): ProgrammeActivity {
  const raw = row.raw_data ?? {};
  const sourceType = (row.source_type ?? raw.sourceType ?? source?.source_type ?? "manual") as ProgrammeActivity["sourceType"];
  const assumedGangSize = row.assumed_gang_size ?? row.planned_crew_size ?? undefined;
  return {
    id: row.id, projectId: row.project_id, programmeActivityId: row.external_activity_id,
    activityName: row.activity_name, activity: row.activity_name, workActivity: row.activity_name,
    activityStatus: row.activity_status ?? "", wbsCode: row.wbs_code ?? "", wbsPath: row.wbs_name ?? row.wbs_code ?? "",
    building: row.building ?? "", elevation: row.area ?? "", level: row.level ?? "", gridline: row.gridline ?? "",
    productType: row.product_type ?? String(raw.productType ?? ""), status: row.programme_status ?? String(raw.programmeStatus ?? row.activity_status ?? ""), unit: row.unit ?? "", plannedQuantity: Number(row.planned_quantity ?? 0), budgetLabourHours: row.budget_labour_hours ?? (raw.budgetLabourHours === null || raw.budgetLabourHours === undefined ? undefined : Number(raw.budgetLabourHours)), plannedProductionRate: row.productivity_target ?? undefined,
    plannedCrewSize: row.planned_crew_size ?? undefined, plannedManDayProductivity: row.planned_man_day_productivity ?? undefined,
    assumedGangSize, plannedGangDailyOutput: row.planned_gang_daily_output ?? undefined,
    plannedManDays: row.planned_man_days ?? undefined, plannedDurationDays: row.planned_duration_days ?? undefined,
    plannedStart: row.planned_start ?? undefined, plannedFinish: row.planned_finish ?? undefined,
    actualStart: row.actual_start ?? undefined, actualFinish: row.actual_finish ?? undefined,
    originalDuration: row.original_duration ?? undefined, remainingDuration: row.remaining_duration ?? undefined,
    physicalPercentComplete: row.percent_complete ?? undefined, calendar: row.calendar_name ?? "",
    sourceType, sourceImportId: row.programme_import_id, sourceFilename: source?.source_filename, importDate: source?.imported_at, importedBy: source?.imported_by, missingFromLatestUpdate: row.is_missing_from_latest,
    productivityBaselineComplete: Boolean(row.unit && row.planned_man_day_productivity && assumedGangSize && row.planned_quantity), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function loadPublishedProgramme(projectId: string): Promise<{ importId: string; activities: ProgrammeActivity[] }> {
  const supabase = createClient();
  const { data: published, error: importError } = await supabase.from("programme_imports").select("id,source_type,source_filename,imported_at,imported_by").eq("project_id", projectId).eq("status", "published").maybeSingle();
  if (importError) throw importError;
  if (!published) return { importId: "", activities: [] };
  const [activityResult, resourceResult, assignmentResult] = await Promise.all([
    supabase.from("programme_activities").select("*").eq("project_id", projectId).eq("programme_import_id", published.id).order("activity_name"),
    supabase.from("programme_resources").select("external_resource_id,resource_name,resource_type,unit").eq("project_id", projectId).eq("programme_import_id", published.id),
    supabase.from("programme_assignments").select("activity_external_id,resource_external_id,budgeted_units").eq("project_id", projectId).eq("programme_import_id", published.id),
  ]);
  if (activityResult.error) throw activityResult.error;
  if (resourceResult.error) throw resourceResult.error;
  if (assignmentResult.error) throw assignmentResult.error;
  const resources = new Map((resourceResult.data ?? []).map((row) => [String(row.external_resource_id), { name: String(row.resource_name), type: String(row.resource_type ?? ""), unit: String(row.unit ?? "") }]));
  const assigned = new Map<string, Array<{ name: string; type: string; unit: string; budgetedUnits: number }>>();
  for (const row of assignmentResult.data ?? []) {
    const resource = resources.get(String(row.resource_external_id));
    if (!resource) continue;
    const activityId = String(row.activity_external_id);
    assigned.set(activityId, [...(assigned.get(activityId) ?? []), { ...resource, budgetedUnits: Number(row.budgeted_units ?? 0) }]);
  }
  const uniqueNames = (items: Array<{ name: string }>) => [...new Set(items.map((item) => item.name).filter(Boolean))];
  const isMaterial = (type: string) => /mat|material/i.test(type);
  const isLabour = (type: string) => /labor|labour|human|role/i.test(type);
  const activities = ((activityResult.data ?? []) as DbActivity[]).map((row) => {
    const activity = programmeActivityFromDb(row, published);
    const activityResources = assigned.get(activity.programmeActivityId) ?? [];
    const labourResources = activityResources.filter((resource) => isLabour(resource.type));
    const materialResources = activityResources.filter((resource) => isMaterial(resource.type));
    const labourHourResources = labourResources.filter((resource) => /^(?:h|hr|hrs|hour|hours)$/i.test(resource.unit.trim()));
    const labourCountResources = labourResources.filter((resource) => !labourHourResources.includes(resource));
    const assignedLabourHours = labourHourResources.reduce((total, resource) => total + resource.budgetedUnits, 0);
    const assignedCrewSize = labourCountResources.reduce((total, resource) => total + resource.budgetedUnits, 0);
    const assignedMaterialQuantity = materialResources.reduce((total, resource) => total + resource.budgetedUnits, 0);
    const derivedLabourHours = assignedLabourHours || (assignedCrewSize && activity.originalDuration ? assignedCrewSize * activity.originalDuration : 0);
    const budgetLabourHours = activity.budgetLabourHours || derivedLabourHours || undefined;
    const plannedQuantity = activity.plannedQuantity || assignedMaterialQuantity || 0;
    const unit = activity.unit || materialResources.map((resource) => resource.unit).find(Boolean) || "";
    const plannedCrewSize = activity.plannedCrewSize || assignedCrewSize || (budgetLabourHours && activity.originalDuration ? budgetLabourHours / activity.originalDuration : undefined);
    const assumedGangSize = activity.assumedGangSize || plannedCrewSize;
    const plannedProductionRate = activity.plannedProductionRate || (plannedQuantity > 0 && budgetLabourHours ? plannedQuantity / budgetLabourHours : undefined);
    const plannedDurationDays = activity.plannedDurationDays ?? plannedWorkingDaysBetween(activity.plannedStart, activity.plannedFinish);
    const plannedManDayProductivity = activity.plannedManDayProductivity || (plannedQuantity > 0 && plannedDurationDays && plannedDurationDays > 0 && assumedGangSize && assumedGangSize > 0 ? plannedQuantity / (plannedDurationDays * assumedGangSize) : undefined);
    const plannedGangDailyOutput = activity.plannedGangDailyOutput || (plannedManDayProductivity && assumedGangSize ? plannedManDayProductivity * assumedGangSize : undefined);
    const plannedManDays = activity.plannedManDays || (plannedManDayProductivity ? plannedQuantity / plannedManDayProductivity : undefined);
    return {
      ...activity,
      plannedQuantity,
      budgetLabourHours,
      plannedCrewSize,
      assumedGangSize,
      plannedDurationDays,
      plannedManDayProductivity,
      plannedGangDailyOutput,
      plannedManDays,
      plannedProductionRate,
      unit,
      productivityBaselineComplete: Boolean(plannedQuantity > 0 && plannedManDayProductivity && assumedGangSize && unit),
      resourceNames: uniqueNames(activityResources),
      labourResourceNames: uniqueNames(labourResources),
      materialResourceNames: uniqueNames(materialResources),
    };
  });
  return { importId: published.id, activities };
}

export async function loadProgrammeImports(projectId: string) {
  const { data, error } = await createClient().from("programme_imports").select("*").eq("project_id", projectId).order("imported_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadPublishedProgrammeRelationships(projectId: string) {
  const supabase = createClient();
  const { data: published, error: importError } = await supabase.from("programme_imports").select("id").eq("project_id", projectId).eq("status", "published").maybeSingle();
  if (importError) throw importError;
  if (!published) return [];
  const { data, error } = await supabase.from("programme_relationships").select("predecessor_external_activity_id,successor_external_activity_id,relationship_type,lag").eq("project_id", projectId).eq("programme_import_id", published.id);
  if (error) return [];
  return (data ?? []).map((row) => ({ predecessorId: String(row.predecessor_external_activity_id), successorId: String(row.successor_external_activity_id), type: String(row.relationship_type ?? ""), lag: row.lag === null ? undefined : Number(row.lag) }));
}

export async function loadActualProductivity(projectId: string): Promise<Record<string, number>> {
  const { data, error } = await createClient()
    .from("timeline_events")
    .select("external_activity_id,event_date,actual_quantity,timeline_event_labour(operative_id)")
    .eq("project_id", projectId)
    .eq("event_type", "work")
    .eq("status", "completed")
    .is("deleted_at", null);
  if (error) throw error;
  const totals = new Map<string, { quantity: number; contributorDays: Map<string, Set<string>> }>();
  for (const row of data ?? []) {
    if (!row.external_activity_id) continue;
    const current = totals.get(row.external_activity_id) ?? { quantity: 0, contributorDays: new Map<string, Set<string>>() };
    current.quantity += Number(row.actual_quantity ?? 0);
    const date = String(row.event_date);
    const contributors = current.contributorDays.get(date) ?? new Set<string>();
    for (const labour of row.timeline_event_labour ?? []) if (labour.operative_id) contributors.add(String(labour.operative_id));
    current.contributorDays.set(date, contributors);
    totals.set(row.external_activity_id, current);
  }
  return Object.fromEntries(
    [...totals.entries()].flatMap(([activityId, total]) =>
      [...total.contributorDays.values()].reduce((sum, contributors) => sum + contributors.size, 0) > 0
        ? [[activityId, total.quantity / [...total.contributorDays.values()].reduce((sum, contributors) => sum + contributors.size, 0)]] : []
    )
  );
}
export async function loadProjectRole(projectId: string): Promise<"planner" | "admin" | "commercial" | "site_team" | undefined> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) return undefined;
  const { data, error } = await supabase
    .from("sitepulse_project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  console.info("Programme project authorization", { userId: user.id, projectId, membership: data });
  return data?.role as "planner" | "admin" | "commercial" | "site_team" | undefined;
}

export async function updateProgrammeBaseline(activityId: string, unit: string, plannedManDayProductivity: number, assumedGangSize: number) {
  const supabase = createClient();
  const { data: activity, error: loadError } = await supabase.from("programme_activities").select("planned_quantity").eq("id", activityId).single();
  if (loadError) throw loadError;
  const { error } = await createClient().from("programme_activities").update({
    unit,
    planned_man_day_productivity: plannedManDayProductivity,
    assumed_gang_size: assumedGangSize,
    planned_gang_daily_output: plannedManDayProductivity * assumedGangSize,
    planned_man_days: Number(activity.planned_quantity ?? 0) > 0 ? Number(activity.planned_quantity) / plannedManDayProductivity : null,
    updated_at: new Date().toISOString(),
  }).eq("id", activityId);
  if (error) throw error;
}

export async function updateProgrammeProgress(activityId: string, percentComplete: number) {
  const { error } = await createClient().from("programme_activities").update({ percent_complete: percentComplete, updated_at: new Date().toISOString() }).eq("id", activityId);
  if (error) throw error;
}

export async function loadActivityInstalledQuantity(projectId: string, externalActivityId: string): Promise<number> {
  const { data, error } = await createClient()
    .from("timeline_events")
    .select("actual_quantity")
    .eq("project_id", projectId)
    .eq("external_activity_id", externalActivityId)
    .eq("event_type", "work")
    .eq("status", "completed")
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).reduce((total, row) => total + Number(row.actual_quantity ?? 0), 0);
}

export type RecalculatedProgrammeProgress = {
  actualStart?: string;
  actualFinish?: string;
  percentageComplete: number;
};

export async function recalculateProgrammeProgress(projectId: string, activity: ProgrammeActivity): Promise<RecalculatedProgrammeProgress> {
  const { data, error } = await createClient().rpc("recalculate_programme_activity_actuals", {
    target_project: projectId,
    target_external_activity: activity.programmeActivityId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    actualStart: result?.actual_start ?? undefined,
    actualFinish: result?.actual_finish ?? undefined,
    percentageComplete: Number(result?.percent_complete ?? 0),
  };
}
