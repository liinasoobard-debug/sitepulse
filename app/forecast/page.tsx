"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProductivityRagBadge from "@/components/ProductivityRagBadge";
import { classifyDashboardBlocker } from "@/lib/dashboard";
import { eventMatchesActivity, forecastActivityType, forecastDiagnostics, forecastReadiness, latestRecordedDataDate, validProductionEvents, type ForecastActivityType } from "@/lib/forecastData";
import { buildEvidenceForecast, directSuccessorImpact, floatExposure, type ForecastRelationship } from "@/lib/forecastRecovery";
import { productivityRag } from "@/lib/productivityRag";
import { getActiveDate, getActiveProject, getActiveProjectId } from "@/lib/storage";
import { loadPublishedProgramme, loadPublishedProgrammeRelationships } from "@/lib/supabase/programmeData";
import { loadTimelineEventsBetween } from "@/lib/supabase/timelineData";
import { loadConstraintLinks, loadConstraints } from "@/lib/supabase/constraintData";
import type { ConstraintActivityLink, ConstraintRecord } from "@/lib/constraints";
import type { ProgrammeActivity, TimelineEvent } from "@/types/site";

type DatedEvent = { date: string; event: TimelineEvent };
type Snapshot = {
  dataDate: string;
  activityId: string;
  createdAt: string;
  bestFinish: string | null;
  likelyFinish: string | null;
  worstFinish: string | null;
  actualFinish?: string;
};
const format = (value: number | null | undefined, suffix = "") => (value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${suffix}`);
const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
const forecastLabel = {
  green: "Green — on/ahead",
  amber: "Amber — small delay",
  red: "Red — material delay",
  unavailable: "Forecast unavailable",
} as const;

function ForecastContent() {
  const params = useSearchParams(),
    projectId = getActiveProjectId();
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]),
    [events, setEvents] = useState<DatedEvent[]>([]),
    [relationships, setRelationships] = useState<ForecastRelationship[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [dataDate, setDataDate] = useState(""),
    [activityType, setActivityType] = useState<ForecastActivityType | "all">("production");
  const [constraints, setConstraints] = useState<ConstraintRecord[]>([]);
  const [constraintLinks, setConstraintLinks] = useState<ConstraintActivityLink[]>([]);
  const [filters, setFilters] = useState({
    building: "",
    elevation: "",
    level: "",
    productType: "",
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [programme, timeline, logic, projectConstraints, links] = await Promise.all([loadPublishedProgramme(projectId), loadTimelineEventsBetween(projectId, "1000-01-01", "9999-12-31"), loadPublishedProgrammeRelationships(projectId), loadConstraints(projectId), loadConstraintLinks(projectId)]);
        if (cancelled) return;
        setActivities(programme.activities);
        setEvents(timeline);
        setRelationships(logic);
        setConstraints(projectConstraints);
        setConstraintLinks(links);
        const resolvedDataDate = latestRecordedDataDate(timeline, params.get("dataDate")) || getActiveDate();
        setDataDate(resolvedDataDate);
        console.info("Forecast published-programme integration diagnostic", forecastDiagnostics(programme.activities, timeline));
        const requested = params.get("activity");
        const requestedActivity = requested ? programme.activities.find((row) => row.programmeActivityId === requested) : undefined;
        if (requestedActivity) setActivityType(forecastActivityType(requestedActivity));
        const productionActivities = programme.activities.filter((row) => forecastActivityType(row) === "production");
        setSelectedId(requested && programme.activities.some((row) => row.programmeActivityId === requested) ? requested : (productionActivities[0]?.programmeActivityId ?? programme.activities[0]?.programmeActivityId ?? ""));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load forecast data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params, projectId]);

  const forecastFor = useCallback(
    (activity: ProgrammeActivity) => {
      const disruptions = events.filter(({ date, event }) => date <= dataDate && event.type === "disruption" && eventMatchesActivity(event, activity));
      const disruptedDates = new Set(disruptions.map((row) => row.date));
      const production = validProductionEvents(events, activity, dataDate).map(({ date, event }) => ({
        date,
        quantity: Number(event.quantity),
        operatives: new Set(event.affectedOperativeIds ?? []).size || Number(event.numberOfOperatives ?? 0),
        disrupted: disruptedDates.has(date),
      }));
      return buildEvidenceForecast(
        {
          id: activity.programmeActivityId,
          name: activity.activity,
          plannedQuantity: activity.plannedQuantity,
          plannedFinish: activity.plannedFinish,
          plannedManDayProductivity: activity.plannedManDayProductivity,
          plannedDailyGangOutput: activity.plannedGangDailyOutput,
          calendar: activity.calendar,
        },
        dataDate,
        production,
        disruptions.map(({ date, event }) => ({
          date,
          category: classifyDashboardBlocker(event),
          lostLabourHours: Number(event.lostLabourHours ?? 0),
        })),
      );
    },
    [dataDate, events],
  );
  const projectForecasts = useMemo(
    () =>
      activities
        .map((activity) => ({ activity, forecast: forecastFor(activity) }))
        .filter((row) => forecastActivityType(row.activity) === "production")
        .sort((a, b) => (b.forecast.likely.variance ?? -999) - (a.forecast.likely.variance ?? -999)),
    [activities, forecastFor],
  );
  const options = useMemo(
    () => ({
      buildings: unique(activities.map((row) => row.building)),
      elevations: unique(activities.filter((row) => !filters.building || row.building === filters.building).map((row) => row.elevation)),
      levels: unique(activities.filter((row) => (!filters.building || row.building === filters.building) && (!filters.elevation || row.elevation === filters.elevation)).map((row) => row.level)),
      productTypes: unique(activities.map((row) => row.productType)),
    }),
    [activities, filters.building, filters.elevation],
  );
  const filtered = activities.filter((row) => (activityType === "all" || forecastActivityType(row) === activityType) && (!filters.building || row.building === filters.building) && (!filters.elevation || row.elevation === filters.elevation) && (!filters.level || row.level === filters.level) && (!filters.productType || row.productType === filters.productType));
  const activity = activities.find((row) => row.programmeActivityId === selectedId) ?? filtered[0],
    model = activity ? forecastFor(activity) : null;
  const successorStarts = new Map(activities.map((row) => [row.programmeActivityId, row.plannedStart]));
  const downstream =
    model && activity
      ? directSuccessorImpact(
          activity.programmeActivityId,
          model.likely.finish,
          relationships.map((row) => ({
            ...row,
            successorPlannedStart: successorStarts.get(row.successorId),
          })),
        )
      : [];
  const float = model ? floatExposure(model.likely.variance, undefined) : null;
  const saveSnapshot = () => {
    if (!activity || !model) return;
    const key = `sitepulse-forecast-snapshots-${projectId}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as Snapshot[];
    const snapshot: Snapshot = {
      dataDate,
      activityId: activity.programmeActivityId,
      createdAt: new Date().toISOString(),
      bestFinish: model.best.finish,
      likelyFinish: model.likely.finish,
      worstFinish: model.worst.finish,
      actualFinish: activity.actualFinish,
    };
    localStorage.setItem(key, JSON.stringify([...existing, snapshot]));
    setSaved("Forecast snapshot saved for future accuracy review.");
  };
  if (loading)
    return (
      <main className="forecast-page">
        <div className="forecast-shell">
          <p>Loading Forecast &amp; Recovery…</p>
        </div>
      </main>
    );
  if (error || !activity || !model)
    return (
      <main className="forecast-page">
        <div className="forecast-shell">
          <p role="alert">{error || "No measurable programme activities are available."}</p>
        </div>
      </main>
    );
  const productivityFactorThresholds = getActiveProject()?.productivityFactorThresholds;
  const productivityStatus = productivityRag(activity.plannedManDayProductivity, model.rates.actualManDayProductivity, productivityFactorThresholds),
    late = (model.likely.variance ?? 0) > 0;
  const recoveryText = model.recoveryStatus === "demonstrated" ? "Amber — achievable based on demonstrated performance" : model.recoveryStatus === "not-yet-demonstrated" ? "Red — required output not yet demonstrated" : model.recoveryStatus === "on-track" ? "Green — current sustained output meets the programme requirement" : "Insufficient data";
  const selectedType = forecastActivityType(activity);
  if (selectedType !== "production") {
    const typeOptions = activities.filter((row) => activityType === "all" || forecastActivityType(row) === activityType);
    return (
      <main className="forecast-page">
        <div className="forecast-shell">
          <header className="forecast-header">
            <div>
              <p className="eyebrow">Evidence-led planning</p>
              <h1>Forecast &amp; Recovery</h1>
              <p>
                {getActiveProject()?.name ?? "Project"} · Data date {formatDate(dataDate)}
              </p>
            </div>
          </header>
          <section className="forecast-filters">
            <label>
              <span>Activity Type</span>
              <select
                value={activityType}
                onChange={(event) => {
                  const next = event.target.value as ForecastActivityType | "all";
                  setActivityType(next);
                  const first = activities.find((row) => next === "all" || forecastActivityType(row) === next);
                  if (first) setSelectedId(first.programmeActivityId);
                }}
              >
                <option value="production">Production</option>
                <option value="milestone">Milestones</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              <span>Activity</span>
              <select value={activity.programmeActivityId} onChange={(event) => setSelectedId(event.target.value)}>
                {typeOptions.map((row) => (
                  <option key={row.programmeActivityId} value={row.programmeActivityId}>
                    {row.activity}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section className="forecast-story">
            <p className="eyebrow">Non-production programme activity</p>
            <h2>{activity.activity}</h2>
            <p>
              <strong>{selectedType === "milestone" ? "Milestone" : "Support activity"}</strong> — productivity forecast not applicable.
            </p>
            <p>{selectedType === "milestone" ? "Milestone forecast unavailable until predecessor forecast logic is available." : "This activity is not measured by installed quantity, so it is excluded from the productivity forecast engine."}</p>
            <p>Programme dates remain available on the Programme page and are not treated as missing production data.</p>
          </section>
        </div>
      </main>
    );
  }
  const readiness = forecastReadiness(activity, model.rates.count);
  return (
    <main className="forecast-page">
      <div className="forecast-shell">
        <header className="forecast-header">
          <div>
            <p className="eyebrow">Evidence-led planning</p>
            <h1>Forecast &amp; Recovery</h1>
            <p>
              {getActiveProject()?.name ?? "Project"} · Data date {formatDate(dataDate)}
            </p>
          </div>
          <div>
            <button className="secondary-button" onClick={saveSnapshot}>
              Save Forecast Snapshot
            </button>
            <Link href="/dashboard" className="secondary-button">
              Dashboard
            </Link>
          </div>
        </header>
        {saved && (
          <p role="status" className="dashboard-notice">
            {saved}
          </p>
        )}
        <section className="forecast-filters">
          <label>
            <span>Activity Type</span>
            <select
              value={activityType}
              onChange={(event) => {
                const next = event.target.value as ForecastActivityType | "all";
                setActivityType(next);
                const first = activities.find((row) => next === "all" || forecastActivityType(row) === next);
                if (first) setSelectedId(first.programmeActivityId);
              }}
            >
              <option value="production">Production</option>
              <option value="milestone">Milestones</option>
              <option value="all">All</option>
            </select>
          </label>
          {(
            [
              ["building", "Building", options.buildings],
              ["elevation", "Elevation", options.elevations],
              ["level", "Level", options.levels],
              ["productType", "Product Type", options.productTypes],
            ] as const
          ).map(([key, label, values]) => (
            <label key={key}>
              <span>{label}</span>
              <select
                value={filters[key]}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {values.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <span>Activity</span>
            <select value={activity.programmeActivityId} onChange={(event) => setSelectedId(event.target.value)}>
              {filtered.map((row) => (
                <option key={row.programmeActivityId} value={row.programmeActivityId}>
                  {row.activity}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="forecast-story">
          <p className={`forecast-readiness ${readiness}`}>
            <strong>{readiness === "ready" ? "READY" : readiness === "waiting-actuals" ? "WAITING FOR ACTUALS" : "BASELINE INCOMPLETE"}</strong>
            {readiness === "waiting-actuals" && " — Programme baseline complete. More actual production data is required for evidence-led forecasting."}
            {readiness === "baseline-incomplete" && " — One or more required fields are genuinely absent from the published programme baseline."}
          </p>
          <p className="eyebrow">1 — Where are we heading?</p>
          <div className="forecast-title">
            <div>
              <h2>{activity.activity}</h2>
              <p>
                {activity.building} / {activity.elevation} / {activity.level} · Programme finish {formatDate(activity.plannedFinish)}
              </p>
            </div>
            <div>
              <span>Forecast confidence</span>
              <strong>{model.rates.confidence}</strong>
              <small>
                {model.rates.count} valid production day
                {model.rates.count === 1 ? "" : "s"}
              </small>
            </div>
          </div>
          <div className="forecast-cases">
            {(
              [
                ["Best Case", model.best, "green"],
                ["Likely", model.likely, model.forecastRag],
                ["Worst Case", model.worst, "red"],
              ] as const
            ).map(([label, result, tone]) => (
              <article className={tone} key={label}>
                <span>{label}</span>
                <strong>{result.available ? formatDate(result.finish) : "Unavailable"}</strong>
                <small>{result.variance === null ? "Insufficient data" : result.variance <= 0 ? `${format(Math.abs(result.variance), " working days ahead")}` : `${format(result.variance, " working days late")}`}</small>
                {label === "Likely" && <b>{forecastLabel[model.forecastRag]}</b>}
              </article>
            ))}
          </div>
          {model.warnings.map((warning) => (
            <p className="forecast-warning" key={warning}>
              {warning}
            </p>
          ))}
        </section>

        <section className="forecast-two-column">
          <article>
            <p className="eyebrow">2 — Why?</p>
            <h2>{model.constraint}</h2>
            <dl>
              <div>
                <dt>Current Man-Day Productivity</dt>
                <dd>{format(model.rates.actualManDayProductivity, ` ${activity.unit}/man-day`)}</dd>
              </div>
              <div>
                <dt>Productivity vs planned</dt>
                <dd>
                  <ProductivityRagBadge status={productivityStatus} /> {format(model.productivityPerformance, "%")}
                </dd>
              </div>
              <div>
                <dt>Current sustained Daily Output</dt>
                <dd>{format(model.currentSustainedOutput, ` ${activity.unit}/day`)}</dd>
              </div>
              <div>
                <dt>Productivity trend</dt>
                <dd>{model.rates.trend}</dd>
              </div>
              <div>
                <dt>Main disruption</dt>
                <dd>{model.mainDisruption?.category ?? "No recorded disruption"}</dd>
              </div>
              <div>
                <dt>Historical occurrence</dt>
                <dd>{model.mainDisruption ? `${model.mainDisruption.affectedWorkingDays} / ${model.mainDisruption.relevantWorkingDays} relevant working days` : "—"}</dd>
              </div>
              <div>
                <dt>Lost labour</dt>
                <dd>{format(model.totalLostHours, " hours")}</dd>
              </div>
            </dl>
          </article>
          <article>
            <p className="eyebrow">3 — What is required to recover?</p>
            {late ? (
              <>
                <dl>
                  <div>
                    <dt>Required Daily Output</dt>
                    <dd>{format(model.requiredDailyOutput, ` ${activity.unit}/day`)}</dd>
                  </div>
                  <div>
                    <dt>Current Sustained Output</dt>
                    <dd>{format(model.currentSustainedOutput, ` ${activity.unit}/day`)}</dd>
                  </div>
                  <div>
                    <dt>Required improvement</dt>
                    <dd>{format(model.requiredImprovementPercent, "%")}</dd>
                  </div>
                  <div>
                    <dt>Best Sustained Demonstrated</dt>
                    <dd>{format(model.bestSustainedDemonstratedOutput, ` ${activity.unit}/day`)}</dd>
                  </div>
                  <div>
                    <dt>Required Man-Day Productivity</dt>
                    <dd>{format(model.requiredManDayProductivity, ` ${activity.unit}/man-day`)}</dd>
                  </div>
                </dl>
                <h3 className={`recovery-assessment ${model.recoveryStatus}`}>{recoveryText}</h3>
                <p>{model.recoveryStatus === "demonstrated" ? "Required recovery output has previously been demonstrated on this project." : model.recoveryStatus === "not-yet-demonstrated" ? "The output required to recover the programme has not yet been demonstrated on this project. This does not mean recovery is impossible." : "Assessment is based on demonstrated project output."}</p>
              </>
            ) : (
              <p>Recovery analysis is not required because the Likely forecast is on or ahead of programme.</p>
            )}
          </article>
        </section>

        <section className="forecast-two-column">
          <article>
            <p className="eyebrow">4 — Where is the opportunity?</p>
            <h2>{model.mainDisruption ? `Primary: reduce ${model.mainDisruption.category.toLowerCase()} exposure` : "Primary: improve underlying production consistency"}</h2>
            <p>Secondary: {model.productivityPerformance !== null && model.productivityPerformance < 90 ? "Improve installation Man-Day Productivity" : "Protect demonstrated sustained output"}.</p>
            {model.opportunityFinish ? (
              <div className="forecast-opportunity">
                <strong>Indicative recovery opportunity</strong>
                <span>Production-only finish: {formatDate(model.productionOnly.finish)}</span>
                <span>Current risk-adjusted Likely finish: {formatDate(model.likely.finish)}</span>
                <span>Indicative opportunity: {format(model.opportunityWorkingDays, " working days")}</span>
              </div>
            ) : (
              <p>No separate disruption recovery opportunity can be quantified from current evidence.</p>
            )}
          </article>
          <article>
            <h2>Top recovery drivers</h2>
            <ol className="forecast-drivers">
              {model.disruptionStats.slice(0, 3).map((row) => (
                <li key={row.category}>
                  <strong>{row.category}</strong>
                  <span>{format(row.totalLostHours, " lost labour hours")}</span>
                </li>
              ))}
              {model.productivityPerformance !== null && (
                <li>
                  <strong>Actual productivity</strong>
                  <span>{format(model.productivityPerformance, "% of planned benchmark")}</span>
                </li>
              )}
              <li>
                <strong>Programme requirement</strong>
                <span>{format(model.requiredDailyOutput, ` ${activity.unit}/day required`)}</span>
              </li>
            </ol>
          </article>
        </section>

        <section className="forecast-project">
          <h2>Project-level forecast</h2>
          <p>{projectForecasts.filter((row) => (row.forecast.likely.variance ?? 0) > 0).length} activities forecast late. Ranked by Likely finish variance.</p>
          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  {["Forecast RAG", "Activity", "Planned Finish", "Best", "Likely", "Worst", "Productivity RAG", "Main Risk", "Recovery Requirement", "Recovery Achievability"].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projectForecasts.map(({ activity: row, forecast }) => (
                  <tr key={row.id} onClick={() => setSelectedId(row.programmeActivityId)}>
                    <td>
                      <span className={`forecast-rag ${forecast.forecastRag}`}>{forecastLabel[forecast.forecastRag]}</span>
                    </td>
                    <td>
                      <strong>{row.activity}</strong>
                    </td>
                    <td>{formatDate(row.plannedFinish)}</td>
                    <td>{formatDate(forecast.best.finish)}</td>
                    <td>
                      {formatDate(forecast.likely.finish)}
                      <small>{forecast.likely.variance === null ? "" : ` ${forecast.likely.variance > 0 ? "+" : ""}${forecast.likely.variance} days`}</small>
                    </td>
                    <td>{formatDate(forecast.worst.finish)}</td>
                    <td>
                      <ProductivityRagBadge status={productivityRag(row.plannedManDayProductivity, forecast.rates.actualManDayProductivity, productivityFactorThresholds)} />
                    </td>
                    <td>{forecast.mainDisruption?.category ?? forecast.constraint}</td>
                    <td>{format(forecast.requiredImprovementPercent, "% output")}</td>
                    <td>{forecast.recoveryStatus.replaceAll("-", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="forecast-two-column">
          <article>
            <h2>Disruption history</h2>
            {model.disruptionStats.length ? (
              model.disruptionStats.map((row) => (
                <div className="forecast-stat" key={row.category}>
                  <strong>{row.category}</strong>
                  <span>Historical occurrence rate: {format(row.historicalOccurrenceRate === null ? null : row.historicalOccurrenceRate * 100, "%")}</span>
                  <small>
                    {row.affectedWorkingDays} affected / {row.relevantWorkingDays} relevant days · {row.eventCount} events · {format(row.averageLostHoursPerEvent, " average lost hours/event")} · {format(row.averageLostHoursPerAffectedDay, " average lost hours/affected day")}
                  </small>
                </div>
              ))
            ) : (
              <p>No disruption records are available.</p>
            )}
            <p>Risk-adjusted Likely output is built from demonstrated disrupted and unaffected daily outputs weighted by historical occurrence. Lost labour hours are not converted into output, preventing disruption from being counted twice.</p>
          </article>
          <article>
            <h2>Potential downstream impact</h2>
            <h3>Open Constraints</h3>
            {constraints.filter((row) => constraintLinks.some((link) => link.constraint_id === row.id && link.programme_activity_external_id === activity.programmeActivityId) && ["OPEN", "ACTIONED / MONITORING"].includes(row.status)).map((row) => <div className="forecast-stat" key={row.id}><strong>{row.category}</strong><span>{row.description}</span><small>{row.rag} · Evidence/context only; delay is not automatically quantified.</small></div>)}
            {!constraints.some((row) => constraintLinks.some((link) => link.constraint_id === row.id && link.programme_activity_external_id === activity.programmeActivityId) && ["OPEN", "ACTIONED / MONITORING"].includes(row.status)) && <p>No open constraints linked to this activity.</p>}
            {downstream.length ? (
              downstream.map((row) => (
                <div className="forecast-stat" key={row.successorId}>
                  <strong>{activities.find((item) => item.programmeActivityId === row.successorId)?.activity ?? row.successorId}</strong>
                  <span>
                    {row.label}
                    {row.exposed ? " — forecast exposure indicated" : ""}
                  </span>
                  <small>
                    {row.type}
                    {row.lag ? ` · imported lag ${row.lag}` : ""}
                  </small>
                </div>
              ))
            ) : (
              <p>No programme relationships are available.</p>
            )}
            <p>{float?.message}</p>
            <p>No Critical Path conclusion is made without reliable float and CPM data.</p>
          </article>
        </section>

        <section className="forecast-basis">
          <h2>Forecast Basis</h2>
          <dl>
            <div>
              <dt>Data Date</dt>
              <dd>{formatDate(dataDate)}</dd>
            </div>
            <div>
              <dt>Planned Quantity</dt>
              <dd>{format(activity.plannedQuantity, ` ${activity.unit}`)}</dd>
            </div>
            <div>
              <dt>Unit</dt>
              <dd>{activity.unit || "—"}</dd>
            </div>
            <div>
              <dt>Planned Start</dt>
              <dd>{formatDate(activity.plannedStart)}</dd>
            </div>
            <div>
              <dt>Planned Duration</dt>
              <dd>{format(activity.plannedDurationDays ?? activity.originalDuration, " working days")}</dd>
            </div>
            <div>
              <dt>Planned Man-Day Productivity</dt>
              <dd>{format(activity.plannedManDayProductivity, ` ${activity.unit}/man-day`)}</dd>
            </div>
            <div>
              <dt>Actual Quantity to Date</dt>
              <dd>{format(model.remainingQuantity === null ? null : Math.max(0, activity.plannedQuantity - model.remainingQuantity), ` ${activity.unit}`)}</dd>
            </div>
            <div>
              <dt>Remaining Quantity</dt>
              <dd>{format(model.remainingQuantity, ` ${activity.unit}`)}</dd>
            </div>
            <div>
              <dt>Production observations</dt>
              <dd>{model.rates.count}</dd>
            </div>
            <div>
              <dt>Observation range</dt>
              <dd>{model.rates.start ? `${formatDate(model.rates.start)} – ${formatDate(model.rates.finish)}` : "No valid observations"}</dd>
            </div>
            <div>
              <dt>Best-case method</dt>
              <dd>{model.rates.enoughForRange ? "Upper quartile of recent valid Daily Gang Output" : "Recent median; range withheld below 6 observations"}</dd>
            </div>
            <div>
              <dt>Likely-case method</dt>
              <dd>Robust disruption-conditioned recent output</dd>
            </div>
            <div>
              <dt>Worst-case method</dt>
              <dd>{model.rates.enoughForRange ? "Lower quartile of recent valid Daily Gang Output" : "Recent median; range withheld below 6 observations"}</dd>
            </div>
            <div>
              <dt>Rates used</dt>
              <dd>
                {format(model.best.rate)} / {format(model.likely.rate)} / {format(model.worst.rate)} {activity.unit}/day
              </dd>
            </div>
            <div>
              <dt>Working calendar</dt>
              <dd>{activity.calendar || "Monday–Friday fallback"}</dd>
            </div>
            <div>
              <dt>Disruption records</dt>
              <dd>{model.disruptionStats.reduce((sum, row) => sum + row.eventCount, 0)}</dd>
            </div>
            <div>
              <dt>Planned Finish</dt>
              <dd>{formatDate(activity.plannedFinish)}</dd>
            </div>
            <div>
              <dt>Float</dt>
              <dd>Unavailable</dd>
            </div>
            <div>
              <dt>Forecast Confidence</dt>
              <dd>{model.rates.confidence}</dd>
            </div>
          </dl>
        </section>
        <p className="forecast-disclaimer">All forecasts are indicative and based on demonstrated project performance. They are not guaranteed outcomes, AI predictions, or Critical Path conclusions. VO/change work remains excluded.</p>
      </div>
    </main>
  );
}

export default function ForecastPage() {
  return <Suspense fallback={<main className="forecast-page"><p className="dashboard-notice">Loading forecast…</p></main>}><ForecastContent /></Suspense>;
}
