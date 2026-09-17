import { createClient } from "@/lib/supabase/client";

export type OrganisationRole = "organisation_admin" | "member";

export type CurrentOrganisation = {
  id: string;
  name: string;
  role: OrganisationRole;
};

export type OrganisationProject = {
  id: string;
  name: string;
  code: string;
  location: string;
  archivedAt: string | null;
};

type OrganisationRow = { id: string; name: string; role: OrganisationRole };
type ProjectRow = { id: string; name: string; code: string | null; location: string | null; archived_at: string | null };

export async function loadCurrentOrganisation(): Promise<CurrentOrganisation | null> {
  const { data, error } = await createClient().rpc("sitepulse_current_organisation");
  if (error) throw new Error(error.message);
  const row = (data as OrganisationRow[] | null)?.[0];
  return row ? { id: row.id, name: row.name, role: row.role } : null;
}

export async function loadOrganisationProjects(): Promise<OrganisationProject[]> {
  const { data, error } = await createClient().rpc("sitepulse_list_organisation_projects");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProjectRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    location: row.location ?? "",
    archivedAt: row.archived_at,
  }));
}

export async function canManageProject(projectId: string): Promise<boolean> {
  const { data, error } = await createClient().rpc("sitepulse_can_manage_project", { target_project: projectId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
