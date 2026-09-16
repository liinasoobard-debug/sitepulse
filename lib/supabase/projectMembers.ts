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

// Admin-only: lists every member of the project with their email, resolved
// server-side by the sitepulse_list_project_members RPC. Returns an empty
// list if the caller is not currently an admin of projectId.
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

// Admin-only: adds an EXISTING SitePulse user (resolved by email server-side)
// to projectId with the given role. Does not send an invitation.
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

// Admin-only under RLS (members_update_admin). The database also refuses to
// change the last admin's role away from admin.
export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: ProjectMemberRole
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sitepulse_project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// Admin-only under RLS (members_delete_admin). The database also refuses to
// remove the last admin from a project.
export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sitepulse_project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
