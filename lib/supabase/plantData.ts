"use client";
import { createClient } from "@/lib/supabase/client";
import {
  classifyPlantImport,
  mapPlantRow,
  plantStableKey,
  type PlantImportRow,
  type PlantMapping,
} from "@/lib/plantImport";
import type { ProgrammeActivity } from "@/types/site";
export type PlantRecord = {
  id: string;
  project_id: string;
  plant_type: string;
  description?: string | null;
  supplier?: string | null;
  hire_reference: string;
  quantity: number;
  programme_activity_external_id?: string | null;
  building?: string | null;
  elevation?: string | null;
  level?: string | null;
  required_from_date?: string | null;
  required_to_date?: string | null;
  on_hire_date?: string | null;
  off_hire_requested_date?: string | null;
  actual_off_hire_date?: string | null;
  explicit_status?: string | null;
  active_issue?: boolean;
  notes?: string | null;
  site_notes?: string | null;
  daily_hire_cost?: number | null;
  weekly_hire_cost?: number | null;
  import_source?: string | null;
  import_row_key?: string | null;
};
export async function loadPlant(projectId: string) {
  const { data, error } = await createClient()
    .from("plant_hire_records")
    .select("*")
    .eq("project_id", projectId)
    .order("required_from_date");
  if (error && ["42P01", "PGRST205"].includes(error.code ?? "")) return [];
  if (error) throw error;
  return (data ?? []) as PlantRecord[];
}
export async function updatePlant(id: string, changes: Partial<PlantRecord>) {
  const { error } = await createClient()
    .from("plant_hire_records")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
export async function importPlantSchedule(
  projectId: string,
  sourceName: string,
  sourceRows: PlantImportRow[],
  mapping: PlantMapping,
  activities: ProgrammeActivity[],
) {
  const db = createClient(),
    existing = await loadPlant(projectId),
    activityIds = new Set(activities.map((row) => row.programmeActivityId)),
    existingByKey = new Map(
      existing.map((row) => [
        row.import_row_key ??
          plantStableKey({
            plant_type: row.plant_type,
            hire_reference: row.hire_reference,
          } as ReturnType<typeof mapPlantRow>),
        row,
      ]),
    );
  const results = sourceRows.map((source, index) => {
    const mapped = mapPlantRow(source, mapping),
      key = plantStableKey(mapped),
      current = existingByKey.get(key);
    return {
      row: index + 2,
      mapped,
      key,
      current,
      classification: classifyPlantImport(
        mapped,
        current as unknown as Record<string, unknown> | undefined,
        !mapped.programme_activity_external_id ||
          activityIds.has(mapped.programme_activity_external_id),
      ),
    };
  });
  const valid = results
    .filter(
      (row) =>
        ["NEW", "UPDATED", "UNCHANGED"].includes(row.classification) && row.key,
    )
    .map(({ mapped, key, current }) => ({
      ...mapped,
      project_id: projectId,
      import_source: sourceName,
      import_row_key: key,
      site_notes: current?.site_notes ?? null,
      actual_off_hire_date:
        current?.actual_off_hire_date ?? mapped.actual_off_hire_date,
      updated_at: new Date().toISOString(),
    }));
  if (valid.length) {
    const { error } = await db
      .from("plant_hire_records")
      .upsert(valid, { onConflict: "project_id,import_source,import_row_key" });
    if (error) throw error;
  }
  return results;
}
