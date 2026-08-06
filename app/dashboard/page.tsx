"use client";

import { useEffect, useMemo, useState } from "react";
import ActivitiesBehindChart from "@/components/dashboard/ActivitiesBehindChart";
import BlockerParetoChart from "@/components/dashboard/BlockerParetoChart";
import CumulativeProgressChart from "@/components/dashboard/CumulativeProgressChart";
import DashboardKpiCard from "@/components/dashboard/DashboardKpiCard";
import GangProductivityChart from "@/components/dashboard/GangProductivityChart";
import LabourUtilisationChart from "@/components/dashboard/LabourUtilisationChart";
import PlannedVsActualChart from "@/components/dashboard/PlannedVsActualChart";
import ProductivityTrendChart from "@/components/dashboard/ProductivityTrendChart";
import { buildDashboardData, classifyDashboardBlocker, dashboardRange, type DashboardFilters, type DashboardPeriod, type DatedDashboardEvent } from "@/lib/dashboard";
import { getActiveDate, getActiveProject, getActiveProjectId, getLocalDate, loadSiteDaysBetween } from "@/lib/storage";
import { loadPublishedProgramme } from "@/lib/supabase/programmeData";
import { loadTimelineEventsBetween } from "@/lib/supabase/timelineData";
import type { ProgrammeActivity, Project, SiteDay } from "@/types/site";

const emptyFilters: DashboardFilters = { building: "", elevation: "", level: "", activity: "", gang: "", unit: "" };
const format = (value: number | null, suffix = "") => value === null ? "—" : `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}${suffix}`;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const EmptyChart = ({ title, message }: { title: string; message: string }) => <section className="dashboard-chart dashboard-empty-chart"><header><h2>{title}</h2></header><p>{message}</p></section>;

function mondayFor(date: string): string { const value = new Date(`${date}T12:00:00`); const day = value.getDay(); value.setDate(value.getDate() - (day === 0 ? 6 : day - 1)); return getLocalDate(value); }
function performanceTone(value: number | null): "neutral" | "good" | "warning" | "bad" { return value === null ? "neutral" : value >= 100 ? "good" : value >= 90 ? "warning" : "bad"; }

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("weekly");
  const [selectedDate, setSelectedDate] = useState("");
  const [programme, setProgramme] = useState<ProgrammeActivity[]>([]);
  const [events, setEvents] = useState<DatedDashboardEvent[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBlocker, setSelectedBlocker] = useState("");
  const [selectedGang, setSelectedGang] = useState("");
  const [selectedActivity, setSelectedActivity] = useState("");

  useEffect(() => { queueMicrotask(() => setSelectedDate(getActiveDate())); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      const projectId = getActiveProjectId(); setProject(getActiveProject());
      try {
        const [published, timeline] = await Promise.all([loadPublishedProgramme(projectId), loadTimelineEventsBetween(projectId, "1000-01-01", "9999-12-31")]);
        if (cancelled) return;
        const localDays = loadSiteDaysBetween("1000-01-01", "9999-12-31", projectId);
        const days = new Map<string, SiteDay>(localDays.map((day) => [day.date, day]));
        timeline.forEach(({ date }) => { if (!days.has(date)) days.set(date, { date, attendance: [], crews: [], events: [] }); });
        setProgramme(published.activities);
        setEvents(timeline.map(({ date, event }) => ({ date, event, day: days.get(date) ?? { date, attendance: [], crews: [], events: [] } })));
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load dashboard data."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener("sitepulse-project-changed", refresh); window.addEventListener("sitepulse-day-changed", refresh);
    return () => { cancelled = true; window.removeEventListener("sitepulse-project-changed", refresh); window.removeEventListener("sitepulse-day-changed", refresh); };
  }, []);

  const filteredForOptions = useMemo(() => programme.filter((activity) => (!filters.building || activity.building === filters.building) && (!filters.elevation || activity.elevation === filters.elevation) && (!filters.level || activity.level === filters.level)), [filters.building, filters.elevation, filters.level, programme]);
  const options = useMemo(() => ({
    buildings: unique(programme.map((item) => item.building)),
    elevations: unique(programme.filter((item) => !filters.building || item.building === filters.building).map((item) => item.elevation)),
    levels: unique(programme.filter((item) => (!filters.building || item.building === filters.building) && (!filters.elevation || item.elevation === filters.elevation)).map((item) => item.level)),
    activities: filteredForOptions,
    gangs: unique(events.map(({ day, event }) => day.crews?.find((crew) => crew.id === event.crewId)?.name ?? (event.crewId ? "Unknown gang" : "Unassigned gang"))),
    units: unique(programme.map((item) => item.unit)),
  }), [events, filteredForOptions, filters.building, filters.elevation, programme]);
  const data = useMemo(() => selectedDate ? buildDashboardData({ period, selectedDate, programme, events, filters }) : null, [events, filters, period, programme, selectedDate]);
  const range = selectedDate ? dashboardRange(period, selectedDate) : null;
  const mostFrequent = data?.blockers.slice().sort((a, b) => b.events - a.events)[0];
  const selectedBlockerRows = data?.disruptionRows.filter(({ event }) => !selectedBlocker || classifyDashboardBlocker(event) === selectedBlocker) ?? [];
  const selectedGangRow = data?.gangs.find((row) => row.key === selectedGang);
  const selectedActivityRow = data?.behind.find((row) => row.id === selectedActivity);

  if (!selectedDate || !data) return null;
  return <main className="dashboard-page"><div className="dashboard-shell">
    <header className="dashboard-header"><div><p className="eyebrow">Production control</p><h1>Project Dashboard</h1><p>{project?.name ?? "Project"} · {range?.start} to {range?.end}</p></div><span className="dashboard-method">Linear planned production profile</span></header>

    <section className="dashboard-controls" aria-label="Dashboard period and filters">
      <div className="dashboard-period-tabs">{(["daily", "weekly", "monthly"] as DashboardPeriod[]).map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => { setPeriod(item); setSelectedBlocker(""); setSelectedGang(""); setSelectedActivity(""); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      <label><span>{period === "monthly" ? "Calendar month" : period === "weekly" ? "Week commencing" : "Date"}</span><input type={period === "monthly" ? "month" : "date"} value={period === "monthly" ? selectedDate.slice(0, 7) : period === "weekly" ? mondayFor(selectedDate) : selectedDate} onChange={(event) => setSelectedDate(period === "monthly" ? `${event.target.value}-01` : period === "weekly" ? mondayFor(event.target.value) : event.target.value)} /></label>
      {([ ["building", "Building", options.buildings], ["elevation", "Elevation", options.elevations], ["level", "Level", options.levels], ["gang", "Gang", options.gangs], ["unit", "Unit", options.units] ] as Array<[keyof DashboardFilters, string, string[]]>).map(([key, label, values]) => <label key={key}><span>{label}</span><select value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value, ...(key === "building" ? { elevation: "", level: "", activity: "" } : key === "elevation" ? { level: "", activity: "" } : key === "level" ? { activity: "" } : {}) }))}><option value="">All</option>{values.map((value) => <option key={value}>{value}</option>)}</select></label>)}
      <label><span>Activity</span><select value={filters.activity} onChange={(event) => setFilters((current) => ({ ...current, activity: event.target.value }))}><option value="">All</option>{options.activities.map((activity) => <option key={activity.programmeActivityId} value={activity.programmeActivityId}>{activity.activity}</option>)}</select></label>
      <button className="secondary-button dashboard-clear" onClick={() => setFilters(emptyFilters)}>Clear filters</button>
    </section>

    {loading && <div className="dashboard-notice">Loading dashboard data…</div>}
    {error && <div className="dashboard-notice error" role="alert">{error}</div>}
    {data.warnings.map((warning) => <div className="dashboard-notice warning" key={warning}>{warning}</div>)}

    <section className="dashboard-kpi-grid-main" aria-label="Production key performance indicators">
      <DashboardKpiCard label="Expected Output" value={format(data.kpis.expected, data.unit ? ` ${data.unit}` : "")} detail="Selected period" />
      <DashboardKpiCard label="Achieved Output" value={format(data.kpis.achieved, data.unit ? ` ${data.unit}` : "")} detail="Measured work" />
      <DashboardKpiCard label="Achievement" value={format(data.kpis.achievement, "%")} tone={performanceTone(data.kpis.achievement)} />
      <DashboardKpiCard label="Planned Production Rate" value={format(data.kpis.plannedRate, data.unit ? ` ${data.unit}/labour hr` : "")} />
      <DashboardKpiCard label="Actual Production Rate" value={format(data.kpis.actualRate, data.unit ? ` ${data.unit}/labour hr` : "")} />
      <DashboardKpiCard label="Productivity Performance" value={format(data.kpis.productivityPerformance, "%")} tone={performanceTone(data.kpis.productivityPerformance)} />
      <DashboardKpiCard label="Productive Labour Hours" value={format(data.kpis.productiveHours, " hr")} detail={data.kpis.utilisation === null ? undefined : `${format(data.kpis.utilisation, "%")} utilisation`} />
      <DashboardKpiCard label="Lost Labour Hours" value={format(data.kpis.lostHours, " hr")} tone={data.kpis.lostHours ? "bad" : "neutral"} />
      <DashboardKpiCard label="Activities Behind Target" value={String(data.kpis.behindCount)} tone={data.kpis.behindCount ? "bad" : "good"} />
      <DashboardKpiCard label="Principal Blocker" value={data.kpis.principalBlocker ?? "—"} detail={mostFrequent ? `Most frequent: ${mostFrequent.category} (${mostFrequent.events})` : undefined} />
    </section>

    <section className="dashboard-chart-grid">
      {data.kpis.expected !== null && data.kpis.achieved !== null ? <PlannedVsActualChart data={data.output} unit={data.unit} /> : <EmptyChart title="Planned vs achieved output" message="A complete planned baseline and measured actual quantity are required." />}
      {data.kpis.expected !== null ? <CumulativeProgressChart data={data.cumulative} unit={data.unit} /> : <EmptyChart title="Cumulative planned vs actual" message="A complete planned quantity and date baseline is required." />}
      <ProductivityTrendChart data={data.productivity} unit={data.unit} />
      <GangProductivityChart data={data.gangs} onSelect={setSelectedGang} />
      {data.kpis.utilisation !== null ? <LabourUtilisationChart data={data.labour} /> : <EmptyChart title="Labour utilisation" message="No classified labour hours exist for this period." />}
      <BlockerParetoChart data={data.blockers} onSelect={setSelectedBlocker} />
      <ActivitiesBehindChart data={data.behind} onSelect={setSelectedActivity} />
    </section>

    {selectedGangRow && <section className="dashboard-drilldown"><h2>Gang drill-down</h2><p><strong>{selectedGangRow.gang}</strong> · {selectedGangRow.activity} · {selectedGangRow.status}</p><p>Planned {format(selectedGangRow.planned)} vs actual {format(selectedGangRow.actual)} {selectedGangRow.unit}/labour hr ({format(selectedGangRow.performance, "%")}).</p></section>}
    {selectedBlocker && <section className="dashboard-drilldown"><h2>{selectedBlocker} disruption events</h2><div className="report-table-scroll"><table><thead><tr><th>Date</th><th>Activity</th><th>Reason</th><th>Lost hours</th></tr></thead><tbody>{selectedBlockerRows.map(({ date, event }) => <tr key={event.id}><td>{date}</td><td>{programme.find((item) => item.programmeActivityId === event.programmeActivityId)?.activity ?? event.title}</td><td>{event.reason ?? event.title}</td><td>{format(event.lostLabourHours ?? 0)}</td></tr>)}</tbody></table></div></section>}
    {selectedActivityRow && <section className="dashboard-drilldown"><h2>Activity detail</h2><p><strong>{selectedActivityRow.activity}</strong> · {selectedActivityRow.building} / {selectedActivityRow.elevation} / {selectedActivityRow.level}</p><p>Expected {format(selectedActivityRow.expected)} {selectedActivityRow.unit}; actual {format(selectedActivityRow.actual)}; variance {format(selectedActivityRow.variance)}. Planned finish {selectedActivityRow.plannedFinish ?? "—"}. Main blocker {selectedActivityRow.mainBlocker}.</p></section>}

    <section className="dashboard-detail-table"><h2>Activities behind target detail</h2>{data.behind.length ? <div className="report-table-scroll"><table><thead><tr>{["Activity", "Building", "Elevation", "Level", "Expected to Date", "Actual to Date", "Variance", "Achievement", "Planned Finish", "Main Blocker"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{data.behind.map((row) => <tr key={row.id} onClick={() => setSelectedActivity(row.id)}><td>{row.activity}</td><td>{row.building || "—"}</td><td>{row.elevation || "—"}</td><td>{row.level || "—"}</td><td>{format(row.expected)} {row.unit}</td><td>{format(row.actual)} {row.unit}</td><td>{format(row.variance)} {row.unit}</td><td>{format(row.achievement, "%")}</td><td>{row.plannedFinish ?? "—"}</td><td>{row.mainBlocker}</td></tr>)}</tbody></table></div> : <p>No activities are behind target for the selected filters and period.</p>}</section>
  </div></main>;
}
