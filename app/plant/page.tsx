"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { suggestPlantMapping } from "@/lib/plantImport";
import {
  indicativeIdleExposure,
  plantUtilisation,
} from "@/lib/plantOperations";
import {
  plantInLookahead,
  plantReadiness,
  plantRiskReason,
} from "@/lib/plantReadiness";
import {
  getActiveDate,
  getActiveProject,
  getActiveProjectId,
  loadDay,
} from "@/lib/storage";
import {
  allocatePlant,
  confirmPlantOffHire,
  createPlant,
  importPlantSchedule,
  loadPlant,
  loadPlantOperations,
  requestPlantOffHire,
  savePlantSettings,
  type PlantAllocation,
  type PlantRecord,
  type PlantSettings,
  type PlantUsage,
} from "@/lib/supabase/plantData";
import { loadPublishedProgramme } from "@/lib/supabase/programmeData";
import type { Crew, ProgrammeActivity, SiteDay } from "@/types/site";

type FormMode = "HIRE" | "REQUIREMENT" | null;
const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
const money = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      }).format(value);
const isOnSite = (row: PlantRecord) =>
  row.record_kind !== "REQUIREMENT" &&
  Boolean(row.on_hire_date || row.arrival_date) &&
  !row.actual_off_hire_date;

export default function PlantPage() {
  const projectId = getActiveProjectId();
  const today = getActiveDate();
  const [records, setRecords] = useState<PlantRecord[]>([]);
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]);
  const [allocations, setAllocations] = useState<PlantAllocation[]>([]);
  const [usage, setUsage] = useState<PlantUsage[]>([]);
  const [settings, setSettings] = useState<PlantSettings>({
    project_id: projectId,
    idle_warning_working_days: 3,
    idle_red_working_days: 5,
  });
  const [crews, setCrews] = useState<Crew[]>([]);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formActivityId, setFormActivityId] = useState("");
  const [formRequiredFrom, setFormRequiredFrom] = useState("");
  const [historyPlantId, setHistoryPlantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [programme, plant, operations] = await Promise.all([
        loadPublishedProgramme(projectId),
        loadPlant(projectId),
        loadPlantOperations(projectId),
      ]);
      setActivities(programme.activities);
      setRecords(plant);
      setAllocations(operations.allocations);
      setUsage(operations.usage);
      setSettings(operations.settings);
      const day = loadDay() as SiteDay | null;
      setCrews(day?.crews ?? []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load plant.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const byActivityId = useMemo(
    () => new Map(activities.map((row) => [row.programmeActivityId, row])),
    [activities],
  );
  const currentAllocation = useMemo(() => {
    const map = new Map<string, PlantAllocation>();
    for (const allocation of allocations) {
      if (
        allocation.allocated_from <= today &&
        (!allocation.allocated_to || allocation.allocated_to >= today) &&
        !map.has(allocation.plant_hire_record_id)
      )
        map.set(allocation.plant_hire_record_id, allocation);
    }
    return map;
  }, [allocations, today]);
  const lastUsage = useMemo(() => {
    const map = new Map<string, PlantUsage>();
    for (const row of usage)
      if (!map.has(row.plant_hire_record_id))
        map.set(row.plant_hire_record_id, row);
    return map;
  }, [usage]);
  const onSiteRows = records.filter(isOnSite).map((record) => {
    const allocation = currentAllocation.get(record.id);
    const latest = lastUsage.get(record.id);
    const activityId =
      allocation?.programme_activity_external_id ||
      record.programme_activity_external_id;
    const activity = activityId ? byActivityId.get(activityId) : undefined;
    const hasFutureAllocation = allocations.some(
      (row) =>
        row.plant_hire_record_id === record.id &&
        (!row.allocated_to || row.allocated_to >= today),
    );
    const utilisation = plantUtilisation({
      onHireDate: record.on_hire_date || record.arrival_date,
      lastUsedDate: latest?.usage_date,
      today,
      warningDays: settings.idle_warning_working_days,
      redDays: settings.idle_red_working_days,
      activityComplete: Number(activity?.physicalPercentComplete) >= 100,
      requiredToDate: record.required_to_date,
      hasCurrentOrFutureAllocation: hasFutureAllocation,
    });
    return {
      record,
      allocation,
      activity,
      latest,
      utilisation,
      exposure: indicativeIdleExposure({
        idleWorkingDays: utilisation.idleWorkingDays,
        dailyRate: record.daily_hire_cost,
        weeklyRate: record.weekly_hire_cost,
      }),
    };
  });
  const requirements = records.filter((row) => row.record_kind === "REQUIREMENT");
  const requirementRows = requirements.map((record) => {
    const activity = record.programme_activity_external_id
      ? byActivityId.get(record.programme_activity_external_id)
      : undefined;
    const result = plantReadiness(
      {
        requiredFromDate: record.required_from_date || activity?.plannedStart,
        requiredToDate: record.required_to_date,
        onHireDate:
          record.confirmed_delivery_date &&
          ["CONFIRMED", "DELIVERED / ON SITE"].includes(
            record.explicit_status || "",
          )
            ? record.confirmed_delivery_date
            : null,
        explicitStatus:
          record.actual_booking_date ||
          ["CALLED OFF / BOOKED", "CONFIRMED"].includes(
            record.explicit_status || "",
          )
            ? "BOOKED"
            : record.explicit_status === "ISSUE"
              ? "ISSUE / AT RISK"
              : "PLANNED",
        activeIssue: record.explicit_status === "ISSUE",
      },
      today,
    );
    return { record, activity, result };
  });
  const lookahead = requirementRows.filter(({ record, activity }) =>
    plantInLookahead(record, activity, today),
  );
  const due = requirementRows.filter(({ record }) =>
    ["CALL-OFF DUE", "CALLED OFF / BOOKED", "CONFIRMED"].includes(
      record.explicit_status || "",
    ),
  );
  const offHireReview = onSiteRows.filter(
    (row) => row.utilisation.offHireReview,
  );
  const usedToday = onSiteRows.filter(
    (row) => row.latest?.usage_date === today,
  ).length;
  const idleExposure = onSiteRows.reduce(
    (sum, row) => sum + (row.exposure ?? 0),
    0,
  );

  function downloadTemplate() {
    const headers = [
      "Record Kind",
      "Plant Type",
      "Description",
      "Asset / Fleet Number",
      "Supplier",
      "Hire Reference",
      "Quantity",
      "On-Hire Date",
      "Delivery / Arrival Date",
      "Required From",
      "Required To",
      "Call-Off Required By",
      "Actual Call-Off / Booking Date",
      "Confirmed Delivery Date",
      "Off-Hire Requested",
      "Actual Off-Hire",
      "Daily Hire Rate",
      "Weekly Hire Rate",
      "Programme Activity ID",
      "Building",
      "Elevation",
      "Level",
      "Status",
      "Notes",
    ];
    const examples = [
      {
        "Record Kind": "HIRE",
        "Plant Type": "MEWP",
        Description: "45m MEWP",
        "Asset / Fleet Number": "MEWP-01",
        Supplier: "Example Hire Co",
        "Hire Reference": "H-1001",
        Quantity: 1,
        "On-Hire Date": "2026-08-12",
        "Delivery / Arrival Date": "2026-08-12",
        "Weekly Hire Rate": 850,
        Status: "ON HIRE",
      },
      {
        "Record Kind": "REQUIREMENT",
        "Plant Type": "Vacuum Lifter",
        Description: "Glass vacuum lifter",
        Quantity: 1,
        "Required From": "2026-08-20",
        "Required To": "2026-08-25",
        "Call-Off Required By": "2026-08-17",
        "Programme Activity ID": "A1000",
        Status: "REQUIRED",
      },
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(examples, { header: headers });
    worksheet["!cols"] = headers.map((header) => ({
      wch: Math.max(14, Math.min(30, header.length + 2)),
    }));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Plant Import");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["SitePulse Plant Import Instructions"],
        ["Use one row for each plant hire/item or plant requirement."],
        ["Record Kind", "HIRE or REQUIREMENT."],
        ["Required fields", "Plant Type. HIRE also needs Hire Reference or Asset/Fleet Number. REQUIREMENT needs Required From."],
        ["Programme link", "Use the exact Programme Activity ID from SitePulse; leave blank for shared plant."],
        ["Dates", "Use YYYY-MM-DD."],
        ["Rates", "Optional numbers only; do not include currency symbols."],
        ["Re-import", "Rows are matched using the hire/asset reference, or requirement activity/type/date, to avoid duplicates."],
      ]),
      "Instructions",
    );
    XLSX.writeFile(workbook, "SitePulse-Plant-Import-Template.xlsx");
  }

  function exportPlantRegister() {
    const workbook = XLSX.utils.book_new();
    const exportRows = records.map((record) => {
      const allocation = currentAllocation.get(record.id);
      const latest = lastUsage.get(record.id);
      const operational = onSiteRows.find((row) => row.record.id === record.id);
      const activityId =
        allocation?.programme_activity_external_id ||
        record.programme_activity_external_id;
      return {
        "Record Kind": record.record_kind || "HIRE",
        "Plant Type": record.plant_type,
        Description: record.description || "",
        "Asset / Fleet Number": record.asset_number || "",
        Supplier: record.supplier || "",
        "Hire Reference": record.hire_reference || "",
        Quantity: record.quantity,
        "On-Hire Date": record.on_hire_date || "",
        "Delivery / Arrival Date": record.arrival_date || "",
        "Required From": record.required_from_date || "",
        "Required To": record.required_to_date || "",
        "Call-Off Required By": record.booking_required_by || "",
        "Actual Call-Off / Booking Date": record.actual_booking_date || "",
        "Confirmed Delivery Date": record.confirmed_delivery_date || "",
        "Off-Hire Requested": record.off_hire_requested_date || "",
        "Requested Collection": record.requested_collection_date || "",
        "Actual Off-Hire": record.actual_off_hire_date || "",
        "Daily Hire Rate": record.daily_hire_cost ?? "",
        "Weekly Hire Rate": record.weekly_hire_cost ?? "",
        "Current Gang": allocation?.gang_name || "",
        "Programme Activity ID": activityId || "",
        "Programme Activity": activityId
          ? byActivityId.get(activityId)?.activity || ""
          : "",
        Building: record.building || "",
        Elevation: record.elevation || "",
        Level: record.level || "",
        Status: record.explicit_status || "PLANNED",
        "Last Timeline Use": latest?.usage_date || "",
        "Working Days Idle": operational?.utilisation.idleWorkingDays ?? "",
        "Utilisation RAG": operational?.utilisation.rag || "",
        "Off-Hire Review": operational?.utilisation.offHireReview ? "YES" : "NO",
        "Off-Hire Review Reason": operational?.utilisation.reason || "",
        "Indicative Idle Hire Exposure": operational?.exposure ?? "",
        Notes: record.notes || "",
      };
    });
    const sheets: Array<[string, Record<string, unknown>[]]> = [
      ["Plant Register", exportRows],
      [
        "Allocations",
        allocations.map((row) => ({
          Plant: records.find((plant) => plant.id === row.plant_hire_record_id)?.description || row.plant_hire_record_id,
          "Asset / Hire Ref": (() => {
            const plant = records.find((item) => item.id === row.plant_hire_record_id);
            return plant?.asset_number || plant?.hire_reference || "";
          })(),
          Gang: row.gang_name || row.gang_id || "",
          "Programme Activity ID": row.programme_activity_external_id || "",
          "Allocated From": row.allocated_from,
          "Allocated To": row.allocated_to || "",
          Notes: row.notes || "",
        })),
      ],
      [
        "Timeline Usage",
        usage.map((row) => ({
          Date: row.usage_date,
          Plant: records.find((plant) => plant.id === row.plant_hire_record_id)?.description || row.plant_hire_record_id,
          Gang: row.gang_name || row.gang_id || "",
          "Programme Activity ID": row.programme_activity_external_id || "",
          Activity: byActivityId.get(row.programme_activity_external_id || "")?.activity || "",
          Hours: row.duration_hours ?? "",
          "Timeline Event ID": row.timeline_event_id,
        })),
      ],
    ];
    for (const [name, rows] of sheets)
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(rows.length ? rows : [{}]),
        name,
      );
    const safeProject = (getActiveProject()?.name || "SitePulse")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "");
    XLSX.writeFile(workbook, `${safeProject}-Plant-Register-${today}.xlsx`);
  }

  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const mapping = suggestPlantMapping(
        sourceRows[0] ? Object.keys(sourceRows[0]) : [],
      );
      if (!mapping.plantType)
        throw new Error("A Plant Type column is required.");
      const result = await importPlantSchedule(
        projectId,
        file.name,
        sourceRows,
        mapping,
        activities,
      );
      setSummary(
        result.reduce<Record<string, number>>((total, row) => {
          total[row.classification] = (total[row.classification] ?? 0) + 1;
          return total;
        }, {}),
      );
      await refresh();
      setMessage("Plant list imported. Existing site data was preserved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to import plant list.");
    } finally {
      setBusy(false);
    }
  }

  function chooseFormActivity(id: string) {
    setFormActivityId(id);
    const activity = byActivityId.get(id);
    setFormRequiredFrom(activity?.plannedStart || "");
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formMode) return;
    const formElement = event.currentTarget;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) || "").trim() || null;
    const number = (name: string) => {
      const value = Number(form.get(name));
      return Number.isFinite(value) && value > 0 ? value : null;
    };
    try {
      const activity = formActivityId
        ? byActivityId.get(formActivityId)
        : undefined;
      const created = await createPlant(projectId, {
        record_kind: formMode,
        plant_type: text("plant_type") || "Plant",
        description: text("description"),
        asset_number: text("asset_number"),
        supplier: text("supplier"),
        hire_reference: text("hire_reference"),
        quantity: number("quantity") || 1,
        on_hire_date: text("on_hire_date"),
        arrival_date: text("arrival_date"),
        daily_hire_cost: number("daily_hire_cost"),
        weekly_hire_cost: number("weekly_hire_cost"),
        programme_activity_external_id: formActivityId || null,
        building: text("building") || activity?.building || null,
        elevation: text("elevation") || activity?.elevation || null,
        level: text("level") || activity?.level || null,
        required_from_date: formRequiredFrom || null,
        required_to_date: text("required_to_date"),
        booking_required_by: text("booking_required_by"),
        actual_booking_date: text("actual_booking_date"),
        confirmed_delivery_date: text("confirmed_delivery_date"),
        notes: text("notes"),
        explicit_status:
          text("status") || (formMode === "HIRE" ? "PLANNED" : "REQUIRED"),
      });
      const gangId = text("gang_id");
      if (gangId || formActivityId) {
        const gang = crews.find((row) => row.id === gangId);
        await allocatePlant(projectId, created.id, {
          gang_id: gangId,
          gang_name: gang?.name || null,
          programme_activity_external_id: formActivityId || null,
          allocated_from: formRequiredFrom || today,
          allocated_to: text("required_to_date"),
        });
      }
      await refresh();
      setMessage(formMode === "HIRE" ? "Plant added." : "Plant requirement created.");
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      if (submitter?.value !== "another") setFormMode(null);
      else {
        formElement.reset();
        setFormActivityId("");
        setFormRequiredFrom("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save plant.");
    } finally {
      setBusy(false);
    }
  }

  async function reallocate(row: PlantRecord) {
    const crewLabel = crews.map((crew) => `${crew.id}: ${crew.name}`).join("\n");
    const gangId = window.prompt(`Gang ID (optional)\n${crewLabel}`, "");
    if (gangId === null) return;
    const activityId = window.prompt("Programme Activity ID (optional)", "");
    if (activityId === null) return;
    const gang = crews.find((crew) => crew.id === gangId);
    await allocatePlant(projectId, row.id, {
      gang_id: gangId || null,
      gang_name: gang?.name || null,
      programme_activity_external_id: activityId || null,
      allocated_from: today,
    });
    await refresh();
  }

  async function requestOffHire(row: PlantRecord) {
    const requested = window.prompt("Requested collection date YYYY-MM-DD", today);
    if (requested === null) return;
    const reference = window.prompt("Reference / confirmation", "");
    if (reference === null) return;
    const notes = window.prompt("Off-hire notes", "");
    if (notes === null) return;
    await requestPlantOffHire(row.id, {
      requested_collection_date: requested || null,
      off_hire_reference: reference || null,
      off_hire_notes: notes || null,
    });
    await refresh();
  }

  async function confirmOffHire(row: PlantRecord) {
    const actual = window.prompt("Actual off-hire date YYYY-MM-DD", today);
    if (!actual) return;
    const returned = window.prompt("Collected / returned", "Collected");
    if (returned === null) return;
    const notes = window.prompt("Final notes", "");
    if (notes === null) return;
    await confirmPlantOffHire(row.id, {
      actual_off_hire_date: actual,
      collected_or_returned: returned || null,
      final_off_hire_notes: notes || null,
    });
    await refresh();
  }

  async function configureIdle() {
    const warning = Number(
      window.prompt("Amber after working days", String(settings.idle_warning_working_days)),
    );
    const red = Number(
      window.prompt("Red/off-hire review after working days", String(settings.idle_red_working_days)),
    );
    if (!Number.isInteger(warning) || !Number.isInteger(red) || warning < 0 || red <= warning) {
      setError("Red threshold must be a whole number greater than the Amber threshold.");
      return;
    }
    await savePlantSettings({
      project_id: projectId,
      idle_warning_working_days: warning,
      idle_red_working_days: red,
    });
    await refresh();
  }

  if (loading)
    return <main className="plant-page"><div className="plant-shell"><p>Loading Plant…</p></div></main>;

  return (
    <main className="plant-page">
      <div className="plant-shell">
        <header className="plant-header">
          <div>
            <p className="eyebrow">Plant operations</p>
            <h1>Plant</h1>
            <p>What plant is currently on site and are we actually using it?</p>
            <small>{getActiveProject()?.name ?? "Project"} · {dateLabel(today)}</small>
          </div>
          <div className="plant-actions">
            <button className="primary-button" onClick={() => setFormMode("HIRE")}>+ Add Plant</button>
            <button className="secondary-button" onClick={() => setFormMode("REQUIREMENT")}>+ Plant Requirement / Call-Off</button>
            <label className="secondary-button">Import Plant List<input hidden type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(event) => void importFile(event.target.files?.[0])} /></label>
            <button className="secondary-button" onClick={downloadTemplate}>Download Excel Template</button>
            <button className="secondary-button" onClick={exportPlantRegister}>Export Excel</button>
          </div>
        </header>

        {message && <p className="dashboard-notice">{message}</p>}
        {error && <p className="dashboard-notice error" role="alert">{error}</p>}
        {summary && <p className="dashboard-notice">Import: {Object.entries(summary).map(([key, value]) => `${key} ${value}`).join(" · ")}</p>}

        {!records.length && (
          <section className="plant-empty">
            <h2>No plant currently recorded</h2>
            <p>Add plant manually or import an existing hire register.</p>
            <div><button className="primary-button" onClick={() => setFormMode("HIRE")}>+ Add Plant</button><label className="secondary-button">Import Plant List<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void importFile(event.target.files?.[0])} /></label></div>
          </section>
        )}

        <section className="plant-kpis">
          <article><strong>{onSiteRows.length}</strong><span>On hire</span></article>
          <article><strong>{usedToday}</strong><span>Used today</span></article>
          <article className="amber"><strong>{onSiteRows.filter((row) => row.utilisation.rag === "AMBER").length}</strong><span>Idle / no recent use</span></article>
          <article className="red"><strong>{offHireReview.length}</strong><span>Off-hire review</span></article>
          <article><strong>{onSiteRows.filter((row) => row.record.explicit_status === "OFF-HIRE REQUESTED").length}</strong><span>Off-hire requested</span></article>
          <article><strong>{money(idleExposure || null)}</strong><span>Indicative idle hire exposure</span></article>
        </section>

        <div className="plant-section-heading"><div><h2>On Site Now</h2><p>Timeline usage is the evidence of use; allocation is shown separately.</p></div><button className="table-action" onClick={() => void configureIdle()}>Configure idle thresholds ({settings.idle_warning_working_days}/{settings.idle_red_working_days} days)</button></div>
        <section className="plant-operational-grid">
          {onSiteRows.map(({ record, allocation, activity, latest, utilisation, exposure }) => (
            <article className="plant-operational-card" key={record.id}>
              <header><div><h3>{record.description || record.plant_type}</h3><span>{record.asset_number || record.hire_reference || "No reference"}</span></div><span className={`calloff-rag ${utilisation.rag.toLowerCase()}`}>{utilisation.rag === "GREEN" ? "●" : utilisation.rag === "AMBER" ? "▲" : utilisation.rag === "RED" ? "■" : "◆"} {utilisation.rag}</span></header>
              <dl>
                <div><dt>Supplier</dt><dd>{record.supplier || "—"}</dd></div>
                <div><dt>On hire since</dt><dd>{dateLabel(record.on_hire_date || record.arrival_date)}</dd></div>
                <div><dt>Current gang</dt><dd>{allocation?.gang_name || "No gang"}</dd></div>
                <div><dt>Current activity</dt><dd>{activity?.activity || "No activity"}</dd></div>
                <div><dt>Last used</dt><dd>{latest?.usage_date === today ? "Today" : dateLabel(latest?.usage_date)}</dd></div>
                <div><dt>Working days idle</dt><dd>{utilisation.idleWorkingDays ?? "No usage evidence"}</dd></div>
                {exposure !== null && <div><dt>Indicative idle exposure</dt><dd>{money(exposure)}</dd></div>}
              </dl>
              {utilisation.reason && <p className="plant-review-note">Review for off-hire — {utilisation.reason}</p>}
              <footer><button onClick={() => setHistoryPlantId(record.id)}>Usage</button><button onClick={() => void reallocate(record)}>Reallocate</button>{record.explicit_status === "OFF-HIRE REQUESTED" ? <button onClick={() => void confirmOffHire(record)}>Confirm Off-Hire</button> : <button onClick={() => void requestOffHire(record)}>Request Off-Hire</button>}</footer>
            </article>
          ))}
          {!onSiteRows.length && <p>No plant is currently recorded as on site.</p>}
        </section>

        <section>
          <h2>Due / Called Off</h2>
          <div className="plant-cards">
            {due.map(({ record, activity, result }) => <article key={record.id}><span className={`calloff-rag ${result.rag.toLowerCase()}`}>{result.rag}</span><h3>{record.description || record.plant_type}</h3><p>{activity?.activity || "No linked activity"}</p><strong>{record.explicit_status}</strong><p>Required {dateLabel(record.required_from_date || activity?.plannedStart)} · Delivery {dateLabel(record.confirmed_delivery_date)}</p></article>)}
            {!due.length && <p>No plant is currently due or called off.</p>}
          </div>
        </section>

        <section>
          <h2>Off-Hire Review</h2>
          <div className="plant-cards">{offHireReview.map(({ record, utilisation, exposure }) => <article key={record.id}><span className="calloff-rag red">■ RED</span><h3>{record.description || record.plant_type}</h3><p>{utilisation.reason}</p>{exposure !== null && <strong>Indicative exposure {money(exposure)}</strong>}<button className="table-action" onClick={() => void requestOffHire(record)}>Request Off-Hire</button></article>)}{!offHireReview.length && <p>No plant currently requires off-hire review.</p>}</div>
        </section>

        <section>
          <h2>Next 14 Days Requirements</h2>
          <div className="plant-cards">{lookahead.map(({ record, activity, result }) => <article key={record.id}><span className={`calloff-rag ${result.rag.toLowerCase()}`}>{result.rag === "GREEN" ? "●" : result.rag === "AMBER" ? "▲" : "■"} {result.rag}</span><h3>{record.description || record.plant_type}</h3><p>{activity?.activity || [record.building, record.elevation, record.level].filter(Boolean).join(" / ") || "Area not assigned"}</p><strong>{record.quantity} required · {record.explicit_status || "REQUIRED"}</strong><p>{plantRiskReason({ description: record.description || record.plant_type, activityName: activity?.activity || "planned work", result }) || `Required from ${dateLabel(record.required_from_date || activity?.plannedStart)}`}</p></article>)}{!lookahead.length && <p>No linked plant requirements fall within the next 14 days.</p>}</div>
        </section>

        <section>
          <h2>Hire History</h2>
          <div className="report-table-scroll"><table className="plant-history-table"><thead><tr>{["Plant", "Asset / Hire Ref", "Supplier", "On Hire", "Off-Hire Requested", "Actual Off-Hire", "Status", "Notes"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{records.filter((row) => row.record_kind !== "REQUIREMENT").map((record) => <tr key={record.id}><td>{record.description || record.plant_type}</td><td>{record.asset_number || record.hire_reference || "—"}</td><td>{record.supplier || "—"}</td><td>{dateLabel(record.on_hire_date || record.arrival_date)}</td><td>{dateLabel(record.off_hire_requested_date)}</td><td>{dateLabel(record.actual_off_hire_date)}</td><td>{record.explicit_status || "PLANNED"}</td><td>{record.final_off_hire_notes || record.notes || "—"}</td></tr>)}</tbody></table></div>
        </section>
      </div>

      {formMode && (
        <div className="plant-modal-backdrop" role="presentation">
          <form className="plant-form-modal" onSubmit={(event) => void saveForm(event)}>
            <header><div><p className="eyebrow">{formMode === "HIRE" ? "On-site / hired plant" : "Upcoming need"}</p><h2>{formMode === "HIRE" ? "Add Plant" : "Plant Requirement / Call-Off"}</h2></div><button type="button" aria-label="Close" onClick={() => setFormMode(null)}>×</button></header>
            <div className="plant-form-grid">
              <label>Plant Type *<input name="plant_type" required /></label><label>Description<input name="description" /></label><label>Asset / Fleet Number<input name="asset_number" /></label><label>Supplier<input name="supplier" /></label><label>Hire Reference<input name="hire_reference" /></label><label>Quantity<input name="quantity" type="number" min="1" step="1" defaultValue="1" /></label>
              {formMode === "HIRE" ? <><label>On-Hire Date<input name="on_hire_date" type="date" defaultValue={today} /></label><label>Delivery / Arrival Date<input name="arrival_date" type="date" /></label><label>Daily Hire Rate<input name="daily_hire_cost" type="number" min="0" step="0.01" /></label><label>Weekly Hire Rate<input name="weekly_hire_cost" type="number" min="0" step="0.01" /></label></> : <><label>Required From<input name="required_from_date" type="date" value={formRequiredFrom} onChange={(event) => setFormRequiredFrom(event.target.value)} /></label><label>Required To<input name="required_to_date" type="date" /></label><label>Call-Off Required By<input name="booking_required_by" type="date" /></label><label>Actual Call-Off / Booking<input name="actual_booking_date" type="date" /></label><label>Confirmed Delivery<input name="confirmed_delivery_date" type="date" /></label></>}
              <label>Gang (optional)<select name="gang_id"><option value="">Shared / no gang</option>{crews.map((crew) => <option key={crew.id} value={crew.id}>{crew.name}</option>)}</select></label>
              <label>Programme Activity (optional)<select value={formActivityId} onChange={(event) => chooseFormActivity(event.target.value)}><option value="">Shared / no activity</option>{activities.map((activity) => <option key={activity.id} value={activity.programmeActivityId}>{activity.activity} — {activity.programmeActivityId}</option>)}</select></label>
              <label>Building<input name="building" /></label><label>Elevation<input name="elevation" /></label><label>Level / Area<input name="level" /></label>
              <label>Status<select name="status" defaultValue={formMode === "HIRE" ? "ON HIRE" : "REQUIRED"}>{(formMode === "HIRE" ? ["PLANNED", "BOOKED", "ON HIRE", "ISSUE / AT RISK"] : ["REQUIRED", "CALL-OFF DUE", "CALLED OFF / BOOKED", "CONFIRMED", "DELIVERED / ON SITE", "ISSUE"]).map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="plant-form-wide">Notes<textarea name="notes" rows={3} /></label>
            </div>
            <footer><button type="submit" className="secondary-button" name="save" value="another" disabled={busy}>Save & Add Another</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save"}</button></footer>
          </form>
        </div>
      )}

      {historyPlantId && (
        <div className="plant-modal-backdrop" role="presentation">
          <section className="plant-form-modal"><header><div><p className="eyebrow">Timeline evidence</p><h2>Plant Usage History</h2></div><button type="button" aria-label="Close" onClick={() => setHistoryPlantId(null)}>×</button></header><div className="report-table-scroll"><table><thead><tr><th>Date</th><th>Gang</th><th>Programme Activity</th><th>Hours</th><th>Timeline Event</th></tr></thead><tbody>{usage.filter((row) => row.plant_hire_record_id === historyPlantId).map((row) => <tr key={row.id}><td>{dateLabel(row.usage_date)}</td><td>{row.gang_name || row.gang_id || "—"}</td><td>{byActivityId.get(row.programme_activity_external_id || "")?.activity || "—"}</td><td>{row.duration_hours ?? "—"}</td><td>{row.timeline_event_id}</td></tr>)}</tbody></table></div>{!usage.some((row) => row.plant_hire_record_id === historyPlantId) && <p>No Timeline usage has been recorded for this plant.</p>}</section>
        </div>
      )}
    </main>
  );
}
