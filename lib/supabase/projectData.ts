import { createClient } from "@/lib/supabase/client";

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
