"use client";
import { createClient } from "@/lib/supabase/client";
import type { OperationalDependency, ProceedException, ReadinessData, ReleaseEvidence, ReleaseRecord, ReleaseType, SiteCompletion } from "@/lib/readiness";

const missing = (error: { code?: string } | null) => Boolean(error && ["42P01", "PGRST205"].includes(error.code ?? ""));
export async function loadReadinessData(projectId: string): Promise<ReadinessData> {
  const db = createClient();
  const results = await Promise.all([
    db.from("activity_releases").select("*").eq("project_id", projectId).order("planned_release_date"),
    db.from("activity_release_links").select("*").eq("project_id", projectId),
    db.from("operational_readiness_dependencies").select("*").eq("project_id", projectId),
    db.from("activity_site_completions").select("*").eq("project_id", projectId),
    db.from("readiness_exceptions").select("*").eq("project_id", projectId).order("occurred_at", { ascending: false }),
    db.from("readiness_evidence").select("*").eq("project_id", projectId).order("uploaded_at", { ascending: false }),
    db.from("readiness_audit").select("*").eq("project_id", projectId).order("changed_at", { ascending: false }).limit(100),
  ]);
  for (const result of results) if (result.error && !missing(result.error)) throw result.error;
  const evidence = (results[5].data ?? []) as ReleaseEvidence[];
  for (const row of evidence) {
    const { data } = await db.storage.from("timeline-photos").createSignedUrl(row.storage_path, 3600);
    row.signed_url = data?.signedUrl;
  }
  return { releases: (results[0].data ?? []) as ReleaseRecord[], releaseLinks: results[1].data ?? [], dependencies: (results[2].data ?? []) as OperationalDependency[], completions: (results[3].data ?? []) as SiteCompletion[], exceptions: (results[4].data ?? []) as ProceedException[], evidence, audit: results[6].data ?? [] };
}

async function userId() { const { data } = await createClient().auth.getUser(); if (!data.user) throw new Error("You must be signed in."); return data.user.id; }
export async function createRelease(projectId: string, input: { releaseType: ReleaseType; title: string; activityIds: string[]; building?: string; elevation?: string; level?: string; areaZone?: string; description?: string; plannedDate?: string; actualDate?: string; releasedBy?: string; organisation?: string; reference?: string; status: ReleaseRecord["status"]; notes?: string; files?: File[] }) {
  if (!input.activityIds.length) throw new Error("Select at least one downstream programme activity.");
  const db = createClient(), actor = await userId();
  const { data, error } = await db.from("activity_releases").insert({ project_id: projectId, release_type: input.releaseType, title: input.title.trim(), building: input.building || null, elevation: input.elevation || null, level: input.level || null, area_zone: input.areaZone || null, description: input.description || null, planned_release_date: input.plannedDate || null, actual_release_date: input.actualDate || null, released_by_name: input.releasedBy || null, responsible_organisation: input.organisation || null, reference: input.reference || null, status: input.status, notes: input.notes || null, created_by: actor }).select("*").single();
  if (error) throw error;
  const { error: linkError } = await db.from("activity_release_links").insert(input.activityIds.map((activityId) => ({ release_id: data.id, project_id: projectId, programme_activity_external_id: activityId })));
  if (linkError) throw linkError;
  if (input.files?.length) await uploadReleaseEvidence(projectId, data.id, input.activityIds, input.files);
  return data as ReleaseRecord;
}
export async function updateRelease(record: ReleaseRecord, changes: Partial<ReleaseRecord>) {
  const { error } = await createClient().from("activity_releases").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", record.id).eq("project_id", record.project_id); if (error) throw error;
}
export async function uploadReleaseEvidence(projectId: string, releaseId: string, activityIds: string[], files: File[]) {
  const db = createClient(), actor = await userId();
  for (const file of files) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-"); const path = `${projectId}/readiness/${releaseId}/${crypto.randomUUID()}-${safe}`;
    const { error: uploadError } = await db.storage.from("timeline-photos").upload(path, file); if (uploadError) throw uploadError;
    const { error } = await db.from("readiness_evidence").insert(activityIds.map((activityId) => ({ project_id: projectId, release_id: releaseId, programme_activity_external_id: activityId, storage_path: path, file_name: file.name, file_type: file.type || null, file_size: file.size, uploaded_by: actor })));
    if (error) throw error;
  }
}
export async function markSiteComplete(projectId: string, activityId: string, completedAt: string, notes?: string, quantity?: number) {
  const actor = await userId(); const { error } = await createClient().from("activity_site_completions").upsert({ project_id: projectId, programme_activity_external_id: activityId, completed_at: completedAt, completed_by: actor, notes: notes || null, quantity: quantity ?? null }, { onConflict: "project_id,programme_activity_external_id" }); if (error) throw error;
}
export async function createOperationalDependency(projectId: string, predecessorId: string, successorId: string, description?: string) {
  if (predecessorId === successorId) throw new Error("An activity cannot depend on itself."); const actor = await userId(); const { error } = await createClient().from("operational_readiness_dependencies").upsert({ project_id: projectId, predecessor_external_activity_id: predecessorId, successor_external_activity_id: successorId, description: description || null, active: true, created_by: actor }, { onConflict: "project_id,predecessor_external_activity_id,successor_external_activity_id" }); if (error) throw error;
}
export async function recordProceedException(projectId: string, activityId: string, issueType: string, reason: string, areaZone?: string, knownConstraints: unknown[] = [], timelineEventId?: string) {
  if (!reason.trim()) throw new Error("A reason is required to proceed with exception."); const actor = await userId(); const { data, error } = await createClient().from("readiness_exceptions").insert({ project_id: projectId, programme_activity_external_id: activityId, issue_type: issueType, reason: reason.trim(), area_zone: areaZone || null, known_constraints: knownConstraints, timeline_event_id: timelineEventId || null, user_id: actor }).select("*").single(); if (error) throw error; return data as ProceedException;
}
