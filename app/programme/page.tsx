"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  addProgrammeActivity,
  deleteProgrammeActivity,
  loadDay,
  loadProgramme,
  saveProgramme,
  updateProgrammeActivity,
} from "@/lib/storage";
import { calculateProgrammeProgress } from "@/lib/progress";
import type { ProgrammeActivity, TimelineEvent } from "@/types/site";

type SpreadsheetRow = Record<string, unknown>;

type ImportValidationRow = {
  rowNumber: number;
  activityId: string;
  errors: string[];
  plannedQuantity: number | null;
  budgetLabourHours: number | null;
  suppliedProductionRate: number | null;
  calculatedProductionRate: number | null;
  activity?: ProgrammeActivity;
};

type PendingImport = {
  fileName: string;
  rows: ImportValidationRow[];
};

type ProgrammeForm = {
  programmeActivityId: string;
  building: string;
  elevation: string;
  level: string;
  gridline: string;
  activity: string;
  plannedQuantity: string;
  budgetLabourHours: string;
  plannedProductionRate: string;
  plannedCrewSize: string;
  plannedStart: string;
  plannedFinish: string;
  unit: string;
};

const emptyForm: ProgrammeForm = {
  programmeActivityId: "",
  building: "",
  elevation: "",
  level: "",
  gridline: "",
  activity: "",
  plannedQuantity: "",
  budgetLabourHours: "",
  plannedProductionRate: "",
  plannedCrewSize: "",
  plannedStart: "",
  plannedFinish: "",
  unit: "",
};

const headerAliases: Record<string, string[]> = {
  programmeActivityId: ["activity id", "activityid", "programme activity id", "programmeactivityid", "id"],
  building: ["building"],
  elevation: ["elevation", "facade", "façade"],
  level: ["level", "floor"],
  gridline: ["gridline", "grid line", "gridlines", "grid lines"],
  activity: ["activity", "activity name", "name"],
  description: ["description", "activity description"],
  trade: ["trade", "discipline"],
  wbs: ["wbs", "wbs code"],
  unit: ["unit", "uom"],
  plannedQuantity: ["planned quantity", "plannedquantity", "quantity", "planned qty"],
  budgetLabourHours: ["budget labour hours", "budget labor hours", "budgetlabourhours", "budget hours"],
  plannedProductionRate: ["planned production rate", "plannedproductionrate", "production rate"],
  plannedCrewSize: ["planned crew size", "plannedcrewsize", "crew size"],
  plannedStart: ["planned start", "plannedstart", "start"],
  plannedFinish: ["planned finish", "plannedfinish", "finish"],
};

function cleanHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function valueFor(row: SpreadsheetRow, field: string): unknown {
  const aliases = headerAliases[field] ?? [];
  const entry = Object.entries(row).find(([header]) => aliases.includes(cleanHeader(header)));
  return entry?.[1];
}

function hasColumn(headers: string[], field: string): boolean {
  const aliases = headerAliases[field] ?? [];
  return headers.some((header) => aliases.includes(cleanHeader(header)));
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function createId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `programme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function parsePositiveNumber(value: unknown): number | null {
  const text = asText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function variancePercentage(value: number, baseline: number): number {
  return baseline > 0 ? Math.abs(value - baseline) / baseline * 100 : 0;
}

export default function ProgrammePage() {
  const [programmeActivities, setProgrammeActivities] = useState<ProgrammeActivity[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [search, setSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [elevationFilter, setElevationFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [gridlineFilter, setGridlineFilter] = useState("");
  const [form, setForm] = useState<ProgrammeForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  useEffect(() => {
    let cancelled = false;
    function refreshTimelineEvents() {
      if (cancelled) return;
      const day = loadDay();
      setTimelineEvents(Array.isArray(day?.events) ? day.events : []);
    }
    function handleStorage(event: StorageEvent) {
      if (event.key?.startsWith("sitepulse-day-project-")) {
        refreshTimelineEvents();
      }
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setProgrammeActivities(loadProgramme());
      refreshTimelineEvents();
    });
    window.addEventListener("sitepulse-day-changed", refreshTimelineEvents);
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("sitepulse-day-changed", refreshTimelineEvents);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return programmeActivities.filter((item) =>
      (!query || [item.programmeActivityId, item.activity, item.description, item.building, item.elevation, item.level, item.gridline, item.trade, item.wbs]
        .some((value) => value?.toLowerCase().includes(query))) &&
      (!buildingFilter || item.building === buildingFilter) &&
      (!elevationFilter || item.elevation === elevationFilter) &&
      (!levelFilter || item.level === levelFilter)
      && (!gridlineFilter || item.gridline === gridlineFilter)
    );
  }, [programmeActivities, search, buildingFilter, elevationFilter, levelFilter, gridlineFilter]);

  const filterOptions = useMemo(() => ({
    buildings: [...new Set(programmeActivities.map((item) => item.building).filter(Boolean))].sort(),
    elevations: [...new Set(programmeActivities.map((item) => item.elevation).filter(Boolean))].sort(),
    levels: [...new Set(programmeActivities.map((item) => item.level).filter(Boolean))].sort(),
    gridlines: [...new Set(programmeActivities.map((item) => item.gridline).filter(Boolean))].sort(),
  }), [programmeActivities]);

  const progressByActivityId = useMemo(
    () => new Map(programmeActivities.map((item) => [
      item.programmeActivityId,
      calculateProgrammeProgress(item, timelineEvents),
    ])),
    [programmeActivities, timelineEvents]
  );

  function updateForm(field: keyof ProgrammeForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  function submitProgrammeActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const programmeActivityId = form.programmeActivityId.trim();
    const activityName = form.activity.trim();
    const plannedQuantity = Number(form.plannedQuantity);
    const budgetLabourHours = Number(form.budgetLabourHours);

    if (!programmeActivityId || !activityName || !form.building.trim() || !form.elevation.trim() || !form.level.trim() || !form.unit.trim()) {
      setError("Activity ID, Building, Elevation, Level, Activity and Unit are required.");
      return;
    }
    if (!(plannedQuantity > 0) || !(budgetLabourHours > 0)) {
      setError("Planned Quantity and Budget Labour Hours must be greater than zero.");
      return;
    }

    const duplicate = programmeActivities.some((item) =>
      item.id !== editingId &&
      item.programmeActivityId.toLowerCase() === programmeActivityId.toLowerCase()
    );
    if (duplicate) {
      setError("This Programme Activity ID already exists.");
      return;
    }

    const calculatedRate = plannedQuantity / budgetLabourHours;
    const overrideRate = Number(form.plannedProductionRate);
    const plannedProductionRate = overrideRate > 0 ? overrideRate : calculatedRate;
    const variance = variancePercentage(plannedProductionRate, calculatedRate);
    if (overrideRate > 0 && !window.confirm(
      `Override the calculated production rate of ${formatNumber(calculatedRate)} with ${formatNumber(overrideRate)} (${formatNumber(variance)}% variance)?`
    )) return;

    const values = {
      programmeActivityId,
      building: form.building.trim(),
      elevation: form.elevation.trim(),
      level: form.level.trim(),
      gridline: form.gridline.trim(),
      activity: activityName,
      plannedQuantity,
      budgetLabourHours,
      plannedProductionRate,
      plannedCrewSize: Number(form.plannedCrewSize) > 0 ? Number(form.plannedCrewSize) : undefined,
      plannedStart: form.plannedStart || undefined,
      plannedFinish: form.plannedFinish || undefined,
      unit: form.unit.trim(),
    };

    if (editingId) {
      const existing = programmeActivities.find((item) => item.id === editingId);
      if (!existing) return;
      setProgrammeActivities(updateProgrammeActivity({ ...existing, ...values }));
      setMessage("Programme activity updated.");
    } else {
      setProgrammeActivities(addProgrammeActivity({
        ...values,
        description: "",
        trade: "",
        wbs: "",
      }));
      setMessage("Programme activity added.");
    }
    resetForm();
  }

  function startEditing(item: ProgrammeActivity) {
    setEditingId(item.id);
    setForm({
      programmeActivityId: item.programmeActivityId,
      building: item.building,
      elevation: item.elevation,
      level: item.level,
      gridline: item.gridline ?? "",
      activity: item.activity,
      plannedQuantity: item.plannedQuantity ? String(item.plannedQuantity) : "",
      budgetLabourHours: item.budgetLabourHours ? String(item.budgetLabourHours) : "",
      plannedProductionRate: item.plannedProductionRate ? String(item.plannedProductionRate) : "",
      plannedCrewSize: item.plannedCrewSize ? String(item.plannedCrewSize) : "",
      plannedStart: item.plannedStart ?? "",
      plannedFinish: item.plannedFinish ?? "",
      unit: item.unit,
    });
    setError("");
    setMessage("");
    setPendingImport(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");
    setPendingImport(null);

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        setError("The workbook does not contain a worksheet.");
        return;
      }

      const worksheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
      const headers = (worksheetRows[0] ?? []).map(asText);
      const missingColumns = [
        ["programmeActivityId", "Activity ID"],
        ["building", "Building"],
        ["elevation", "Elevation"],
        ["level", "Level"],
        ["activity", "Activity"],
        ["unit", "Unit"],
        ["plannedQuantity", "Planned Quantity"],
        ["budgetLabourHours", "Budget Labour Hours"],
      ].filter(([field]) => !hasColumn(headers, field)).map(([, label]) => label);

      if (missingColumns.length > 0) {
        setError(`Missing required column${missingColumns.length === 1 ? "" : "s"}: ${missingColumns.join(", ")}.`);
        return;
      }

      const rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, { defval: "", raw: false });
      const importedIds = new Set<string>();
      const existingIds = new Set(programmeActivities.map((item) => item.programmeActivityId.toLowerCase()));
      const validationRows = rows.map((row, index): ImportValidationRow => {
        const rowNumber = index + 2;
        const programmeActivityId = asText(valueFor(row, "programmeActivityId"));
        const building = asText(valueFor(row, "building"));
        const elevation = asText(valueFor(row, "elevation"));
        const level = asText(valueFor(row, "level"));
        const gridline = asText(valueFor(row, "gridline"));
        const activity = asText(valueFor(row, "activity"));
        const unit = asText(valueFor(row, "unit"));
        const plannedQuantity = parsePositiveNumber(valueFor(row, "plannedQuantity"));
        const budgetLabourHours = parsePositiveNumber(valueFor(row, "budgetLabourHours"));
        const suppliedProductionRate = asText(valueFor(row, "plannedProductionRate"))
          ? parsePositiveNumber(valueFor(row, "plannedProductionRate"))
          : null;
        const calculatedProductionRate = plannedQuantity && budgetLabourHours
          ? plannedQuantity / budgetLabourHours
          : null;
        const key = programmeActivityId.toLowerCase();
        const errors: string[] = [];
        if (!programmeActivityId) errors.push("Activity ID is required.");
        if (!building) errors.push("Building is required.");
        if (!elevation) errors.push("Elevation is required.");
        if (!level) errors.push("Level is required.");
        if (!activity) errors.push("Activity is required.");
        if (!unit) errors.push("Unit is required.");
        if (plannedQuantity === null) errors.push("Planned Quantity must be a number greater than zero.");
        if (budgetLabourHours === null) errors.push("Budget Labour Hours must be a number greater than zero.");
        if (asText(valueFor(row, "plannedProductionRate")) && suppliedProductionRate === null) {
          errors.push("Planned Production Rate must be a number greater than zero.");
        }
        if (programmeActivityId && importedIds.has(key)) errors.push("Activity ID is duplicated in this workbook.");
        if (programmeActivityId && existingIds.has(key)) errors.push("Activity ID already exists in this project.");
        if (programmeActivityId) importedIds.add(key);
        if (suppliedProductionRate && calculatedProductionRate && variancePercentage(suppliedProductionRate, calculatedProductionRate) > 2) {
          errors.push(`Supplied rate differs by more than 2%; expected ${formatNumber(calculatedProductionRate)}.`);
        }
        const plannedCrewSizeText = asText(valueFor(row, "plannedCrewSize"));
        const plannedCrewSize = plannedCrewSizeText ? parsePositiveNumber(plannedCrewSizeText) : null;
        if (plannedCrewSizeText && plannedCrewSize === null) errors.push("Planned Crew Size must be a number greater than zero.");

        const importedActivity: ProgrammeActivity | undefined = errors.length === 0 && plannedQuantity && budgetLabourHours && calculatedProductionRate
          ? {
          id: createId(),
          programmeActivityId,
          building,
          elevation,
          level,
          gridline,
          activity,
          description: asText(valueFor(row, "description")),
          trade: asText(valueFor(row, "trade")),
          wbs: asText(valueFor(row, "wbs")),
          unit,
          plannedQuantity,
          budgetLabourHours,
          plannedProductionRate: suppliedProductionRate ?? calculatedProductionRate,
          plannedCrewSize: plannedCrewSize ?? undefined,
          plannedStart: asText(valueFor(row, "plannedStart")) || undefined,
          plannedFinish: asText(valueFor(row, "plannedFinish")) || undefined,
          createdAt: new Date().toISOString(),
        } : undefined;
        return { rowNumber, activityId: programmeActivityId, errors, plannedQuantity, budgetLabourHours, suppliedProductionRate, calculatedProductionRate, activity: importedActivity };
      });
      setPendingImport({ fileName: file.name, rows: validationRows });
      if (validationRows.some((row) => row.errors.length > 0)) {
        setError("Import not saved. Resolve every validation error and upload the corrected workbook.");
      }
    } catch (caught) {
      console.error("Unable to import programme:", caught);
      setError("The Excel file could not be read. Use an .xlsx or .xls workbook with a header row.");
    }
  }

  function confirmImport() {
    if (!pendingImport || pendingImport.rows.some((row) => row.errors.length > 0)) return;
    const imported = pendingImport.rows.flatMap((row) => row.activity ? [row.activity] : []);
    const updated = [...programmeActivities, ...imported];
    saveProgramme(updated);
    setProgrammeActivities(updated);
    setMessage(`${imported.length} programme activities imported.`);
    setError("");
    setPendingImport(null);
  }

  async function downloadProgrammeTemplate() {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet([{
      "Activity ID": "A1000",
      Building: "Block A",
      Elevation: "North",
      Level: "Level 01",
      Gridlines: "A-B",
      Activity: "Install curtain wall panels",
      Description: "Example row — replace or remove before importing",
      Trade: "Facade",
      WBS: "1.2.3",
      "Planned Quantity": 100,
      Unit: "m²",
      "Budget Labour Hours": 50,
      "Planned Production Rate": 2,
      "Planned Crew Size": 4,
      "Planned Start": "2026-08-03",
      "Planned Finish": "2026-08-14",
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Programme");
    XLSX.writeFile(workbook, "sitepulse-programme-template.xlsx");
  }

  function removeActivity(item: ProgrammeActivity) {
    if (!window.confirm(`Delete ${item.programmeActivityId} — ${item.activity}?`)) return;
    setProgrammeActivities(deleteProgrammeActivity(item.id));
    setMessage("");
  }

  const formQuantity = Number(form.plannedQuantity);
  const formBudgetHours = Number(form.budgetLabourHours);
  const calculatedFormRate = formQuantity > 0 && formBudgetHours > 0
    ? formQuantity / formBudgetHours
    : null;
  const overrideFormRate = Number(form.plannedProductionRate) > 0
    ? Number(form.plannedProductionRate)
    : null;
  const formRateVariance = calculatedFormRate && overrideFormRate
    ? variancePercentage(overrideFormRate, calculatedFormRate)
    : null;

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div><p className="eyebrow">Project Setup</p><h1>Programme</h1></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/crews" className="secondary-button">Gangs</Link>
            <Link href="/timeline" className="secondary-button">Timeline</Link>
          </div>
        </header>

        <form
          onSubmit={submitProgrammeActivity}
          style={{ display: "grid", gap: 14, padding: 20, marginBottom: 24, border: "1px solid #d7dde3", borderRadius: 18, background: "#f7f9fa" }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{editingId ? "Edit programme activity" : "Add programme activity"}</h2>
            <p style={{ margin: "6px 0 0", color: "#5f6b76" }}>Add planned work manually or update an existing programme row.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <label className="attendance-field">
              <span>Programme Activity ID *</span>
              <input value={form.programmeActivityId} onChange={(event) => updateForm("programmeActivityId", event.target.value)} placeholder="e.g. A1000" />
            </label>
            <label className="attendance-field">
              <span>Building</span>
              <input value={form.building} onChange={(event) => updateForm("building", event.target.value)} placeholder="e.g. Block A" />
            </label>
            <label className="attendance-field">
              <span>Elevation</span>
              <input value={form.elevation} onChange={(event) => updateForm("elevation", event.target.value)} placeholder="e.g. North" />
            </label>
            <label className="attendance-field">
              <span>Level</span>
              <input value={form.level} onChange={(event) => updateForm("level", event.target.value)} placeholder="e.g. Level 02" />
            </label>
            <label className="attendance-field">
              <span>Gridlines</span>
              <input value={form.gridline} onChange={(event) => updateForm("gridline", event.target.value)} placeholder="e.g. A-B" />
            </label>
            <label className="attendance-field">
              <span>Activity *</span>
              <input value={form.activity} onChange={(event) => updateForm("activity", event.target.value)} placeholder="e.g. Install curtain wall" />
            </label>
            <label className="attendance-field">
              <span>Quantity</span>
              <input type="number" min="0.000001" step="any" required value={form.plannedQuantity} onChange={(event) => updateForm("plannedQuantity", event.target.value)} placeholder="0" />
            </label>
            <label className="attendance-field">
              <span>Unit</span>
              <input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="e.g. m², nr, lm" />
            </label>
            <label className="attendance-field">
              <span>Budget Labour Hours *</span>
              <input type="number" min="0.000001" step="any" required value={form.budgetLabourHours} onChange={(event) => updateForm("budgetLabourHours", event.target.value)} placeholder="e.g. 50" />
            </label>
            <label className="attendance-field">
              <span>Override Rate</span>
              <input type="number" min="0.000001" step="any" value={form.plannedProductionRate} onChange={(event) => updateForm("plannedProductionRate", event.target.value)} placeholder={calculatedFormRate ? formatNumber(calculatedFormRate) : "Calculated automatically"} />
            </label>
            <label className="attendance-field">
              <span>Planned Crew Size</span>
              <input type="number" min="1" step="1" value={form.plannedCrewSize} onChange={(event) => updateForm("plannedCrewSize", event.target.value)} />
            </label>
            <label className="attendance-field"><span>Planned Start</span><input type="date" value={form.plannedStart} onChange={(event) => updateForm("plannedStart", event.target.value)} /></label>
            <label className="attendance-field"><span>Planned Finish</span><input type="date" value={form.plannedFinish} onChange={(event) => updateForm("plannedFinish", event.target.value)} /></label>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: 12, borderRadius: 10, background: "#fff" }}>
            <span><strong>Calculated Rate:</strong> {calculatedFormRate === null ? "—" : formatNumber(calculatedFormRate)}</span>
            <span><strong>Override Rate:</strong> {overrideFormRate === null ? "—" : formatNumber(overrideFormRate)}</span>
            <span><strong>Variance:</strong> {formRateVariance === null ? "—" : `${formatNumber(formRateVariance)}%`}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="add-event-button" style={{ width: "auto", margin: 0 }}>{editingId ? "Save changes" : "Add activity"}</button>
            {editingId && <button type="button" className="secondary-button" onClick={resetForm}>Cancel edit</button>}
          </div>
        </form>

        <section style={{ padding: 20, marginBottom: 24, border: "1px solid #d7dde3", borderRadius: 18, background: "#f7f9fa" }}>
          <h2 style={{ marginTop: 0 }}>Import programme</h2>
          <p>Upload the first worksheet, review every row, then import only when the full workbook is valid.</p>
          <div style={{ display: "flex", gap: 10, margin: "8px 0", flexWrap: "wrap" }}>
            <label className="add-event-button" style={{ display: "inline-flex", width: "auto", margin: 0, cursor: "pointer" }}>
              Import Excel
              <input type="file" accept=".xlsx,.xls" onChange={importExcel} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            </label>
            <button type="button" className="secondary-button" onClick={downloadProgrammeTemplate}>Download template</button>
          </div>
          <p style={{ marginBottom: 0, color: "#5f6b76", fontSize: 13 }}>Required: Activity ID, Building, Elevation, Level, Activity, Unit, Planned Quantity and Budget Labour Hours. Planned Production Rate is calculated when omitted.</p>
          {message && <p role="status" style={{ color: "#087443", fontWeight: 700 }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}
          {pendingImport && (
            <div role="status" style={{ marginTop: 14 }}>
              <strong style={{ display: "block", marginBottom: 8 }}>Validation — {pendingImport.fileName}</strong>
              <div style={{ overflowX: "auto" }}><table className="programme-grid" style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse", background: "#fff" }}>
                <thead><tr>{["Excel row", "Activity ID", "Status", "Error message", "Planned Quantity", "Budget Labour Hours", "Supplied Production Rate", "Calculated Production Rate"].map((heading) => <th key={heading} style={{ padding: 9, textAlign: "left", borderBottom: "2px solid #d7dde3" }}>{heading}</th>)}</tr></thead>
                <tbody>{pendingImport.rows.map((row) => <tr key={row.rowNumber}>
                  <td style={{ padding: 9, borderBottom: "1px solid #e4e8ec" }}>{row.rowNumber}</td><td style={{ padding: 9, borderBottom: "1px solid #e4e8ec" }}>{row.activityId || "—"}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid #e4e8ec", color: row.errors.length ? "#b42318" : "#087443", fontWeight: 700 }}>{row.errors.length ? "Invalid" : "Valid"}</td>
                  <td style={{ padding: 9, borderBottom: "1px solid #e4e8ec" }}>{row.errors.join(" ") || "—"}</td>
                  {[row.plannedQuantity, row.budgetLabourHours, row.suppliedProductionRate, row.calculatedProductionRate].map((value, index) => <td key={index} style={{ padding: 9, borderBottom: "1px solid #e4e8ec" }}>{value === null ? "—" : formatNumber(value)}</td>)}
                </tr>)}</tbody>
              </table></div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}><button type="button" className="add-event-button" style={{ width: "auto", margin: 0 }} disabled={pendingImport.rows.some((row) => row.errors.length > 0)} onClick={confirmImport}>Import all valid rows</button><button type="button" className="secondary-button" onClick={() => { setPendingImport(null); setError(""); }}>Cancel import</button></div>
            </div>
          )}
        </section>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <strong>{programmeActivities.length} programme activit{programmeActivities.length === 1 ? "y" : "ies"}</strong>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search programme" style={{ width: "100%", maxWidth: 320, minHeight: 42, padding: "9px 12px", border: "1px solid #ccd3da", borderRadius: 10 }} />
        </div>
        <p style={{ color: "#5f6b76" }}>Planned production rate is the baseline quantity expected per productive labour hour.</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, padding: 14, marginBottom: 16, border: "1px solid #d7dde3", borderRadius: 12, background: "#f7f9fa" }}>
          <label className="attendance-field">
            <span>Building</span>
            <select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}><option value="">All buildings</option>{filterOptions.buildings.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
          <label className="attendance-field">
            <span>Elevation</span>
            <select value={elevationFilter} onChange={(event) => setElevationFilter(event.target.value)}><option value="">All elevations</option>{filterOptions.elevations.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
          <label className="attendance-field">
            <span>Level</span>
            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}><option value="">All levels</option>{filterOptions.levels.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
          <label className="attendance-field">
            <span>Gridlines</span>
            <select value={gridlineFilter} onChange={(event) => setGridlineFilter(event.target.value)}><option value="">All gridlines</option>{filterOptions.gridlines.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button type="button" className="secondary-button" onClick={() => { setBuildingFilter(""); setElevationFilter(""); setLevelFilter(""); setGridlineFilter(""); setSearch(""); }}>Clear filters</button>
          </div>
        </div>

        {programmeActivities.length === 0 ? (
          <section style={{ padding: 28, border: "1px dashed #b9c2ca", borderRadius: 18, background: "#f7f9fa", textAlign: "center" }}>
            <h2 style={{ marginTop: 0 }}>No programme imported</h2><p>Import an Excel programme to make planned work available on the timeline.</p>
          </section>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="programme-grid" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1900 }}>
              <thead><tr>{["Activity ID", "Building", "Elevation", "Level", "Gridlines", "Activity", "Planned Quantity", "Unit", "Budget Labour Hours", "Planned Production Rate", "Planned Crew Size", "Planned Start", "Planned Finish", "Baseline Status", "Completed", "% Complete", ""].map((heading) => <th key={heading} style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #d7dde3" }}>{heading}</th>)}</tr></thead>
              <tbody>{filteredActivities.map((item) => {
                const progress = progressByActivityId.get(item.programmeActivityId);
                return (
                <tr key={item.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec", fontWeight: 700 }}>{item.programmeActivityId}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.building || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.elevation || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.level || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.gridline || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}><strong>{item.activity}</strong>{item.description && <small style={{ display: "block", color: "#5f6b76" }}>{item.description}</small>}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(item.plannedQuantity)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.unit || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.budgetLabourHours ? formatNumber(item.budgetLabourHours) : "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.plannedProductionRate ? `${formatNumber(item.plannedProductionRate)} ${item.unit}/labour hr` : "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.plannedCrewSize ?? "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.plannedStart ?? "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.plannedFinish ?? "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec", color: progress?.baselineComplete ? "#087443" : "#b42318", fontWeight: 700 }}>{progress?.baselineComplete ? "Complete" : "Productivity baseline incomplete"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(progress?.completedQuantity ?? 0)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec", fontWeight: 700 }}>{formatNumber(progress?.percentageComplete ?? 0)}%</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}><div style={{ display: "flex", gap: 8 }}><button type="button" className="secondary-button" onClick={() => startEditing(item)}>Edit</button><button type="button" className="secondary-button" onClick={() => removeActivity(item)}>Delete</button></div></td>
                </tr>
              );})}</tbody>
            </table>
          </div>
        )}
        {programmeActivities.length > 0 && filteredActivities.length === 0 && <p>No programme activities match your search.</p>}
      </section>
    </main>
  );
}
