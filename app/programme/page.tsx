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

type ImportSummary = {
  fileName: string;
  totalRows: number;
  added: number;
  updated: number;
  rejected: number;
  rejectedRows: string[];
};

type ProgrammeForm = {
  programmeActivityId: string;
  building: string;
  elevation: string;
  level: string;
  activity: string;
  plannedQuantity: string;
  unit: string;
};

const emptyForm: ProgrammeForm = {
  programmeActivityId: "",
  building: "",
  elevation: "",
  level: "",
  activity: "",
  plannedQuantity: "",
  unit: "",
};

const headerAliases: Record<string, string[]> = {
  programmeActivityId: ["activity id", "activityid", "programme activity id", "programmeactivityid", "id"],
  building: ["building"],
  elevation: ["elevation", "facade", "façade"],
  level: ["level", "floor"],
  activity: ["activity", "activity name", "name"],
  description: ["description", "activity description"],
  trade: ["trade", "discipline"],
  wbs: ["wbs", "wbs code"],
  unit: ["unit", "uom"],
  plannedQuantity: ["planned quantity", "plannedquantity", "quantity", "planned qty"],
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

export default function ProgrammePage() {
  const [programmeActivities, setProgrammeActivities] = useState<ProgrammeActivity[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [search, setSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [elevationFilter, setElevationFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [form, setForm] = useState<ProgrammeForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

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
      (!query || [item.programmeActivityId, item.activity, item.description, item.building, item.elevation, item.level, item.trade, item.wbs]
        .some((value) => value?.toLowerCase().includes(query))) &&
      (!buildingFilter || item.building === buildingFilter) &&
      (!elevationFilter || item.elevation === elevationFilter) &&
      (!levelFilter || item.level === levelFilter)
    );
  }, [programmeActivities, search, buildingFilter, elevationFilter, levelFilter]);

  const filterOptions = useMemo(() => ({
    buildings: [...new Set(programmeActivities.map((item) => item.building).filter(Boolean))].sort(),
    elevations: [...new Set(programmeActivities.map((item) => item.elevation).filter(Boolean))].sort(),
    levels: [...new Set(programmeActivities.map((item) => item.level).filter(Boolean))].sort(),
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

    if (!programmeActivityId || !activityName) {
      setError("Programme Activity ID and Activity are required.");
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

    const values = {
      programmeActivityId,
      building: form.building.trim(),
      elevation: form.elevation.trim(),
      level: form.level.trim(),
      activity: activityName,
      plannedQuantity: Number(form.plannedQuantity) || 0,
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
      activity: item.activity,
      plannedQuantity: item.plannedQuantity ? String(item.plannedQuantity) : "",
      unit: item.unit,
    });
    setError("");
    setMessage("");
    setImportSummary(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");

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
        ["activity", "Activity"],
      ].filter(([field]) => !hasColumn(headers, field)).map(([, label]) => label);

      if (missingColumns.length > 0) {
        setError(`Missing required column${missingColumns.length === 1 ? "" : "s"}: ${missingColumns.join(", ")}.`);
        return;
      }

      const rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet, { defval: "", raw: false });
      const imported: ProgrammeActivity[] = [];
      const rejectedRows: string[] = [];
      const importedIds = new Set<string>();

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const programmeActivityId = asText(valueFor(row, "programmeActivityId"));
        const activity = asText(valueFor(row, "activity"));
        const quantityValue = asText(valueFor(row, "plannedQuantity")).replace(/,/g, "");
        const plannedQuantity = quantityValue === "" ? 0 : Number(quantityValue);
        const key = programmeActivityId.toLowerCase();

        if (!programmeActivityId || !activity) {
          rejectedRows.push(`Row ${rowNumber}: Activity ID and Activity are required.`);
          return;
        }
        if (!Number.isFinite(plannedQuantity) || plannedQuantity < 0) {
          rejectedRows.push(`Row ${rowNumber}: Quantity must be a non-negative number.`);
          return;
        }
        if (importedIds.has(key)) {
          rejectedRows.push(`Row ${rowNumber}: duplicate Activity ID ${programmeActivityId}.`);
          return;
        }
        importedIds.add(key);

        imported.push({
          id: createId(),
          programmeActivityId,
          building: asText(valueFor(row, "building")),
          elevation: asText(valueFor(row, "elevation")),
          level: asText(valueFor(row, "level")),
          activity,
          description: asText(valueFor(row, "description")),
          trade: asText(valueFor(row, "trade")),
          wbs: asText(valueFor(row, "wbs")),
          unit: asText(valueFor(row, "unit")),
          plannedQuantity,
          plannedStart: asText(valueFor(row, "plannedStart")) || undefined,
          plannedFinish: asText(valueFor(row, "plannedFinish")) || undefined,
          createdAt: new Date().toISOString(),
        });
      });

      if (imported.length === 0) {
        setImportSummary({ fileName: file.name, totalRows: rows.length, added: 0, updated: 0, rejected: rejectedRows.length, rejectedRows });
        setError("No valid programme rows were found. Nothing was imported.");
        return;
      }

      const merged = new Map(programmeActivities.map((item) => [item.programmeActivityId.toLowerCase(), item]));
      const updatedCount = imported.filter((item) => merged.has(item.programmeActivityId.toLowerCase())).length;
      const addedCount = imported.length - updatedCount;

      if (updatedCount > 0 && !window.confirm(
        `${updatedCount} imported programme row${updatedCount === 1 ? " matches" : "s match"} existing Activity IDs. Overwrite ${updatedCount === 1 ? "this row" : "these rows"}?`
      )) {
        setError("Import cancelled. The existing programme was not changed.");
        return;
      }

      imported.forEach((item) => {
        const key = item.programmeActivityId.toLowerCase();
        const existing = merged.get(key);
        merged.set(key, existing ? { ...item, id: existing.id, createdAt: existing.createdAt } : item);
      });
      const updated = Array.from(merged.values());
      saveProgramme(updated);
      setProgrammeActivities(updated);
      setImportSummary({ fileName: file.name, totalRows: rows.length, added: addedCount, updated: updatedCount, rejected: rejectedRows.length, rejectedRows });
      setMessage("Programme import complete.");
    } catch (caught) {
      console.error("Unable to import programme:", caught);
      setError("The Excel file could not be read. Use an .xlsx or .xls workbook with a header row.");
    }
  }

  async function downloadProgrammeTemplate() {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet([{
      "Activity ID": "A1000",
      Building: "Block A",
      Elevation: "North",
      Level: "Level 01",
      Activity: "Install curtain wall panels",
      Description: "Example row — replace or remove before importing",
      Trade: "Facade",
      WBS: "1.2.3",
      Quantity: 100,
      Unit: "m²",
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
              <span>Activity *</span>
              <input value={form.activity} onChange={(event) => updateForm("activity", event.target.value)} placeholder="e.g. Install curtain wall" />
            </label>
            <label className="attendance-field">
              <span>Quantity</span>
              <input type="number" min="0" step="any" value={form.plannedQuantity} onChange={(event) => updateForm("plannedQuantity", event.target.value)} placeholder="0" />
            </label>
            <label className="attendance-field">
              <span>Unit</span>
              <input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="e.g. m², nr, lm" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="add-event-button" style={{ width: "auto", margin: 0 }}>{editingId ? "Save changes" : "Add activity"}</button>
            {editingId && <button type="button" className="secondary-button" onClick={resetForm}>Cancel edit</button>}
          </div>
        </form>

        <section style={{ padding: 20, marginBottom: 24, border: "1px solid #d7dde3", borderRadius: 18, background: "#f7f9fa" }}>
          <h2 style={{ marginTop: 0 }}>Import programme</h2>
          <p>Upload the first worksheet from Excel. Activity ID and Activity are required; matching Activity IDs update existing rows.</p>
          <div style={{ display: "flex", gap: 10, margin: "8px 0", flexWrap: "wrap" }}>
            <label className="add-event-button" style={{ display: "inline-flex", width: "auto", margin: 0, cursor: "pointer" }}>
              Import Excel
              <input type="file" accept=".xlsx,.xls" onChange={importExcel} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            </label>
            <button type="button" className="secondary-button" onClick={downloadProgrammeTemplate}>Download template</button>
          </div>
          <p style={{ marginBottom: 0, color: "#5f6b76", fontSize: 13 }}>Supported columns: Activity ID, Building, Elevation, Level, Activity, Description, Trade, WBS, Quantity, Unit, Planned Start, Planned Finish. Unknown columns are ignored.</p>
          {message && <p role="status" style={{ color: "#087443", fontWeight: 700 }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}
          {importSummary && (
            <div role="status" style={{ marginTop: 14, padding: 14, border: "1px solid #d7dde3", borderRadius: 12, background: "#ffffff" }}>
              <strong style={{ display: "block", marginBottom: 8 }}>Import summary — {importSummary.fileName}</strong>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14 }}>
                <span>{importSummary.totalRows} rows read</span>
                <span>{importSummary.added} added</span>
                <span>{importSummary.updated} updated</span>
                <span>{importSummary.rejected} rejected</span>
              </div>
              {importSummary.rejectedRows.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "#b42318", fontSize: 13 }}>
                  {importSummary.rejectedRows.slice(0, 5).map((reason) => <li key={reason}>{reason}</li>)}
                  {importSummary.rejectedRows.length > 5 && <li>{importSummary.rejectedRows.length - 5} more rejected rows</li>}
                </ul>
              )}
            </div>
          )}
        </section>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <strong>{programmeActivities.length} programme activit{programmeActivities.length === 1 ? "y" : "ies"}</strong>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search programme" style={{ width: "100%", maxWidth: 320, minHeight: 42, padding: "9px 12px", border: "1px solid #ccd3da", borderRadius: 10 }} />
        </div>

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
          <div style={{ display: "flex", alignItems: "end" }}>
            <button type="button" className="secondary-button" onClick={() => { setBuildingFilter(""); setElevationFilter(""); setLevelFilter(""); setSearch(""); }}>Clear filters</button>
          </div>
        </div>

        {programmeActivities.length === 0 ? (
          <section style={{ padding: 28, border: "1px dashed #b9c2ca", borderRadius: 18, background: "#f7f9fa", textAlign: "center" }}>
            <h2 style={{ marginTop: 0 }}>No programme imported</h2><p>Import an Excel programme to make planned work available on the timeline.</p>
          </section>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
              <thead><tr>{["Programme Activity ID", "Building", "Elevation", "Level", "Activity", "Planned", "Completed", "Remaining", "% Complete", "Labour hours", "Productivity", "Unit", ""].map((heading) => <th key={heading} style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #d7dde3" }}>{heading}</th>)}</tr></thead>
              <tbody>{filteredActivities.map((item) => {
                const progress = progressByActivityId.get(item.programmeActivityId);
                return (
                <tr key={item.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec", fontWeight: 700 }}>{item.programmeActivityId}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.building || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.elevation || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.level || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}><strong>{item.activity}</strong>{item.description && <small style={{ display: "block", color: "#5f6b76" }}>{item.description}</small>}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(progress?.plannedQuantity ?? 0)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(progress?.completedQuantity ?? 0)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(progress?.remainingQuantity ?? 0)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec", fontWeight: 700 }}>{formatNumber(progress?.percentageComplete ?? 0)}%</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(progress?.labourHours ?? 0)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{formatNumber(progress?.productivity ?? 0)} {item.unit ? `${item.unit}/hr` : "units/hr"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #e4e8ec" }}>{item.unit || "—"}</td>
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
