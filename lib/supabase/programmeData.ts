"use client";

import { createClient } from "@/lib/supabase/client";
import type { ProgrammeActivity } from "@/types/site";

type DbActivity = {
  id: string; project_id: string; programme_import_id: string; external_activity_id: string;
  activity_name: string; activity_status: string | null; wbs_code: string | null; wbs_name: string | null;
  building: string | null; area: string | null; level: string | null; gridline: string | null; location: string | null;
  planned_start: string | null; planned_finish: string | null; actual_start: string | null; actual_finish: string | null;
  original_duration: number | null; remaining_duration: number | null; percent_complete: number | null;
  planned_quantity: number | null; unit: string | null; productivity_target: number | null;
  planned_crew_size: number | null; calendar_name: string | null; is_missing_from_latest: boolean;
  created_at: string; updated_at: string;
};

export function programmeActivityFromDb(row: DbActivity): ProgrammeActivity {
  return {
    id: row.id, projectId: row.project_id, programmeActivityId: row.external_activity_id,
    activityName: row.activity_name, activity: row.activity_name, workActivity: row.activity_name,
    activityStatus: row.activity_status ?? "", wbsCode: row.wbs_code ?? "", wbsPath: row.wbs_name ?? row.wbs_code ?? "",
    building: row.building ?? "", elevation: row.area ?? "", level: row.level ?? "", gridline: row.gridline ?? "",
    unit: row.unit ?? "", plannedQuantity: Number(row.planned_quantity ?? 0), plannedProductionRate: row.productivity_target ?? undefined,
    plannedCrewSize: row.planned_crew_size ?? undefined, plannedStart: row.planned_start ?? undefined, plannedFinish: row.planned_finish ?? undefined,
    actualStart: row.actual_start ?? undefined, actualFinish: row.actual_finish ?? undefined,
    originalDuration: row.original_duration ?? undefined, remainingDuration: row.remaining_duration ?? undefined,
    physicalPercentComplete: row.percent_complete ?? undefined, calendar: row.calendar_name ?? "",
    sourceType: "p6-xlsx", sourceImportId: row.programme_import_id, missingFromLatestUpdate: row.is_missing_from_latest,
    productivityBaselineComplete: Boolean(row.unit && row.productivity_target && row.planned_quantity), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function loadPublishedProgramme(projectId: string): Promise<{ importId: string; activities: ProgrammeActivity[] }> {
  const supabase = createClient();
  const { data: published, error: importError } = await supabase.from("programme_imports").select("id").eq("project_id", projectId).eq("status", "published").maybeSingle();
  if (importError) throw importError;
  if (!published) return { importId: "", activities: [] };
  const { data, error } = await supabase.from("programme_activities").select("*").eq("project_id", projectId).eq("programme_import_id", published.id).order("activity_name");
  if (error) throw error;
  return { importId: published.id, activities: ((data ?? []) as DbActivity[]).map(programmeActivityFromDb) };
}

export async function loadProgrammeImports(projectId: string) {
  const { data, error } = await createClient().from("programme_imports").select("*").eq("project_id", projectId).order("imported_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function loadProjectRole(projectId:string){const {data,error}=await createClient().from("sitepulse_project_members").select("role").eq("project_id",projectId).maybeSingle();if(error)throw error;return data?.role as "planner"|"admin"|"site_team"|undefined;}

export async function updateProgrammeBaseline(activityId: string, unit: string, productivityTarget: number) {
  const { error } = await createClient().from("programme_activities").update({ unit, productivity_target: productivityTarget, updated_at: new Date().toISOString() }).eq("id", activityId);
  if (error) throw error;
}
