"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  plantInLookahead,
  plantReadiness,
  plantRiskReason,
} from "@/lib/plantReadiness";
import { suggestPlantMapping } from "@/lib/plantImport";
import {
  getActiveDate,
  getActiveProject,
  getActiveProjectId,
} from "@/lib/storage";
import {
  importPlantSchedule,
  loadPlant,
  updatePlant,
  type PlantRecord,
} from "@/lib/supabase/plantData";
import { loadPublishedProgramme } from "@/lib/supabase/programmeData";
import type { ProgrammeActivity } from "@/types/site";
const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
export default function PlantPage() {
  const projectId = getActiveProjectId(),
    today = getActiveDate();
  const [records, setRecords] = useState<PlantRecord[]>([]),
    [activities, setActivities] = useState<ProgrammeActivity[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [summary, setSummary] = useState<Record<string, number> | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [programme, plant] = await Promise.all([
        loadPublishedProgramme(projectId),
        loadPlant(projectId),
      ]);
      setActivities(programme.activities);
      setRecords(plant);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load plant.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  const byId = useMemo(
    () => new Map(activities.map((row) => [row.programmeActivityId, row])),
    [activities],
  );
  const rows = records
    .map((record) => {
      const activity = record.programme_activity_external_id
        ? byId.get(record.programme_activity_external_id)
        : undefined;
      const result = plantReadiness(
        {
          requiredFromDate: record.required_from_date,
          requiredToDate: record.required_to_date,
          onHireDate: record.on_hire_date,
          offHireRequestedDate: record.off_hire_requested_date,
          actualOffHireDate: record.actual_off_hire_date,
          explicitStatus: record.explicit_status,
          activeIssue: record.active_issue,
          activityComplete: Number(activity?.physicalPercentComplete) >= 100,
        },
        today,
      );
      return {
        record,
        activity,
        result,
        risk: plantRiskReason({
          description: record.description || record.plant_type,
          activityName: activity?.activity || "linked activity",
          result,
        }),
      };
    })
    .sort(
      (a, b) =>
        ({ RED: 0, AMBER: 1, GREY: 2, GREEN: 3 })[a.result.rag] -
        { RED: 0, AMBER: 1, GREY: 2, GREEN: 3 }[b.result.rag],
    );
  const lookahead = rows.filter(({ record, activity }) =>
    plantInLookahead(record, activity, today),
  );
  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
          type: "array",
          cellDates: false,
        }),
        sheet = workbook.Sheets[workbook.SheetNames[0]],
        sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: "",
        }),
        mapping = suggestPlantMapping(
          sourceRows[0] ? Object.keys(sourceRows[0]) : [],
        );
      if (!mapping.plantType || !mapping.hireReference)
        throw new Error(
          "Plant Type and Hire Reference columns are required. Common column names are mapped automatically.",
        );
      const result = await importPlantSchedule(
        projectId,
        file.name,
        sourceRows,
        mapping,
        activities,
      );
      setSummary(
        result.reduce<Record<string, number>>(
          (total, row) => ({
            ...total,
            [row.classification]: (total[row.classification] ?? 0) + 1,
          }),
          {},
        ),
      );
      await refresh();
      setMessage(
        "Plant schedule imported. Unmatched and invalid rows are reported.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to import plant list.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function edit(record: PlantRecord) {
    const status = window.prompt(
      "Status: PLANNED, BOOKED, ON HIRE, OFF-HIRE REQUESTED, OFF HIRED, ISSUE / AT RISK",
      record.explicit_status ?? "PLANNED",
    );
    if (status === null) return;
    const issue = status === "ISSUE / AT RISK";
    await updatePlant(record.id, {
      explicit_status: status,
      active_issue: issue,
    });
    await refresh();
  }
  async function date(
    record: PlantRecord,
    field: keyof PlantRecord,
    label: string,
  ) {
    const value = window.prompt(label, String(record[field] ?? ""));
    if (value === null) return;
    await updatePlant(record.id, { [field]: value || null });
    await refresh();
  }
  if (loading)
    return (
      <main className="plant-page">
        <div className="plant-shell">
          <p>Loading Plant…</p>
        </div>
      </main>
    );
  return (
    <main className="plant-page">
      <div className="plant-shell">
        <header className="plant-header">
          <div>
            <p className="eyebrow">Programme readiness</p>
            <h1>Plant</h1>
            <p>
              {getActiveProject()?.name ?? "Project"} · {dateLabel(today)}
            </p>
          </div>
          <label className="secondary-button">
            Import Plant List
            <input
              hidden
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={busy}
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
          </label>
        </header>
        {message && <p className="dashboard-notice">{message}</p>}
        {error && <p className="dashboard-notice error">{error}</p>}
        {summary && (
          <p className="dashboard-notice">
            Import:{" "}
            {Object.entries(summary)
              .map(([key, value]) => `${key} ${value}`)
              .join(" · ")}
          </p>
        )}
        <section>
          <h2>Next 14 Days — Plant Readiness</h2>
          <div className="plant-cards">
            {lookahead.map(({ record, activity, result, risk }) => (
              <article key={record.id}>
                <span className={`calloff-rag ${result.rag.toLowerCase()}`}>
                  {result.rag === "GREEN"
                    ? "●"
                    : result.rag === "AMBER"
                      ? "▲"
                      : result.rag === "RED"
                        ? "■"
                        : "◆"}{" "}
                  {result.rag}
                </span>
                <h3>{activity?.activity ?? record.plant_type}</h3>
                <p>
                  {[activity?.building, activity?.elevation, activity?.level]
                    .filter(Boolean)
                    .join(" / ") || "Area unavailable"}
                </p>
                <strong>
                  {record.description || record.plant_type} · {result.status}
                </strong>
                <p>
                  {risk ||
                    `${record.supplier || "Supplier unassigned"} · Required ${dateLabel(record.required_from_date || activity?.plannedStart)}`}
                </p>
              </article>
            ))}
            {!lookahead.length && (
              <p>No linked plant requirements fall within the next 14 days.</p>
            )}
          </div>
        </section>
        <section>
          <h2>Plant and Hire Records</h2>
          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "RAG",
                    "Status",
                    "Activity",
                    "Area",
                    "Plant Type",
                    "Description",
                    "Supplier",
                    "Hire Reference",
                    "Quantity",
                    "Required From",
                    "Required To",
                    "On Hire",
                    "Off-Hire Requested",
                    "Actual Off-Hire",
                    "Review",
                    "Notes",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ record, activity, result }) => (
                  <tr key={record.id}>
                    <td>
                      <span
                        className={`calloff-rag ${result.rag.toLowerCase()}`}
                      >
                        {result.rag}
                      </span>
                    </td>
                    <td>
                      {result.status}
                      <button
                        className="table-action"
                        onClick={() => edit(record)}
                      >
                        Update
                      </button>
                    </td>
                    <td>{activity?.activity || "—"}</td>
                    <td>
                      {[
                        activity?.building || record.building,
                        activity?.elevation || record.elevation,
                        activity?.level || record.level,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </td>
                    <td>{record.plant_type}</td>
                    <td>{record.description || "—"}</td>
                    <td>{record.supplier || "—"}</td>
                    <td>{record.hire_reference}</td>
                    <td>{record.quantity}</td>
                    <td>
                      {dateLabel(
                        record.required_from_date || activity?.plannedStart,
                      )}
                    </td>
                    <td>{dateLabel(record.required_to_date)}</td>
                    <td>
                      {dateLabel(record.on_hire_date)}
                      <button
                        className="table-action"
                        onClick={() =>
                          date(
                            record,
                            "on_hire_date",
                            "On-hire date YYYY-MM-DD",
                          )
                        }
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      {dateLabel(record.off_hire_requested_date)}
                      <button
                        className="table-action"
                        onClick={() =>
                          date(
                            record,
                            "off_hire_requested_date",
                            "Off-hire requested date YYYY-MM-DD",
                          )
                        }
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      {dateLabel(record.actual_off_hire_date)}
                      <button
                        className="table-action"
                        onClick={() =>
                          date(
                            record,
                            "actual_off_hire_date",
                            "Actual off-hire date YYYY-MM-DD",
                          )
                        }
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      {result.potentialOffHire ? (
                        <strong className="calloff-change">
                          Potential off-hire review required.
                        </strong>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{record.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
