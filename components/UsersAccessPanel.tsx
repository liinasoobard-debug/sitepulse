"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  addProjectMember,
  loadProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
  type ProjectMember,
} from "@/lib/supabase/projectMembers";
import { canManageProject } from "@/lib/supabase/organisationData";
import { isLastRemainingAdmin, projectMemberRoleLabel, PROJECT_MEMBER_ROLES, type ProjectMemberRole } from "@/lib/projectAccess";

export default function UsersAccessPanel({ projectId }: { projectId: string }) {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectMemberRole>("site_team");
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const allowed = await canManageProject(projectId);
      setCanManage(allowed);
      setMembers(allowed ? await loadProjectMembers(projectId) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load project members.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setError("");
    setMessage("");
    void refresh();
  }, [refresh]);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter the email address of an existing SitePulse user.");
      return;
    }
    setAdding(true);
    setError("");
    setMessage("");
    try {
      await addProjectMember(projectId, trimmedEmail, role);
      setEmail("");
      setRole("site_team");
      setMessage(`${trimmedEmail} was given ${projectMemberRoleLabel(role)} access.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add this user.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(member: ProjectMember, nextRole: ProjectMemberRole) {
    setBusyUserId(member.userId);
    setError("");
    setMessage("");
    try {
      await updateProjectMemberRole(projectId, member.userId, nextRole);
      setMessage(`${member.email ?? "Member"}'s role was changed to ${projectMemberRoleLabel(nextRole)}.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change this member's role.");
    } finally {
      setBusyUserId("");
    }
  }

  async function handleRemove(member: ProjectMember) {
    if (!window.confirm(`Remove ${member.email ?? "this member"}'s access to this project?`)) return;
    setBusyUserId(member.userId);
    setError("");
    setMessage("");
    try {
      await removeProjectMember(projectId, member.userId);
      setMessage(`${member.email ?? "Member"}'s access was removed.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove this member's access.");
    } finally {
      setBusyUserId("");
    }
  }

  if (canManage === false) return null;

  return (
    <section style={{ marginBottom: 36 }}>
      <p className="eyebrow">Access</p>
      <h2>Project Team &amp; Access</h2>
      <p>Manage who can access this project and their role.</p>

      {loading && canManage === null && <p>Loading project team &amp; access…</p>}

      {canManage && (
        <>
          {error && <p role="alert" style={{ padding: 14, borderRadius: 10, background: "#fff0ee", color: "#b42318", fontWeight: 700 }}>{error}</p>}
          {message && <p role="status" style={{ padding: 14, borderRadius: 10, background: "#eaf7ef", color: "#17633a", fontWeight: 700 }}>{message}</p>}

          <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
            {members.map((member) => {
              const protectedAsLastAdmin = isLastRemainingAdmin(members, member.userId);
              const removeDisabled = busyUserId === member.userId || member.isCurrentUser || protectedAsLastAdmin;
              return (
                <div key={member.userId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 12, border: "1px solid #d7dde3", borderRadius: 10, background: "#fff" }}>
                  <div style={{ minWidth: 200 }}>
                    <strong>{member.email ?? `User ${member.userId.slice(0, 8)}`}</strong>
                    {member.isCurrentUser && <span style={{ marginLeft: 8, color: "#687580", fontSize: 12, fontWeight: 700 }}>(You)</span>}
                  </div>
                  <select
                    value={member.role}
                    disabled={busyUserId === member.userId || protectedAsLastAdmin}
                    onChange={(event) => void handleRoleChange(member, event.target.value as ProjectMemberRole)}
                    style={{ minHeight: 38, padding: "6px 8px" }}
                  >
                    {PROJECT_MEMBER_ROLES.map((option) => (
                      <option key={option} value={option}>{projectMemberRoleLabel(option)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={removeDisabled}
                    title={member.isCurrentUser
                      ? "You cannot remove your own access here."
                      : protectedAsLastAdmin
                        ? "A project must always have at least one admin."
                        : undefined}
                    onClick={() => void handleRemove(member)}
                  >
                    Remove access
                  </button>
                </div>
              );
            })}
            {!members.length && !loading && <p style={{ color: "#687580" }}>No members found.</p>}
          </div>

          <form onSubmit={handleAdd} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label className="attendance-field" style={{ minWidth: 260 }}>
              <span>Add team member</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            </label>
            <label className="attendance-field">
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as ProjectMemberRole)}>
                {PROJECT_MEMBER_ROLES.map((option) => (
                  <option key={option} value={option}>{projectMemberRoleLabel(option)}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary-button" style={{ width: "auto", minHeight: 42, marginTop: 0, padding: "9px 18px" }} disabled={adding}>
              {adding ? "Adding…" : "Add access"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
