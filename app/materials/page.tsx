"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateCallOff, materialStage } from "@/lib/materialCallOff";
import { suggestMaterialMapping } from "@/lib/materialImport";
import * as XLSX from "xlsx";
import {
  getActiveDate,
  getActiveProject,
  getActiveProjectId,
} from "@/lib/storage";
import {
  loadProjectRole,
  loadPublishedProgramme,
} from "@/lib/supabase/programmeData";
import {
  generateCallOffSchedule,
  importMaterialSchedule,
  loadMaterialData,
  saveMaterialSettings,
  saveProductDefault,
  updateMaterialRequirement,
  type MaterialRequirement,
  type MaterialSettings,
  type ProductDefault,
  type SupplierProduct,
} from "@/lib/supabase/materialData";
import type { ProgrammeActivity } from "@/types/site";

const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
const numberLabel = (value?: number | null) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export default function MaterialsPage() {
  const projectId = getActiveProjectId(),
    today = getActiveDate();
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]),
    [requirements, setRequirements] = useState<MaterialRequirement[]>([]),
    [settings, setSettings] = useState<MaterialSettings>({
      project_default_lead_time: null,
      internal_buffer: 0,
      warning_period: 5,
    }),
    [defaults, setDefaults] = useState<ProductDefault[]>([]),
    [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]),
    [role, setRole] = useState<string>(),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [productType, setProductType] = useState(""),
    [productLead, setProductLead] = useState(""),
    [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
  const canManage = Boolean(role);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [programme, materialData, currentRole] = await Promise.all([
        loadPublishedProgramme(projectId),
        loadMaterialData(projectId),
        loadProjectRole(projectId),
      ]);
      setActivities(programme.activities);
      setRequirements(materialData.requirements);
      setSettings(materialData.settings);
      setDefaults(materialData.defaults);
      setSupplierProducts(materialData.supplierProducts);
      setRole(currentRole);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load materials.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);
  const activityById = useMemo(
    () => new Map(activities.map((row) => [row.programmeActivityId, row])),
    [activities],
  );
  const rows = requirements
    .map((requirement) => {
      const activity = activityById.get(
        requirement.programme_activity_external_id,
      );
      const supplierLead = supplierProducts.find(
        (row) =>
          row.supplier === requirement.supplier &&
          row.material === requirement.material,
      )?.lead_time;
      const productLead = defaults.find(
        (row) =>
          row.product_type ===
          (requirement.product_type || activity?.productType),
      )?.lead_time;
      return {
        requirement,
        activity,
        result: calculateCallOff(
          {
            requiredOnSiteDate: requirement.required_on_site_date ?? undefined,
            plannedStart: activity?.plannedStart,
            requirementLeadTime: requirement.requirement_lead_time ?? undefined,
            supplierProductLeadTime: supplierLead,
            productTypeLeadTime: productLead,
            projectLeadTime: settings.project_default_lead_time ?? undefined,
            internalBuffer: settings.internal_buffer,
            actualCallOffDate: requirement.actual_call_off_date ?? undefined,
            confirmedDeliveryDate:
              requirement.confirmed_delivery_date ?? undefined,
            actualDeliveryDate: requirement.actual_delivery_date ?? undefined,
            overrideDate: requirement.overridden_call_off_date ?? undefined,
          },
          today,
          settings.warning_period,
        ),
        stage: materialStage({ orderDate: requirement.order_date ?? undefined, actualCallOffDate: requirement.actual_call_off_date ?? undefined, confirmedDeliveryDate: requirement.confirmed_delivery_date ?? undefined, actualDeliveryDate: requirement.actual_delivery_date ?? undefined, materialIssue: requirement.material_issue }),
      };
    })
    .sort(
      (a, b) =>
        ({ RED: 0, AMBER: 1, GREY: 2, GREEN: 3 })[a.result.rag] -
        { RED: 0, AMBER: 1, GREY: 2, GREEN: 3 }[b.result.rag],
    );
  async function generate() {
    setBusy(true);
    try {
      const count = await generateCallOffSchedule(
        projectId,
        activities,
        today,
        settings,
        defaults,
        supplierProducts,
        requirements,
      );
      await refresh();
      setMessage(
        `${count} material requirement${count === 1 ? "" : "s"} generated or refreshed. Actual procurement dates were preserved.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to generate schedule.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importSchedule(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const mapping = suggestMaterialMapping(sourceRows[0] ? Object.keys(sourceRows[0]) : []);
      if (!mapping.description || (!mapping.materialCode && !mapping.programmeActivityId && !mapping.poNumber && !mapping.orderReference)) throw new Error("Unable to map this schedule automatically. Include Description plus Programme Activity ID, Material Code, PO Number or Order Reference.");
      const result = await importMaterialSchedule(projectId, file.name, sourceRows, mapping, activities);
      setImportSummary(result.reduce<Record<string, number>>((total, row) => ({ ...total, [row.classification]: (total[row.classification] ?? 0) + 1 }), {}));
      await refresh(); setMessage("Material schedule imported. Unmatched and invalid rows are reported and not silently discarded.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to import material schedule."); }
    finally { setBusy(false); }
  }
  async function editDate(
    row: MaterialRequirement,
    field: keyof MaterialRequirement,
    label: string,
  ) {
    const value = window.prompt(label, String(row[field] ?? ""));
    if (value === null) return;
    const changes: Partial<MaterialRequirement> = { [field]: value || null };
    if (field === "overridden_call_off_date") {
      const reason = window.prompt(
        "Override reason (required)",
        row.override_reason ?? "",
      );
      if (!reason?.trim()) return;
      const { data } = await (await import("@/lib/supabase/client"))
        .createClient()
        .auth.getUser();
      changes.override_reason = reason.trim();
      changes.overridden_by = data.user?.id;
      changes.overridden_at = new Date().toISOString();
    }
    await updateMaterialRequirement(row.id, changes);
    await refresh();
  }
  async function saveSettings() {
    setBusy(true);
    try {
      await saveMaterialSettings(projectId, settings);
      if (productType.trim() && Number(productLead) >= 0)
        await saveProductDefault(
          projectId,
          productType.trim(),
          Number(productLead),
        );
      await refresh();
      setProductType("");
      setProductLead("");
      setMessage("Call-off settings saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function editRequirement(row: MaterialRequirement) {
    const supplier = window.prompt("Supplier", row.supplier ?? "");
    if (supplier === null) return;
    const required = window.prompt(
      "Required on site date (YYYY-MM-DD; blank uses programme start)",
      row.required_on_site_date ?? "",
    );
    if (required === null) return;
    const lead = window.prompt(
      "Requirement lead time in working days (blank uses supplier/product or defaults)",
      row.requirement_lead_time?.toString() ?? "",
    );
    if (lead === null) return;
    await updateMaterialRequirement(row.id, {
      supplier: supplier || null,
      required_on_site_date: required || null,
      requirement_lead_time: lead === "" ? null : Number(lead),
    });
    await refresh();
  }
  if (loading)
    return (
      <main className="materials-page">
        <div className="materials-shell">
          <p>Loading Materials…</p>
        </div>
      </main>
    );
  return (
    <main className="materials-page">
      <div className="materials-shell">
        <header className="materials-header">
          <div>
            <p className="eyebrow">Procurement readiness</p>
            <h1>Materials · Call-Off Schedule</h1>
            <p>
              {getActiveProject()?.name ?? "Project"} · {dateLabel(today)}
            </p>
          </div>
          {canManage && (
            <div>
              <label className="secondary-button">Import Order Schedule<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void importSchedule(event.target.files?.[0])} /></label>
              <button className="primary-button" disabled={busy} onClick={generate}>Generate Call-Off Schedule</button>
            </div>
          )}
        </header>
        {message && (
          <p className="dashboard-notice" role="status">
            {message}
          </p>
        )}
        {importSummary && <p className="dashboard-notice">Import: {Object.entries(importSummary).map(([key, value]) => `${key} ${value}`).join(" · ")}</p>}
        {error && (
          <p className="dashboard-notice error" role="alert">
            {error}
          </p>
        )}
        {canManage && (
          <section className="materials-settings">
            <h2>Call-off settings</h2>
            <label>
              Project default lead time
              <input
                type="number"
                min="0"
                value={settings.project_default_lead_time ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    project_default_lead_time:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Internal review buffer
              <input
                type="number"
                min="0"
                value={settings.internal_buffer}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    internal_buffer: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Warning period
              <input
                type="number"
                min="0"
                value={settings.warning_period}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    warning_period: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Product Type
              <input
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
                placeholder="e.g. CW Glazing"
              />
            </label>
            <label>
              Default lead time
              <input
                type="number"
                min="0"
                value={productLead}
                onChange={(event) => setProductLead(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={saveSettings}
            >
              Save Settings
            </button>
            {defaults.length > 0 && (
              <p className="materials-defaults">
                {defaults
                  .map(
                    (row) =>
                      `${row.product_type}: ${row.lead_time} working days`,
                  )
                  .join(" · ")}
              </p>
            )}
          </section>
        )}
        <section className="materials-lookahead">
          <h2>Two-week call-off readiness</h2>
          {(
            [
              [
                "Overdue",
                rows.filter((row) => row.result.status === "OVERDUE").length,
              ],
              [
                "Due this week",
                rows.filter(
                  (row) =>
                    row.result.status === "DUE" &&
                    row.result.recommendedDate &&
                    row.result.recommendedDate <= today,
                ).length,
              ],
              [
                "Due soon",
                rows.filter((row) => row.result.status === "DUE").length,
              ],
              [
                "Deliveries due / at risk",
                rows.filter(
                  (row) =>
                    row.result.rag === "RED" || row.result.rag === "AMBER",
                ).length,
              ],
            ] as const
          ).map(([label, value]) => (
            <article key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </section>
        <section>
          <h2>Call-Off Schedule</h2>
          <div className="report-table-scroll">
            <table className="materials-table">
              <thead>
                <tr>
                  {[
                    "RAG",
                    "Status",
                    "Programme Activity",
                    "Building",
                    "Elevation",
                    "Level",
                    "Material",
                    "Product Type",
                    "Supplier",
                    "Quantity",
                    "Unit",
                    "Required On Site",
                    "Lead Time",
                    "Internal Buffer",
                    "Recommended Call-Off",
                    "Actual Call-Off",
                    "Confirmed Delivery",
                    "Actual Delivery",
                  ].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ requirement, activity, result, stage }) => (
                  <tr key={requirement.id}>
                    <td>
                      <span
                        className={`calloff-rag ${result.rag.toLowerCase()}`}
                      >
                        <i aria-hidden="true">
                          {result.rag === "GREEN"
                            ? "●"
                            : result.rag === "AMBER"
                              ? "▲"
                              : result.rag === "RED"
                                ? "■"
                                : "◆"}
                        </i>{" "}
                        {result.rag}
                      </span>
                    </td>
                  <td>{stage}<small>Call-off: {result.status}</small></td>
                    <td>
                      <strong>
                        {activity?.activity ??
                          requirement.programme_activity_external_id}
                      </strong>
                      {requirement.programme_date_changed && (
                        <small className="calloff-change">
                          Call-off date changed due to programme update:{" "}
                          {dateLabel(
                            requirement.previous_calculated_call_off_date,
                          )}{" "}
                          → {dateLabel(requirement.calculated_call_off_date)}
                        </small>
                      )}
                    </td>
                    <td>{activity?.building || "—"}</td>
                    <td>{activity?.elevation || "—"}</td>
                    <td>{activity?.level || "—"}</td>
                    <td>
                      {requirement.material}
                      {canManage && <button className="table-action" onClick={() => editRequirement(requirement)}>Edit requirement</button>}
                    </td>
                    <td>
                      {requirement.product_type || activity?.productType || "—"}
                    </td>
                    <td>{requirement.supplier || "—"}</td>
                    <td>{numberLabel(requirement.quantity)}</td>
                    <td>{requirement.unit || "—"}</td>
                    <td>{dateLabel(result.requiredDate)}</td>
                    <td>
                      {result.leadTime === null ? (
                        <strong>Lead time required</strong>
                      ) : (
                        `${result.leadTime} days · ${result.leadTimeSource}`
                      )}
                    </td>
                    <td>{settings.internal_buffer} days</td>
                    <td>
                      {dateLabel(result.recommendedDate)}
                      {requirement.overridden_call_off_date && (
                        <small>
                          Override · calculated{" "}
                          {dateLabel(result.calculatedDate)}
                        </small>
                      )}
                      {canManage && (
                        <button
                          className="table-action"
                          onClick={() =>
                            editDate(
                              requirement,
                              "overridden_call_off_date",
                              "Override recommended date (YYYY-MM-DD), blank to clear",
                            )
                          }
                        >
                          Override
                        </button>
                      )}
                    </td>
                    <td>
                      {dateLabel(requirement.actual_call_off_date)}
                      {canManage && (
                        <button
                          className="table-action"
                          onClick={() =>
                            editDate(
                              requirement,
                              "actual_call_off_date",
                              "Actual call-off date (YYYY-MM-DD)",
                            )
                          }
                        >
                          Edit
                        </button>
                      )}
                    </td>
                    <td>
                      {dateLabel(requirement.confirmed_delivery_date)}
                      {canManage && (
                        <button
                          className="table-action"
                          onClick={() =>
                            editDate(
                              requirement,
                              "confirmed_delivery_date",
                              "Confirmed delivery date (YYYY-MM-DD)",
                            )
                          }
                        >
                          Edit
                        </button>
                      )}
                    </td>
                    <td>
                      {dateLabel(requirement.actual_delivery_date)}
                      {canManage && (
                        <button
                          className="table-action"
                          onClick={() =>
                            editDate(
                              requirement,
                              "actual_delivery_date",
                              "Actual delivery date (YYYY-MM-DD)",
                            )
                          }
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p>
              No call-off entries yet. Generate the schedule from published
              programme material assignments.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
