"use client";
import { createClient } from "@/lib/supabase/client";
import type {
  ConstraintRecord,
  ConstraintSuggestion,
  ConstraintStatus,
  ConstraintRag,
} from "@/lib/constraints";
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
}
export async function updateConstraint(
  row: ConstraintRecord,
  changes: {
    status?: ConstraintStatus;
    rag?: ConstraintRag;
    owner?: string | null;
    action_required?: string | null;
    latest_update?: string | null;
  },
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const today = new Date().toISOString().slice(0, 10);
  const patch = {
    ...changes,
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
      changed_by: user.user?.id,
    });
  if (historyError) throw historyError;
}
export async function createManualConstraint(
  projectId: string,
  input: {
    activityId?: string;
    category: string;
    description: string;
    requiredDate?: string;
    owner?: string;
  },
  today: string,
) {
  const db = createClient();
  const { data: user } = await db.auth.getUser();
  const key = `manual-${crypto.randomUUID()}`;
  const { error } = await db
    .from("constraints")
    .insert({
      project_id: projectId,
      programme_activity_external_id: input.activityId || null,
      category: input.category,
      description: input.description,
      source: "MANUAL",
      source_condition_key: key,
      first_detected_date: today,
      raised_date: today,
      calculated_required_date: input.requiredDate || null,
      owner: input.owner || null,
      status: "OPEN",
      rag: "GREY",
      occurrence_count: 1,
      last_detected_date: today,
      created_by: user.user?.id,
    });
  if (error) throw error;
}
