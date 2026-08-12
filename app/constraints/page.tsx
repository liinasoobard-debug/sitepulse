"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  constraintCategories,
  constraintMovement,
  daysOpen,
  materialRiskSuggestion,
  mergeSuggestions,
  plantRiskSuggestion,
  recurringDisruptionSuggestions,
  type ConstraintRecord,
  type ConstraintRag,
  type ConstraintStatus,
} from "@/lib/constraints";
import { calculateCallOff } from "@/lib/materialCallOff";
import {
  getActiveDate,
  getActiveProject,
  getActiveProjectId,
} from "@/lib/storage";
import {
  createManualConstraint,
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
    [trackerStatus, setTrackerStatus] = useState<"ALL" | "OPEN" | "CLOSED">(
      "OPEN",
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [programme, constraints, materials, timeline, plant] =
        await Promise.all([
          loadPublishedProgramme(projectId),
          loadConstraints(projectId),
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
  const byId = useMemo(
    () => new Map(activities.map((row) => [row.programmeActivityId, row])),
    [activities],
  );
  const open = rows.filter((row) =>
      ["OPEN", "ACTIONED / MONITORING"].includes(row.status),
    ),
    suggested = rows.filter((row) => row.status === "SUGGESTED");
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
    .sort((a, b) => {
      const statusOrder =
        Number(a.status === "CLOSED") - Number(b.status === "CLOSED");
      if (statusOrder) return statusOrder;
      const ragOrder = { RED: 0, AMBER: 1, GREEN: 2, GREY: 3 };
      return ragOrder[a.rag] - ragOrder[b.rag];
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
      .prompt("RAG: GREEN, AMBER, RED or GREY", row.rag)
      ?.toUpperCase() as ConstraintRag | undefined;
    if (!rag || !["GREEN", "AMBER", "RED", "GREY"].includes(rag)) return;
    await updateConstraint(row, {
      owner,
      action_required: action,
      rag,
      latest_update: `Constraint updated: ${action}`,
    });
    await refresh();
  }
  async function manual() {
    const description = window.prompt("Constraint description");
    if (!description) return;
    const category = window.prompt(
      `Category: ${constraintCategories.join(", ")}`,
      "Other",
    );
    if (
      !category ||
      !constraintCategories.includes(
        category as (typeof constraintCategories)[number],
      )
    )
      return;
    const activityId =
      window.prompt("Programme Activity ID (optional)") || undefined;
    await createManualConstraint(
      projectId,
      { activityId, category, description },
      today,
    );
    await refresh();
    setMessage("Manual constraint raised.");
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
            <button className="primary-button" onClick={manual}>
              Raise Constraint
            </button>
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
          <div className="report-table-scroll">
            <table className="constraint-tracker-table">
              <thead>
                <tr>
                  {[
                    "RAG",
                    "Activity",
                    "Area",
                    "Constraint",
                    "Category",
                    "Owner",
                    "Opened",
                    "Required Resolution",
                    "Days Open",
                    "Status",
                    "Closed",
                    "Latest Action",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trackerRows.map((row) => {
                  const activity = byId.get(
                    row.programme_activity_external_id ?? "",
                  );
                  return (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={`calloff-rag ${row.rag.toLowerCase()}`}
                        >
                          {row.rag}
                        </span>
                      </td>
                      <td>{activity?.activity ?? "Project-wide"}</td>
                      <td>
                        {activity
                          ? [
                              activity.building,
                              activity.elevation,
                              activity.level,
                            ]
                              .filter(Boolean)
                              .join(" / ")
                          : "—"}
                      </td>
                      <td>
                        <strong>{row.description}</strong>
                      </td>
                      <td>{row.category}</td>
                      <td>{row.owner || "Unassigned"}</td>
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
                      <td>
                        <span
                          className={`constraint-status ${row.status === "CLOSED" ? "closed" : "open"}`}
                        >
                          {row.status === "CLOSED" ? "● Closed" : "◆ Open"}
                        </span>
                      </td>
                      <td>{dateLabel(row.closed_date)}</td>
                      <td>
                        {row.action_required || "—"}
                        <button
                          className="table-action"
                          onClick={() => edit(row)}
                        >
                          Update
                        </button>
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
                    <td colSpan={12}>No {trackerStatus.toLowerCase()} constraints.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
    </main>
  );
}
