import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/types/site";

export async function createOrganisationProject(
  projectId: string,
  name: string,
  code: string,
  location: string
): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_create_organisation_project", {
    target_project: projectId,
    target_name: name,
    target_code: code || null,
    target_location: location || null,
  });
  if (error) throw new Error(`Unable to create project: ${error.message}`);
}

// Undoes createOrganisationProject() when a later compatibility write fails.
// fails. Only ever removes the caller's own membership, and only when they
// are still the project's sole member (enforced server-side).
export async function rollbackProjectCreation(projectId: string): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_rollback_project_creation", { target_project: projectId });
  if (error) throw new Error(`Unable to roll back project membership: ${error.message}`);
}

export async function setCanonicalProjectArchived(projectId: string, archived: boolean): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_set_project_archived", {
    target_project: projectId,
    target_archived: archived,
  });
  if (error) throw new Error(error.message);
}

type CanonicalProjectRow = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  created_at: string;
  archived_at: string | null;
  settings: Record<string, unknown> | null;
};

/** Projects the signed-in user can see (enforced by RLS on sitepulse_projects). */
export async function loadAccessibleProjects(): Promise<Project[]> {
  const { data, error } = await createClient()
    .from("sitepulse_projects")
    .select("id,name,code,location,created_at,archived_at,settings")
    .order("name");
  if (error) throw new Error(`Unable to load projects: ${error.message}`);
  return ((data ?? []) as CanonicalProjectRow[]).map((row) => {
    const settings = row.settings ?? {};
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? "",
      location: row.location ?? "",
      createdAt: row.created_at,
      isArchived: Boolean(row.archived_at),
      labourRateSettings: settings.labourRateSettings as Project["labourRateSettings"],
      productivityFactorThresholds: settings.productivityFactorThresholds as Project["productivityFactorThresholds"],
      hoursPerManDay: typeof settings.hoursPerManDay === "number" ? settings.hoursPerManDay : undefined,
    };
  });
}

/** Persists per-project settings to the protected projects table. */
export async function saveProjectSettings(project: Project): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_update_project_settings", {
    target_project: project.id,
    target_settings: {
      labourRateSettings: project.labourRateSettings ?? null,
      productivityFactorThresholds: project.productivityFactorThresholds ?? null,
      hoursPerManDay: project.hoursPerManDay ?? null,
    },
  });
  if (error) throw new Error(`Unable to save project settings: ${error.message}`);
}
