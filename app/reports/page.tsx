"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  getActiveDate,
  getActiveProject,
  getActiveProjectId,
  getLocalDate,
  loadOperatives,
  loadSiteDaysBetween,
} from "@/lib/storage";
import { loadPublishedProgramme } from "@/lib/supabase/programmeData";
import { loadTimelineEventsBetween } from "@/lib/supabase/timelineData";
import { crewName, elapsedHours, eventLabourHours } from "@/lib/reporting";
import { calculateLabourRateBreakdown, labourRateRuleForCompany, normaliseLabourRateSettings } from "@/lib/labourRates";
import type { Operative, ProgrammeActivity, Project, SiteDay, TimelineEvent } from "@/types/site";

type DatedEvent = { date: string; day: SiteDay; event: TimelineEvent };

const cellStyle = {
  padding: 10,
  borderBottom: "1px solid #e4e8ec",
  textAlign: "left" as const,
  verticalAlign: "top" as const,
};

function mondayFor(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  return getLocalDate(value);
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return getLocalDate(value);
}

function formatDate(date: string, includeYear = true): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: undefined,
    day: "numeric",
    month: "long",
    year: includeYear ? "numeric" : undefined,
  }).format(new Date(`${date}T12:00:00`));
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));
}

function number(value: number): string {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function labourHours(events: TimelineEvent[], type: TimelineEvent["type"]): number {
  return events.filter((event) => event.type === type).reduce((sum, event) => sum + eventLabourHours(event), 0);
}

function Table({ children, minWidth = 900 }: { children: React.ReactNode; minWidth?: number }) {
  return <div style={{ overflowX: "auto", border: "1px solid #d7dde3", borderRadius: 12 }}><table style={{ width: "100%", minWidth, borderCollapse: "collapse", background: "#fff" }}>{children}</table></div>;
}

function Section({ title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <section style={{ marginBottom: 34 }}><h2>{title}</h2>{children}</section>;
}

function programmeFor(event: TimelineEvent, programmeById: Map<string, ProgrammeActivity>) {
  return event.programmeActivityId ? programmeById.get(event.programmeActivityId) : undefined;
}

export default function ReportsPage() {
  const [weekStart, setWeekStart] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [days, setDays] = useState<SiteDay[]>([]);
  const [allDays, setAllDays] = useState<SiteDay[]>([]);
  const [programme, setProgramme] = useState<ProgrammeActivity[]>([]);
  const [operatives, setOperatives] = useState<Operative[]>([]);
  const [productivityPeriod, setProductivityPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("weekly");
  const [productivityDate, setProductivityDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        const activeDate = getActiveDate();
        setWeekStart(mondayFor(activeDate));
        setProductivityDate(activeDate);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!weekStart) return;
    let cancelled = false;
    async function refresh() {
      if (cancelled) return;
      const projectId = getActiveProjectId();
      const weekEnd = addDays(weekStart, 6);
      setProject(getActiveProject());
      const localWeek=loadSiteDaysBetween(weekStart,weekEnd,projectId),localAll=loadSiteDaysBetween("1000-01-01","9999-12-31",projectId);
      try { const [published,allEvents]=await Promise.all([loadPublishedProgramme(projectId),loadTimelineEventsBetween(projectId,"1000-01-01","9999-12-31")]);if(cancelled)return;setProgramme(published.activities);const byDate=new Map<string,TimelineEvent[]>();allEvents.forEach(({date,event})=>byDate.set(date,[...(byDate.get(date)??[]),event]));const withEvents=(source:SiteDay[],start:string,end:string)=>{const days=new Map(source.map(day=>[day.date,day]));byDate.forEach((_events,date)=>{if(date>=start&&date<=end&&!days.has(date))days.set(date,{date,attendance:[],crews:[],events:[]});});return [...days.values()].map(day=>({...day,events:byDate.get(day.date)??[]})).sort((a,b)=>a.date.localeCompare(b.date));};setDays(withEvents(localWeek,weekStart,weekEnd));setAllDays(withEvents(localAll,"1000-01-01","9999-12-31")); } catch(error) { console.error("Unable to load Supabase report data",error); }
      setOperatives(loadOperatives());
    }
    void refresh();
    const storageRefresh = () => void refresh();
    window.addEventListener("sitepulse-day-changed", storageRefresh);
    window.addEventListener("sitepulse-project-changed", storageRefresh);
    window.addEventListener("storage", storageRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("sitepulse-day-changed", storageRefresh);
      window.removeEventListener("sitepulse-project-changed", storageRefresh);
      window.removeEventListener("storage", storageRefresh);
    };
  }, [weekStart]);

  const report = useMemo(() => {
    const weekEnd = weekStart ? addDays(weekStart, 6) : "";
    const dates = weekStart ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)) : [];
    const dayByDate = new Map(days.map((day) => [day.date, day]));
    const programmeById = new Map(programme.map((item) => [item.programmeActivityId, item]));
    const operativeById = new Map(operatives.map((item) => [String(item.id), item]));
    const weeklyEvents: DatedEvent[] = days.flatMap((day) => day.events.map((event) => ({ date: day.date, day, event })));
    const allEvents: DatedEvent[] = allDays.flatMap((day) => day.events.map((event) => ({ date: day.date, day, event })));
    const completedWork = weeklyEvents.filter(({ event }) => event.type === "work" && event.status === "completed");
    const periodDate = productivityDate || weekStart;
    const monthStart = `${periodDate.slice(0, 7)}-01`;
    const monthEndValue = new Date(`${monthStart}T12:00:00`);
    monthEndValue.setMonth(monthEndValue.getMonth() + 1);
    monthEndValue.setDate(monthEndValue.getDate() - 1);
    const yearStart = `${periodDate.slice(0, 4)}-01-01`;
    const productivityStart = productivityPeriod === "daily" ? periodDate : productivityPeriod === "monthly" ? monthStart : productivityPeriod === "yearly" ? yearStart : weekStart;
    const productivityEnd = productivityPeriod === "daily"
      ? periodDate
      : productivityPeriod === "weekly"
        ? weekEnd
        : productivityPeriod === "monthly" ? getLocalDate(monthEndValue) : `${periodDate.slice(0, 4)}-12-31`;
    const productivityEvents = allEvents.filter(({ date }) => date >= productivityStart && date <= productivityEnd);
    const productivityCompletedWork = productivityEvents.filter(({ event }) => event.type === "work" && event.status === "completed");

    const activityPerformance = programme.flatMap((activity) => {
      const activityEvents = allEvents.filter(({ date, event }) => date <= productivityEnd && event.type === "work" && event.programmeActivityId === activity.programmeActivityId).sort((a, b) => a.date.localeCompare(b.date));
      const periodEvents = activityEvents.filter(({ date }) => date >= productivityStart);
      const startedDate = activity.actualStart || activityEvents[0]?.date;
      const cumulativeQuantity = activityEvents.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
      const inferredFinished = activity.plannedQuantity > 0 && cumulativeQuantity >= activity.plannedQuantity ? activityEvents.at(-1)?.date : undefined;
      const finishedDate = activity.actualFinish || inferredFinished;
      const startedInPeriod = Boolean(startedDate && startedDate >= productivityStart && startedDate <= productivityEnd);
      const finishedInPeriod = Boolean(finishedDate && finishedDate >= productivityStart && finishedDate <= productivityEnd);
      if (!periodEvents.length && !startedInPeriod && !finishedInPeriod) return [];
      const quantity = periodEvents.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
      const hours = periodEvents.reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      return [{ ...activity, startedDate, finishedDate, startedInPeriod, finishedInPeriod, periodQuantity: quantity, periodHours: hours, periodProductivity: hours > 0 ? quantity / hours : null, cumulativeQuantity }];
    }).sort((a, b) => `${a.building}|${a.elevation}|${a.level}|${a.activity}`.localeCompare(`${b.building}|${b.elevation}|${b.level}|${b.activity}`));

    const measured = programme.flatMap((activity) => {
      const weekly = productivityCompletedWork.filter(({ event }) => event.programmeActivityId === activity.programmeActivityId);
      const cumulative = allEvents.filter(({ date, event }) => date <= productivityEnd && event.type === "work" && event.status === "completed" && event.programmeActivityId === activity.programmeActivityId);
      if (!weekly.length && !cumulative.length) return [];
      const weeklyQuantity = weekly.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
      const cumulativeQuantity = cumulative.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
      const hours = weekly.reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      const disruptionHours = productivityEvents
        .filter(({ event }) => event.type === "disruption" && event.programmeActivityId === activity.programmeActivityId)
        .reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      const plannedRate = (activity.plannedProductionRate ?? 0) > 0 ? activity.plannedProductionRate! : null;
      const actualRate = hours > 0 ? weeklyQuantity / hours : null;
      const overallRate = hours + disruptionHours > 0 ? weeklyQuantity / (hours + disruptionHours) : null;
      const earnedHours = plannedRate ? weeklyQuantity / plannedRate : null;
      return [{
        ...activity,
        weeklyQuantity,
        cumulativeQuantity,
        remaining: Math.max(activity.plannedQuantity - cumulativeQuantity, 0),
        percentage: activity.plannedQuantity > 0 ? (cumulativeQuantity / activity.plannedQuantity) * 100 : 0,
        hours,
        productivity: hours > 0 ? weeklyQuantity / hours : 0,
        baselineComplete: Boolean(activity.plannedQuantity > 0 && (activity.budgetLabourHours ?? 0) > 0 && plannedRate),
        plannedRate,
        actualRate,
        overallRate,
        disruptionHours,
        earnedHours,
        labourProductivityIndex: earnedHours !== null && hours > 0 ? earnedHours / hours : null,
        overallLabourEfficiencyIndex: earnedHours !== null && hours + disruptionHours > 0 ? earnedHours / (hours + disruptionHours) : null,
        productivityPerformance: actualRate !== null && plannedRate ? actualRate / plannedRate * 100 : null,
      }];
    }).sort((a, b) => `${a.building}|${a.elevation}|${a.level}|${a.activity}`.localeCompare(`${b.building}|${b.elevation}|${b.level}|${b.activity}`));

    const gangMap = new Map<string, { gang: string; activity: string; unit: string; quantities: number; productive: number; disruption: number; variation: number; crewCounts: number[] }>();
    completedWork.forEach(({ day, event }) => {
      const activity = programmeFor(event, programmeById);
      if (!activity) return;
      const gang = crewName(day.crews ?? [], event.crewId);
      const key = `${gang}|${activity.programmeActivityId}|${activity.unit}`;
      const row = gangMap.get(key) ?? { gang, activity: activity.activity, unit: activity.unit, quantities: 0, productive: 0, disruption: 0, variation: 0, crewCounts: [] };
      row.quantities += event.quantity ?? 0;
      row.productive += eventLabourHours(event);
      const crew = day.crews?.find((item) => item.id === event.crewId);
      if (crew) row.crewCounts.push(crew.operativeIds.length);
      gangMap.set(key, row);
    });
    weeklyEvents.filter(({ event }) => event.type === "disruption" || event.type === "variation").forEach(({ day, event }) => {
      const gang = crewName(day.crews ?? [], event.crewId);
      for (const row of gangMap.values()) {
        if (row.gang !== gang) continue;
        if (event.type === "disruption") row.disruption += eventLabourHours(event);
        else row.variation += eventLabourHours(event);
      }
    });

    const disruptions = weeklyEvents.filter(({ event }) => event.type === "disruption");
    const variations = weeklyEvents.filter(({ event }) => event.type === "variation");
    const disruptionCost = disruptions.reduce((sum, { event }) => sum + (event.labourCost ?? 0), 0);
    const disruptionLostHours = disruptions.reduce((sum, { event }) => sum + (event.lostLabourHours ?? eventLabourHours(event)), 0);
    const weeklyAttendanceHours = days.reduce((sum, day) => sum + day.attendance.reduce((daySum, record) => daySum + elapsedHours(record.signIn, record.signOut), 0), 0);
    const labourSettings = normaliseLabourRateSettings(project?.labourRateSettings);
    const labourByDate = new Map(days.map((day) => {
      const breakdown = day.attendance.reduce((total, record) => {
        const operative = operativeById.get(String(record.operativeId));
        if (!operative) return total;
        const value = calculateLabourRateBreakdown(record.signIn, record.signOut, operative.hourlyRate, labourRateRuleForCompany(labourSettings, operative.company));
        return { backshiftHours: total.backshiftHours + value.backshiftHours, cost: total.cost + value.totalCost };
      }, { backshiftHours: 0, cost: 0 });
      return [day.date, breakdown] as const;
    }));
    const weeklyBackshiftHours = [...labourByDate.values()].reduce((sum, value) => sum + value.backshiftHours, 0);
    const weeklyAttendanceCost = [...labourByDate.values()].reduce((sum, value) => sum + value.cost, 0);
    const productiveHours = labourHours(weeklyEvents.map(({ event }) => event), "work");
    const classifiedHours = productiveHours + labourHours(weeklyEvents.map(({ event }) => event), "disruption") + labourHours(weeklyEvents.map(({ event }) => event), "variation") + labourHours(weeklyEvents.map(({ event }) => event), "break");

    const measuredText = measured.filter((row) => row.weeklyQuantity > 0).slice(0, 3).map((row) => `${number(row.weeklyQuantity)}${row.unit ? ` ${row.unit}` : ""} of ${row.activity}`).join(", ");
    const gangNames = new Set(days.flatMap((day) => (day.crews ?? []).map((crew) => crew.name)));
    const reasonCounts = new Map<string, number>();
    disruptions.forEach(({ event }) => { const reason = event.reason || event.title; reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1); });
    const mainReason = [...reasonCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const references = [...new Set(variations.map(({ event }) => event.instructionReference || event.drawingReference).filter(Boolean))];
    const narrative = days.length === 0 ? "Enter or backdate daily records for this week to populate the report." : [
      `During the week commencing ${formatDate(weekStart)}, the site recorded ${number(weeklyAttendanceHours)} labour hours, including ${number(weeklyBackshiftHours)} backshift hours, across ${gangNames.size} gang${gangNames.size === 1 ? "" : "s"}.`,
      measuredText ? `Measured work included ${measuredText}.` : "No completed measured work was recorded.",
      classifiedHours > 0 ? `Productive labour represented ${number((productiveHours / classifiedHours) * 100)}% of classified labour time.` : "No classified labour time was recorded.",
      disruptions.length ? `${disruptions.length} disruption event${disruptions.length === 1 ? "" : "s"} resulted in ${number(disruptionLostHours)} lost labour hours${mainReason ? `, mainly due to ${mainReason.toLowerCase()}` : ""}.` : "No disruptions were recorded.",
      variations.length ? `VO/change works${references.length ? ` under ${references.join(", ")}` : ""} accounted for ${number(variations.reduce((sum, { event }) => sum + eventLabourHours(event), 0))} labour hours.` : "No VO/change work was recorded.",
    ].join(" ");

    return { weekEnd, dates, dayByDate, programmeById, operativeById, weeklyEvents, measured, activityPerformance, gangs: [...gangMap.values()], disruptions, variations, disruptionCost, disruptionLostHours, weeklyAttendanceHours, weeklyBackshiftHours, weeklyAttendanceCost, labourByDate, narrative, productivityStart, productivityEnd };
  }, [allDays, days, operatives, productivityDate, productivityPeriod, programme, project?.labourRateSettings, weekStart]);

  function exportExcel() {
    const workbook = XLSX.utils.book_new();
    const dailyRows = report.dates.map((date) => {
      const day = report.dayByDate.get(date);
      const labour = report.labourByDate.get(date);
      return {
        Date: date,
        Operatives: day?.attendance.length ?? 0,
        Gangs: day?.crews?.length ?? 0,
        "Productive Hours": day ? labourHours(day.events, "work") : 0,
        "Disruption Hours": day ? labourHours(day.events, "disruption") : 0,
        "VO / Change Hours": day ? labourHours(day.events, "variation") : 0,
        "Break Hours": day ? labourHours(day.events, "break") : 0,
        "Attendance Hours": day?.attendance.reduce((sum, record) => sum + elapsedHours(record.signIn, record.signOut), 0) ?? 0,
        "Backshift Hours": labour?.backshiftHours ?? 0,
        "Labour Cost": labour?.cost ?? 0,
      };
    });
    const activityRows = report.activityPerformance.map((row) => ({
      Building: row.building,
      Elevation: row.elevation,
      Level: row.level,
      Activity: row.activity,
      "Activity ID": row.programmeActivityId,
      "Started Date": row.startedDate ?? "",
      "Started In Period": row.startedInPeriod ? "Yes" : "No",
      "Finished Date": row.finishedDate ?? "",
      "Finished In Period": row.finishedInPeriod ? "Yes" : "No",
      Unit: row.unit,
      "Period Quantity": row.periodQuantity,
      "Period Labour Hours": row.periodHours,
      "Period Productivity": row.periodProductivity ?? "",
      "Cumulative Quantity": row.cumulativeQuantity,
      "Planned Quantity": row.plannedQuantity,
      "% Complete": row.plannedQuantity > 0 ? row.cumulativeQuantity / row.plannedQuantity * 100 : 0,
    }));
    const measuredRows = report.measured.map((row) => ({ Activity: row.activity, "Activity ID": row.programmeActivityId, Building: row.building, Elevation: row.elevation, Level: row.level, Unit: row.unit, "Period Quantity": row.weeklyQuantity, "Cumulative Quantity": row.cumulativeQuantity, "Planned Quantity": row.plannedQuantity, "Productive Hours": row.hours, "Disruption Hours": row.disruptionHours, "Actual Production Rate": row.actualRate ?? "", "Planned Production Rate": row.plannedRate ?? "", "Productivity Performance %": row.productivityPerformance ?? "" }));
    const disruptionRows = report.disruptions.map(({ date, day, event }) => ({ Date: date, Start: event.startTime ?? event.time, Finish: event.finishTime ?? "", Gang: crewName(day.crews ?? [], event.crewId), Activity: programmeFor(event, report.programmeById)?.activity ?? event.title, Reason: event.reason ?? event.title, "Lost Labour Hours": event.lostLabourHours ?? eventLabourHours(event), "Labour Cost": event.labourCost ?? "" }));
    const variationRows = report.variations.map(({ date, day, event }) => ({ Date: date, Reference: event.drawingReference ?? event.instructionReference ?? "", Description: event.notes ?? event.title, Gang: crewName(day.crews ?? [], event.crewId), Quantity: event.quantity ?? "", Unit: event.unit ?? "", "Labour Hours": eventLabourHours(event) }));
    const sheets: Array<[string, Record<string, unknown>[]]> = [
      ["Summary", [{ Project: project?.name ?? "Project", "Week Start": weekStart, "Week End": report.weekEnd, "Activity Period Start": report.productivityStart, "Activity Period End": report.productivityEnd, "Attendance Hours": report.weeklyAttendanceHours, "Backshift Hours": report.weeklyBackshiftHours, "Labour Cost": report.weeklyAttendanceCost }]],
      ["Daily Labour", dailyRows],
      ["Activity Performance", activityRows],
      ["Measured Work", measuredRows],
      ["Disruptions", disruptionRows],
      ["VO Change Work", variationRows],
    ];
    sheets.forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name));
    const safeProject = (project?.code || project?.name || "SitePulse").replace(/[^a-zA-Z0-9_-]+/g, "-");
    XLSX.writeFile(workbook, `${safeProject}_report_${weekStart}.xlsx`);
  }

  if (!weekStart) return null;

  return <main className="timeline-page"><section className="timeline-panel">
    <header className="timeline-header"><div><p className="eyebrow">Production reporting</p><h1>Weekly Production Report</h1><p style={{ marginBottom: 0, color: "#5f6b76" }}>{project?.name ?? "Project"}</p></div><button type="button" className="secondary-button" onClick={exportExcel}>Export Excel</button></header>
    <section style={{ padding: 18, marginBottom: 30, border: "1px solid #d7dde3", borderRadius: 14, background: "#f7f9fa" }}>
      <label style={{ display: "grid", gap: 6, maxWidth: 260, fontWeight: 800 }}>Week commencing<input type="date" value={weekStart} onChange={(event) => setWeekStart(mondayFor(event.target.value))} style={{ minHeight: 42, padding: "8px 10px" }} /></label>
      <h2 style={{ marginBottom: 4 }}>Week commencing {formatDate(weekStart)}</h2><p style={{ margin: 0 }}>{formatDate(weekStart)} – {formatDate(report.weekEnd)}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <strong>Productivity period:</strong>
        {(["daily", "weekly", "monthly", "yearly"] as const).map((period) => <button key={period} type="button" className={`attendance-filter-button${productivityPeriod === period ? " active" : ""}`} onClick={() => setProductivityPeriod(period)}>{period[0].toUpperCase() + period.slice(1)}</button>)}
        {productivityPeriod !== "weekly" && <input type="date" value={productivityDate} onChange={(event) => setProductivityDate(event.target.value)} aria-label="Productivity report date" />}
        <span>{formatDate(report.productivityStart)}{report.productivityEnd !== report.productivityStart ? ` – ${formatDate(report.productivityEnd)}` : ""}</span>
      </div>
    </section>

    {days.length === 0 && <div style={{ padding: 22, marginBottom: 30, border: "1px dashed #9aa6b2", borderRadius: 14, background: "#fff" }}><strong>Enter or backdate daily records for this week to populate the report.</strong><p style={{ marginBottom: 0 }}>Use the date selector above to review another week, or the global date selector to enter historical daily records.</p></div>}

    <Section number={1} title="Daily Log Overview"><Table minWidth={1200}><thead><tr>{["Date", "Operatives", "Gangs", "Measured Work Records", "Productive Labour Hours", "Disruption Labour Hours", "VO / Change Labour Hours", "Break Hours", "Status"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.dates.map((date) => { const day = report.dayByDate.get(date); if (!day) return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td colSpan={7} style={{ ...cellStyle, color: "#7a858f" }}>No record entered</td><td style={cellStyle}><strong>No Record</strong></td></tr>; const measuredCount = day.events.filter((event) => event.type === "work" && event.status === "completed").length; const status = day.attendance.length > 0 && day.events.length > 0 ? "Complete" : "Partial"; return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{day.attendance.length}</td><td style={cellStyle}>{day.crews?.length ?? 0}</td><td style={cellStyle}>{measuredCount}</td><td style={cellStyle}>{number(labourHours(day.events, "work"))}</td><td style={cellStyle}>{number(labourHours(day.events, "disruption"))}</td><td style={cellStyle}>{number(labourHours(day.events, "variation"))}</td><td style={cellStyle}>{number(labourHours(day.events, "break"))}</td><td style={cellStyle}><strong>{status}</strong></td></tr>; })}</tbody></Table></Section>

    <Section number={2} title="Measured Work Achievement">{report.measured.length === 0 ? <p>No completed measured work recorded in this period.</p> : <Table minWidth={2600}><thead><tr>{["Building", "Elevation", "Level", "Activity", "Activity ID", "Unit", "Quantity in Period", "Cumulative Quantity", "Planned Quantity", "Remaining", "% Complete", "Planned Production Rate", "Actual Production Rate", "Overall Production Rate", "Productive Labour Hours", "Disruption Labour Hours", "Earned Labour Hours", "Labour Productivity Index", "Overall Labour Efficiency Index", "Productivity Performance %"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.measured.map((row) => <tr key={row.programmeActivityId}><td style={cellStyle}>{row.building || "—"}</td><td style={cellStyle}>{row.elevation || "—"}</td><td style={cellStyle}>{row.level || "—"}</td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.programmeActivityId}</td><td style={cellStyle}>{row.unit || "—"}</td><td style={cellStyle}>{number(row.weeklyQuantity)}</td><td style={cellStyle}>{number(row.cumulativeQuantity)}</td><td style={cellStyle}>{number(row.plannedQuantity)}</td><td style={cellStyle}>{number(row.remaining)}</td><td style={cellStyle}>{number(row.percentage)}%</td>{row.baselineComplete ? <><td style={cellStyle}>{number(row.plannedRate ?? 0)}</td><td style={cellStyle}>{row.actualRate === null ? "—" : number(row.actualRate)}</td><td style={cellStyle}>{row.overallRate === null ? "—" : number(row.overallRate)}</td><td style={cellStyle}>{number(row.hours)}</td><td style={cellStyle}>{number(row.disruptionHours)}</td><td style={cellStyle}>{row.earnedHours === null ? "—" : number(row.earnedHours)}</td><td style={cellStyle}>{row.labourProductivityIndex === null ? "—" : number(row.labourProductivityIndex)}</td><td style={cellStyle}>{row.overallRate === null ? "—" : number(row.overallLabourEfficiencyIndex ?? 0)}</td><td style={cellStyle}>{row.productivityPerformance === null ? "—" : `${number(row.productivityPerformance)}%`}</td></> : <td colSpan={9} style={{ ...cellStyle, color: "#b42318", fontWeight: 700 }}>Productivity baseline incomplete</td>}</tr>)}</tbody></Table>}</Section>

    <Section number={3} title="Activity Performance">{report.activityPerformance.length === 0 ? <p>No activities started, finished, or recorded work in the selected period.</p> : <Table minWidth={1900}><thead><tr>{["Building", "Elevation", "Level", "Activity", "Activity ID", "Started", "Started in Period", "Finished", "Finished in Period", "Unit", "Period Quantity", "Period Labour Hours", "Period Productivity", "Cumulative Quantity", "Planned Quantity", "% Complete"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.activityPerformance.map((row) => <tr key={row.programmeActivityId}><td style={cellStyle}>{row.building || "—"}</td><td style={cellStyle}>{row.elevation || "—"}</td><td style={cellStyle}>{row.level || "—"}</td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.programmeActivityId}</td><td style={cellStyle}>{row.startedDate ? formatDay(row.startedDate) : "—"}</td><td style={cellStyle}>{row.startedInPeriod ? "Yes" : "No"}</td><td style={cellStyle}>{row.finishedDate ? formatDay(row.finishedDate) : "—"}</td><td style={cellStyle}>{row.finishedInPeriod ? "Yes" : "No"}</td><td style={cellStyle}>{row.unit || "—"}</td><td style={cellStyle}>{number(row.periodQuantity)}</td><td style={cellStyle}>{number(row.periodHours)}</td><td style={cellStyle}>{row.periodProductivity === null ? "—" : number(row.periodProductivity)}</td><td style={cellStyle}>{number(row.cumulativeQuantity)}</td><td style={cellStyle}>{number(row.plannedQuantity)}</td><td style={cellStyle}>{row.plannedQuantity > 0 ? `${number(row.cumulativeQuantity / row.plannedQuantity * 100)}%` : "—"}</td></tr>)}</tbody></Table>}</Section>

    <Section number={3} title="Productivity by Gang">{report.gangs.length === 0 ? <p>No gang productivity records available.</p> : <Table minWidth={1200}><thead><tr>{["Gang", "Average Operatives", "Activities Worked", "Unit", "Quantity Completed", "Productive Labour Hours", "Disruption Labour Hours", "VO / Change Labour Hours", "Average Productivity"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.gangs.map((row) => <tr key={`${row.gang}-${row.activity}-${row.unit}`}><td style={cellStyle}>{row.gang}</td><td style={cellStyle}>{row.crewCounts.length ? number(row.crewCounts.reduce((sum, count) => sum + count, 0) / row.crewCounts.length) : "—"}</td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.unit || "—"}</td><td style={cellStyle}>{number(row.quantities)}</td><td style={cellStyle}>{number(row.productive)}</td><td style={cellStyle}>{number(row.disruption)}</td><td style={cellStyle}>{number(row.variation)}</td><td style={cellStyle}>{row.productive > 0 ? number(row.quantities / row.productive) : "—"}</td></tr>)}</tbody></Table>}</Section>

    <Section number={4} title="Disruptions">{report.disruptions.length === 0 ? <p>No disruptions recorded this week.</p> : <Table minWidth={1700}><thead><tr>{["Date", "Start", "Finish", "Duration", "Gang", "Building", "Elevation", "Level", "Affected Activity", "Reason", "Affected Operatives", "Lost Labour Hours", "Labour Cost"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.disruptions.map(({ date, day, event }) => { const activity = programmeFor(event, report.programmeById); return <tr key={`${date}-${event.id}`}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{event.startTime ?? event.time}</td><td style={cellStyle}>{event.finishTime ?? "—"}</td><td style={cellStyle}>{duration(event.duration ?? 0)}</td><td style={cellStyle}>{crewName(day.crews ?? [], event.crewId)}</td><td style={cellStyle}>{activity?.building || "—"}</td><td style={cellStyle}>{activity?.elevation || "—"}</td><td style={cellStyle}>{activity?.level || "—"}</td><td style={cellStyle}>{activity?.activity || event.title}</td><td style={cellStyle}>{event.reason || event.title}</td><td style={cellStyle}>{event.affectedOperativeIds?.map((id) => report.operativeById.get(String(id))?.name ?? id).join(", ") || "—"}</td><td style={cellStyle}>{number(event.lostLabourHours ?? eventLabourHours(event))}</td><td style={cellStyle}>{typeof event.labourCost === "number" ? currency(event.labourCost) : "—"}</td></tr>; })}</tbody><tfoot><tr><th colSpan={3} style={cellStyle}>{report.disruptions.length} event{report.disruptions.length === 1 ? "" : "s"}</th><th style={cellStyle}>{duration(report.disruptions.reduce((sum, { event }) => sum + (event.duration ?? 0), 0))}</th><th colSpan={7} style={cellStyle}>Total lost labour hours</th><th style={cellStyle}>{number(report.disruptionLostHours)}</th><th style={cellStyle}>{report.disruptions.some(({ event }) => typeof event.labourCost === "number") ? currency(report.disruptionCost) : "—"}</th></tr></tfoot></Table>}</Section>

    <Section number={5} title="VO / Change Work">{report.variations.length === 0 ? <p>No VO/change work recorded this week.</p> : <Table minWidth={1450}><thead><tr>{["Date", "Reference", "Instruction Reference", "Building", "Elevation", "Level", "Description", "Gang", "Quantity", "Unit", "Labour Hours", "Status"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.variations.map(({ date, day, event }) => { const activity = programmeFor(event, report.programmeById); return <tr key={`${date}-${event.id}`}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{event.drawingReference || event.instructionReference || "—"}</td><td style={cellStyle}>{event.instructionReference || "—"}</td><td style={cellStyle}>{activity?.building || "—"}</td><td style={cellStyle}>{activity?.elevation || "—"}</td><td style={cellStyle}>{activity?.level || "—"}</td><td style={cellStyle}>{event.notes || event.title}</td><td style={cellStyle}>{crewName(day.crews ?? [], event.crewId)}</td><td style={cellStyle}>{typeof event.quantity === "number" ? number(event.quantity) : "—"}</td><td style={cellStyle}>{event.unit || activity?.unit || "—"}</td><td style={cellStyle}>{number(eventLabourHours(event))}</td><td style={cellStyle}>{event.status ?? "Recorded"}</td></tr>; })}</tbody></Table>}</Section>

    <Section number={6} title="Labour Summary"><Table minWidth={1000}><thead><tr>{["Date", "Operatives", "Productive Hours", "Disruption Hours", "VO / Change Hours", "Break Hours", "Total Recorded Labour Hours"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.dates.map((date) => { const day = report.dayByDate.get(date); const attendanceHours = day?.attendance.reduce((sum, record) => sum + elapsedHours(record.signIn, record.signOut), 0) ?? 0; return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{day?.attendance.length ?? 0}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "work") : 0)}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "disruption") : 0)}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "variation") : 0)}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "break") : 0)}</td><td style={cellStyle}>{number(attendanceHours)}</td></tr>; })}</tbody><tfoot><tr><th style={cellStyle}>Weekly totals</th><th style={cellStyle}>{days.reduce((sum, day) => sum + day.attendance.length, 0)}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "work"))}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "disruption"))}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "variation"))}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "break"))}</th><th style={cellStyle}>{number(report.weeklyAttendanceHours)}</th></tr></tfoot></Table></Section>

    <Section number={7} title="Backshift and Labour Cost"><Table minWidth={700}><thead><tr>{["Date", "Attendance Hours", "Backshift Hours", "Weighted Labour Cost"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.dates.map((date) => { const day = report.dayByDate.get(date); const labour = report.labourByDate.get(date); return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{number(day?.attendance.reduce((sum, record) => sum + elapsedHours(record.signIn, record.signOut), 0) ?? 0)}</td><td style={cellStyle}>{number(labour?.backshiftHours ?? 0)}</td><td style={cellStyle}>{currency(labour?.cost ?? 0)}</td></tr>; })}</tbody><tfoot><tr><th style={cellStyle}>Weekly totals</th><th style={cellStyle}>{number(report.weeklyAttendanceHours)}</th><th style={cellStyle}>{number(report.weeklyBackshiftHours)}</th><th style={cellStyle}>{currency(report.weeklyAttendanceCost)}</th></tr></tfoot></Table></Section>

    <Section number={7} title="Automatic Weekly Narrative"><div style={{ padding: 20, border: "1px solid #d7dde3", borderRadius: 14, background: "#f7f9fa", lineHeight: 1.7 }}>{report.narrative}</div></Section>
  </section></main>;
}
