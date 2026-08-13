"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PlannedVsActualChart from "@/components/dashboard/PlannedVsActualChart";
import ProductivityTrendChart from "@/components/dashboard/ProductivityTrendChart";
import { buildDashboardData, classifyDashboardBlocker, dashboardRange, dashboardStartDate, type DashboardFilters, type DashboardPeriod, type DatedDashboardEvent } from "@/lib/dashboard";
import { effectiveConstraintRag, type ConstraintActivityLink, type ConstraintRecord } from "@/lib/constraints";
import { buildEvidenceForecast } from "@/lib/forecastRecovery";
import { getActiveDate, getActiveProject, getActiveProjectId, loadSiteDaysBetween } from "@/lib/storage";
import { loadConstraintLinks, loadConstraints } from "@/lib/supabase/constraintData";
import { loadPublishedProgramme } from "@/lib/supabase/programmeData";
import { loadTimelineEventsBetween } from "@/lib/supabase/timelineData";
import { loadDailyPlan } from "@/lib/supabase/dailyPlanData";
import type { DailyPlanAllocation } from "@/lib/dailyPlan";
import type { ProgrammeActivity, Project, SiteDay } from "@/types/site";

type Tone = "green" | "amber" | "red" | "neutral";
type Attention = { tone: "red" | "amber"; text: string; href: string; priority: number };
const blankFilters: DashboardFilters = { building: "", elevation: "", level: "", activity: "", gang: "", unit: "", activityStatus: "", blockerCategory: "", productivityRag: "", productType: "" };
const format = (value: number, digits = 1) => value.toLocaleString("en-GB", { maximumFractionDigits: digits });
const icon: Record<Tone, string> = { green: "●", amber: "▲", red: "■", neutral: "◇" };
const label: Record<Tone, string> = { green: "Green", amber: "Amber", red: "Red", neutral: "Unavailable" };
const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

function StatusCard({ title, value, detail, tone, href }: { title: string; value: string; detail: string; tone: Tone; href: string }) {
  return <Link href={href} className={`health-status-card ${tone}`}><header><span>{title}</span><b>{icon[tone]} {label[tone]}</b></header><strong>{value}</strong><small>{detail}</small></Link>;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("overall");
  const [selectedDate, setSelectedDate] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(blankFilters);
  const [programme, setProgramme] = useState<ProgrammeActivity[]>([]);
  const [events, setEvents] = useState<DatedDashboardEvent[]>([]);
  const [constraints, setConstraints] = useState<ConstraintRecord[]>([]);
  const [constraintLinks, setConstraintLinks] = useState<ConstraintActivityLink[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [todayPlan, setTodayPlan] = useState<DailyPlanAllocation[]>([]);

  useEffect(() => { queueMicrotask(() => setSelectedDate(getActiveDate())); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(""); const projectId = getActiveProjectId(); setProject(getActiveProject());
      try {
        const [published, timeline, constraintRows, links, dailyPlan] = await Promise.all([loadPublishedProgramme(projectId), loadTimelineEventsBetween(projectId, "1000-01-01", "9999-12-31"), loadConstraints(projectId), loadConstraintLinks(projectId), loadDailyPlan(projectId, getActiveDate())]);
        if (cancelled) return;
        const days = new Map<string, SiteDay>(loadSiteDaysBetween("1000-01-01", "9999-12-31", projectId).map((day) => [day.date, day]));
        timeline.forEach(({ date }) => { if (!days.has(date)) days.set(date, { date, attendance: [], crews: [], events: [] }); });
        setProgramme(published.activities); setEvents(timeline.map(({ date, event }) => ({ date, event, day: days.get(date)! }))); setConstraints(constraintRows); setConstraintLinks(links); setTodayPlan(dailyPlan.allocations);
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load dashboard data."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); const refresh = () => void load(); window.addEventListener("sitepulse-project-changed", refresh); window.addEventListener("sitepulse-day-changed", refresh);
    return () => { cancelled = true; window.removeEventListener("sitepulse-project-changed", refresh); window.removeEventListener("sitepulse-day-changed", refresh); };
  }, []);

  const productTypes = useMemo(() => unique(programme.map((row) => row.productType)), [programme]);
  const areas = useMemo(() => unique(programme.filter((row) => !filters.productType || row.productType === filters.productType).map((row) => row.elevation)), [filters.productType, programme]);
  const gangs = useMemo(() => unique(events.map(({ day, event }) => day.crews?.find((crew) => crew.id === event.crewId)?.name)), [events]);
  const selectedActivities = useMemo(() => programme.filter((row) => (!filters.productType || row.productType === filters.productType) && (!filters.elevation || row.elevation === filters.elevation)), [filters.elevation, filters.productType, programme]);
  const selectedProductTypes = unique(selectedActivities.map((row) => row.productType));
  const data = useMemo(() => selectedDate ? buildDashboardData({ period, selectedDate, programme, events, filters, productivityFactorThresholds: project?.productivityFactorThresholds }) : null, [events, filters, period, programme, project?.productivityFactorThresholds, selectedDate]);
  const forecasts = useMemo(() => !selectedDate ? [] : selectedActivities.map((activity) => {
    const disruptions = events.filter(({ event }) => event.type === "disruption" && event.programmeActivityId === activity.programmeActivityId);
    const disrupted = new Set(disruptions.map((row) => row.date));
    const production = events.filter(({ event }) => event.type === "work" && event.status === "completed" && event.programmeActivityId === activity.programmeActivityId && typeof event.quantity === "number").map(({ date, event }) => ({ date, quantity: Number(event.quantity), operatives: new Set(event.affectedOperativeIds ?? []).size || Number(event.numberOfOperatives ?? 0), disrupted: disrupted.has(date) }));
    return { activity, forecast: buildEvidenceForecast({ id: activity.programmeActivityId, name: activity.activity, plannedQuantity: activity.plannedQuantity, plannedFinish: activity.plannedFinish, plannedManDayProductivity: activity.plannedManDayProductivity }, selectedDate, production, disruptions.map(({ date, event }) => ({ date, category: classifyDashboardBlocker(event), lostLabourHours: Number(event.lostLabourHours ?? 0) }))) };
  }).filter(({ forecast }) => forecast.likely.variance !== null), [events, selectedActivities, selectedDate]);

  if (!selectedDate || !data) return null;
  const range = dashboardRange(period, selectedDate, dashboardStartDate(programme, events, selectedDate));
  const reliableQuantity = !data.mixedUnits;
  const reliableProductivity = reliableQuantity && selectedProductTypes.length <= 1;
  const progress = reliableQuantity ? data.kpis.achievement : null;
  const progressTone: Tone = progress === null ? "neutral" : progress >= 100 ? "green" : progress >= 90 ? "amber" : "red";
  const productivity = reliableProductivity ? data.kpis.productivityFactor : null;
  const productivityTone: Tone = productivity === null ? "neutral" : data.kpis.productivityFactorRag === "green" ? "green" : data.kpis.productivityFactorRag === "amber" ? "amber" : data.kpis.productivityFactorRag === "red" ? "red" : "neutral";
  const lateForecasts = forecasts.filter(({ forecast }) => (forecast.likely.variance ?? 0) > 0).sort((a, b) => (b.forecast.likely.variance ?? 0) - (a.forecast.likely.variance ?? 0));
  const programmeTone: Tone = programme.length ? (data.programmeStatus.find((row) => row.status === "Overdue")?.count ?? 0) > 0 ? "red" : "green" : "neutral";
  const openConstraints = constraints.filter((row) => ["OPEN", "ACTIONED / MONITORING"].includes(row.status));
  const redConstraints = openConstraints.filter((row) => effectiveConstraintRag(row, selectedDate).effective === "RED");
  const blockingIds = new Set(constraintLinks.filter((row) => ["Blocking Start", "Blocking Progress", "Blocking Completion"].includes(row.blocking_relationship)).map((row) => row.constraint_id));
  const blocking = openConstraints.filter((row) => blockingIds.has(row.id));
  const constraintTone: Tone = redConstraints.length ? "red" : openConstraints.length || blocking.length ? "amber" : "green";
  const recordedHours = (data.kpis.productiveHours ?? 0) + (data.kpis.lostHours ?? 0);
  const disruptionPercent = data.kpis.lostHours !== null && recordedHours ? data.kpis.lostHours / recordedHours * 100 : null;
  const disruptionTone: Tone = data.kpis.lostHours === null ? "green" : disruptionPercent === null ? "neutral" : disruptionPercent >= 10 ? "red" : "amber";
  const activeChanges = data.changes.filter((row) => !["closed", "completed"].includes(row.status.toLowerCase()));

  const cards = [
    { title: "Programme", value: programmeTone === "neutral" ? "Status unavailable" : programmeTone === "red" ? `${data.programmeStatus.find((row) => row.status === "Overdue")?.count ?? 0} overdue activities` : "On programme dates", detail: "Published programme status", tone: programmeTone, href: "/programme" },
    { title: "Productivity Factor", value: productivity === null ? (selectedProductTypes.length > 1 ? "Select one interface / product type" : "No productivity actuals") : format(productivity, 2), detail: productivity === null ? "Actual man-days ÷ earned man-days" : `${format(Math.abs(productivity-1)*100)}% ${productivity <= 1 ? "fewer" : "more"} man-days consumed than earned`, tone: productivityTone, href: "/reports" },
    { title: "Constraints", value: `${openConstraints.length} Open · ${blocking.length} Blocking`, detail: `${redConstraints.length} Red constraint${redConstraints.length === 1 ? "" : "s"}`, tone: constraintTone, href: "/constraints" },
    { title: "Disruption", value: data.kpis.lostHours === null ? "No disruption recorded" : `${format(data.kpis.lostHours)} labour hrs`, detail: disruptionPercent === null ? "Recorded labour share unavailable" : `${format(disruptionPercent)}% of recorded productive + lost hours`, tone: disruptionTone, href: "/timeline" },
    { title: "Forecast", value: forecasts.length ? `${lateForecasts.length} activities forecast late` : "Forecast unavailable", detail: lateForecasts[0] ? `Worst: +${format(lateForecasts[0].forecast.likely.variance ?? 0, 0)} working days` : "No evidence-led late forecast", tone: !forecasts.length ? "neutral" as Tone : lateForecasts.length ? "red" as Tone : "green" as Tone, href: "/forecast" },
    { title: "Change", value: activeChanges.length ? `${activeChanges.length} active changes` : "Exposure not yet available", detail: activeChanges.length ? "Commercial value not recorded" : "No supported commercial exposure", tone: activeChanges.length ? "amber" as Tone : "neutral" as Tone, href: "/reports" },
  ];
  const attention: Attention[] = [];
  if (productivity !== null && productivityTone === "red") attention.push({ tone: "red", text: `${filters.productType || "Selected work"} Productivity Factor is ${format(productivity, 2)} — ${format((productivity-1)*100)}% more man-days consumed than earned.`, href: "/reports", priority: 100 });
  if (lateForecasts[0]) attention.push({ tone: "red", text: `${lateForecasts[0].activity.productType || lateForecasts[0].activity.activity} likely forecast is +${format(lateForecasts[0].forecast.likely.variance ?? 0, 0)} working days.`, href: `/forecast?activity=${encodeURIComponent(lateForecasts[0].activity.programmeActivityId)}`, priority: 95 });
  if (redConstraints[0]) attention.push({ tone: "red", text: `${redConstraints[0].description}`, href: "/constraints", priority: 92 });
  else if (blocking.length) attention.push({ tone: "amber", text: `${blocking.length} blocking constraint${blocking.length === 1 ? "" : "s"} affect planned activities.`, href: "/constraints", priority: 85 });
  if (data.kpis.lostHours) attention.push({ tone: disruptionTone === "red" ? "red" : "amber", text: `${format(data.kpis.lostHours)} disruption labour hours recorded this period.`, href: "/timeline", priority: 70 });
  if (activeChanges.length) attention.push({ tone: "amber", text: `${activeChanges.length} active change${activeChanges.length === 1 ? "" : "s"} recorded this period.`, href: "/reports", priority: 60 });
  const ranked = attention.sort((a, b) => b.priority - a.priority).slice(0, 5);

  return <main className="dashboard-page health-dashboard"><div className="dashboard-shell">
    <header className="health-header"><div><p className="eyebrow">Project health</p><h1>Project Health</h1><p>{project?.name ?? "Project"} · {range.start} to {range.end}</p></div></header>
    {loading && <p className="dashboard-notice">Loading project health…</p>}{error && <p className="dashboard-notice error" role="alert">{error}</p>}
    <Link href="/daily-plan" className="daily-plan-health"><div><p className="eyebrow">Today&apos;s plan</p><strong>{todayPlan.length} activities</strong></div><span>{todayPlan.filter(row=>row.readiness_rag==="GREEN").length} Ready · {todayPlan.filter(row=>row.readiness_rag==="AMBER").length} Amber · {todayPlan.filter(row=>row.readiness_rag==="RED").length} Red</span><span>Target: {todayPlan.length?format(todayPlan.reduce((sum,row)=>sum+row.target_quantity,0)):0} planned output</span><b>Open →</b></Link>
    <section className="health-status-grid" aria-label="Independent project health measures">{cards.map((card) => <StatusCard key={card.title} {...card} />)}</section>
    <section className="period-progress"><header><div><p className="eyebrow">Period progress</p><h2>Plan / Actual / Variance</h2></div><span className={`health-rag ${progressTone}`}>{icon[progressTone]} {progressTone === "neutral" ? "Unavailable" : `${format(progress!)}% of period plan`}</span></header>{reliableQuantity ? <div className="period-progress-values"><dl><dt>Plan</dt><dd>{data.kpis.expected === null ? "—" : `${format(data.kpis.expected)} ${data.unit}`}</dd></dl><dl><dt>Actual</dt><dd>{data.kpis.achieved === null ? "—" : `${format(data.kpis.achieved)} ${data.unit}`}</dd></dl><dl><dt>Variance</dt><dd>{data.kpis.expected === null || data.kpis.achieved === null ? "—" : `${data.kpis.achieved-data.kpis.expected >= 0 ? "+" : ""}${format(data.kpis.achieved-data.kpis.expected)} ${data.unit}`}</dd></dl></div> : <p className="health-neutral-state">Mixed units cannot be summed. Select an Interface / Product Type or unit-compatible Area.</p>}{reliableProductivity && <div className="productivity-factor-kpis"><dl><dt>Earned Man-Days</dt><dd>{data.kpis.earnedManDays === null ? "—" : format(data.kpis.earnedManDays,2)}</dd></dl><dl><dt>Actual Man-Days</dt><dd>{data.kpis.actualManDays === null ? "—" : format(data.kpis.actualManDays,2)}</dd></dl><dl><dt>Man-Day Variance</dt><dd>{data.kpis.manDayVariance === null ? "—" : `${data.kpis.manDayVariance >= 0 ? "+" : ""}${format(data.kpis.manDayVariance,2)} MD`}</dd></dl><dl><dt>Productivity Factor</dt><dd>{productivity === null ? "—" : format(productivity,2)}</dd></dl></div>}</section>
    <section className="health-compact-filters" aria-label="Production performance filters"><strong>Production performance</strong><label>Date range<select value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}><option value="overall">From Start</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>{period === "overall" ? "To date" : period === "weekly" ? "Week containing" : period === "monthly" ? "Month" : "Date"}<input type={period === "monthly" ? "month" : "date"} value={period === "monthly" ? selectedDate.slice(0,7) : selectedDate} onChange={(event) => setSelectedDate(period === "monthly" ? `${event.target.value}-01` : event.target.value)} /></label><label>Interface / Product Type<select value={filters.productType} onChange={(event) => setFilters((current) => ({ ...current, productType: event.target.value, elevation: "" }))}><option value="">All interfaces / product types</option>{productTypes.map((value) => <option key={value}>{value}</option>)}</select></label><label>Area<select value={filters.elevation} onChange={(event) => setFilters((current) => ({ ...current, elevation: event.target.value }))}><option value="">All</option>{areas.map((value) => <option key={value}>{value}</option>)}</select></label><label>Gang<select value={filters.gang} onChange={(event) => setFilters((current) => ({ ...current, gang: event.target.value }))}><option value="">All</option>{gangs.map((value) => <option key={value}>{value}</option>)}</select></label>{(filters.productType || filters.elevation || filters.gang) && <button className="secondary-button" onClick={() => setFilters(blankFilters)}>Clear</button>}</section>
    <section className="health-chart-grid">{reliableQuantity ? <PlannedVsActualChart data={data.output} unit={data.unit} /> : <div className="health-chart-empty"><h2>Daily output — planned vs achieved</h2><p>Select an Interface / Product Type so incompatible quantity units are not combined.</p></div>}{reliableProductivity ? <ProductivityTrendChart data={data.productivity} unit={data.unit} /> : <div className="health-chart-empty"><h2>Man-Day Productivity</h2><p>{data.mixedUnits ? "Select an Interface / Product Type with one unit." : "Select one Interface / Product Type before comparing productivity baselines."}</p></div>}</section>
    <section className="health-attention"><header><p className="eyebrow">Exceptions</p><h2>Needs Attention</h2><p>Only supported, material exceptions for the current selection.</p></header>{ranked.length ? <ol>{ranked.map((item, index) => <li key={`${item.href}-${index}`}><Link href={item.href}><span className={`health-attention-rag ${item.tone}`}>{icon[item.tone]} {label[item.tone]}</span><strong>{item.text}</strong><span>→</span></Link></li>)}</ol> : <div className="health-all-clear"><span>●</span><div><strong>No current supported exceptions.</strong><p>No Red or Amber issue is evidenced for this selection.</p></div></div>}</section>
  </div></main>;
}
