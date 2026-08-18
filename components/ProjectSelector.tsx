"use client";

import {
  addProject,
  archiveProject,
  getActiveProjectId,
  loadProjects,
  setActiveProject,
  updateProject,
} from "@/lib/storage";
import type { Project } from "@/types/site";
import { flushSharedWrite } from "@/lib/sharedSync";
import { PROJECTS_STORAGE_KEY } from "@/lib/storage";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import UserIndicator from "@/components/UserIndicator";

export default function ProjectSelector() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");

  function refreshProjects() {
    const allProjects = loadProjects();
    setProjects(allProjects.filter((project) => !project.isArchived));
    setArchivedProjects(allProjects.filter((project) => project.isArchived));
    setActiveProjectIdState(getActiveProjectId());
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refreshProjects();
    });

    function handleProjectChange() {
      refreshProjects();
    }

    window.addEventListener("sitepulse-project-changed", handleProjectChange);
    return () => {
      cancelled = true;
      window.removeEventListener("sitepulse-project-changed", handleProjectChange);
    };
  }, []);

  function reloadCurrentPage() {
    window.location.assign(pathname || "/");
  }

  function handleSelect(projectId: string) {
    setActiveProject(projectId);
    setActiveProjectIdState(projectId);
    reloadCurrentPage();
  }

  function handleAddProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Enter a project name.");
      return;
    }

    if (
      projects.some(
        (project) => project.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      setError("A project with this name already exists.");
      return;
    }

    const updatedProjects = addProject({
      name: trimmedName,
      code: code.trim(),
      location: location.trim(),
      isArchived: false,
    });

    setProjects(updatedProjects.filter((project) => !project.isArchived));
    setActiveProjectIdState(getActiveProjectId());
    setName("");
    setCode("");
    setLocation("");
    setError("");
    setShowForm(false);
    reloadCurrentPage();
  }

  async function handleArchiveProject() {
    const active = projects.find((project) => project.id === activeProjectId);
    if (!active) return;
    if (projects.length === 1) {
      setError("Create another active project before archiving this one.");
      return;
    }
    if (!window.confirm(`Archive “${active.name}”? It will be hidden, but its records and audit history will not be deleted.`)) return;
    const updatedProjects = archiveProject(active.id);
    await flushSharedWrite(PROJECTS_STORAGE_KEY, updatedProjects);
    reloadCurrentPage();
  }

  async function handleRestoreProject(project: Project) {
    const updatedProjects = updateProject({ ...project, isArchived: false });
    await flushSharedWrite(PROJECTS_STORAGE_KEY, updatedProjects);
    setActiveProject(project.id);
    reloadCurrentPage();
  }

  return (
    <section
      className="project-selector"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "10px 16px",
        borderBottom: "1px solid #d7dde3",
        background: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="project-selector-inner" style={{ width: "100%", maxWidth: 1100, margin: "0 auto" }}>
        <div
          className="project-selector-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <label
            htmlFor="sitepulse-project"
            style={{ fontSize: 13, fontWeight: 800, color: "#4a5560" }}
          >
            PROJECT
          </label>

          <select
            className="project-selector-select"
            id="sitepulse-project"
            value={activeProjectId}
            onChange={(event) => handleSelect(event.target.value)}
            style={{
              minWidth: 220,
              minHeight: 40,
              padding: "8px 38px 8px 11px",
              border: "1px solid #bfc8d0",
              borderRadius: 10,
              background: "#ffffff",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code ? `${project.code} — ${project.name}` : project.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setShowForm((current) => !current);
              setError("");
            }}
          >
            {showForm ? "Cancel" : "+ New Project"}
          </button>
          <button type="button" className="secondary-button" onClick={handleArchiveProject} disabled={!activeProjectId}>
            Archive Project
          </button>
          <UserIndicator />
        </div>

        {archivedProjects.length > 0 && <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#4a5560" }}>Archived projects ({archivedProjects.length})</summary>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {archivedProjects.map((project) => <button type="button" className="secondary-button" key={project.id} onClick={() => void handleRestoreProject(project)}>Restore {project.name}</button>)}
          </div>
        </details>}

        {showForm && (
          <form
            onSubmit={handleAddProject}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
              marginTop: 12,
              padding: 14,
              border: "1px solid #d7dde3",
              borderRadius: 12,
              background: "#f7f9fa",
            }}
          >
            <label>
              <span style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: 700 }}>
                Project name *
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Hinkley Point C"
                autoFocus
                style={{ width: "100%", minHeight: 40, padding: "8px 10px" }}
              />
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: 700 }}>
                Project code
              </span>
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="e.g. HVB"
                style={{ width: "100%", minHeight: 40, padding: "8px 10px" }}
              />
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: 700 }}>
                Location
              </span>
              <input
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="e.g. Somerset"
                style={{ width: "100%", minHeight: 40, padding: "8px 10px" }}
              />
            </label>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button type="submit" className="primary-button" style={{ width: "100%" }}>
                Create Project
              </button>
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  gridColumn: "1 / -1",
                  margin: 0,
                  color: "#b42318",
                  fontWeight: 700,
                }}
              >
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
