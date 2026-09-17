import { createClient } from "@/lib/supabase/client";

export async function createProjectMembership(projectId: string): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_create_project", { target_project: projectId });
  if (error) throw new Error(`Unable to create project membership: ${error.message}`);
}

// Undoes createProjectMembership() when a later step of project creation
// fails. Only ever removes the caller's own membership, and only when they
// are still the project's sole member (enforced server-side).
export async function rollbackProjectCreation(projectId: string): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_rollback_project_creation", { target_project: projectId });
  if (error) throw new Error(`Unable to roll back project membership: ${error.message}`);
}
