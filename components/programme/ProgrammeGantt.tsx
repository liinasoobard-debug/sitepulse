"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConstraintActivityLink, ConstraintRecord } from "@/lib/constraints";
import { deriveProgrammeGanttStatus, isAvailableNow, openConstraintsForActivity, programmeGanttStatusLabels } from "@/lib/programmeGantt";
import type { ProgrammeOperationalMetric } from "@/lib/supabase/programmeData";
import type { ProgrammeActivity } from "@/types/site";

type Props = { activities: ProgrammeActivity[]; constraints: ConstraintRecord[]; constraintLinks: ConstraintActivityLink[]; metrics: Record<string, ProgrammeOperationalMetric>; dataDate: string; programmeDataDate?: string; loading?: boolean };
type FilterKey = "elevation" | "level" | "workType" | "crew" | "activity" | "activityType" | "status";
type Zoom = "weeks" | "months" | "overview";
const DAY = 86_400_000, ROW_HEIGHT = 52, HEADER_HEIGHT = 62;
const dateValue = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
const isoDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const displayDate = (value?: string, short = false) => value ? new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", short ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" }) : "—";
const number = (value: number | null | undefined, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: digits });
const dayWidthFor = (zoom: Zoom) => zoom === "weeks" ? 10 : zoom === "months" ? 4 : 1.7;

export default function ProgrammeGantt({ activities, constraints, constraintLinks, metrics, dataDate, programmeDataDate, loading }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [availableOnly, setAvailableOnly] = useState(false), [selectedId, setSelectedId] = useState<string>(), [zoom, setZoom] = useState<Zoom>("weeks");
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ elevation: "", level: "", workType: "", crew: "", activity: "", activityType: "", status: "" });
  const rows = useMemo(() => activities.map((activity) => { const openConstraints = openConstraintsForActivity(activity.programmeActivityId, constraints, constraintLinks); return { activity, openConstraints, status: deriveProgrammeGanttStatus(activity, dataDate, openConstraints), metric: metrics[activity.programmeActivityId] }; }), [activities, constraints, constraintLinks, dataDate, metrics]);
  const options = useMemo(() => ({ elevation: [...new Set(activities.map((item) => item.elevation).filter(Boolean))].sort(), level: [...new Set(activities.map((item) => item.level).filter(Boolean))].sort(), workType: [...new Set(activities.map((item) => item.productType || item.workActivity).filter(Boolean) as string[])].sort(), crew: [...new Set(activities.flatMap((item) => item.labourResourceNames ?? []).filter(Boolean))].sort() }), [activities]);
  const filtered = useMemo(() => rows.filter(({ activity, status }) => { const query = filters.activity.toLowerCase(); const activityText = `${activity.activityName ?? ""} ${activity.activity} ${activity.workActivity ?? ""} ${activity.productType ?? ""}`; return (!availableOnly || isAvailableNow(status)) && (!filters.elevation || activity.elevation === filters.elevation) && (!filters.level || activity.level === filters.level) && (!filters.workType || (activity.productType || activity.workActivity) === filters.workType) && (!filters.crew || activity.labourResourceNames?.includes(filters.crew)) && (!filters.activityType || (filters.activityType === "install" && /install|installation|erection/i.test(activityText))) && (!filters.status || status === filters.status) && (!query || `${activity.programmeActivityId} ${activity.activityName ?? activity.activity}`.toLowerCase().includes(query)); }), [availableOnly, filters, rows]);

  const dated = activities.filter((item) => item.plannedStart && item.plannedFinish);
  const programmeStart = dated.length ? Math.min(...dated.map((item) => dateValue(item.plannedStart!))) : dateValue(dataDate) - 90 * DAY;
  const programmeFinish = dated.length ? Math.max(...dated.map((item) => dateValue(item.plannedFinish!))) : dateValue(dataDate) + 180 * DAY;
  const timelineStart = programmeStart - 31 * DAY, timelineFinish = programmeFinish + 62 * DAY;
  const timelineDays = Math.max(180, Math.ceil((timelineFinish - timelineStart) / DAY)), dayWidth = dayWidthFor(zoom), timelineWidth = timelineDays * dayWidth;
  const dataDateLeft = (dateValue(dataDate) - timelineStart) / DAY * dayWidth;
  const bands = useMemo(() => {
    const years: Band[] = [], periods: Band[] = [], ticks: Band[] = [];
    const push = (target: Band[], label: string, start: number, finish: number) => target.push({ label, left: (start - timelineStart) / DAY * dayWidth, width: (finish - start) / DAY * dayWidth });
    let cursor = timelineStart;
    while (cursor < timelineFinish) { const date = new Date(cursor), next = Math.min(timelineFinish, Date.UTC(date.getUTCFullYear() + 1, 0, 1)); push(years, String(date.getUTCFullYear()), cursor, next); cursor = next; }
    cursor = timelineStart;
    while (cursor < timelineFinish) { const date = new Date(cursor), quarter = Math.floor(date.getUTCMonth() / 3); const next = zoom === "overview" ? Math.min(timelineFinish, Date.UTC(date.getUTCFullYear(), quarter * 3 + 3, 1)) : Math.min(timelineFinish, Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)); push(periods, zoom === "overview" ? `Q${quarter + 1}` : date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), cursor, next); cursor = next; }
    if (zoom === "weeks") { cursor = timelineStart; while (cursor < timelineFinish) { const next = Math.min(timelineFinish, cursor + 7 * DAY); push(ticks, displayDate(isoDate(cursor), true), cursor, next); cursor = next; } }
    return { years, periods, ticks };
  }, [dayWidth, timelineFinish, timelineStart, zoom]);
  useEffect(() => { const timeline = timelineRef.current; if (!timeline) return; const frame = requestAnimationFrame(() => { timeline.scrollLeft = Math.max(0, dataDateLeft - timeline.clientWidth * .42); }); return () => cancelAnimationFrame(frame); }, [dataDateLeft, zoom, activities.length]);
  const selected = rows.find(({ activity }) => activity.id === selectedId);
  const setFilter = (key: FilterKey, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const renderBands = (items: Band[], className: string) => items.map((item, index) => <span className={className} key={`${item.label}-${index}`} style={{ left: item.left, width: item.width }}>{item.label}</span>);

  return <section className="programme-gantt-section programme-gantt-v2" aria-label="Programme Gantt">
    <div className="programme-gantt-intro"><div><p className="eyebrow">Operational programme</p><h2>Programme Gantt</h2><p>Imported programme dates with live SitePulse progress, productivity and constraints.</p></div><div className="programme-data-date"><span>Selected site date</span><strong>{displayDate(dataDate)}</strong>{programmeDataDate ? <small>Programme data date: {displayDate(programmeDataDate)}</small> : null}</div></div>
    <div className="programme-gantt-toolbar compact">
      <button type="button" className={`available-now-button${availableOnly ? " active" : ""}`} aria-pressed={availableOnly} onClick={() => setAvailableOnly((value) => !value)}>Available Now <small>{rows.filter((row) => isAvailableNow(row.status)).length}</small></button>
      <Filter label="Elevation / area"><select value={filters.elevation} onChange={(e) => setFilter("elevation", e.target.value)}><option value="">All areas</option>{options.elevation.map((value) => <option key={value}>{value}</option>)}</select></Filter>
      <Filter label="Level"><select value={filters.level} onChange={(e) => setFilter("level", e.target.value)}><option value="">All levels</option>{options.level.map((value) => <option key={value}>{value}</option>)}</select></Filter>
      <Filter label="Work type / material"><select value={filters.workType} onChange={(e) => setFilter("workType", e.target.value)}><option value="">All work types</option>{options.workType.map((value) => <option key={value}>{value}</option>)}</select></Filter>
      <Filter label="Activity type"><select value={filters.activityType} onChange={(e) => setFilter("activityType", e.target.value)}><option value="">All activities</option><option value="install">Install</option></select></Filter>
      <Filter label="Crew"><select value={filters.crew} onChange={(e) => setFilter("crew", e.target.value)}><option value="">All crews</option>{options.crew.map((value) => <option key={value}>{value}</option>)}</select></Filter>
      <Filter label="Status"><select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="">All statuses</option>{Object.entries(programmeGanttStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Filter>
      <Filter label="Activity" className="programme-activity-search"><input type="search" value={filters.activity} onChange={(e) => setFilter("activity", e.target.value)} placeholder="ID or activity name" /></Filter>
    </div>
    <div className="programme-gantt-controls"><div className="programme-status-key">{Object.entries(programmeGanttStatusLabels).map(([status, label]) => <span key={status}><i className={`gantt-key gantt-status-${status}`} />{label}</span>)}</div><div className="gantt-zoom"><span>Zoom</span>{(["weeks", "months", "overview"] as Zoom[]).map((value) => <button type="button" className={zoom === value ? "active" : ""} key={value} onClick={() => setZoom(value)}>{value === "overview" ? "Quarter" : value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
    <div className="programme-gantt-frame">
      <div className="gantt-fixed-pane"><div className="gantt-fixed-header"><span>Activity</span><span>Start</span><span>Finish</span><span>Dur.</span><span>%</span></div>{loading ? <p className="programme-gantt-empty">Loading programme…</p> : filtered.length === 0 ? <p className="programme-gantt-empty">No activities match these filters.</p> : filtered.map(({ activity, status }) => <button type="button" className={`gantt-fixed-row${selectedId === activity.id ? " selected" : ""}`} style={{ height: ROW_HEIGHT }} key={activity.id} onClick={() => setSelectedId(activity.id)}><span className="gantt-activity-cell"><strong>{activity.activityName ?? activity.activity}</strong><small><i className={`gantt-row-status gantt-status-${status}`} />{activity.programmeActivityId}</small></span><span>{displayDate(activity.plannedStart, true)}</span><span>{displayDate(activity.plannedFinish, true)}</span><span>{number(activity.originalDuration ?? activity.plannedDurationDays, 0)}d</span><span>{number(activity.physicalPercentComplete, 0)}%</span></button>)}</div>
      <div className="gantt-timeline-pane" ref={timelineRef}><div className="gantt-time-canvas" style={{ width: timelineWidth, minHeight: HEADER_HEIGHT + Math.max(1, filtered.length) * ROW_HEIGHT }}>
        <div className={`gantt-timescale ${zoom}`} style={{ height: HEADER_HEIGHT }}><div>{renderBands(bands.years, "year-band")}</div><div>{renderBands(bands.periods, "period-band")}</div>{bands.ticks.length ? <div>{renderBands(bands.ticks, "tick-band")}</div> : null}</div>
        <i className="gantt-data-date-line" style={{ left: dataDateLeft }}><span>{displayDate(dataDate, true)}</span></i><div className={`gantt-grid-lines zoom-${zoom}`} style={{ top: HEADER_HEIGHT, height: Math.max(1, filtered.length) * ROW_HEIGHT }} />
        {filtered.map(({ activity, status }, index) => { const left = activity.plannedStart ? (dateValue(activity.plannedStart) - timelineStart) / DAY * dayWidth : 0; const width = activity.plannedStart && activity.plannedFinish ? Math.max(5, ((dateValue(activity.plannedFinish) - dateValue(activity.plannedStart)) / DAY + 1) * dayWidth) : 5; const progress = Math.min(100, Math.max(0, Number(activity.physicalPercentComplete ?? 0))); return <button type="button" className={`gantt-timeline-row${selectedId === activity.id ? " selected" : ""}`} style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT }} key={activity.id} aria-label={`Select ${activity.activityName ?? activity.activity}`} onClick={() => setSelectedId(activity.id)}><i className={`gantt-bar gantt-status-${status}`} style={{ left, width }} title={`${activity.activityName}: ${displayDate(activity.plannedStart)} – ${displayDate(activity.plannedFinish)}`}><b style={{ width: `${progress}%` }} /></i></button>; })}
      </div></div>
    </div>
    {selected ? <div className="programme-drawer-backdrop" onClick={() => setSelectedId(undefined)}><aside className="programme-intelligence programme-intelligence-drawer" onClick={(event) => event.stopPropagation()}><button type="button" className="programme-drawer-close" aria-label="Close activity intelligence" onClick={() => setSelectedId(undefined)}>×</button><div className="programme-intelligence-heading"><div><p className="eyebrow">Activity intelligence</p><h3>{selected.activity.activityName ?? selected.activity.activity}</h3><span>{[selected.activity.elevation, selected.activity.level].filter(Boolean).join(" · ") || selected.activity.programmeActivityId}</span></div><span className={`gantt-status-pill gantt-status-${selected.status}`}>{programmeGanttStatusLabels[selected.status]}</span></div><dl><Metric label="Planned labour" value={number(selected.activity.assumedGangSize ?? selected.activity.plannedCrewSize, 0)} /><Metric label="Actual labour" value={number(selected.metric?.actualCrew, 0)} /><Metric label="Progress" value={`${number(selected.activity.physicalPercentComplete, 0)}%`} /><Metric label="Earned MD" value={number(selected.metric?.earnedManDays)} /><Metric label="Actual MD" value={number(selected.metric?.actualManDays)} /><Metric label="PF" value={number(selected.metric?.productivityFactor, 2)} /><Metric wide label="Constraint status" value={selected.openConstraints.length ? `${selected.openConstraints.length} open · ${selected.openConstraints.some((item) => item.rag === "RED") ? "Red" : "Active"}` : "No open constraint linked"} /><Metric wide label="Current constraint" value={selected.openConstraints[0]?.description ?? "—"} /></dl><div className="programme-intelligence-actions"><Link href={`/constraints?activity=${encodeURIComponent(selected.activity.programmeActivityId)}`}>View constraints</Link><Link href={`/forecast?activity=${encodeURIComponent(selected.activity.programmeActivityId)}`}>Forecast &amp; recovery</Link></div></aside></div> : null}
  </section>;
}

type Band = { label: string; left: number; width: number };
function Filter({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={className}><span>{label}</span>{children}</label>; }
function Metric({ label, value, wide }: { label: string; value: string; wide?: boolean }) { return <div className={wide ? "intelligence-wide" : undefined}><dt>{label}</dt><dd>{value}</dd></div>; }
