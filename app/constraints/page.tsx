"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  constraintCategories,
  constraintMovement,
  daysOpen,
  effectiveConstraintRag,
  materialRiskSuggestion,
  mergeSuggestions,
  plantRiskSuggestion,
  recurringDisruptionSuggestions,
  type ConstraintRecord,
  type ConstraintRag,
  type ConstraintStatus,
  type ConstraintActivityLink,
  type BlockingRelationship,
} from "@/lib/constraints";
import { classifyConstraintImport, type ConstraintImportRow } from "@/lib/constraintImport";
import { calculateCallOff } from "@/lib/materialCallOff";
import {
  getActiveDate,
  getActiveProject,
  getActiveProjectId,
} from "@/lib/storage";
import {
  createManualConstraint,
  importConstraint,
  loadConstraintLinks,
  loadConstraints,
  saveSuggestions,
  updateConstraint,
} from "@/lib/supabase/constraintData";
import { loadMaterialData } from "@/lib/supabase/materialData";
import { loadPublishedProgramme } from "@/lib/supabase/programmeData";
import { loadTimelineEventsBetween } from "@/lib/supabase/timelineData";
import { loadPlant } from "@/lib/supabase/plantData";
import { plantReadiness, plantRiskReason } from "@/lib/plantReadiness";
import type { ProgrammeActivity } from "@/types/site";
import LinkedEvidence from "@/components/evidence/LinkedEvidence";
const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
export default function ConstraintsPage() {
  const projectId = getActiveProjectId(),
    today = getActiveDate();
  const [rows, setRows] = useState<ConstraintRecord[]>([]),
    [activities, setActivities] = useState<ProgrammeActivity[]>([]),
    [links, setLinks] = useState<ConstraintActivityLink[]>([]),
    [showForm, setShowForm] = useState(false),
    [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]),
    [projectWide, setProjectWide] = useState(false),
    [search, setSearch] = useState(""),
    [ragFilter, setRagFilter] = useState("ALL"),
    [statusFilter, setStatusFilter] = useState("ALL"),
    [categoryFilter, setCategoryFilter] = useState("ALL"),
    [buildingFilter, setBuildingFilter] = useState("ALL"),
    [elevationFilter, setElevationFilter] = useState("ALL"),
    [levelFilter, setLevelFilter] = useState("ALL"),
    [activityFilter, setActivityFilter] = useState("ALL"),
    [ownerFilter, setOwnerFilter] = useState("ALL"),
    [organisationFilter, setOrganisationFilter] = useState("ALL"),
    [sourceFilter, setSourceFilter] = useState("ALL"),
    [sortBy, setSortBy] = useState("RAG"),
    [overdueOnly, setOverdueOnly] = useState(false),
    [importPreview, setImportPreview] = useState<Array<ReturnType<typeof classifyConstraintImport> & { row: number }> | null>(null),
    [trackerStatus, setTrackerStatus] = useState<"ALL" | "OPEN" | "CLOSED">(
      "OPEN",
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [evidenceConstraint,setEvidenceConstraint]=useState<ConstraintRecord|null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [programme, constraints, constraintLinks, materials, timeline, plant] =
        await Promise.all([
          loadPublishedProgramme(projectId),
          loadConstraints(projectId),
          loadConstraintLinks(projectId),
          loadMaterialData(projectId),
          loadTimelineEventsBetween(projectId, "1000-01-01", today),
          loadPlant(projectId),
        ]);
      const byId = new Map(
        programme.activities.map((row) => [row.programmeActivityId, row]),
      );
      const materialSuggestions = materials.requirements.flatMap(
        (requirement) => {
          const activity = byId.get(requirement.programme_activity_external_id);
          if (!activity) return [];
          const supplierLead = materials.supplierProducts.find(
            (item) =>
              item.supplier === requirement.supplier &&
              item.material === requirement.material,
          )?.lead_time;
          const productLead = materials.defaults.find(
            (item) =>
              item.product_type ===
              (requirement.product_type || activity.productType),
          )?.lead_time;
          const result = calculateCallOff(
            {
              requiredOnSiteDate:
                requirement.required_on_site_date ?? undefined,
              plannedStart: activity.plannedStart,
              requirementLeadTime:
                requirement.requirement_lead_time ?? undefined,
              supplierProductLeadTime: supplierLead,
              productTypeLeadTime: productLead,
              projectLeadTime:
                materials.settings.project_default_lead_time ?? undefined,
              internalBuffer: materials.settings.internal_buffer,
              actualCallOffDate: requirement.actual_call_off_date ?? undefined,
              confirmedDeliveryDate:
                requirement.confirmed_delivery_date ?? undefined,
              actualDeliveryDate: requirement.actual_delivery_date ?? undefined,
            },
            today,
            materials.settings.warning_period,
          );
          const reason =
            result.status === "OVERDUE"
              ? "call-off is overdue"
              : result.rag === "RED"
                ? "confirmed delivery is after the required-on-site date"
                : "";
          const suggestion = materialRiskSuggestion(
            {
              activityId: activity.programmeActivityId,
              activityName: activity.activity,
              requiredDate: result.requiredDate,
              rag: result.rag,
              reason,
              sourceId: requirement.id,
            },
            today,
          );
          return suggestion ? [suggestion] : [];
        },
      );
      const plantSuggestions = plant.flatMap((record) => {
        const activity = record.programme_activity_external_id
          ? byId.get(record.programme_activity_external_id)
          : undefined;
        if (!activity) return [];
        const result = plantReadiness(
          {
            requiredFromDate:
              record.required_from_date ?? activity.plannedStart,
            requiredToDate: record.required_to_date,
            onHireDate:
              record.on_hire_date ||
              (record.confirmed_delivery_date &&
              ["CONFIRMED", "DELIVERED / ON SITE"].includes(
                record.explicit_status || "",
              )
                ? record.confirmed_delivery_date
                : null),
            offHireRequestedDate: record.off_hire_requested_date,
            actualOffHireDate: record.actual_off_hire_date,
            explicitStatus:
              record.actual_booking_date ||
              ["CALLED OFF / BOOKED", "CONFIRMED"].includes(
                record.explicit_status || "",
              )
                ? "BOOKED"
                : record.explicit_status === "ISSUE"
                  ? "ISSUE / AT RISK"
                  : record.explicit_status,
            activeIssue:
              record.active_issue || record.explicit_status === "ISSUE",
            activityComplete: Number(activity.physicalPercentComplete) >= 100,
          },
          today,
        );
        const reason = plantRiskReason({
          description: record.description || record.plant_type,
          activityName: activity.activity,
          result,
        });
        return reason
          ? [
              plantRiskSuggestion(
                {
                  activityId: activity.programmeActivityId,
                  requiredDate:
                    record.required_from_date || activity.plannedStart,
                  reason,
                  sourceId: record.id,
                },
                today,
              ),
            ]
          : [];
      });
      const suggestions = mergeSuggestions(
        [
          ...materialSuggestions,
          ...plantSuggestions,
          ...recurringDisruptionSuggestions(
            timeline,
            programme.activities,
            today,
          ),
        ],
        constraints,
      );
      await saveSuggestions(projectId, suggestions);
      setRows(
        suggestions.length ? await loadConstraints(projectId) : constraints,
      );
      setActivities(programme.activities);
      setLinks(constraintLinks);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load constraints.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, today]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  useEffect(() => {
    const activity = new URLSearchParams(window.location.search).get("activity");
    if (activity) queueMicrotask(() => setActivityFilter(activity));
  }, []);
  const byId = useMemo(
    () => new Map(activities.map((row) => [row.programmeActivityId, row])),
    [activities],
  );
  const evidenceActivity=evidenceConstraint?byId.get(links.find(link=>link.constraint_id===evidenceConstraint.id)?.programme_activity_external_id||""):undefined;
  const open = rows.filter((row) =>
      ["OPEN", "ACTIONED / MONITORING"].includes(row.status),
    ),
    suggested = rows.filter((row) => row.status === "SUGGESTED");
  const options = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
  const rowActivities = (row: ConstraintRecord) =>
    links
      .filter((link) => link.constraint_id === row.id)
      .map((link) => byId.get(link.programme_activity_external_id))
      .filter((activity): activity is ProgrammeActivity => Boolean(activity));
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const movement = constraintMovement(
    rows,
    start.toISOString().slice(0, 10),
    today,
  );
  const trackerRows = rows
    .filter((row) => !["SUGGESTED", "DISMISSED"].includes(row.status))
    .filter((row) =>
      trackerStatus === "ALL"
        ? true
        : trackerStatus === "CLOSED"
          ? row.status === "CLOSED"
          : ["OPEN", "ACTIONED / MONITORING"].includes(row.status),
    )
    .filter((row) => ragFilter === "ALL" || effectiveConstraintRag(row, today).effective === ragFilter)
    .filter((row) => statusFilter === "ALL" || row.status === statusFilter)
    .filter((row) => categoryFilter === "ALL" || row.category === categoryFilter)
    .filter((row) => buildingFilter === "ALL" || rowActivities(row).some((activity) => activity.building === buildingFilter))
    .filter((row) => elevationFilter === "ALL" || rowActivities(row).some((activity) => activity.elevation === elevationFilter))
    .filter((row) => levelFilter === "ALL" || rowActivities(row).some((activity) => activity.level === levelFilter))
    .filter((row) => activityFilter === "ALL" || links.some((link) => link.constraint_id === row.id && link.programme_activity_external_id === activityFilter))
    .filter((row) => ownerFilter === "ALL" || row.owner === ownerFilter)
    .filter((row) => organisationFilter === "ALL" || row.responsible_organisation === organisationFilter)
    .filter((row) => sourceFilter === "ALL" || row.source === sourceFilter)
    .filter((row) => !overdueOnly || effectiveConstraintRag(row, today).overdue)
    .filter((row) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      const activityNames = links.filter((link) => link.constraint_id === row.id).map((link) => byId.get(link.programme_activity_external_id)?.activity || link.programme_activity_external_id).join(" ");
      return [row.constraint_reference, row.description, row.owner, row.responsible_organisation, row.notes, activityNames].some((value) => value?.toLowerCase().includes(term));
    })
    .sort((a, b) => {
      const ragOrder = { RED: 0, AMBER: 1, GREEN: 2, GREY: 3 };
      const required = (row: ConstraintRecord) => String(row.overridden_required_date || row.calculated_required_date || "9999");
      const activity = (row: ConstraintRecord) => rowActivities(row)[0]?.activity || "";
      const comparisons: Record<string, number> = {
        RAG: ragOrder[effectiveConstraintRag(a, today).effective] - ragOrder[effectiveConstraintRag(b, today).effective] || required(a).localeCompare(required(b)),
        "DATE RAISED": String(a.raised_date || a.first_detected_date).localeCompare(String(b.raised_date || b.first_detected_date)),
        "REQUIRED BY": required(a).localeCompare(required(b)),
        "DAYS OPEN": daysOpen(b, today) - daysOpen(a, today),
        ACTIVITY: activity(a).localeCompare(activity(b)),
        CATEGORY: a.category.localeCompare(b.category),
        OWNER: String(a.owner || "").localeCompare(String(b.owner || "")),
        STATUS: a.status.localeCompare(b.status),
      };
      return comparisons[sortBy] || 0;
    });
  async function act(row: ConstraintRecord, status: ConstraintStatus) {
    await updateConstraint(row, {
      status,
      rag: status === "OPEN" ? row.rag : undefined,
      latest_update:
        status === "OPEN"
          ? "Suggested constraint confirmed by user."
          : status === "DISMISSED"
            ? "Suggestion dismissed by user."
            : undefined,
    });
    await refresh();
  }
  async function edit(row: ConstraintRecord) {
    const owner = window.prompt("Owner", row.owner ?? "");
    if (owner === null) return;
    const action = window.prompt("Action required", row.action_required ?? "");
    if (action === null) return;
    const rag = window
      .prompt(
        "Override RAG: GREEN, AMBER, RED or GREY",
        effectiveConstraintRag(row, today).effective,
      )
      ?.toUpperCase() as ConstraintRag | undefined;
    if (!rag || !["GREEN", "AMBER", "RED", "GREY"].includes(rag)) return;
    const reason = window.prompt(
      "RAG override reason (required)",
      row.rag_override_reason ?? "",
    );
    if (!reason?.trim()) return;
    await updateConstraint(row, {
      owner,
      action_required: action,
      override_rag: rag,
      rag_override_reason: reason,
      latest_update: `Constraint updated: ${action}`,
    });
    await refresh();
  }
  async function manual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) || "").trim();
    if (!projectWide && !selectedActivityIds.length) {
      setError("Select at least one programme activity or mark this as project-wide.");
      return;
    }
    await createManualConstraint(projectId, {
      activityIds: selectedActivityIds,
      projectWide,
      relationship: get("relationship") as BlockingRelationship,
      category: get("category"),
      description: get("description"),
      requiredDate: get("required_date") || undefined,
      owner: get("owner") || undefined,
      responsibleOrganisation: get("organisation") || undefined,
      status: get("status") as ConstraintStatus,
      rag: get("rag") as ConstraintRag,
      latestUpdate: get("latest_update") || undefined,
      impact: get("impact") || undefined,
      source: get("source") || "MANUAL",
      notes: get("notes") || undefined,
    }, get("raised_date") || today);
    setShowForm(false); setSelectedActivityIds([]); setProjectWide(false);
    await refresh(); setMessage("Constraint added to the register.");
  }
  function downloadTemplate() {
    const headings = ["Constraint ID","Category","Description","Programme Activity ID","Activity","Building","Elevation","Level","Blocking Relationship","Owner","Responsible Organisation","Date Raised","Required Resolution Date","Status","RAG","Latest Update","Programme / Forecast Impact","Source","Notes","Closed Date","Project Wide"];
    const sheet = XLSX.utils.json_to_sheet([{ "Constraint ID": "CON-EXAMPLE", Category: "Access", Description: "Example only — access scaffold incomplete", "Programme Activity ID": "A1000", Activity: "Example activity", "Blocking Relationship": "Blocking Progress", "Date Raised": today, Status: "OPEN", RAG: "AMBER", Source: "MANUAL", "Project Wide": "NO" }], { header: headings });
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Constraints"); XLSX.writeFile(book, "SitePulse-Constraints-Template.xlsx");
  }
  async function previewImport(file?: File) {
    if (!file) return;
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const source = XLSX.utils.sheet_to_json<ConstraintImportRow>(book.Sheets[book.SheetNames[0]], { defval: "" });
    const references = new Set(rows.flatMap((row) => row.constraint_reference ? [row.constraint_reference] : []));
    setImportPreview(source.map((row, index) => ({ ...classifyConstraintImport(row, activities, references), row: index + 2 })));
  }
  async function publishImport() {
    if (!importPreview) return;
    for (const item of importPreview) {
      if (!item.values || !["NEW", "UPDATED"].includes(item.classification)) continue;
      await importConstraint(projectId, { reference: item.values.reference || undefined, category: item.values.category, description: item.values.description, projectWide: item.values.projectWide, activityIds: item.activityIds, relationship: item.values.relationship as BlockingRelationship, raisedDate: item.values.raisedDate, requiredDate: item.values.requiredDate, owner: item.values.owner, responsibleOrganisation: item.values.organisation, status: item.values.status, rag: item.values.rag, latestUpdate: item.values.latestUpdate, impact: item.values.impact, source: item.values.source, notes: item.values.notes, closedDate: item.values.closedDate });
    }
    setImportPreview(null); await refresh(); setMessage("Constraints import published.");
  }
  function exportExcel(all = false) {
    const source = all ? rows.filter((row) => !["SUGGESTED","DISMISSED"].includes(row.status)) : trackerRows;
    const register = source.map((row) => { const rag = effectiveConstraintRag(row, today); return { Project: getActiveProject()?.name || "Project", "Constraint ID": row.constraint_reference || row.id, RAG: rag.effective, "Calculated RAG": rag.calculated, Status: row.status, Category: row.category, Description: row.description, Owner: row.owner || "", "Responsible Organisation": row.responsible_organisation || "", "Date Raised": row.raised_date || row.first_detected_date, "Required Resolution Date": row.overridden_required_date || row.calculated_required_date || "", "Days Open": daysOpen(row,today), Overdue: rag.overdue ? "YES" : "NO", "Latest Update": row.latest_update || "", "Programme / Forecast Impact": row.programme_forecast_impact || "", Source: row.source, "Closed Date": row.closed_date || "", Notes: row.notes || "" }; });
    const exportedIds = new Set(source.map((row) => row.id));
    const linkRows = links.filter((link) => exportedIds.has(link.constraint_id)).map((link) => { const activity = byId.get(link.programme_activity_external_id); const row = rows.find((item) => item.id === link.constraint_id); return { "Constraint ID": row?.constraint_reference || link.constraint_id, "Programme Activity ID": link.programme_activity_external_id, "Blocking Activity": activity?.activity || "", Building: activity?.building || "", Elevation: activity?.elevation || "", Level: activity?.level || "", "Blocking Relationship": link.blocking_relationship }; });
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(register), "Constraints"); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(linkRows.length ? linkRows : [{}]), "ConstraintActivityLinks"); XLSX.writeFile(book, `SitePulse-Constraints-${all ? "All" : "Filtered"}-${today}.xlsx`);
  }
  if (loading)
    return (
      <main className="constraints-page">
        <div className="constraints-shell">
          <p>Loading Constraints…</p>
        </div>
      </main>
    );
  return (
    <main className="constraints-page">
      <div className="constraints-shell">
        <header className="constraints-header">
          <div>
            <p className="eyebrow">Readiness and action</p>
            <h1>Constraints</h1>
            <p>
              {getActiveProject()?.name ?? "Project"} · Live at{" "}
              {dateLabel(today)}
            </p>
          </div>
          <div>
            <button className="primary-button" onClick={() => setShowForm(true)}>
              + Add Constraint
            </button>
            <label className="secondary-button">Import Constraints (.xlsx)<input hidden type="file" accept=".xlsx,.xls" onChange={(event) => void previewImport(event.target.files?.[0])} /></label>
            <button className="secondary-button" onClick={downloadTemplate}>Download Template</button>
            <button className="secondary-button" onClick={() => exportExcel(false)}>Export Filtered</button>
            <button className="secondary-button" onClick={() => exportExcel(true)}>Export All</button>
            <button className="secondary-button" onClick={() => window.print()}>
              Print Tracker
            </button>
          </div>
        </header>
        {message && <p className="dashboard-notice">{message}</p>}
        {error && (
          <p className="dashboard-notice error" role="alert">
            {error}
          </p>
        )}
        <section className="constraint-kpis no-print">
          <article>
            <strong>{open.length}</strong>
            <span>Open</span>
          </article>
          <article className="red">
            <strong>{movement.red.length}</strong>
            <span>Red</span>
          </article>
          <article className="amber">
            <strong>{movement.amber.length}</strong>
            <span>Amber</span>
          </article>
          <article className="green">
            <strong>{movement.green.length}</strong>
            <span>Green</span>
          </article>
          <article>
            <strong>{movement.newRows.length}</strong>
            <span>New this week</span>
          </article>
          <article>
            <strong>{movement.closed.length}</strong>
            <span>Closed this week</span>
          </article>
          <article className="red"><strong>{rows.filter((row) => effectiveConstraintRag(row,today).overdue).length}</strong><span>Overdue</span></article>
        </section>
        <section className="no-print">
          <h2>Suggested Constraints</h2>
          <p>
            Detected risks require confirmation; they are not automatically
            treated as formal constraints.
          </p>
          <div className="constraint-cards">
            {suggested.map((row) => (
              <article key={row.id}>
                <span className={`calloff-rag ${row.rag.toLowerCase()}`}>
                  {row.rag}
                </span>
                <h3>{row.description}</h3>
                <p>{row.latest_update}</p>
                <div>
                  <button
                    className="primary-button"
                    onClick={() => act(row, "OPEN")}
                  >
                    Confirm
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => act(row, "DISMISSED")}
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
            {!suggested.length && <p>No new suggested constraints.</p>}
          </div>
        </section>
        <section className="constraint-tracker">
          {!rows.some((row) => !["SUGGESTED", "DISMISSED"].includes(row.status)) ? (
            <div className="constraint-empty-state">
              <h2>No constraints recorded for this project.</h2>
              <p>Link a new constraint to programme work, or import the standard SitePulse workbook.</p>
              <div><button className="primary-button" onClick={() => setShowForm(true)}>+ Add Constraint</button><label className="secondary-button">Import Constraints<input hidden type="file" accept=".xlsx,.xls" onChange={(event) => void previewImport(event.target.files?.[0])} /></label></div>
            </div>
          ) : <>
          <div className="constraint-tracker-heading">
            <div>
              <p className="eyebrow">Printable register</p>
              <h2>Constraints Tracker</h2>
              <p className="print-only">
                {getActiveProject()?.name ?? "Project"} · Status: {trackerStatus}
                {" · "}Printed {dateLabel(today)}
              </p>
            </div>
            <label className="constraint-status-filter no-print">
              Status
              <select
                value={trackerStatus}
                onChange={(event) =>
                  setTrackerStatus(event.target.value as "ALL" | "OPEN" | "CLOSED")
                }
              >
                <option value="ALL">All</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
          </div>
          <div className="constraint-filters no-print">
            <label>Search Constraints<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label>RAG<select value={ragFilter} onChange={(event) => setRagFilter(event.target.value)}><option>ALL</option>{["RED","AMBER","GREEN","GREY"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>ALL</option>{["OPEN","ACTIONED / MONITORING","CLOSED","DISMISSED"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>ALL</option>{constraintCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Building<select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}><option>ALL</option>{options(activities.map((row) => row.building)).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Elevation<select value={elevationFilter} onChange={(event) => setElevationFilter(event.target.value)}><option>ALL</option>{options(activities.map((row) => row.elevation)).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Level<select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}><option>ALL</option>{options(activities.map((row) => row.level)).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Activity<select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="ALL">All</option>{activities.map((row) => <option key={row.programmeActivityId} value={row.programmeActivityId}>{row.activity} · {row.building} / {row.level}</option>)}</select></label>
            <label>Owner<select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option>ALL</option>{options(rows.map((row) => row.owner)).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Responsible Organisation<select value={organisationFilter} onChange={(event) => setOrganisationFilter(event.target.value)}><option>ALL</option>{options(rows.map((row) => row.responsible_organisation)).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Source<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>ALL</option>{options(rows.map((row) => row.source)).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{["RAG","DATE RAISED","REQUIRED BY","DAYS OPEN","ACTIVITY","CATEGORY","OWNER","STATUS"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="constraint-checkbox"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /> Overdue only</label>
            <button className="secondary-button" onClick={() => { setSearch(""); setRagFilter("ALL"); setStatusFilter("ALL"); setCategoryFilter("ALL"); setBuildingFilter("ALL"); setElevationFilter("ALL"); setLevelFilter("ALL"); setActivityFilter("ALL"); setOwnerFilter("ALL"); setOrganisationFilter("ALL"); setSourceFilter("ALL"); setTrackerStatus("ALL"); setOverdueOnly(false); setSortBy("RAG"); }}>Clear Filters</button>
          </div>
          <div className="report-table-scroll">
            <table className="constraint-tracker-table">
              <thead>
                <tr>
                  {[
                    "RAG",
                    "Constraint ID",
                    "Status",
                    "Category",
                    "Constraint Description",
                    "Blocking Activity",
                    "Programme Activity ID",
                    "Building",
                    "Elevation",
                    "Level",
                    "Owner",
                    "Responsible Organisation",
                    "Opened",
                    "Required Resolution",
                    "Days Open",
                    "Latest Update",
                    "Forecast / Programme Impact",
                    "Source",
                    "Closed",
                    "Notes / Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trackerRows.map((row) => {
                  const rowLinks = links.filter((link) => link.constraint_id === row.id);
                  const activity = byId.get(rowLinks[0]?.programme_activity_external_id || row.programme_activity_external_id || "");
                  const rag = effectiveConstraintRag(row, today);
                  return (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={`calloff-rag ${rag.effective.toLowerCase()}`}
                        >
                          {rag.effective === "GREEN" ? "●" : rag.effective === "AMBER" ? "▲" : rag.effective === "RED" ? "■" : "◆"} {rag.effective}{rag.overdue ? " · OVERDUE" : ""}
                        </span>
                      </td>
                      <td>{row.constraint_reference || row.id.slice(0,8)}</td><td>{row.status}</td><td>{row.category}</td><td><strong>{row.description}</strong></td>
                      <td>{activity?.activity ?? (row.project_wide ? "Project-wide" : "Unlinked")}{rowLinks.length > 1 && <details><summary>+ {rowLinks.length - 1} additional activities</summary>{rowLinks.slice(1).map((link) => { const linked = byId.get(link.programme_activity_external_id); return <p key={link.programme_activity_external_id}>{linked?.activity || link.programme_activity_external_id} · {link.blocking_relationship}</p>; })}</details>}</td>
                      <td>{activity?.programmeActivityId || "—"}</td>
                      <td>{activity?.building || "—"}</td>
                      <td>{activity?.elevation || "—"}</td>
                      <td>{activity?.level || "—"}</td>
                      <td>{row.owner || "Unassigned"}</td>
                      <td>{row.responsible_organisation || "—"}</td>
                      <td>
                        {dateLabel(row.raised_date || row.first_detected_date)}
                      </td>
                      <td>
                        {dateLabel(
                          row.overridden_required_date ||
                            row.calculated_required_date,
                        )}
                      </td>
                      <td>{daysOpen(row, today)}</td>
                      <td>{row.latest_update || "—"}</td><td>{row.programme_forecast_impact || "Evidence only; no automatic delay attribution."}</td><td>{row.source}</td>
                      <td>{dateLabel(row.closed_date)}</td>
                      <td>
                        {row.notes || row.action_required || "—"}
                        <button
                          className="table-action"
                          onClick={() => edit(row)}
                        >
                          Update
                        </button>
                        <button className="table-action" onClick={() => setEvidenceConstraint(row)}>Evidence</button>
                        {row.status === "CLOSED" ? (
                          <button
                            className="table-action"
                            onClick={() => act(row, "OPEN")}
                          >
                            Reopen
                          </button>
                        ) : (
                          <button
                            className="table-action"
                            onClick={() => act(row, "CLOSED")}
                          >
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!trackerRows.length && (
                  <tr>
                    <td colSpan={21}>No constraints match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="constraint-mobile-list">{trackerRows.map((row) => { const rag=effectiveConstraintRag(row,today); const rowLinks=links.filter((link)=>link.constraint_id===row.id); const activity=byId.get(rowLinks[0]?.programme_activity_external_id || ""); return <article key={row.id}><header><span className={`calloff-rag ${rag.effective.toLowerCase()}`}>{rag.effective}</span><strong>{row.constraint_reference || row.id.slice(0,8)}</strong><span>{row.status}</span></header><h3>{row.description}</h3><p>{activity?.activity || (row.project_wide ? "Project-wide" : "Unlinked")}</p><dl><div><dt>Required by</dt><dd>{dateLabel(row.overridden_required_date || row.calculated_required_date)}</dd></div><div><dt>Owner</dt><dd>{row.owner || "Unassigned"}</dd></div><div><dt>Days open</dt><dd>{daysOpen(row,today)}</dd></div></dl><button className="table-action" onClick={() => edit(row)}>Edit</button></article>; })}</div>
          </>}
        </section>
        <section className="constraint-summary">
          <h2>Management Summary</h2>
          <p>
            {open.length} constraints remain open. {movement.red.length} are Red
            and require immediate attention. {movement.newRows.length} new
            constraints were raised this week and {movement.closed.length} were
            closed.
          </p>
          <p>
            Constraint evidence provides delivery context only. No Critical Path
            or delay entitlement conclusion is made without reliable programme
            logic and float.
          </p>
        </section>
        <Link href="/dashboard" className="secondary-button">
          Back to Dashboard
        </Link>
      </div>
      {showForm && <div className="constraint-modal-backdrop"><form className="constraint-form-modal" onSubmit={(event) => void manual(event)}><header><div><p className="eyebrow">Operational register</p><h2>Add Constraint</h2></div><button type="button" onClick={() => setShowForm(false)}>×</button></header><div className="constraint-form-grid"><label>Category<select name="category" required>{constraintCategories.map((value)=><option key={value}>{value}</option>)}</select></label><label>RAG<select name="rag" defaultValue="GREY">{["GREEN","AMBER","RED","GREY"].map((value)=><option key={value}>{value}</option>)}</select></label><label className="wide">Description<textarea name="description" required rows={3}/></label><label className="wide constraint-checkbox"><input type="checkbox" checked={projectWide} onChange={(event)=>setProjectWide(event.target.checked)}/> Project-wide constraint</label><fieldset className="wide"><legend>Programme Activity / Activities</legend><div className="constraint-activity-picker">{activities.map((activity)=><label key={activity.id}><input type="checkbox" disabled={projectWide} checked={selectedActivityIds.includes(activity.programmeActivityId)} onChange={(event)=>setSelectedActivityIds((current)=>event.target.checked?[...current,activity.programmeActivityId]:current.filter((id)=>id!==activity.programmeActivityId))}/><span>{activity.building} → {activity.elevation} → {activity.level} → <strong>{activity.activity}</strong><small>{activity.programmeActivityId}</small></span></label>)}</div></fieldset><label>Blocking Relationship<select name="relationship" defaultValue="Blocking Progress">{["Blocking Start","Blocking Progress","Blocking Completion","Potential Risk","General Constraint"].map((value)=><option key={value}>{value}</option>)}</select></label><label>Status<select name="status" defaultValue="OPEN">{["OPEN","ACTIONED / MONITORING","CLOSED"].map((value)=><option key={value}>{value}</option>)}</select></label><label>Owner<input name="owner"/></label><label>Responsible Organisation<input name="organisation"/></label><label>Date Raised<input name="raised_date" type="date" defaultValue={today}/></label><label>Required Resolution Date<input name="required_date" type="date"/></label><label>Source<input name="source" defaultValue="MANUAL"/></label><label>Latest Update<input name="latest_update"/></label><label className="wide">Programme / Forecast Impact<textarea name="impact" rows={2}/></label><label className="wide">Notes<textarea name="notes" rows={2}/></label></div><footer><button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>Cancel</button><button className="primary-button">Save Constraint</button></footer></form></div>}
      {importPreview && <div className="constraint-modal-backdrop"><section className="constraint-form-modal"><header><div><p className="eyebrow">Excel import</p><h2>Import Preview</h2></div><button onClick={()=>setImportPreview(null)}>×</button></header><div className="report-table-scroll"><table><thead><tr><th>Row</th><th>Classification</th><th>Error</th></tr></thead><tbody>{importPreview.map((item)=><tr key={item.row}><td>{item.row}</td><td>{item.classification}</td><td>{item.error || "—"}</td></tr>)}</tbody></table></div><footer><button className="secondary-button" onClick={()=>setImportPreview(null)}>Cancel</button><button className="primary-button" disabled={importPreview.some((item)=>["INVALID","UNMATCHED ACTIVITY"].includes(item.classification))} onClick={()=>void publishImport()}>Publish Import</button></footer></section></div>}
      {evidenceConstraint&&<div className="constraint-modal-backdrop"><section className="constraint-form-modal"><header><div><p className="eyebrow">Linked operational record</p><h2>Constraint Evidence</h2><p>{evidenceConstraint.constraint_reference||evidenceConstraint.id.slice(0,8)} · {evidenceConstraint.description}</p></div><button onClick={()=>setEvidenceConstraint(null)}>×</button></header><LinkedEvidence context={{projectId,programmeActivityId:evidenceActivity?.programmeActivityId,activityName:evidenceActivity?.activity||evidenceConstraint.description,building:evidenceActivity?.building,elevation:evidenceActivity?.elevation,level:evidenceActivity?.level,productType:evidenceActivity?.productType,recordType:"constraint",recordId:evidenceConstraint.id,category:"Constraint",description:evidenceConstraint.description}}/><footer><button className="secondary-button" onClick={()=>setEvidenceConstraint(null)}>Close</button></footer></section></div>}
    </main>
  );
}
