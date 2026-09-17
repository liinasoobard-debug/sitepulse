"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import UsersAccessPanel from "@/components/UsersAccessPanel";
import {
  loadCurrentOrganisation,
  loadOrganisationProjects,
  type CurrentOrganisation,
  type OrganisationProject,
} from "@/lib/supabase/organisationData";

export default function OrganisationPanel({ activeProjectId }: { activeProjectId?: string }) {
  const [organisation, setOrganisation] = useState<CurrentOrganisation | null>(null);
  const [projects, setProjects] = useState<OrganisationProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await loadCurrentOrganisation();
      setOrganisation(current);
      if (current?.role === "organisation_admin") {
        const rows = await loadOrganisationProjects();
        setProjects(rows);
        setSelectedProjectId((value) => value || rows.find((row) => !row.archivedAt)?.id || rows[0]?.id || "");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load organisation settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loading && organisation?.role !== "organisation_admin") return null;
  if (loading) return null;

  return (
    <section style={{ marginBottom: 36 }}>
      <p className="eyebrow">Organisation</p>
      <h2>{organisation?.name ?? "Organisation"}</h2>
      <p>Manage organisation projects and their Project Teams.</p>
      {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}

      <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <label className="attendance-field" style={{ minWidth: 280 }}>
          <span>Projects</span>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code ? `${project.code} — ${project.name}` : project.name}{project.archivedAt ? " (Archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary-button"
          style={{ width: "auto", minHeight: 42, marginTop: 0, padding: "9px 18px" }}
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            document.getElementById("sitepulse-new-project")?.click();
          }}
        >
          Create project
        </button>
      </div>

      {selectedProjectId && selectedProjectId !== activeProjectId && <UsersAccessPanel projectId={selectedProjectId} />}
    </section>
  );
}
