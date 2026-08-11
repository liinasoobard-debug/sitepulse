"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductivityRagBadge from "@/components/ProductivityRagBadge";
import { productivityPerformance, productivityRag, productivityRagLabels, ragDistribution, type ProductivityRag } from "@/lib/productivityRag";
import { getActiveProjectId } from "@/lib/storage";
import {
  loadProgrammeImports,
  loadActualProductivity,
  loadProjectRole,
  loadPublishedProgramme,
  updateProgrammeBaseline,
} from "@/lib/supabase/programmeData";
import type { ProgrammeActivity } from "@/types/site";

type ImportIssue = {
  sheet: string;
  rowNumber?: number;
  activityId?: string;
  severity: "error" | "warning";
  message: string;
};

type ImportPreview = {
  importId: string;
  status: "draft" | "failed";
  filename: string;
  activities: number;
  relationships: number;
  resources: number;
  assignments: number;
  issues: ImportIssue[];
};

type ImportSource = "sitepulse-template" | "p6-xlsx" | "asta-xlsx";
const sourceLabels: Record<ImportSource, string> = { "sitepulse-template": "SitePulse Programme (.xlsx)", "p6-xlsx": "Primavera P6 Programme (.xlsx)", "asta-xlsx": "Asta Powerproject Programme (.xlsx)" };

const activityTypeKeywords: Record<string, string[]> = {
  design: ["design", "drawing", "engineering"],
  install: ["install", "installation", "erection"],
  calculations: ["calculation", "calculations", "calc"],
  "shop-issue": ["shop issue", "shop drawing", "issued for fabrication"],
  procurement: ["procurement", "purchase", "order material"],
  "bylor-handover": ["bylor handover", "handover to bylor"],
  constraint: ["constraint", "hold point"],
  "alumet-handover": ["alumet handover", "handover to alumet"],
  remedials: ["remedial", "rectification", "snag"],
};

const touchButtonStyle = {
  minHeight: 54,
  minWidth: 190,
  padding: "14px 20px",
  justifyContent: "center",
} as const;

const formatNumber = (value?: number) =>
  value === undefined
    ? "—"
    : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export default function ProgrammePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]);
  const [actualProductivity, setActualProductivity] = useState<Record<string, number>>({});
  const [imports, setImports] = useState<Record<string, unknown>[]>([]);
  const [role, setRole] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [buildingDefault, setBuildingDefault] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importSource, setImportSource] = useState<ImportSource>("sitepulse-template");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    building: "",
    elevation: "",
    level: "",
    gridline: "",
    status: "",
    completion: "",
    activityType: "",
    productivityRag: "",
  });
  const [edit, setEdit] = useState<ProgrammeActivity | null>(null);
  const [crewSize, setCrewSize] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const canManage = role === "planner" || role === "admin";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const projectId = getActiveProjectId();
      const [programme, history, currentRole, productivity] = await Promise.all([
        loadPublishedProgramme(projectId),
        loadProgrammeImports(projectId),
        loadProjectRole(projectId),
        loadActualProductivity(projectId),
      ]);
      setActivities(programme.activities);
      setImports(history as Record<string, unknown>[]);
      setRole(currentRole);
      setActualProductivity(productivity);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load programme from Supabase."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const changed = () => void refresh();
    window.addEventListener("sitepulse-project-changed", changed);
    return () => window.removeEventListener("sitepulse-project-changed", changed);
  }, [refresh]);

  function selectWorkbook(file: File | undefined) {
    if (!file) return;
    setSelectedFile(file);
    setPreview(null);
    setMessage("");
    setError("");
  }

  function cancelImport() {
    setSelectedFile(null);
    setPreview(null);
    setMessage("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function reviewImport() {
    if (!selectedFile || !canManage) return;
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const form = new FormData();
      form.set("file", selectedFile, selectedFile.name);
      form.set("projectId", getActiveProjectId());
      form.set("building", buildingDefault);
      form.set("sourceType", importSource);
      const response = await fetch("/api/programme/import", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      const projectId = getActiveProjectId();
      const history = await loadProgrammeImports(projectId);
      const storedImport = history.find((item) => String(item.id) === String(body.importId));
      const summary = body.summary && typeof body.summary === "object" ? body.summary : {};
      const activityCount = Number(summary.activities ?? body.activityCount ?? storedImport?.activity_count ?? 0);
      const relationshipCount = Number(summary.relationships ?? body.relationshipCount ?? storedImport?.relationship_count ?? 0);
      const resourceCount = Number(summary.resources ?? body.resourceCount ?? storedImport?.resource_count ?? 0);
      const assignmentCount = Number(summary.assignments ?? body.assignmentCount ?? storedImport?.assignment_count ?? 0);
      const storedValidation = storedImport?.validation_summary && typeof storedImport.validation_summary === "object"
        ? storedImport.validation_summary as { issues?: ImportIssue[] }
        : undefined;
      const result: ImportPreview = {
        importId: String(body.importId ?? ""),
        status: body.status === "draft" ? "draft" : "failed",
        filename: selectedFile.name,
        activities: activityCount,
        relationships: relationshipCount,
        resources: resourceCount,
        assignments: assignmentCount,
        issues: Array.isArray(summary.issues) ? summary.issues : Array.isArray(storedValidation?.issues) ? storedValidation.issues : [],
      };
      setPreview(result);
      if (!response.ok) {
        setError(
          body.error ||
            result.issues.find((issue) => issue.severity === "error")?.message ||
            "Workbook validation failed."
        );
        return;
      }
      if (result.activities < 1) {
        setPreview({ ...result, status: "failed" });
        setError("The workbook returned no programme activities. Publishing has been blocked; select the workbook and review it again.");
        return;
      }
      setMessage("Workbook parsed successfully. Review the import before publishing.");
      await refresh();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : "Import review failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish(importId: string) {
    if (!canManage || !importId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/programme/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publish failed.");
      setMessage("Programme update published successfully.");
      setSelectedFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Publish failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveBaseline() {
    if (!edit || !unit.trim() || !(Number(rate) > 0) || !Number.isInteger(Number(crewSize)) || Number(crewSize) < 1) {
      setError("Unit, Planned Man-Day Productivity, and Assumed Gang Size are required.");
      return;
    }
    try {
      await updateProgrammeBaseline(edit.id, unit.trim(), Number(rate), Number(crewSize));
      setEdit(null);
      setMessage("Productivity baseline updated.");
      await refresh();
    } catch (baselineError) {
      setError(
        baselineError instanceof Error
          ? baselineError.message
          : "Unable to update baseline."
      );
    }
  }

  const options = useMemo(
    () => ({
      buildings: [...new Set(activities.map((item) => item.building).filter(Boolean))].sort(),
      elevations: [...new Set(activities.map((item) => item.elevation).filter(Boolean))].sort(),
      levels: [...new Set(activities.map((item) => item.level).filter(Boolean))].sort(),
      gridlines: [...new Set(activities.map((item) => item.gridline).filter((value): value is string => Boolean(value)))].sort(),
      statuses: [...new Set(activities.map((item) => item.activityStatus).filter((value): value is string => Boolean(value)))].sort(),
    }),
    [activities]
  );
  const publishedImport = imports.find((row) => row.status === "published");
  const publishedSource = publishedImport?.source_type as ImportSource | undefined;

  const productivityRows = useMemo(() => activities.map((item) => {
    const actual = actualProductivity[item.programmeActivityId];
    const rag = productivityRag(item.plannedManDayProductivity, actual);
    return { item, actual, rag, performance: productivityPerformance(item.plannedManDayProductivity, actual) };
  }), [activities, actualProductivity]);
  const ragSummary = useMemo(() => ragDistribution(productivityRows.map((row) => row.rag)), [productivityRows]);

  const filtered = useMemo(
    () =>
      productivityRows.filter(({ item, rag }) => {
        const query = search.toLowerCase();
        const name = `${item.activityName} ${item.programmeActivityId}`.toLowerCase();
        const typeName = `${item.activityName} ${item.workActivity}`.toLowerCase();
        return (
          (!query || name.includes(query)) &&
          (!filters.building || item.building === filters.building) &&
          (!filters.elevation || item.elevation === filters.elevation) &&
          (!filters.level || item.level === filters.level) &&
          (!filters.gridline || item.gridline === filters.gridline) &&
          (!filters.status || item.activityStatus === filters.status) &&
          (!filters.completion ||
            (filters.completion === "completed") ===
              (item.activityStatus?.toLowerCase() === "completed")) &&
          (!filters.activityType ||
            (activityTypeKeywords[filters.activityType] || []).some((keyword) =>
              typeName.includes(keyword)
            )) &&
          (!filters.productivityRag || rag === filters.productivityRag)
        );
      }),
    [filters, productivityRows, search]
  );

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow">Project Setup</p>
            <h1>Programme</h1>
            <p>Published programme data is shared securely through Supabase.</p>
          </div>
          <div className="page-actions" style={{ display: "flex", gap: 10 }}>
            <Link href="/crews" className="secondary-button">Gangs</Link>
            <Link href="/timeline" className="secondary-button">Timeline</Link>
          </div>
        </header>

        <section style={{ padding: 20, border: "1px solid #d7dde3", borderRadius: 18, marginBottom: 20, background: "#f7f9fa" }}>
          <div className="programme-import-heading"><div><h2>Import Programme</h2><p>Choose a source. Every workbook is validated and mapped into the same SitePulse programme model before publication.</p></div><div><strong>Programme Source</strong><span>{publishedSource ? sourceLabels[publishedSource] ?? String(publishedImport?.source_type) : "No published programme"}</span>{publishedImport?.imported_at ? <small>Last import: {new Date(String(publishedImport.imported_at)).toLocaleString("en-GB")}</small> : null}</div></div>

          <div style={{ display: "grid", gap: 16 }}>
              <label className="attendance-field" style={{ maxWidth: 460 }}>
                <span>Import format</span>
                <select
                  value={importSource}
                  disabled={busy}
                  onChange={(event) => {
                    setImportSource(event.target.value as ImportSource);
                    cancelImport();
                  }}
                >
                  {(Object.entries(sourceLabels) as Array<[ImportSource, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div className="programme-template-actions"><a className="add-event-button" href="/api/programme/template" download="SitePulse-Programme-Template.xlsx">Download SitePulse Programme Template (.xlsx)</a><span>{importSource === "p6-xlsx" ? "Requires TASK; TASKPRED, RSRC and TASKRSRC are supported." : importSource === "asta-xlsx" ? "Use an Asta activity or task export with visible column headings." : "Download the official workbook, complete its programme rows, then upload it below. Budget hours or production rate will calculate the other value."}</span></div>
              {!canManage && <p style={{ margin: 0, fontWeight: 700 }}>You can view the upload formats and download the template. Planner or Admin access is required to review and publish a programme.</p>}
              <label className="attendance-field" style={{ maxWidth: 360 }}>
                <span>Single building value (optional)</span>
                <input value={buildingDefault} onChange={(event) => setBuildingDefault(event.target.value)} placeholder="e.g. HBX" />
              </label>

              <div className="programme-import-actions" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <label className="programme-file-picker">
                  <span>Choose programme file to import</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={busy}
                    onChange={(event) => selectWorkbook(event.target.files?.[0])}
                  />
                </label>
                <button type="button" className="secondary-button" style={touchButtonStyle} disabled={!canManage || !selectedFile || busy} onClick={() => void reviewImport()}>
                  {busy && selectedFile && !preview ? "Reviewing…" : "Review Import"}
                </button>
                <button type="button" className="add-event-button" style={{ ...touchButtonStyle, width: "auto" }} disabled={!canManage || busy || preview?.status !== "draft" || !preview.importId} onClick={() => preview && void publish(preview.importId)}>
                  Publish Programme Update
                </button>
                <button type="button" className="secondary-button" style={touchButtonStyle} disabled={busy || (!selectedFile && !preview)} onClick={cancelImport}>
                  Cancel
                </button>
              </div>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {selectedFile ? `Selected workbook: ${selectedFile.name}` : "No workbook selected."}
              </p>
          </div>

          {preview && (
            <section style={{ marginTop: 20, padding: 18, border: "1px solid #cbd5df", borderRadius: 14, background: "white" }} aria-live="polite">
              <h3 style={{ marginTop: 0 }}>Import Preview — {preview.filename}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {[
                  ["Activities", preview.activities],
                  ["Relationships", preview.relationships],
                  ["Resources", preview.resources],
                  ["Assignments", preview.assignments],
                ].map(([label, count]) => (
                  <div key={String(label)} style={{ padding: 14, borderRadius: 10, background: "#eef2f5" }}>
                    <strong style={{ display: "block", fontSize: 24 }}>{count}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <h4>Validation</h4>
              {preview.issues.length === 0 ? (
                <p style={{ color: "#087443", fontWeight: 700 }}>Validation completed successfully. The draft is ready to publish.</p>
              ) : (
                <>
                  <p style={{ fontWeight: 700 }}>
                    {preview.issues.length} validation issue{preview.issues.length === 1 ? "" : "s"} found.
                    {preview.issues.length > 100 ? " Showing the first 100." : ""}
                  </p>
                  <ul style={{ display: "grid", gap: 8, paddingLeft: 22 }}>
                    {preview.issues.slice(0, 100).map((issue, index) => (
                      <li key={`${issue.sheet}-${issue.rowNumber ?? 0}-${index}`} style={{ color: issue.severity === "error" ? "#b42318" : "#8a5700" }}>
                        <strong>{issue.severity.toUpperCase()} — {issue.sheet}{issue.rowNumber ? ` row ${issue.rowNumber}` : ""}{issue.activityId ? ` (${issue.activityId})` : ""}:</strong> {issue.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {message && <p role="status" style={{ color: "#087443", fontWeight: 700 }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}

          <h3>Import history</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="programme-grid" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>Version</th><th>Source</th><th>Filename</th><th>Status</th><th>Imported</th><th>Activities</th><th></th></tr></thead>
              <tbody>
                {imports.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{String(row.import_version)}</td>
                    <td>{sourceLabels[row.source_type as ImportSource] ?? String(row.source_type)}</td>
                    <td>{String(row.source_filename)}</td>
                    <td>{String(row.status)}</td>
                    <td>{new Date(String(row.imported_at)).toLocaleString("en-GB")}</td>
                    <td>{String(row.activity_count)}</td>
                    <td>{row.status === "draft" && canManage && <button className="secondary-button" disabled={busy} onClick={() => void publish(String(row.id))}>Publish Programme Update</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {edit && (
          <section style={{ padding: 16, border: "1px solid #d7dde3", borderRadius: 12, marginBottom: 16 }}>
            <h3>Complete baseline — {edit.activityName}</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label className="attendance-field"><span>Unit</span><input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
              <label className="attendance-field"><span>Planned Man-Day Productivity</span><input type="number" value={rate} onChange={(event) => setRate(event.target.value)} /></label>
              <label className="attendance-field"><span>Assumed Gang Size</span><input type="number" min="1" step="1" value={crewSize} onChange={(event) => setCrewSize(event.target.value)} /></label>
            </div>
            <button className="add-event-button" style={{ width: "auto" }} onClick={() => void saveBaseline()}>Save</button>
          </section>
        )}

        <div className="programme-search-row" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <strong>{loading ? "Loading programme…" : `${activities.length} published activities`}</strong>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity" />
        </div>
        <section className="productivity-rag-summary" aria-label="Productivity RAG summary">
          <div><strong>{ragSummary.counts.green}</strong><span>Green activities</span></div><div><strong>{ragSummary.counts.amber}</strong><span>Amber activities</span></div><div><strong>{ragSummary.counts.red}</strong><span>Red activities</span></div><div><strong>{ragSummary.counts["baseline-missing"]}</strong><span>Baseline Missing</span></div><div><strong>{ragSummary.counts["no-actuals"]}</strong><span>No Actuals</span></div><div><strong>{formatNumber(ragSummary.percentages.green)}%</strong><span>% Green</span></div><div><strong>{formatNumber(ragSummary.percentages.amber)}%</strong><span>% Amber</span></div><div><strong>{formatNumber(ragSummary.percentages.red)}%</strong><span>% Red</span></div>
        </section>
        <div className="programme-filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, padding: 12 }}>
          {(["building", "elevation", "level", "gridline", "status"] as const).map((field) => (
            <label className="attendance-field" key={field}>
              <span>{field}</span>
              <select value={filters[field]} onChange={(event) => setFilters((current) => ({ ...current, [field]: event.target.value }))}>
                <option value="">All</option>
                {options[field === "status" ? "statuses" : `${field}s` as keyof typeof options].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          ))}
          <label className="attendance-field"><span>Completion</span><select value={filters.completion} onChange={(event) => setFilters((current) => ({ ...current, completion: event.target.value }))}><option value="">All</option><option value="non-completed">Non-completed</option><option value="completed">Completed</option></select></label>
          <label className="attendance-field"><span>Activity type</span><select value={filters.activityType} onChange={(event) => setFilters((current) => ({ ...current, activityType: event.target.value }))}><option value="">All</option>{Object.keys(activityTypeKeywords).map((key) => <option value={key} key={key}>{key.replaceAll("-", " ")}</option>)}</select></label>
          <label className="attendance-field"><span>Productivity RAG</span><select value={filters.productivityRag} onChange={(event) => setFilters((current) => ({ ...current, productivityRag: event.target.value }))}><option value="">All</option>{(Object.entries(productivityRagLabels) as Array<[ProductivityRag, string]>).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>

        <div className="programme-desktop-table" style={{ overflowX: "auto" }}>
          <table className="programme-grid" style={{ width: "100%", minWidth: 1900, borderCollapse: "collapse" }}>
            <thead><tr>{["Building", "Area", "Gridline", "Level", "Activity", "Product Type", "Labour Resources", "Material Resources", "Planned Start", "Planned Finish", "Actual Start", "Actual Finish", "% Complete", "Quantity", "Assumed Gang Size", "Productivity RAG", "Planned Man-Day Productivity", "Actual Man-Day Productivity", "Productivity Performance %"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
            <tbody>
              {filtered.map(({ item, actual, rag, performance }) => (
                <tr key={item.id}>
                  <td>{item.building || "—"}</td><td>{item.elevation || "—"}</td><td>{item.gridline || "—"}</td><td>{item.level || "—"}</td>
                  <td><strong>{item.activityName}</strong><small style={{ display: "block" }}>{item.programmeActivityId}</small><Link href={`/forecast?activity=${encodeURIComponent(item.programmeActivityId)}`}>View Forecast &amp; Recovery</Link></td><td>{item.productType || "—"}</td>
                  <td>{item.labourResourceNames?.join(", ") || "—"}</td><td>{item.materialResourceNames?.join(", ") || "—"}</td>
                  <td>{item.plannedStart || "—"}</td><td>{item.plannedFinish || "—"}</td><td>{item.actualStart || "—"}</td><td>{item.actualFinish || "—"}</td><td>{formatNumber(item.physicalPercentComplete)}%</td>
                  <td>{item.plannedQuantity ? `${formatNumber(item.plannedQuantity)} ${item.unit}` : "—"}</td><td>{formatNumber(item.assumedGangSize)}</td>
                  <td><ProductivityRagBadge status={rag} /></td>
                  <td>{item.plannedManDayProductivity ? <>{formatNumber(item.plannedManDayProductivity)} {item.unit}/man-day{item.assumedGangSize ? <small style={{ display: "block" }}>Daily Gang Output: {formatNumber(item.plannedGangDailyOutput ?? item.plannedManDayProductivity * item.assumedGangSize)} {item.unit}/day</small> : null}{canManage && <button className="secondary-button" onClick={() => { setEdit(item); setUnit(item.unit); setRate(String(item.plannedManDayProductivity ?? "")); setCrewSize(String(item.assumedGangSize ?? "")); }}>Edit baseline</button>}</> : canManage ? <button className="secondary-button" onClick={() => { setEdit(item); setUnit(item.unit); setRate(""); setCrewSize(String(item.assumedGangSize ?? "")); }}>Complete baseline</button> : "Man-day productivity baseline required"}</td>
                  <td>{actual === undefined ? "—" : `${formatNumber(actual)} ${item.unit}/man-day`}</td><td>{performance === null ? "—" : `${formatNumber(performance)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="programme-mobile-list">
          {filtered.map(({ item, actual, rag, performance }) => {
            const baselineComplete = Boolean(item.unit && item.plannedManDayProductivity && item.assumedGangSize);
            return <article className="programme-activity-card" key={item.id}>
              <div className="programme-activity-card-header">
                <div><strong>{item.activityName}</strong><small>{item.programmeActivityId}</small></div>
                <span className={`programme-baseline-status ${baselineComplete ? "complete" : "incomplete"}`}>{baselineComplete ? "Baseline complete" : "Baseline incomplete"}</span>
              </div>
              <dl className="programme-activity-summary">
                <div><dt>Building</dt><dd>{item.building || "—"}</dd></div>
                <div><dt>Elevation</dt><dd>{item.elevation || "—"}</dd></div>
                <div><dt>Level</dt><dd>{item.level || "—"}</dd></div>
                <div><dt>Planned quantity</dt><dd>{item.plannedQuantity ? `${formatNumber(item.plannedQuantity)} ${item.unit}` : "—"}</dd></div>
                <div><dt>Productivity RAG</dt><dd><ProductivityRagBadge status={rag} /></dd></div>
                <div><dt>Actual Man-Day Productivity</dt><dd>{actual === undefined ? "—" : `${formatNumber(actual)} ${item.unit}/man-day`}</dd></div>
                <div><dt>Productivity Performance</dt><dd>{performance === null ? "—" : `${formatNumber(performance)}%`}</dd></div>
                  <div><dt>Product type</dt><dd>{item.productType || "—"}</dd></div>
                  <div><dt>Labour resources</dt><dd>{item.labourResourceNames?.join(", ") || "—"}</dd></div>
                  <div><dt>Material resources</dt><dd>{item.materialResourceNames?.join(", ") || "—"}</dd></div>
              </dl>
              <details>
                <summary>Activity details</summary>
                <dl className="programme-activity-summary programme-activity-details">
                  <div><dt>Gridline</dt><dd>{item.gridline || "—"}</dd></div>
                  <div><dt>Planned dates</dt><dd>{item.plannedStart || "—"} to {item.plannedFinish || "—"}</dd></div>
                  <div><dt>Actual dates</dt><dd>{item.actualStart || "—"} to {item.actualFinish || "—"}</dd></div>
                  <div><dt>Complete</dt><dd>{formatNumber(item.physicalPercentComplete)}%</dd></div>
                  <div><dt>Assumed Gang Size</dt><dd>{formatNumber(item.assumedGangSize)}</dd></div>
                  <div><dt>Planned Man-Day Productivity</dt><dd>{item.plannedManDayProductivity ? `${formatNumber(item.plannedManDayProductivity)} ${item.unit}/man-day` : "—"}</dd></div>
                  <div><dt>Planned Daily Gang Output</dt><dd>{item.plannedGangDailyOutput ? `${formatNumber(item.plannedGangDailyOutput)} ${item.unit}/day` : "—"}</dd></div>
                  <div><dt>Planned Man-Days</dt><dd>{formatNumber(item.plannedManDays)}</dd></div>
                </dl>
              </details>
              {canManage && <button className="secondary-button programme-baseline-action" onClick={() => { setEdit(item); setUnit(item.unit); setRate(String(item.plannedManDayProductivity ?? "")); setCrewSize(String(item.assumedGangSize ?? "")); }}>{baselineComplete ? "Edit baseline" : "Complete baseline"}</button>}
              <Link className="secondary-button programme-baseline-action" href={`/forecast?activity=${encodeURIComponent(item.programmeActivityId)}`}>View Forecast &amp; Recovery</Link>
            </article>;
          })}
        </div>
      </section>
    </main>
  );
}
