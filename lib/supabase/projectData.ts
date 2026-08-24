import { createClient } from "@/lib/supabase/client";

export async function createProjectMembership(projectId: string): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_create_project", { target_project: projectId });
  if (error) throw new Error(`Unable to create project membership: ${error.message}`);
}
