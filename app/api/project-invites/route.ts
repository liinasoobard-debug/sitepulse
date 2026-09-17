import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createAnonymousServerClient } from "@/lib/supabase/admin";
import {
  createInvitationToken,
  invitationExpiry,
  isProjectMemberRole,
  normaliseInvitationEmail,
} from "@/lib/invitations";

export const runtime = "nodejs";

async function accountExists(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    if (data.users.some((user) => user.email?.toLowerCase() === email)) return true;
    if (data.users.length < perPage) return false;
  }
  throw new Error("Unable to check the SitePulse account directory.");
}

function invitationUrl(request: Request, token: string): string {
  const configuredOrigin = process.env.SITEPULSE_APP_URL?.trim();
  if (!configuredOrigin && process.env.NODE_ENV === "production") {
    throw new Error("SITEPULSE_APP_URL is not configured.");
  }
  const url = new URL("/invite/accept", configuredOrigin || new URL(request.url).origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = String(body?.projectId ?? "");
  const email = normaliseInvitationEmail(body?.email);
  const role = body?.role;
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !email || !isProjectMemberRole(role)) {
    return NextResponse.json({ error: "Enter a valid email, project and role." }, { status: 400 });
  }

  const { data: canManage, error: permissionError } = await supabase.rpc("sitepulse_can_manage_project", {
    target_project: projectId,
  });
  if (permissionError || !canManage) {
    return NextResponse.json({ error: "You cannot invite members to this project." }, { status: 403 });
  }

  const { data: project, error: projectError } = await supabase
    .from("sitepulse_projects")
    .select("name")
    .eq("id", projectId)
    .single();
  if (projectError || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let inviteId: string | null = null;
  try {
    createAdminClient();
    const { token, tokenHash } = createInvitationToken();
    const expiresAt = invitationExpiry();
    const { data, error: inviteError } = await supabase.rpc("sitepulse_create_project_invite", {
      target_project: projectId,
      target_email: email,
      target_role: role,
      target_token_hash: tokenHash,
      target_expires_at: expiresAt,
    });
    if (inviteError) throw inviteError;
    inviteId = String(data);

    const redirectTo = invitationUrl(request, token);
    const existingAccount = await accountExists(email);
    const deliveryResult = existingAccount
      ? await createAnonymousServerClient().auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: redirectTo,
            data: { sitepulse_project_name: project.name },
          },
        })
      : await createAdminClient().auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: { sitepulse_invited_new: true, sitepulse_project_name: project.name },
        });

    if (deliveryResult.error) {
      throw deliveryResult.error;
    }

    return NextResponse.json({ message: "Invite sent." });
  } catch (caught) {
    if (inviteId) {
      await supabase.rpc("sitepulse_revoke_project_invite", { target_invite: inviteId });
    }
    console.error("Unable to send SitePulse project invitation:", caught);
    return NextResponse.json({ error: "Unable to send the invitation right now." }, { status: 500 });
  }
}
