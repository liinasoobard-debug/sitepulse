"use client";
import { createClient } from "@/lib/supabase/client";
import type {
  ConstraintRecord,
  ConstraintSuggestion,
  ConstraintStatus,
  ConstraintRag,
  ConstraintActivityLink,
  BlockingRelationship,
} from "@/lib/constraints";
import { constraintRag } from "@/lib/constraints";
export async function loadConstraints(projectId: string) {
  const { data, error } = await createClient()
    .from("constraints")
    .select("*")
    .eq("project_id", projectId)
    .order("first_detected_date", { ascending: false });
  if (error && ["42P01", "PGRST205"].includes(error.code ?? "")) return [];
  if (error) throw error;
  return (data ?? []) as ConstraintRecord[];
}
export async function loadConstraintLinks(projectId: string) {
  const { data, error } = await createClient()
    .from("constraint_activity_links")
    .select("*")
    .eq("project_id", projectId);
  if (error && ["42P01", "PGRST205"].includes(error.code ?? "")) return [];
  if (error) throw error;
  return (data ?? []) as ConstraintActivityLink[];
}
export async function saveSuggestions(
  projectId: string,
  suggestions: ConstraintSuggestion[],
) {
  if (!suggestions.length) return;
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const rows = suggestions.map((row) => ({
    ...row,
    project_id: projectId,
    status: "SUGGESTED",
    calculated_rag: row.rag,
    created_by: user.user?.id,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db
    .from("constraints")
    .upsert(rows, {
      onConflict:
        "project_id,programme_activity_external_id,category,source_condition_key",
      ignoreDuplicates: true,
    });
  if (error) throw error;
  const keys = rows.map((row) => row.source_condition_key);
  const { data: saved, error: savedError } = await db
    .from("constraints")
    .select("id,project_id,programme_activity_external_id")
    .eq("project_id", projectId)
    .in("source_condition_key", keys);
  if (savedError) throw savedError;
  const linkRows = (saved ?? []).flatMap((row) =>
    row.programme_activity_external_id
      ? [{ constraint_id: row.id, project_id: row.project_id, programme_activity_external_id: row.programme_activity_external_id, blocking_relationship: "Potential Risk" }]
      : [],
  );
  if (linkRows.length) {
    const { error: linkError } = await db
      .from("constraint_activity_links")
      .upsert(linkRows, { onConflict: "constraint_id,programme_activity_external_id" });
    if (linkError) throw linkError;
  }
}
export async function updateConstraint(
  row: ConstraintRecord,
  changes: {
    status?: ConstraintStatus;
    rag?: ConstraintRag;
    owner?: string | null;
    action_required?: string | null;
    latest_update?: string | null;
    responsible_organisation?: string | null;
    calculated_required_date?: string | null;
    programme_forecast_impact?: string | null;
    notes?: string | null;
    override_rag?: ConstraintRag | null;
    rag_override_reason?: string | null;
  },
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const today = new Date().toISOString().slice(0, 10);
  const patch = {
    ...changes,
    ...(changes.override_rag
      ? {
          rag_overridden_by: user.user?.id,
          rag_overridden_at: new Date().toISOString(),
        }
      : {}),
    raised_date:
      changes.status === "OPEN" && !row.raised_date ? today : row.raised_date,
    closed_date:
      changes.status === "CLOSED"
        ? today
        : changes.status === "OPEN"
          ? null
          : row.closed_date,
    closed_by: changes.status === "CLOSED" ? user.user?.id : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("constraints").update(patch).eq("id", row.id);
  if (error) throw error;
  const { error: historyError } = await db
    .from("constraint_history")
    .insert({
      constraint_id: row.id,
      project_id: row.project_id,
      event_type:
        changes.status === "CLOSED"
          ? "CLOSED"
          : changes.status === "DISMISSED"
            ? "DISMISSED"
            : "UPDATED",
      from_status: row.status,
      to_status: changes.status ?? row.status,
      from_rag: row.rag,
      to_rag: changes.rag ?? row.rag,
      note: changes.latest_update,
      old_value: row,
      new_value: patch,
      changed_by: user.user?.id,
    });
  if (historyError) throw historyError;
}
export async function replaceConstraintLinks(
  constraint: Pick<ConstraintRecord, "id" | "project_id">,
  links: Array<{
    activityId: string;
    relationship: BlockingRelationship;
  }>,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const { data: old } = await db
    .from("constraint_activity_links")
    .select("programme_activity_external_id")
    .eq("constraint_id", constraint.id);
  const { error: removeError } = await db
    .from("constraint_activity_links")
    .delete()
    .eq("constraint_id", constraint.id);
  if (removeError) throw removeError;
  if (links.length) {
    const { error } = await db.from("constraint_activity_links").insert(
      links.map((link) => ({
        constraint_id: constraint.id,
        project_id: constraint.project_id,
        programme_activity_external_id: link.activityId,
        blocking_relationship: link.relationship,
      })),
    );
    if (error) throw error;
  }
  await db.from("constraint_history").insert({
    constraint_id: constraint.id,
    project_id: constraint.project_id,
    event_type: "ACTIVITY_LINKS_CHANGED",
    note: `${(old ?? []).map((row) => row.programme_activity_external_id).join(", ") || "none"} → ${links.map((row) => row.activityId).join(", ") || "none"}`,
    changed_by: user.user?.id,
  });
}
export async function createManualConstraint(
  projectId: string,
  input: {
    activityIds?: string[];
    projectWide?: boolean;
    relationship?: BlockingRelationship;
    category: string;
    description: string;
    requiredDate?: string;
    owner?: string;
    responsibleOrganisation?: string;
    status?: ConstraintStatus;
    rag?: ConstraintRag;
    latestUpdate?: string;
    impact?: string;
    source?: string;
    notes?: string;
    reference?: string;
    closedDate?: string;
  },
  today: string,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const key = `manual-${crypto.randomUUID()}`;
  if (!input.projectWide && !input.activityIds?.length)
    throw new Error("Select at least one programme activity or mark the constraint project-wide.");
  const id = crypto.randomUUID();
  const { error } = await db
    .from("constraints")
    .insert({
      id,
      project_id: projectId,
      constraint_reference: input.reference || `CON-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
      project_wide: Boolean(input.projectWide),
      programme_activity_external_id: input.activityIds?.[0] || null,
      category: input.category,
      description: input.description,
      source: input.source || "MANUAL",
      source_condition_key: key,
      first_detected_date: today,
      raised_date: today,
      calculated_required_date: input.requiredDate || null,
      owner: input.owner || null,
      responsible_organisation: input.responsibleOrganisation || null,
      status: input.status || "OPEN",
      rag: constraintRag(input.requiredDate || null, today),
      calculated_rag: constraintRag(input.requiredDate || null, today),
      override_rag: input.rag || null,
      rag_override_reason: input.rag ? "Set during constraint creation or import." : null,
      rag_overridden_by: input.rag ? user.user?.id : null,
      rag_overridden_at: input.rag ? new Date().toISOString() : null,
      latest_update: input.latestUpdate || null,
      programme_forecast_impact: input.impact || null,
      notes: input.notes || null,
      closed_date: input.status === "CLOSED" ? input.closedDate || today : null,
      occurrence_count: 1,
      last_detected_date: today,
      created_by: user.user?.id,
    });
  if (error) throw error;
  const { error: historyError } = await db.from("constraint_history").insert({
    constraint_id: id,
    project_id: projectId,
    event_type: "CREATED",
    old_value: null,
    new_value: {
      category: input.category,
      description: input.description,
      status: input.status || "OPEN",
      rag: input.rag || "GREY",
      required_date: input.requiredDate || null,
    },
    changed_by: user.user?.id,
  });
  if (historyError) throw historyError;
  if (input.activityIds?.length)
    await replaceConstraintLinks(
      { id, project_id: projectId },
      input.activityIds.map((activityId) => ({
        activityId,
        relationship: input.relationship || "Blocking Progress",
      })),
    );
  return id;
}
export async function importConstraint(
  projectId: string,
  input: {
    reference?: string;
    category: string;
    description: string;
    projectWide: boolean;
    activityIds: string[];
    relationship: BlockingRelationship;
    raisedDate?: string;
    requiredDate?: string;
    owner?: string;
    responsibleOrganisation?: string;
    status: ConstraintStatus;
    rag: ConstraintRag;
    latestUpdate?: string;
    impact?: string;
    source?: string;
    notes?: string;
    closedDate?: string;
  },
) {
  const db = createClient();
  const existing = input.reference
    ? await db.from("constraints").select("*").eq("project_id", projectId).eq("constraint_reference", input.reference).maybeSingle()
    : { data: null, error: null };
  if (existing.error) throw existing.error;
  if (!existing.data) {
    return createManualConstraint(projectId, {
      activityIds: input.activityIds,
      projectWide: input.projectWide,
      relationship: input.relationship,
      category: input.category,
      description: input.description,
      requiredDate: input.requiredDate,
      owner: input.owner,
      responsibleOrganisation: input.responsibleOrganisation,
      status: input.status,
      rag: input.rag,
      latestUpdate: input.latestUpdate,
      impact: input.impact,
      source: input.source,
      notes: input.notes,
      reference: input.reference,
      closedDate: input.closedDate,
    }, input.raisedDate || new Date().toISOString().slice(0, 10));
  }
  const row = existing.data as ConstraintRecord;
  await updateConstraint(row, {
    status: input.status,
    rag: input.rag,
    owner: input.owner || null,
    responsible_organisation: input.responsibleOrganisation || null,
    calculated_required_date: input.requiredDate || null,
    latest_update: input.latestUpdate || null,
    programme_forecast_impact: input.impact || null,
    notes: input.notes || null,
  });
  await replaceConstraintLinks(row, input.activityIds.map((activityId) => ({ activityId, relationship: input.relationship })));
  return row.id;
}
