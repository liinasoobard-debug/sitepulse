import type { ProjectMemberRole } from "./projectAccess.ts";

export type OrganisationRole = "organisation_admin" | "member";

export function canCreateOrganisationProject(role: OrganisationRole | null): boolean {
  return role === "organisation_admin";
}

export function canManageProjectTeam(
  organisationRole: OrganisationRole | null,
  projectRole: ProjectMemberRole | null
): boolean {
  return organisationRole === "organisation_admin" || projectRole === "admin";
}

export function canReadProjectOperations(projectRole: ProjectMemberRole | null): boolean {
  return projectRole !== null;
}

export function explicitlyAllocatedProjectIds(
  memberships: Array<{ projectId: string }>
): string[] {
  return [...new Set(memberships.map((membership) => membership.projectId))];
}
