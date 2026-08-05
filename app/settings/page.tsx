"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  getActiveProject,
  loadAllSiteDays,
  loadOperatives,
  loadProjects,
  restoreProjectData,
  updateProject,
} from "@/lib/storage";
import { DEFAULT_LABOUR_RATE_SETTINGS, normaliseLabourRateSettings } from "@/lib/labourRates";
import {
  PROJECT_BACKUP_SCHEMA_VERSION,
  type BackupPreview,
  type ProjectBackup,
  validateProjectBackup,
} from "@/lib/projectBackup";
import type { LabourRateSettings, Project } from "@/types/site";

interface FileSystemWritableFileStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle>;

function formatDate(date: string | null): string {
  if (!date) return "No dated records";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function exportTimestamp(): string {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}_${time}`;
}

function safeCode(project: Project): string {
  return (project.code || project.name || "Project").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function SummaryCard({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ padding: 14, border: "1px solid #d7dde3", borderRadius: 12, background: "#fff" }}><span style={{ display: "block", marginBottom: 5, color: "#687580", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>{label}</span><strong>{value}</strong></div>;
}

export default function SettingsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [exportedBy, setExportedBy] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [matchingProject, setMatchingProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [rateSettings, setRateSettings] = useState<LabourRateSettings>(DEFAULT_LABOUR_RATE_SETTINGS);
  const [companies, setCompanies] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        const activeProject = getActiveProject();
        setProject(activeProject);
        setRateSettings(normaliseLabourRateSettings(activeProject?.labourRateSettings));
        setCompanies([...new Set(loadOperatives().map((operative) => operative.company.trim()).filter(Boolean))].sort());
      }
    });
    return () => { cancelled = true; };
  }, []);

  function saveRateSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rateSettings.backshiftStart) || !Number.isFinite(rateSettings.backshiftMultiplier) || rateSettings.backshiftMultiplier <= 0) {
      setError("Enter a valid backshift start time and a multiplier above zero.");
      return;
    }
    const nextProject = { ...project, labourRateSettings: normaliseLabourRateSettings(rateSettings) };
    updateProject(nextProject);
    setProject(nextProject);
    setRateSettings(nextProject.labourRateSettings);
    setError("");
    setMessage("Labour rate criteria saved for this project.");
  }

  function toggleCompanyRule(company: string, enabled: boolean) {
    setRateSettings((current) => ({
      ...current,
      companyRules: enabled
        ? [...current.companyRules, { company, backshiftStart: current.backshiftStart, backshiftMultiplier: current.backshiftMultiplier }]
        : current.companyRules.filter((rule) => rule.company !== company),
    }));
  }

  function updateCompanyRule(company: string, field: "backshiftStart" | "backshiftMultiplier", value: string) {
    setRateSettings((current) => ({
      ...current,
      companyRules: current.companyRules.map((rule) => rule.company === company
        ? { ...rule, [field]: field === "backshiftMultiplier" ? Number(value) : value }
        : rule),
    }));
  }

  async function exportProject() {
    const activeProject = getActiveProject();
    if (!activeProject) {
      setError("No active project is available to export.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const siteDays = loadAllSiteDays(activeProject.id);
      const referencedIds = new Set(siteDays.flatMap((day) => [
        ...day.attendance.map((record) => String(record.operativeId)),
        ...(day.crews ?? []).flatMap((crew) => crew.operativeIds.map(String)),
        ...day.events.flatMap((event) => event.affectedOperativeIds?.map(String) ?? []),
      ]));
      const backup: ProjectBackup = {
        SchemaVersion: PROJECT_BACKUP_SCHEMA_VERSION,
        ExportedAt: new Date().toISOString(),
        ...(exportedBy.trim() ? { ExportedBy: exportedBy.trim() } : {}),
        ProjectId: activeProject.id,
        Project: activeProject,
        ProgrammeActivities: [],
        Operatives: loadOperatives().filter((operative) => referencedIds.has(String(operative.id))),
        SiteDays: siteDays.map((day) => ({ ...day, events: [] })),
        ReportData: { Mode: "derived", GeneratedFrom: ["ProgrammeActivities", "SiteDays"] },
      };
      const filename = `SitePulse_${safeCode(activeProject)}_${exportTimestamp()}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
      if (picker) {
        const handle = await picker({ suggestedName: filename, types: [{ description: "SitePulse project backup", accept: { "application/json": [".json"] } }] });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setMessage(`Project exported successfully as ${filename}.`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") setMessage("Export cancelled. No file was written.");
      else setError(caught instanceof Error ? caught.message : "Unable to export the project.");
    } finally {
      setWorking(false);
    }
  }

  async function selectImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPreview(null);
    setMatchingProject(null);
    setMessage("");
    setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Select a SitePulse JSON backup file.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validated = validateProjectBackup(parsed);
      setPreview(validated);
      setMatchingProject(loadProjects().find((item) => item.id === validated.backup.ProjectId) ?? null);
    } catch (caught) {
      setError(caught instanceof SyntaxError ? "The selected file is not valid JSON." : caught instanceof Error ? caught.message : "Unable to validate the selected file.");
    }
  }

  function importBackup(mode: "new" | "replace") {
    if (!preview) return;
    if (mode === "replace" && !matchingProject) {
      setError("No matching local project exists to replace.");
      return;
    }
    const action = mode === "new"
      ? `Import “${preview.backup.Project.name}” as a new project?`
      : `Replace “${matchingProject?.name}” with this backup? Existing programme and daily records for that project will be overwritten.`;
    if (!window.confirm(action)) return;
    setError("");
    setMessage("");
    try {
      restoreProjectData({
        project: preview.backup.Project,
        programmeActivities: preview.backup.ProgrammeActivities,
        operatives: preview.backup.Operatives,
        siteDays: preview.backup.SiteDays,
      }, mode);
      setMessage(mode === "new" ? "Project imported successfully as a new project." : "Matching project replaced successfully.");
      setPreview(null);
      setMatchingProject(null);
      setProject(getActiveProject());
      window.setTimeout(() => window.location.assign("/settings"), 500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to import the project.");
    }
  }

  return <main className="timeline-page"><section className="timeline-panel">
    <header className="timeline-header"><div><p className="eyebrow">Current project</p><h1>Settings</h1><p style={{ marginBottom: 0, color: "#5f6b76" }}>{project?.name ?? "Loading project…"}</p></div></header>

    <div role="alert" style={{ padding: 16, marginBottom: 28, border: "1px solid #d39b22", borderRadius: 12, background: "#fff8e7", color: "#684b0c", fontWeight: 700 }}>
      SitePulse shared-drive files are not live multi-user data. Only one person should edit the project file at a time.
    </div>

    {error && <p role="alert" style={{ padding: 14, borderRadius: 10, background: "#fff0ee", color: "#b42318", fontWeight: 700 }}>{error}</p>}
    {message && <p role="status" style={{ padding: 14, borderRadius: 10, background: "#eaf7ef", color: "#17633a", fontWeight: 700 }}>{message}</p>}

    <section style={{ marginBottom: 36 }}>
      <p className="eyebrow">Commercial criteria</p>
      <h2>Labour rate rules</h2>
      <form onSubmit={saveRateSettings} style={{ display: "grid", gap: 18, maxWidth: 760 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <label className="attendance-field"><span>Backshift starts</span><input type="time" value={rateSettings.backshiftStart} onChange={(event) => setRateSettings((current) => ({ ...current, backshiftStart: event.target.value }))} required /></label>
          <label className="attendance-field"><span>Backshift rate multiplier</span><input type="number" min="0.01" step="0.01" value={rateSettings.backshiftMultiplier} onChange={(event) => setRateSettings((current) => ({ ...current, backshiftMultiplier: Number(event.target.value) }))} required /></label>
        </div>

        {companies.length > 0 && <fieldset style={{ display: "grid", gap: 12, margin: 0, padding: 14, border: "1px solid #d7dde3", borderRadius: 8 }}>
          <legend style={{ padding: "0 5px", fontWeight: 800 }}>Company overrides</legend>
          {companies.map((company) => {
            const rule = rateSettings.companyRules.find((item) => item.company === company);
            return <div key={company} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) repeat(2, minmax(130px, 180px))", gap: 10, alignItems: "end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 42 }}><input type="checkbox" checked={Boolean(rule)} onChange={(event) => toggleCompanyRule(company, event.target.checked)} /><strong>{company}</strong></label>
              <label className="attendance-field"><span>Starts</span><input type="time" disabled={!rule} value={rule?.backshiftStart ?? rateSettings.backshiftStart} onChange={(event) => updateCompanyRule(company, "backshiftStart", event.target.value)} /></label>
              <label className="attendance-field"><span>Multiplier</span><input type="number" min="0.01" step="0.01" disabled={!rule} value={rule?.backshiftMultiplier ?? rateSettings.backshiftMultiplier} onChange={(event) => updateCompanyRule(company, "backshiftMultiplier", event.target.value)} /></label>
            </div>;
          })}
        </fieldset>}
        <button type="submit" className="primary-button" disabled={!project}>Save Labour Rate Rules</button>
      </form>
    </section>

    <section style={{ marginBottom: 36 }}><p className="eyebrow">Backup</p><h2>Export project</h2><p>Save the active project as one portable JSON file. On supported browsers, choose a OneDrive, SharePoint-synchronised, or network shared-drive folder directly.</p>
      <label style={{ display: "grid", gap: 6, maxWidth: 420, marginBottom: 14, fontWeight: 700 }}>Exported by <span style={{ color: "#687580", fontSize: 13, fontWeight: 400 }}>Optional</span><input value={exportedBy} onChange={(event) => setExportedBy(event.target.value)} placeholder="Name or initials" style={{ minHeight: 42, padding: "8px 10px" }} /></label>
      <button type="button" className="primary-button" onClick={exportProject} disabled={working || !project}>{working ? "Preparing export…" : "Export Current Project"}</button>
    </section>

    <section><p className="eyebrow">Restore</p><h2>Import project</h2><p>Select a SitePulse JSON backup. Nothing is changed until the file passes validation and you confirm an import option.</p>
      <input ref={fileInput} type="file" accept="application/json,.json" onChange={selectImport} style={{ display: "none" }} />
      <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}>Choose SitePulse JSON File</button>

      {preview && <div style={{ marginTop: 20, padding: 18, border: "1px solid #d7dde3", borderRadius: 14, background: "#f7f9fa" }}>
        <h3 style={{ marginTop: 0 }}>Validated backup: {preview.backup.Project.name}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
          <SummaryCard label="Date range" value={preview.firstDate ? `${formatDate(preview.firstDate)} – ${formatDate(preview.lastDate)}` : "No dated records"} />
          <SummaryCard label="Programme activities" value={preview.backup.ProgrammeActivities.length} />
          <SummaryCard label="Operatives" value={preview.backup.Operatives.length} />
          <SummaryCard label="Daily records" value={preview.backup.SiteDays.length} />
          <SummaryCard label="Timeline events" value={preview.timelineEvents} />
          <SummaryCard label="Schema version" value={preview.backup.SchemaVersion} />
        </div>
        <p><strong>Exported:</strong> {new Date(preview.backup.ExportedAt).toLocaleString("en-GB")}{preview.backup.ExportedBy ? ` by ${preview.backup.ExportedBy}` : ""}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="primary-button" onClick={() => importBackup("new")}>Import as a New Project</button>
          <button type="button" className="secondary-button" disabled={!matchingProject} onClick={() => importBackup("replace")}>Replace Matching Project</button>
          <button type="button" className="secondary-button" onClick={() => { setPreview(null); setMatchingProject(null); setMessage("Import cancelled. No data was changed."); }}>Cancel</button>
        </div>
        {!matchingProject && <p style={{ marginBottom: 0, color: "#687580" }}>Replace is unavailable because this browser has no project matching ProjectId {preview.backup.ProjectId}.</p>}
      </div>}
    </section>
  </section></main>;
}
