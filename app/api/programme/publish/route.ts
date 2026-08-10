import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { importId } = await request.json() as { importId?: string };
  if (!importId) return NextResponse.json({ error: "Import ID required." }, { status: 400 });
  const { data: programmeImport, error: importError } = await supabase.from("programme_imports").select("project_id").eq("id", importId).maybeSingle();
  if (importError || !programmeImport) return NextResponse.json({ error: importError?.message ?? "Draft programme import not found." }, { status: 404 });
  const projectId = String(programmeImport.project_id);
  const { data: membership, error: membershipError } = await supabase.from("sitepulse_project_members").select("project_id,user_id,role").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
  console.info("Programme publish authorization", { userId: user.id, projectId, importId, membership, membershipError: membershipError?.message ?? null });
  if (membershipError) return NextResponse.json({ error: `Unable to verify project membership: ${membershipError.message}` }, { status: 500 });
  if (!membership || !["planner", "admin"].includes(membership.role)) return NextResponse.json({ error: "Only a Project Admin or Planner can publish programme imports.", diagnostic: { userId: user.id, projectId, membership } }, { status: 403 });
  const { error } = await supabase.rpc("publish_programme_import", { target_import: importId });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ status: "published" });
}
