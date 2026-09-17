import { NextResponse } from "next/server";
import { hashInvitationToken } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in before accepting this invitation." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = String(body?.token ?? "");
  if (token.length < 32 || token.length > 256) {
    return NextResponse.json({ error: "This invitation link is invalid." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("sitepulse_accept_project_invite", {
    target_token_hash: hashInvitationToken(token),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const accepted = (data as Array<{ project_id: string; project_name: string; project_code: string | null; project_location: string | null }> | null)?.[0];
  if (!accepted) return NextResponse.json({ error: "This invitation could not be accepted." }, { status: 400 });

  return NextResponse.json({
    projectId: accepted.project_id,
    projectName: accepted.project_name,
    projectCode: accepted.project_code ?? "",
    projectLocation: accepted.project_location ?? "",
  });
}
