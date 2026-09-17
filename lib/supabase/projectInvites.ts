import { createClient } from "@/lib/supabase/client";
import type { ProjectMemberRole } from "@/lib/projectAccess";

export type ProjectInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type ProjectInvite = {
  id: string;
  email: string;
  role: ProjectMemberRole;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: ProjectInviteStatus;
};

type InviteRow = {
  id: string;
  email: string;
  role: ProjectMemberRole;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  status: ProjectInviteStatus;
};

export async function loadProjectInvites(projectId: string): Promise<ProjectInvite[]> {
  const { data, error } = await createClient().rpc("sitepulse_list_project_invites", {
    target_project: projectId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as InviteRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    status: row.status,
  }));
}

export async function sendProjectInvite(projectId: string, email: string, role: ProjectMemberRole): Promise<void> {
  const response = await fetch("/api/project-invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, email, role }),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Unable to send the invitation.");
}

export async function revokeProjectInvite(inviteId: string): Promise<void> {
  const { error } = await createClient().rpc("sitepulse_revoke_project_invite", {
    target_invite: inviteId,
  });
  if (error) throw new Error(error.message);
}
