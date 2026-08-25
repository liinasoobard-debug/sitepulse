"use client";

import { createClient } from "@/lib/supabase/client";
import type { V2DailyRecord } from "@/lib/v2Productivity";
import type { ProgrammeActivity } from "@/types/site";
import { demoRecords, V2_DEMO_ACTIVITIES, V2_DEMO_RECORDS_KEY } from "@/lib/v2Demo";

export async function loadV2Programme(projectId: string) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth.user) return { activities: V2_DEMO_ACTIVITIES, dataDate: "2026-08-25", demo: true };
  const { loadPublishedProgramme } = await import("@/lib/supabase/programmeData");
  return { ...await loadPublishedProgramme(projectId), demo: false };
}

export async function loadV2DailyRecords(projectId: string): Promise<V2DailyRecord[]> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return demoRecords();
  const { data, error } = await supabase.from("timeline_events").select("id,event_date,external_activity_id,actual_quantity,labour_hours,change_category,note").eq("project_id", projectId).eq("event_type", "work").eq("status", "completed").is("deleted_at", null).order("event_date");
  if (error) throw error;
  return (data ?? []).flatMap((row) => row.external_activity_id ? [{ id: String(row.id), date: String(row.event_date), activityId: String(row.external_activity_id), quantity: Number(row.actual_quantity ?? 0), labourHours: Number(row.labour_hours ?? 0), constrained: Boolean(row.change_category), constraintReason: row.change_category ? String(row.change_category) : undefined, note: row.note ? String(row.note) : undefined }] : []);
}

export async function saveV2DailyRecord(projectId: string, activity: ProgrammeActivity, record: Omit<V2DailyRecord, "id" | "activityId">) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) { const id = `demo-${Date.now()}`; const added = demoRecords().filter((row) => !String(row.id).startsWith("demo-r")); localStorage.setItem(V2_DEMO_RECORDS_KEY, JSON.stringify([...added, { id, ...record, activityId: activity.programmeActivityId }])); return id; }
  const { data, error } = await supabase.from("timeline_events").insert({ project_id: projectId, programme_activity_id: activity.id, programme_import_id: activity.sourceImportId ?? null, external_activity_id: activity.programmeActivityId, event_type: "work", activity_name_snapshot: activity.activityName ?? activity.activity, building_snapshot: activity.building || null, area_snapshot: activity.elevation || null, level_snapshot: activity.level || null, unit_snapshot: activity.unit || null, productivity_target_snapshot: activity.plannedManDayProductivity ?? null, event_date: record.date, start_time: "00:00", actual_quantity: record.quantity, operative_count: null, labour_hours: record.labourHours, change_category: record.constrained ? record.constraintReason || "Constrained" : null, note: record.note || null, status: "completed", created_by: auth.user.id }).select("id").single();
  if (error) throw error;
  return String(data.id);
}
