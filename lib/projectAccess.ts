export type ProjectMemberRole = "admin" | "planner" | "commercial" | "site_team";

export const PROJECT_MEMBER_ROLES: ProjectMemberRole[] = ["admin", "planner", "commercial", "site_team"];

const ROLE_LABELS: Record<ProjectMemberRole, string> = {
  admin: "Admin",
  planner: "Planner",
  commercial: "Commercial",
  site_team: "Site Team",
};

export function projectMemberRoleLabel(role: ProjectMemberRole): string {
  return ROLE_LABELS[role];
}

export type MinimalProjectMember = { userId: string; role: ProjectMemberRole };

// True only when removing/demoting this user would leave the project with zero
// admins. Used to show a friendly client-side warning; the database trigger
// (sitepulse_prevent_last_admin_removal) is the real enforcement.
export function isLastRemainingAdmin(members: MinimalProjectMember[], userId: string): boolean {
  const admins = members.filter((member) => member.role === "admin");
  if (admins.length !== 1) return false;
  return admins[0].userId === userId;
}
