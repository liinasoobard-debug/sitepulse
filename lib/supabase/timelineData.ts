"use client";

import { createClient } from "@/lib/supabase/client";
import type { TimelineEvent } from "@/types/site";

type DbEvent = Record<string, unknown>;
export function timelineEventFromDb(row: DbEvent): TimelineEvent {
  const labour = Array.isArray(row.timeline_event_labour) ? row.timeline_event_labour as Array<{ operative_id?: unknown }> : [];
  return { id: String(row.id), crewId: row.crew_id ? String(row.crew_id) : undefined, programmeActivityId: row.external_activity_id ? String(row.external_activity_id) : undefined, programmeImportId: row.programme_import_id ? String(row.programme_import_id) : undefined, programmeVersion: row.programme_import_id ? String(row.programme_import_id) : undefined, time: String(row.start_time).slice(0,5), startTime: String(row.start_time).slice(0,5), finishTime: row.finish_time ? String(row.finish_time).slice(0,5) : undefined, duration: row.labour_hours && row.operative_count ? Number(row.labour_hours) / Number(row.operative_count) * 60 : undefined, title: String(row.activity_name_snapshot), type: String(row.event_type) as TimelineEvent["type"], status: String(row.status || "completed") as TimelineEvent["status"], location: row.location_snapshot ? String(row.location_snapshot) : undefined, unit: row.unit_snapshot ? String(row.unit_snapshot) : undefined, productivityTarget: row.productivity_target_snapshot ? Number(row.productivity_target_snapshot) : undefined, quantity: row.actual_quantity === null ? undefined : Number(row.actual_quantity), numberOfOperatives: row.operative_count === null ? undefined : Number(row.operative_count), affectedOperativeIds: labour.flatMap((item) => item.operative_id ? [String(item.operative_id)] : []), notes: row.note ? String(row.note) : undefined, photoIds: [] };
}
export async function loadTimelineEvents(projectId: string, date: string): Promise<TimelineEvent[]> {
  const supabase=createClient(); const { data, error } = await supabase.from("timeline_events").select("*,timeline_event_photos(storage_path),timeline_event_labour(operative_id)").eq("project_id", projectId).eq("event_date", date).is("deleted_at", null).order("start_time");
  if (error) throw error;
  return Promise.all((data??[]).map(async row=>{const event=timelineEventFromDb(row as DbEvent);const photos=(row.timeline_event_photos??[]) as Array<{storage_path:string}>;event.photoIds=(await Promise.all(photos.map(photo=>supabase.storage.from("timeline-photos").createSignedUrl(photo.storage_path,3600)))).flatMap(result=>result.data?.signedUrl?[result.data.signedUrl]:[]);return event;}));
}
export async function loadTimelineEventsBetween(projectId:string,start:string,end:string){const {data,error}=await createClient().from("timeline_events").select("*,timeline_event_labour(operative_id)").eq("project_id",projectId).gte("event_date",start).lte("event_date",end).is("deleted_at",null).order("event_date");if(error)throw error;return (data??[]).map(row=>({date:String(row.event_date),event:timelineEventFromDb(row as DbEvent)}));}
export async function createTimelineEvent(projectId: string, date: string, event: Omit<TimelineEvent,"id">, activityDatabaseId?: string) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("You must be signed in.");
  let activity:Record<string,unknown>|null=null; if(activityDatabaseId){const {data,error}=await supabase.from("programme_activities").select("id,programme_import_id,external_activity_id,activity_name,building,area,level,location,unit,productivity_target").eq("id",activityDatabaseId).single();if(error)throw error;activity=data;}
  const durationHours = (event.duration ?? 0) / 60;
  const { data, error } = await supabase.from("timeline_events").insert({ project_id: projectId, programme_activity_id: activityDatabaseId || null, programme_import_id: activity?.programme_import_id || event.programmeImportId || null, external_activity_id: activity?.external_activity_id || event.programmeActivityId || null, event_type: event.type, activity_name_snapshot: activity?.activity_name || event.title, building_snapshot: activity?.building || null, area_snapshot: activity?.area || null, level_snapshot: activity?.level || null, location_snapshot: activity?.location || event.location || null, unit_snapshot: activity?.unit || event.unit || null, productivity_target_snapshot: activity?.productivity_target || event.productivityTarget || null, event_date: date, start_time: event.startTime || event.time, finish_time: event.finishTime || null, actual_quantity: event.quantity ?? null, operative_count: event.numberOfOperatives ?? event.affectedOperativeIds?.length ?? null, labour_hours: durationHours * (event.numberOfOperatives ?? event.affectedOperativeIds?.length ?? 0), note: event.notes || null, crew_id: event.crewId || null, status: event.status || "completed", created_by: userData.user.id }).select("*").single();
  if (error) throw error;
  const labour=(event.affectedOperativeIds??[]).map(operativeId=>({timeline_event_id:data.id,operative_id:operativeId,gang_id:event.crewId||null,hours:durationHours,normal_hours:durationHours,overtime_hours:0}));if(labour.length){const {error:labourError}=await supabase.from("timeline_event_labour").insert(labour);if(labourError)throw labourError;}
  const created = timelineEventFromDb(data as DbEvent);
  created.affectedOperativeIds = event.affectedOperativeIds ?? [];
  created.percentComplete = event.percentComplete;
  return created;
}
export async function updateTimelineEvent(event: TimelineEvent, date?: string): Promise<TimelineEvent> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("You must be signed in.");
  const operativeCount = event.numberOfOperatives ?? event.affectedOperativeIds?.length ?? 0;
  const durationHours = (event.duration ?? 0) / 60;
  const { data, error } = await supabase.from("timeline_events").update({
    ...(date ? { event_date: date } : {}),
    activity_name_snapshot: event.title,
    start_time: event.startTime || event.time,
    finish_time: event.finishTime || null,
    actual_quantity: event.quantity ?? null,
    operative_count: operativeCount,
    labour_hours: durationHours * operativeCount,
    note: event.notes || null,
    status: event.status || "completed",
    updated_at: new Date().toISOString(),
  }).eq("id", event.id).select("*").single();
  if (error) throw error;
  const { error: labourError } = await supabase.from("timeline_event_labour").update({ hours: durationHours, normal_hours: durationHours }).eq("timeline_event_id", event.id);
  if (labourError) throw labourError;
  const updated = timelineEventFromDb(data as DbEvent);
  updated.affectedOperativeIds = event.affectedOperativeIds ?? [];
  updated.photoIds = event.photoIds ?? [];
  updated.percentComplete = event.percentComplete;
  return updated;
}

export async function deleteTimelineEvent(eventId: string): Promise<void> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("You must be signed in.");
  const { error } = await supabase.from("timeline_events").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", eventId).select("id").single();
  if (error) throw error;
}
export async function uploadTimelinePhotos(projectId: string, eventId: string, files: File[]) {
  const supabase = createClient(); const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("You must be signed in.");
  for (const file of files) { const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,"-"); const path=`${projectId}/${eventId}/${crypto.randomUUID()}-${safe}`; const { error: uploadError }=await supabase.storage.from("timeline-photos").upload(path,file); if(uploadError) throw uploadError; const { error }=await supabase.from("timeline_event_photos").insert({timeline_event_id:eventId,storage_path:path,file_name:file.name,file_type:file.type,file_size:file.size,category:"progress",uploaded_by:userData.user.id}); if(error) throw error; }
}
