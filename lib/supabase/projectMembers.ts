import { createClient } from "@/lib/supabase/client";
import type { ProjectMemberRole } from "@/lib/projectAccess";

export type { ProjectMemberRole } from "@/lib/projectAccess";

export type ProjectMember = {
  projectId: string;
  userId: string;
  email: string | null;
  role: ProjectMemberRole;
  createdAt: string;
  isCurrentUser: boolean;
};

// Lists members for callers authorized by the server as Project Admin or
// Organisation Admin; email resolution stays inside the RPC.
export async function loadProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const { data, error } = await supabase.rpc("sitepulse_list_project_members", {
    target_project: projectId,
  });
  if (error) throw new Error(error.message);

  type MemberRow = {
    project_id: string;
    user_id: string;
    email: string | null;
    role: ProjectMemberRole;
    created_at: string;
  };

  return ((data ?? []) as MemberRow[]).map((row) => ({
    projectId: String(row.project_id),
    userId: String(row.user_id),
    email: row.email ?? null,
    role: row.role as ProjectMemberRole,
    createdAt: row.created_at,
    isCurrentUser: row.user_id === user?.id,
  }));
}

// Adds an existing SitePulse account through the guarded management RPC.
export async function addProjectMember(
  projectId: string,
  email: string,
  role: ProjectMemberRole
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("sitepulse_add_project_member", {
    target_project: projectId,
    target_email: email.trim(),
    target_role: role,
  });
  if (error) throw new Error(error.message);
}

// The guarded RPC authorizes Project/Organisation Admins and preserves the
// database's final Project Admin protection.
export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectMemberRole
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("sitepulse_update_project_member_role", {
    target_project: projectId,
    target_user: userId,
    target_role: role,
  });
  if (error) throw new Error(error.message);
}

// The guarded RPC authorizes Project/Organisation Admins and preserves the
// database's final Project Admin protection.
export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("sitepulse_remove_project_member", {
    target_project: projectId,
    target_user: userId,
  });
  if (error) throw new Error(error.message);
}
