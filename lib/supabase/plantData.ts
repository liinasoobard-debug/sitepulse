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
  hire_reference?: string | null;
  quantity: number;
  record_kind?: "HIRE" | "REQUIREMENT";
  asset_number?: string | null;
  arrival_date?: string | null;
  booking_required_by?: string | null;
  actual_booking_date?: string | null;
  confirmed_delivery_date?: string | null;
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
  requested_collection_date?: string | null;
  off_hire_requested_by?: string | null;
  off_hire_reference?: string | null;
  off_hire_notes?: string | null;
  final_off_hire_notes?: string | null;
  collected_or_returned?: string | null;
  import_source?: string | null;
  import_row_key?: string | null;
};
export type PlantAllocation = {
  id: string;
  project_id: string;
  plant_hire_record_id: string;
  gang_id?: string | null;
  gang_name?: string | null;
  programme_activity_external_id?: string | null;
  allocated_from: string;
  allocated_to?: string | null;
  notes?: string | null;
};
export type PlantUsage = {
  id: string;
  project_id: string;
  plant_hire_record_id: string;
  timeline_event_id: string;
  usage_date: string;
  gang_id?: string | null;
  gang_name?: string | null;
  programme_activity_external_id?: string | null;
  duration_hours?: number | null;
};
export type PlantSettings = {
  project_id: string;
  idle_warning_working_days: number;
  idle_red_working_days: number;
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
export async function createPlant(
  projectId: string,
  values: Omit<Partial<PlantRecord>, "id" | "project_id"> &
    Pick<PlantRecord, "plant_type">,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const { data, error } = await db
    .from("plant_hire_records")
    .insert({
      ...values,
      project_id: projectId,
      quantity: values.quantity ?? 1,
      created_by: user.user?.id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlantRecord;
}
export async function loadPlantOperations(projectId: string) {
  const db = createClient();
  const [allocations, usage, settings] = await Promise.all([
    db.from("plant_allocations").select("*").eq("project_id", projectId).order("allocated_from", { ascending: false }),
    db.from("plant_usage").select("*").eq("project_id", projectId).order("usage_date", { ascending: false }),
    db.from("plant_settings").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  for (const result of [allocations, usage, settings]) {
    if (result.error && !["42P01", "PGRST205"].includes(result.error.code ?? ""))
      throw result.error;
  }
  return {
    allocations: (allocations.data ?? []) as PlantAllocation[],
    usage: (usage.data ?? []) as PlantUsage[],
    settings: (settings.data as PlantSettings | null) ?? {
      project_id: projectId,
      idle_warning_working_days: 3,
      idle_red_working_days: 5,
    },
  };
}
export async function savePlantSettings(settings: PlantSettings) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const { error } = await db.from("plant_settings").upsert({
    ...settings,
    created_by: user.user?.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
export async function allocatePlant(
  projectId: string,
  plantId: string,
  values: Omit<Partial<PlantAllocation>, "id" | "project_id" | "plant_hire_record_id"> &
    Pick<PlantAllocation, "allocated_from">,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const { error } = await db.from("plant_allocations").insert({
    ...values,
    project_id: projectId,
    plant_hire_record_id: plantId,
    created_by: user.user?.id,
  });
  if (error) throw error;
}
export async function requestPlantOffHire(
  id: string,
  values: Pick<PlantRecord, "requested_collection_date" | "off_hire_reference" | "off_hire_notes">,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  await updatePlant(id, {
    ...values,
    off_hire_requested_date: new Date().toISOString().slice(0, 10),
    explicit_status: "OFF-HIRE REQUESTED",
    off_hire_requested_by: user.user?.id,
  } as Partial<PlantRecord>);
}
export async function confirmPlantOffHire(
  id: string,
  values: Pick<PlantRecord, "actual_off_hire_date" | "collected_or_returned" | "final_off_hire_notes">,
) {
  await updatePlant(id, { ...values, explicit_status: "OFF HIRED" });
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
            record_kind: row.record_kind ?? "HIRE",
            plant_type: row.plant_type,
            hire_reference: row.hire_reference,
            asset_number: row.asset_number,
            programme_activity_external_id:
              row.programme_activity_external_id,
            required_from_date: row.required_from_date,
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
      ...(current ? { id: current.id } : {}),
      ...mapped,
      project_id: projectId,
      import_source: sourceName,
      import_row_key: key,
      site_notes: current?.site_notes ?? null,
      actual_off_hire_date:
        current?.actual_off_hire_date ?? mapped.actual_off_hire_date,
      updated_at: new Date().toISOString(),
    }));
  const newRows = valid.filter((row) => !row.id);
  const existingRows = valid.filter((row) => row.id);
  if (newRows.length) {
    const { error } = await db
      .from("plant_hire_records")
      .upsert(newRows, { onConflict: "project_id,import_source,import_row_key" });
    if (error) throw error;
  }
  for (const row of existingRows) {
    const { id, ...changes } = row;
    const { error } = await db
      .from("plant_hire_records")
      .update(changes)
      .eq("id", id);
    if (error) throw error;
  }
  return results;
}
