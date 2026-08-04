"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { classifyProgramme, parseP6Workbook, type HierarchyField, type HierarchyMapping, type ParsedP6Workbook, type WorkbookSheets } from "@/lib/programmeImport";
import { getActiveProjectId, loadProgramme, loadProgrammeImportData, saveProgramme, saveProgrammeImportData } from "@/lib/storage";
import type { ProgrammeActivity, ProgrammeImportChange, ProgrammeImportData, ProgrammeImportSnapshot } from "@/types/site";

const emptyMapping: HierarchyMapping = { building: "", elevation: "", level: "", gridline: "", workActivity: "" };
const hierarchyLabels: Record<HierarchyField, string> = { building: "Building", elevation: "Elevation", level: "Level", gridline: "Gridline", workActivity: "Work Activity" };

const activityTypeKeywords: Record<string, string[]> = {
  design: ["design", "drawing", "engineering"],
  install: ["install", "installation", "erection"],
  calculations: ["calculation", "calculations", "calc"],
  "shop-issue": ["shop issue", "shop drawing", "issued for fabrication", "issue to shop"],
  procurement: ["procurement", "purchase", "order material", "material order"],
  "bylor-handover": ["bylor handover", "handover to bylor", "bylor acceptance"],
  constraint: ["constraint", "hold point", "restricted access"],
  "alumet-handover": ["alumet handover", "handover to alumet", "alumet acceptance"],
  remedials: ["remedial", "remedials", "rectification", "snagging", "snag"],
};

function matchesActivityType(activity: ProgrammeActivity, type: string): boolean {
  if (!type) return true;
  const name = `${activity.activityName ?? ""} ${activity.activity ?? ""} ${activity.workActivity ?? ""}`.toLowerCase();
  return (activityTypeKeywords[type] ?? []).some((keyword) => name.includes(keyword));
}

type PendingImport = {
  fileName: string;
  importId: string;
  sheets: WorkbookSheets;
  parsed: ParsedP6Workbook;
  mapping: HierarchyMapping;
  changes: ProgrammeImportChange[];
  mode: "initial" | "update";
  partialUpdate: boolean;
};

function createId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatNumber(value?: number): string {
  return value === undefined ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function mergeProgramme(existing: ProgrammeActivity[], incoming: ProgrammeActivity[], partialUpdate = false): ProgrammeActivity[] {
  const incomingById = new Map(incoming.map((activity) => [activity.programmeActivityId.toLowerCase(), activity]));
  const now = new Date().toISOString();
  const merged = existing.map((activity) => {
    const update = incomingById.get(activity.programmeActivityId.toLowerCase());
    if (!update) return partialUpdate ? activity : { ...activity, missingFromLatestUpdate: true, updatedAt: now };
    incomingById.delete(activity.programmeActivityId.toLowerCase());
    const plannedQuantity = update.plannedQuantity > 0 ? update.plannedQuantity : activity.plannedQuantity;
    const unit = update.unit || activity.unit;
    const budgetLabourHours = update.budgetLabourHours ?? activity.budgetLabourHours;
    const plannedProductionRate = update.plannedProductionRate ?? activity.plannedProductionRate;
    const plannedCrewSize = update.plannedCrewSize ?? activity.plannedCrewSize;
    return { ...activity, ...update, id: activity.id, projectId: activity.projectId ?? update.projectId, createdAt: activity.createdAt, plannedQuantity, unit, budgetLabourHours, plannedProductionRate, plannedCrewSize, productivityBaselineComplete: Boolean(plannedQuantity > 0 && budgetLabourHours && unit), updatedAt: now, missingFromLatestUpdate: false };
  });
  return [...merged, ...incomingById.values()];
}

export default function ProgrammePage() {
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]);
  const [importData, setImportData] = useState<ProgrammeImportData>({ relationships: [], resources: [], assignments: [], snapshots: [] });
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ building: "", elevation: "", level: "", gridline: "", status: "", activityType: "", completion: "", missing: "", baseline: "" });
  const [showHistory, setShowHistory] = useState(false);
  const [baselineActivityId, setBaselineActivityId] = useState("");
  const [baselineForm, setBaselineForm] = useState({ quantity: "", unit: "", budgetHours: "", rate: "" });

  useEffect(() => {
    const refresh = () => { setActivities(loadProgramme()); setImportData(loadProgrammeImportData()); setPending(null); };
    queueMicrotask(refresh);
    window.addEventListener("sitepulse-project-changed", refresh);
    return () => window.removeEventListener("sitepulse-project-changed", refresh);
  }, []);

  async function selectWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setMessage(""); setPending(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setError("P6 import currently supports .xlsx workbooks only."); return; }
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheets: WorkbookSheets = {};
      workbook.SheetNames.forEach((name) => { const worksheet = workbook.Sheets[name]; if (worksheet) sheets[name] = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true }); });
      const projectId = getActiveProjectId();
      const importId = createId();
      const knownActivityIds = activities.map((activity) => activity.programmeActivityId);
      const firstPass = parseP6Workbook(sheets, projectId, importId, emptyMapping, knownActivityIds);
      const mapping = { ...emptyMapping };
      const normalisedColumns = firstPass.availableColumns.map((column) => ({ column, key: `${column} ${firstPass.columnLabels[column] ?? ""}`.trim().toLowerCase().replace(/[\s_-]+/g, " ") }));
      (Object.keys(mapping) as HierarchyField[]).forEach((field) => {
        const label = hierarchyLabels[field].toLowerCase();
        mapping[field] = normalisedColumns.find((candidate) => candidate.key === label || candidate.key.includes(label) || field === "level" && candidate.key.includes("floor"))?.column ?? "";
      });
      const parsed = parseP6Workbook(sheets, projectId, importId, mapping, knownActivityIds);
      const statuses = new Set(parsed.activities.map((activity) => activity.activityStatus?.trim().toLowerCase()).filter(Boolean));
      const partialUpdate = activities.length > 0 && parsed.activities.length < activities.length && !statuses.has("completed");
      const changes = classifyProgramme(activities, parsed.activities).filter((change) => !partialUpdate || change.classification !== "missing");
      setPending({ fileName: file.name, importId, sheets, parsed, mapping, changes, mode: activities.length ? "update" : "initial", partialUpdate });
    } catch (caught) {
      console.error("Unable to parse P6 workbook:", caught);
      setError("The workbook is malformed or could not be read.");
    }
  }

  function updateMapping(field: HierarchyField, column: string) {
    if (!pending) return;
    const mapping = { ...pending.mapping, [field]: column === "__constant__" ? "__constant__:" : column };
    const parsed = parseP6Workbook(pending.sheets, getActiveProjectId(), pending.importId, mapping, activities.map((activity) => activity.programmeActivityId));
    const changes = classifyProgramme(activities, parsed.activities).filter((change) => !pending.partialUpdate || change.classification !== "missing");
    setPending({ ...pending, mapping, parsed, changes });
  }

  function updateConstantMapping(field: HierarchyField, value: string) {
    if (!pending) return;
    const mapping = { ...pending.mapping, [field]: `__constant__:${value}` };
    const parsed = parseP6Workbook(pending.sheets, getActiveProjectId(), pending.importId, mapping, activities.map((activity) => activity.programmeActivityId));
    const changes = classifyProgramme(activities, parsed.activities).filter((change) => !pending.partialUpdate || change.classification !== "missing");
    setPending({ ...pending, mapping, parsed, changes });
  }

  function applyImport() {
    if (!pending || pending.parsed.issues.some((issue) => issue.severity === "error")) return;
    const updated = mergeProgramme(activities, pending.parsed.activities, pending.partialUpdate);
    const counts = (classification: ProgrammeImportChange["classification"]) => pending.changes.filter((change) => change.classification === classification).length;
    const snapshot: ProgrammeImportSnapshot = { id: pending.importId, projectId: getActiveProjectId(), importedAt: new Date().toISOString(), sourceFilename: pending.fileName, sourceType: "p6-xlsx", dataDate: pending.parsed.dataDate, activityCount: pending.parsed.activities.length, relationshipCount: pending.parsed.relationships.length, resourceCount: pending.parsed.resources.length, assignmentCount: pending.parsed.assignments.length, newCount: counts("new"), updatedCount: counts("updated"), unchangedCount: counts("unchanged"), invalidCount: pending.parsed.issues.filter((issue) => issue.severity === "error").length, missingCount: counts("missing"), changes: pending.changes };
    const nextData = { relationships: pending.parsed.relationships, resources: pending.parsed.resources, assignments: pending.parsed.assignments, snapshots: [snapshot, ...importData.snapshots] };
    saveProgramme(updated); saveProgrammeImportData(nextData);
    setActivities(updated); setImportData(nextData); setPending(null); setError("");
    setMessage(`${pending.mode === "initial" ? "Initial programme imported" : "Weekly programme updated"}: ${snapshot.newCount} new, ${snapshot.updatedCount} updated, ${snapshot.unchangedCount} unchanged, ${snapshot.missingCount} missing.`);
  }

  function editBaseline(activity: ProgrammeActivity) {
    setBaselineActivityId(activity.id);
    setBaselineForm({ quantity: activity.plannedQuantity ? String(activity.plannedQuantity) : "", unit: activity.unit || "", budgetHours: activity.budgetLabourHours ? String(activity.budgetLabourHours) : "", rate: activity.plannedProductionRate ? String(activity.plannedProductionRate) : "" });
  }

  function saveBaseline() {
    const quantity = Number(baselineForm.quantity);
    const budgetHours = Number(baselineForm.budgetHours);
    const enteredRate = Number(baselineForm.rate);
    const rate = enteredRate > 0 ? enteredRate : quantity > 0 && budgetHours > 0 ? quantity / budgetHours : 0;
    if (!baselineForm.unit.trim() || !(rate > 0)) { setError("A unit of measure and productivity target are required for measured work."); return; }
    const updated = activities.map((activity) => activity.id === baselineActivityId ? { ...activity, unit: baselineForm.unit.trim(), plannedQuantity: quantity > 0 ? quantity : activity.plannedQuantity, budgetLabourHours: budgetHours > 0 ? budgetHours : activity.budgetLabourHours, plannedProductionRate: rate, productivityBaselineComplete: Boolean(quantity > 0 && budgetHours > 0), updatedAt: new Date().toISOString() } : activity);
    saveProgramme(updated); setActivities(updated); setBaselineActivityId(""); setError(""); setMessage("Productivity baseline saved. The activity is now available for measured work.");
  }

  const options = useMemo(() => ({
    buildings: [...new Set(activities.map((item) => item.building).filter(Boolean))].sort(),
    elevations: [...new Set(activities.map((item) => item.elevation).filter(Boolean))].sort(),
    levels: [...new Set(activities.map((item) => item.level).filter(Boolean))].sort(),
    gridlines: [...new Set(activities.map((item) => item.gridline).filter((value): value is string => Boolean(value)))].sort(),
    statuses: [...new Set(activities.map((item) => item.activityStatus).filter((value): value is string => Boolean(value)))].sort(),
  }), [activities]);
  const filtered = useMemo(() => activities.filter((item) => {
    const query = search.trim().toLowerCase();
    return (!query || [item.activityName, item.activity, item.programmeActivityId, item.wbsCode, item.wbsPath].some((value) => value?.toLowerCase().includes(query)))
      && (!filters.building || item.building === filters.building) && (!filters.elevation || item.elevation === filters.elevation) && (!filters.level || item.level === filters.level) && (!filters.gridline || item.gridline === filters.gridline)
      && (!filters.status || item.activityStatus === filters.status)
      && matchesActivityType(item, filters.activityType)
      && (!filters.completion || (filters.completion === "completed" ? item.activityStatus?.trim().toLowerCase() === "completed" : item.activityStatus?.trim().toLowerCase() !== "completed"))
      && (!filters.missing || String(Boolean(item.missingFromLatestUpdate)) === filters.missing)
      && (!filters.baseline || String(Boolean(item.productivityBaselineComplete)) === filters.baseline);
  }), [activities, filters, search]);
  const summary = pending ? (["new", "updated", "unchanged", "missing"] as const).map((kind) => [kind, pending.changes.filter((change) => change.classification === kind).length] as const) : [];

  return <main className="timeline-page"><section className="timeline-panel">
    <header className="timeline-header"><div><p className="eyebrow">Project Setup</p><h1>Programme</h1><p style={{ margin: "6px 0 0", color: "#5f6b76" }}>The P6 programme is the source of truth for planned work.</p></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link href="/crews" className="secondary-button">Gangs</Link><Link href="/timeline" className="secondary-button">Timeline</Link></div></header>

    <section style={{ padding: 20, marginBottom: 24, border: "1px solid #d7dde3", borderRadius: 18, background: "#f7f9fa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}><div><h2 style={{ margin: 0 }}>{activities.length ? "Update Programme" : "Initial P6 Programme Import"}</h2><p>Upload the native weekly P6 Excel export. Nothing is applied until you approve the validation and change preview.</p></div><button type="button" className="secondary-button" onClick={() => setShowHistory((value) => !value)}>Import History ({importData.snapshots.length})</button></div>
      <label className="add-event-button" style={{ display: "inline-flex", width: "auto", margin: 0, cursor: "pointer" }}>{activities.length ? "Update Programme" : "Import P6 Workbook"}<input type="file" accept=".xlsx" onChange={selectWorkbook} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} /></label>
      <p style={{ color: "#5f6b76", fontSize: 13 }}>Supported sheets: TASK (required), TASKPRED, RSRC and TASKRSRC. USERDATA is ignored.</p>
      {message && <p role="status" style={{ color: "#087443", fontWeight: 700 }}>{message}</p>}{error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}
      {showHistory && <div style={{ overflowX: "auto", marginTop: 14 }}><table className="programme-grid" style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["Imported", "File", "Activities", "New", "Updated", "Unchanged", "Missing"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{importData.snapshots.map((item) => <tr key={item.id}><td>{new Date(item.importedAt).toLocaleString("en-GB")}</td><td>{item.sourceFilename}</td><td>{item.activityCount}</td><td>{item.newCount}</td><td>{item.updatedCount}</td><td>{item.unchangedCount}</td><td>{item.missingCount}</td></tr>)}</tbody></table>{importData.snapshots.length === 0 && <p>No imports recorded yet.</p>}</div>}
    </section>

    {pending && <section style={{ padding: 20, marginBottom: 24, border: "1px solid #d7dde3", borderRadius: 18 }}>
      <h2 style={{ marginTop: 0 }}>Validation Preview — {pending.fileName}</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>{summary.map(([kind, count]) => <span key={kind} style={{ padding: "7px 10px", borderRadius: 999, background: "#eef2f4" }}><strong>{count}</strong> {kind}</span>)}<span style={{ padding: "7px 10px", borderRadius: 999, background: pending.parsed.issues.some((issue) => issue.severity === "error") ? "#fee4e2" : "#dcfae6" }}><strong>{pending.parsed.issues.length}</strong> issues</span></div>
      {pending.partialUpdate && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#fff4cc", color: "#684d00", fontWeight: 700 }}>Partial programme update detected: this workbook contains non-completed TASK rows only. Existing activities omitted by the P6 filter will be preserved and will not be marked missing.</p>}
      <h3>Hierarchy Mapping</h3><p>Choose explicit TASK columns, leave unmapped, or use the WBS path segments as a fallback. Review the results before applying.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>{(Object.keys(hierarchyLabels) as HierarchyField[]).map((field) => { const constant = pending.mapping[field].startsWith("__constant__:"); return <div key={field} style={{ display: "grid", gap: 6 }}><label className="attendance-field"><span>{hierarchyLabels[field]}</span><select value={constant ? "__constant__" : pending.mapping[field]} onChange={(event) => updateMapping(field, event.target.value)}><option value="">Leave unmapped</option><option value="__constant__">Single value for all rows</option><option value="__wbs__">WBS path fallback</option>{pending.parsed.availableColumns.map((column) => <option value={column} key={column}>{pending.parsed.columnLabels[column] || column}</option>)}</select></label>{constant && <label className="attendance-field"><span>{hierarchyLabels[field]} value</span><input value={pending.mapping[field].slice("__constant__:".length)} onChange={(event) => updateConstantMapping(field, event.target.value)} placeholder={`Enter ${hierarchyLabels[field].toLowerCase()}`} /></label>}</div>; })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 12 }}>{(["building", "elevation", "level", "gridline"] as const).map((field) => { const values = [...new Set(pending.parsed.activities.map((activity) => activity[field]).filter(Boolean))]; return <div key={field} style={{ padding: "9px 11px", borderRadius: 10, background: "#eef2f4" }}><strong>{pending.parsed.activities.filter((activity) => Boolean(activity[field])).length} {hierarchyLabels[field]} values mapped</strong><small style={{ display: "block", marginTop: 4, color: "#5f6b76" }}>{values.slice(0, 6).join(", ") || "No values in workbook"}{values.length > 6 ? ` +${values.length - 6} more` : ""}</small></div>; })}</div>
      <h3>Row-level issues</h3>{pending.parsed.issues.length ? <div style={{ overflowX: "auto" }}><table className="programme-grid" style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Sheet / row</th><th>Activity ID</th><th>Severity</th><th>Message</th></tr></thead><tbody>{pending.parsed.issues.map((issue, index) => <tr key={`${issue.sheet}-${issue.rowNumber}-${index}`}><td>{issue.sheet}{issue.rowNumber ? ` / ${issue.rowNumber}` : ""}</td><td>{issue.activityId || "—"}</td><td style={{ color: issue.severity === "error" ? "#b42318" : "#9a6700", fontWeight: 700 }}>{issue.severity}</td><td>{issue.message}</td></tr>)}</tbody></table></div> : <p style={{ color: "#087443", fontWeight: 700 }}>Workbook structure and references are valid.</p>}
      <h3>Change Preview</h3><div style={{ overflowX: "auto", maxHeight: 360 }}><table className="programme-grid" style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Activity ID</th><th>Classification</th><th>Changed fields</th><th>Start</th><th>Finish</th></tr></thead><tbody>{pending.changes.map((change) => <tr key={`${change.classification}-${change.programmeActivityId}`}><td>{change.programmeActivityId}</td><td>{change.classification}</td><td>{change.changedFields?.join(", ") || "—"}</td><td>{change.before?.plannedStart || "—"} → {change.after?.plannedStart || "—"}</td><td>{change.before?.plannedFinish || "—"} → {change.after?.plannedFinish || "—"}</td></tr>)}</tbody></table></div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}><button type="button" className="add-event-button" style={{ width: "auto", margin: 0 }} disabled={pending.parsed.issues.some((issue) => issue.severity === "error")} onClick={applyImport}>Apply {pending.mode === "initial" ? "Initial Import" : "Weekly Update"}</button><button type="button" className="secondary-button" onClick={() => setPending(null)}>Cancel</button></div>
    </section>}

    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}><strong>{activities.length} programme activit{activities.length === 1 ? "y" : "ies"}</strong><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Activity, ID or WBS" style={{ width: "100%", maxWidth: 340, minHeight: 42, padding: "9px 12px", border: "1px solid #ccd3da", borderRadius: 10 }} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, padding: 14, marginBottom: 16, border: "1px solid #d7dde3", borderRadius: 12, background: "#f7f9fa" }}>
      {(["building", "elevation", "level", "gridline", "status"] as const).map((field) => <label className="attendance-field" key={field}><span>{field[0].toUpperCase() + field.slice(1)}</span><select value={filters[field]} onChange={(event) => setFilters((current) => ({ ...current, [field]: event.target.value }))}><option value="">All</option>{options[`${field === "status" ? "statuses" : `${field}s`}` as keyof typeof options].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
      <label className="attendance-field"><span>Activity Type</span><select value={filters.activityType} onChange={(event) => setFilters((current) => ({ ...current, activityType: event.target.value }))}><option value="">All activity types</option><option value="design">Design</option><option value="install">Install</option><option value="calculations">Calculations</option><option value="shop-issue">Shop Issue</option><option value="procurement">Procurement</option><option value="bylor-handover">Bylor Handover</option><option value="constraint">Constraint</option><option value="alumet-handover">Alumet Handover</option><option value="remedials">Remedials</option></select></label>
      <label className="attendance-field"><span>Completion</span><select value={filters.completion} onChange={(event) => setFilters((current) => ({ ...current, completion: event.target.value }))}><option value="">All tasks</option><option value="non-completed">Non-completed tasks</option><option value="completed">Completed tasks</option></select></label>
      <label className="attendance-field"><span>Missing from update</span><select value={filters.missing} onChange={(event) => setFilters((current) => ({ ...current, missing: event.target.value }))}><option value="">All</option><option value="true">Missing</option><option value="false">Present</option></select></label>
      <label className="attendance-field"><span>Productivity baseline</span><select value={filters.baseline} onChange={(event) => setFilters((current) => ({ ...current, baseline: event.target.value }))}><option value="">All</option><option value="false">Incomplete</option><option value="true">Complete</option></select></label>
    </div>
    {baselineActivityId && <section style={{ padding: 18, marginBottom: 16, border: "1px solid #d7dde3", borderRadius: 14, background: "#f7f9fa" }}><h3 style={{ marginTop: 0 }}>Complete productivity baseline</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}><label className="attendance-field"><span>Planned quantity</span><input type="number" min="0" step="any" value={baselineForm.quantity} onChange={(event) => setBaselineForm((current) => ({ ...current, quantity: event.target.value }))} /></label><label className="attendance-field"><span>Unit of measure *</span><input value={baselineForm.unit} onChange={(event) => setBaselineForm((current) => ({ ...current, unit: event.target.value }))} /></label><label className="attendance-field"><span>Budget labour hours</span><input type="number" min="0" step="any" value={baselineForm.budgetHours} onChange={(event) => setBaselineForm((current) => ({ ...current, budgetHours: event.target.value }))} /></label><label className="attendance-field"><span>Productivity target *</span><input type="number" min="0" step="any" value={baselineForm.rate} onChange={(event) => setBaselineForm((current) => ({ ...current, rate: event.target.value }))} /></label></div><div style={{ display: "flex", gap: 10, marginTop: 12 }}><button type="button" className="add-event-button" style={{ width: "auto", margin: 0 }} onClick={saveBaseline}>Save baseline</button><button type="button" className="secondary-button" onClick={() => setBaselineActivityId("")}>Cancel</button></div></section>}
    {activities.length === 0 ? <section style={{ padding: 28, border: "1px dashed #b9c2ca", borderRadius: 18, background: "#f7f9fa", textAlign: "center" }}><h2 style={{ marginTop: 0 }}>No programme imported</h2><p>Import the initial P6 workbook to make planned work available throughout SitePulse.</p></section> : <div style={{ overflowX: "auto" }}><table className="programme-grid" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1350 }}><thead><tr>{["Building", "Elevation", "Gridline", "Floor", "Activity Name", "Start", "Finish", "% Complete", "Quantity", "No. of Men", "Planned Productivity"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id} style={{ opacity: item.missingFromLatestUpdate ? 0.65 : 1 }}><td>{item.building || "—"}</td><td>{item.elevation || "—"}</td><td>{item.gridline || "—"}</td><td>{item.level || "—"}</td><td><strong>{item.activityName || item.activity}</strong><small style={{ display: "block", color: "#66717c", marginTop: 4 }}>{item.programmeActivityId}{item.missingFromLatestUpdate ? " · Missing from latest update" : ""}</small></td><td>{item.plannedStart || "—"}</td><td>{item.plannedFinish || "—"}</td><td>{formatNumber(item.physicalPercentComplete)}{item.physicalPercentComplete === undefined ? "" : "%"}</td><td>{item.plannedQuantity > 0 ? `${formatNumber(item.plannedQuantity)} ${item.unit}`.trim() : "—"}</td><td>{formatNumber(item.plannedCrewSize)}</td><td style={{ color: item.plannedProductionRate ? "#087443" : "#b54708", fontWeight: 700 }}>{item.plannedProductionRate ? `${formatNumber(item.plannedProductionRate)} ${item.unit}/hr` : "Productivity target incomplete"}<button type="button" className="secondary-button" style={{ display: "block", marginTop: 6 }} onClick={() => editBaseline(item)}>Edit baseline</button></td></tr>)}</tbody></table></div>}
  </section></main>;
}
