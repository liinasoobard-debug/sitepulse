import { createHash, randomBytes } from "node:crypto";
import type { ProjectMemberRole } from "./projectAccess.ts";

export const INVITE_EXPIRY_DAYS = 7;

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function invitationExpiry(now = new Date()): string {
  return new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isProjectMemberRole(value: unknown): value is ProjectMemberRole {
  return value === "admin" || value === "planner" || value === "commercial" || value === "site_team";
}

export function normaliseInvitationEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}
