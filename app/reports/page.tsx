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
import { aggregateProductivityFactors, calculateProductivityFactor, groupGangDayProductivity } from "@/lib/manDayProductivity";
import ProductivityRagBadge from "@/components/ProductivityRagBadge";
import { ragDistribution, type ProductivityRag } from "@/lib/productivityRag";
import type { Operative, ProgrammeActivity, Project, SiteDay, TimelineEvent } from "@/types/site";
import { allocationActual, type DailyPlanAllocation } from "@/lib/dailyPlan";
import { loadDailyPlansBetween } from "@/lib/supabase/dailyPlanData";

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
  return <div className="report-table-scroll" style={{ overflowX: "auto", border: "1px solid #d7dde3", borderRadius: 12 }}><table style={{ width: "100%", minWidth, borderCollapse: "collapse", background: "#fff" }}>{children}</table></div>;
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
  const [dailyPlans, setDailyPlans] = useState<DailyPlanAllocation[]>([]);

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
      try { const [published,allEvents,plans]=await Promise.all([loadPublishedProgramme(projectId),loadTimelineEventsBetween(projectId,"1000-01-01","9999-12-31"),loadDailyPlansBetween(projectId,weekStart,weekEnd)]);if(cancelled)return;setProgramme(published.activities);setDailyPlans(plans);const byDate=new Map<string,TimelineEvent[]>();allEvents.forEach(({date,event})=>byDate.set(date,[...(byDate.get(date)??[]),event]));const withEvents=(source:SiteDay[],start:string,end:string)=>{const days=new Map(source.map(day=>[day.date,day]));byDate.forEach((_events,date)=>{if(date>=start&&date<=end&&!days.has(date))days.set(date,{date,attendance:[],crews:[],events:[]});});return [...days.values()].map(day=>({...day,events:byDate.get(day.date)??[]})).sort((a,b)=>a.date.localeCompare(b.date));};setDays(withEvents(localWeek,weekStart,weekEnd));setAllDays(withEvents(localAll,"1000-01-01","9999-12-31")); } catch(error) { console.error("Unable to load Supabase report data",error); }
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
      const manDays = groupGangDayProductivity(periodEvents.map(({ date, event }) => ({ date, event }))).reduce((sum, group) => sum + group.operatives, 0);
      return [{ ...activity, startedDate, finishedDate, startedInPeriod, finishedInPeriod, periodQuantity: quantity, periodHours: hours, periodOperatives: manDays, periodProductivity: manDays > 0 ? quantity / manDays : null, periodManHourProductivity: hours > 0 ? quantity / hours : null, cumulativeQuantity }];
    }).sort((a, b) => `${a.building}|${a.elevation}|${a.level}|${a.activity}`.localeCompare(`${b.building}|${b.elevation}|${b.level}|${b.activity}`));

    const measured = programme.flatMap((activity) => {
      const weekly = productivityCompletedWork.filter(({ event }) => event.programmeActivityId === activity.programmeActivityId);
      const cumulative = allEvents.filter(({ date, event }) => date <= productivityEnd && event.type === "work" && event.status === "completed" && event.programmeActivityId === activity.programmeActivityId);
      const weeklyQuantity = weekly.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
      const cumulativeQuantity = cumulative.reduce((sum, { event }) => sum + (event.quantity ?? 0), 0);
      const hours = weekly.reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      const disruptionHours = productivityEvents
        .filter(({ event }) => event.type === "disruption" && event.programmeActivityId === activity.programmeActivityId)
        .reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      const activityGangDays = groupGangDayProductivity(weekly.map(({ date, event }) => ({ date, event })));
      const manDays = activityGangDays.reduce((sum, group) => sum + group.operatives, 0);
      const plannedRate = (activity.plannedManDayProductivity ?? 0) > 0 ? activity.plannedManDayProductivity! : null;
      const actualRate = manDays > 0 ? weeklyQuantity / manDays : null;
      const manHourRate = hours > 0 ? weeklyQuantity / hours : null;
      const plannedCrewOutput = activity.plannedGangDailyOutput ?? (plannedRate && activity.assumedGangSize ? plannedRate * activity.assumedGangSize : null);
      const factor = calculateProductivityFactor(weeklyQuantity, plannedRate, manDays, project?.productivityFactorThresholds);
      return [{
        ...activity,
        weeklyQuantity,
        dailyGangOutput: activityGangDays.length ? weeklyQuantity / activityGangDays.length : null,
        cumulativeQuantity,
        remaining: Math.max(activity.plannedQuantity - cumulativeQuantity, 0),
        percentage: activity.plannedQuantity > 0 ? (cumulativeQuantity / activity.plannedQuantity) * 100 : 0,
        hours,
        productivity: hours > 0 ? weeklyQuantity / hours : 0,
        baselineComplete: Boolean(activity.plannedQuantity > 0 && activity.unit && plannedRate && (activity.assumedGangSize ?? 0) > 0),
        plannedRate,
        plannedCrewOutput,
        actualRate,
        manDays,
        manHourRate,
        disruptionHours,
        earnedManDays: factor.earnedManDays,
        actualManDays: factor.actualManDays,
        manDayVariance: factor.manDayVariance,
        productivityFactor: factor.productivityFactor,
        productivityPerformance: actualRate !== null && plannedRate ? actualRate / plannedRate * 100 : null,
        productivityRag: factor.rag,
        mainBlocker: productivityEvents.filter(({ event }) => event.type === "disruption" && event.programmeActivityId === activity.programmeActivityId).sort((a, b) => eventLabourHours(b.event) - eventLabourHours(a.event))[0]?.event.reason ?? "—",
      }];
    }).sort((a, b) => `${a.building}|${a.elevation}|${a.level}|${a.activity}`.localeCompare(`${b.building}|${b.elevation}|${b.level}|${b.activity}`));

    const gangs = groupGangDayProductivity(productivityCompletedWork.map(({ date, event }) => ({ date, event }))).map((group) => {
      const activity = programmeById.get(group.activityId);
      const source = productivityCompletedWork.find(({ date, event }) => date === group.date && event.programmeActivityId === group.activityId && (event.crewId ?? "unassigned") === group.gangId);
      const gang = crewName(source?.day.crews ?? [], group.gangId === "unassigned" ? undefined : group.gangId);
      const related = productivityEvents.filter(({ date, event }) => date === group.date && (event.crewId ?? "unassigned") === group.gangId);
      const disruption = related.filter(({ event }) => event.type === "disruption").reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      const variation = related.filter(({ event }) => event.type === "variation").reduce((sum, { event }) => sum + eventLabourHours(event), 0);
      const planned = activity?.plannedManDayProductivity ?? null;
      const factor = calculateProductivityFactor(group.quantity, planned, group.operatives, project?.productivityFactorThresholds);
      return { ...group, gang, activity: activity?.activity ?? group.activityId, unit: activity?.unit ?? "", planned, disruption, variation, earnedManDays: factor.earnedManDays, actualManDays: factor.actualManDays, manDayVariance: factor.manDayVariance, productivityFactor: factor.productivityFactor, performance: planned && group.actualManDayProductivity !== null ? group.actualManDayProductivity / planned * 100 : null, productivityRag: factor.rag };
    });

    const movement = programme.flatMap((activity) => {
      const rows = gangs.filter((row) => row.activityId === activity.programmeActivityId).sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length < 2 || rows[0].productivityRag === rows.at(-1)!.productivityRag) return [];
      return [{ activity: activity.activity, from: rows[0].productivityRag, to: rows.at(-1)!.productivityRag }];
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

    const ragSummary = ragDistribution(measured.map((row) => row.productivityRag));
    const aggregateFactor = aggregateProductivityFactors(measured.map((row) => ({ quantity: row.weeklyQuantity, earnedManDays: row.earnedManDays, actualManDays: row.actualManDays })), project?.productivityFactorThresholds);
    const topRed = measured.filter((row) => row.productivityRag === "red").sort((a, b) => (b.productivityFactor ?? 0) - (a.productivityFactor ?? 0));
    return { weekEnd, dates, dayByDate, programmeById, operativeById, weeklyEvents, measured, activityPerformance, gangs, movement, disruptions, variations, disruptionCost, disruptionLostHours, weeklyAttendanceHours, weeklyBackshiftHours, weeklyAttendanceCost, labourByDate, narrative, productivityStart, productivityEnd, ragSummary, aggregateFactor, topRed };
  }, [allDays, days, operatives, productivityDate, productivityPeriod, programme, project?.labourRateSettings, project?.productivityFactorThresholds, weekStart]);

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
    const measuredRows = report.measured.map((row) => ({ Activity: row.activity, "Activity ID": row.programmeActivityId, Building: row.building, Elevation: row.elevation, Level: row.level, Unit: row.unit, "Productivity Factor RAG": row.productivityRag, "Quantity Achieved": row.weeklyQuantity, "Planned Man-Day Productivity": row.plannedRate ?? "", "Earned Man-Days": row.earnedManDays ?? "", "Actual Man-Days": row.actualManDays ?? "", "Man-Day Variance": row.manDayVariance ?? "", "Productivity Factor": row.productivityFactor ?? "", "Actual Man-Day Productivity": row.actualRate ?? "", "Disruption Labour Hours": row.disruptionHours, "Disruption Man-Days (8h equivalent)": row.disruptionHours / 8, "Main Blocker": row.mainBlocker, "Productive Labour Hours": row.hours }));
    const disruptionRows = report.disruptions.map(({ date, day, event }) => ({ Date: date, Start: event.startTime ?? event.time, Finish: event.finishTime ?? "", Gang: crewName(day.crews ?? [], event.crewId), Activity: programmeFor(event, report.programmeById)?.activity ?? event.title, Reason: event.reason ?? event.title, "Lost Labour Hours": event.lostLabourHours ?? eventLabourHours(event), "Labour Cost": event.labourCost ?? "" }));
    const variationRows = report.variations.map(({ date, day, event }) => ({ Date: date, "Change Type": event.reason ?? "", Reference: event.drawingReference ?? event.instructionReference ?? "", Description: event.notes ?? event.title, Gang: crewName(day.crews ?? [], event.crewId), Quantity: event.quantity ?? "", Unit: event.unit ?? "", "Labour Hours": eventLabourHours(event) }));
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
    <section className="report-controls" style={{ padding: 18, marginBottom: 30, border: "1px solid #d7dde3", borderRadius: 14, background: "#f7f9fa" }}>
      <label style={{ display: "grid", gap: 6, maxWidth: 260, fontWeight: 800 }}>Week commencing<input type="date" value={weekStart} onChange={(event) => setWeekStart(mondayFor(event.target.value))} style={{ minHeight: 42, padding: "8px 10px" }} /></label>
      <h2 style={{ marginBottom: 4 }}>Week commencing {formatDate(weekStart)}</h2><p style={{ margin: 0 }}>{formatDate(weekStart)} – {formatDate(report.weekEnd)}</p>
      <div className="report-period-controls" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <strong>Productivity period:</strong>
        {(["daily", "weekly", "monthly", "yearly"] as const).map((period) => <button key={period} type="button" className={`attendance-filter-button${productivityPeriod === period ? " active" : ""}`} onClick={() => setProductivityPeriod(period)}>{period[0].toUpperCase() + period.slice(1)}</button>)}
        {productivityPeriod !== "weekly" && <input type="date" value={productivityDate} onChange={(event) => setProductivityDate(event.target.value)} aria-label="Productivity report date" />}
        <span>{formatDate(report.productivityStart)}{report.productivityEnd !== report.productivityStart ? ` – ${formatDate(report.productivityEnd)}` : ""}</span>
      </div>
    </section>

    <section className="report-kpi-grid" aria-label="Report highlights">
      <div><strong>{report.aggregateFactor.earnedManDays === null ? "—" : number(report.aggregateFactor.earnedManDays)}</strong><span>Earned Man-Days</span></div>
      <div><strong>{report.aggregateFactor.actualManDays === null ? "—" : number(report.aggregateFactor.actualManDays)}</strong><span>Actual Man-Days</span></div>
      <div><strong>{report.aggregateFactor.manDayVariance === null ? "—" : `${report.aggregateFactor.manDayVariance >= 0 ? "+" : ""}${number(report.aggregateFactor.manDayVariance)}`}</strong><span>Man-Day Variance</span></div>
      <div><strong>{report.aggregateFactor.productivityFactor === null ? "—" : number(report.aggregateFactor.productivityFactor)}</strong><span>Productivity Factor · {report.aggregateFactor.rag}</span></div>
    </section>
    <section aria-label="Productivity Factor RAG report summary"><h2>Productivity Factor Summary</h2><p>Lower is better. RAG is independent from Programme and Progress RAG.</p><div className="productivity-rag-summary"><div><strong>{report.ragSummary.counts.green}</strong><span>Green · PF ≤ {number(project?.productivityFactorThresholds?.greenMax ?? 1)}</span></div><div><strong>{report.ragSummary.counts.amber}</strong><span>Amber · PF ≤ {number(project?.productivityFactorThresholds?.amberMax ?? 1.1)}</span></div><div><strong>{report.ragSummary.counts.red}</strong><span>Red · PF &gt; {number(project?.productivityFactorThresholds?.amberMax ?? 1.1)}</span></div><div><strong>{report.ragSummary.counts["baseline-missing"]}</strong><span>Baseline Missing</span></div><div><strong>{report.ragSummary.counts["no-actuals"]}</strong><span>No Actuals</span></div></div><h3>Top Red activities and blockers</h3>{report.topRed.length ? <Table><thead><tr><th style={cellStyle}>RAG</th><th style={cellStyle}>Activity</th><th style={cellStyle}>Productivity Factor</th><th style={cellStyle}>Man-Day Variance</th><th style={cellStyle}>Main blocker</th></tr></thead><tbody>{report.topRed.slice(0, 10).map((row) => <tr key={row.programmeActivityId}><td style={cellStyle}><ProductivityRagBadge status="red" /></td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.productivityFactor === null ? "—" : number(row.productivityFactor)}</td><td style={cellStyle}>{row.manDayVariance === null ? "—" : number(row.manDayVariance)}</td><td style={cellStyle}>{row.mainBlocker}</td></tr>)}</tbody></Table> : <p>No Red activities in this period.</p>}<h3>RAG movement over time</h3>{report.movement.length ? <ul>{report.movement.map((row) => <li key={row.activity}>{row.activity}: <ProductivityRagBadge status={row.from as ProductivityRag} /> → <ProductivityRagBadge status={row.to as ProductivityRag} /></li>)}</ul> : <p>No Red/Amber/Green movement recorded within this period.</p>}</section>

    {days.length === 0 && <div style={{ padding: 22, marginBottom: 30, border: "1px dashed #9aa6b2", borderRadius: 14, background: "#fff" }}><strong>Enter or backdate daily records for this week to populate the report.</strong><p style={{ marginBottom: 0 }}>Use the date selector above to review another week, or the global date selector to enter historical daily records.</p></div>}

    <Section number={1} title="Daily Planning Reliability">{dailyPlans.length===0?<p>No Daily Plan allocations were recorded in this week.</p>:<Table minWidth={1450}><thead><tr>{["Date","Gang","Activity","Morning Target","Actual","Variance","Achievement","Plan RAG","Actual PF","Productivity RAG","Readiness at Commit","Warning Reason"].map(heading=><th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{dailyPlans.map(allocation=>{const result=allocationActual(allocation,report.dayByDate.get(allocation.plan_date)?.events??[],project?.productivityFactorThresholds);return <tr key={allocation.id}><td style={cellStyle}>{formatDay(allocation.plan_date)}</td><td style={cellStyle}>{allocation.gang_name}</td><td style={cellStyle}>{report.programmeById.get(allocation.programme_activity_external_id)?.activity||allocation.programme_activity_external_id}</td><td style={cellStyle}>{number(allocation.target_quantity)} {allocation.unit}</td><td style={cellStyle}>{number(result.actualQuantity)} {allocation.unit}</td><td style={cellStyle}>{number(result.targetVariance)}</td><td style={cellStyle}>{result.targetAchievement===null?"—":`${number(result.targetAchievement)}%`}</td><td style={cellStyle}>{result.achievementRag}</td><td style={cellStyle}>{result.productivityFactor===null?"—":number(result.productivityFactor)}</td><td style={cellStyle}>{result.productivityRag}</td><td style={cellStyle}>{allocation.readiness_rag} · {allocation.readiness_status}</td><td style={cellStyle}>{allocation.warning_reason||"—"}</td></tr>})}</tbody></Table>}</Section>

    <Section number={1} title="Daily Log Overview"><Table minWidth={1200}><thead><tr>{["Date", "Operatives", "Gangs", "Measured Work Records", "Productive Labour Hours", "Disruption Labour Hours", "VO / Change Labour Hours", "Break Hours", "Status"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.dates.map((date) => { const day = report.dayByDate.get(date); if (!day) return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td colSpan={7} style={{ ...cellStyle, color: "#7a858f" }}>No record entered</td><td style={cellStyle}><strong>No Record</strong></td></tr>; const measuredCount = day.events.filter((event) => event.type === "work" && event.status === "completed").length; const status = day.attendance.length > 0 && day.events.length > 0 ? "Complete" : "Partial"; return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{day.attendance.length}</td><td style={cellStyle}>{day.crews?.length ?? 0}</td><td style={cellStyle}>{measuredCount}</td><td style={cellStyle}>{number(labourHours(day.events, "work"))}</td><td style={cellStyle}>{number(labourHours(day.events, "disruption"))}</td><td style={cellStyle}>{number(labourHours(day.events, "variation"))}</td><td style={cellStyle}>{number(labourHours(day.events, "break"))}</td><td style={cellStyle}><strong>{status}</strong></td></tr>; })}</tbody></Table></Section>

    <Section number={2} title="Measured Work / Productivity">{report.measured.length === 0 ? <p>No completed measured work recorded in this period.</p> : <Table minWidth={2500}><thead><tr>{["Building", "Elevation", "Level", "Activity", "Activity ID", "Unit", "RAG", "Quantity Achieved", "Planned Man-Day Productivity", "Earned Man-Days", "Actual Man-Days", "Man-Day Variance", "Productivity Factor", "Actual Man-Day Productivity", "Main Blocker", "Disruption Labour Hours", "Disruption Man-Days (8h equivalent)"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.measured.map((row) => <tr key={row.programmeActivityId}><td style={cellStyle}>{row.building || "—"}</td><td style={cellStyle}>{row.elevation || "—"}</td><td style={cellStyle}>{row.level || "—"}</td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.programmeActivityId}</td><td style={cellStyle}>{row.unit || "—"}</td><td style={cellStyle}><ProductivityRagBadge status={row.productivityRag} /></td><td style={cellStyle}>{number(row.weeklyQuantity)}</td><td style={cellStyle}>{row.plannedRate === null ? "—" : number(row.plannedRate)}</td><td style={cellStyle}>{row.earnedManDays === null ? "—" : number(row.earnedManDays)}</td><td style={cellStyle}>{row.actualManDays === null ? "—" : number(row.actualManDays)}</td><td style={cellStyle}>{row.manDayVariance === null ? "—" : `${row.manDayVariance >= 0 ? "+" : ""}${number(row.manDayVariance)}`}</td><td style={cellStyle}>{row.productivityFactor === null ? "—" : number(row.productivityFactor)}</td><td style={cellStyle}>{row.actualRate === null ? "—" : number(row.actualRate)}</td><td style={cellStyle}>{row.mainBlocker}</td><td style={cellStyle}>{number(row.disruptionHours)}</td><td style={cellStyle}>{number(row.disruptionHours/8)}</td></tr>)}</tbody></Table>}</Section>

    <Section number={3} title="Activity Performance">{report.activityPerformance.length === 0 ? <p>No activities started, finished, or recorded work in the selected period.</p> : <Table minWidth={2000}><thead><tr>{["Building", "Elevation", "Level", "Activity", "Activity ID", "Started", "Started in Period", "Finished", "Finished in Period", "Unit", "Period Quantity", "Operative Man-Days", "Actual Man-Day Productivity", "Period Labour Hours", "Man-Hour Productivity (Advanced)", "Cumulative Quantity", "Planned Quantity", "% Complete"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.activityPerformance.map((row) => <tr key={row.programmeActivityId}><td style={cellStyle}>{row.building || "—"}</td><td style={cellStyle}>{row.elevation || "—"}</td><td style={cellStyle}>{row.level || "—"}</td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.programmeActivityId}</td><td style={cellStyle}>{row.startedDate ? formatDay(row.startedDate) : "—"}</td><td style={cellStyle}>{row.startedInPeriod ? "Yes" : "No"}</td><td style={cellStyle}>{row.finishedDate ? formatDay(row.finishedDate) : "—"}</td><td style={cellStyle}>{row.finishedInPeriod ? "Yes" : "No"}</td><td style={cellStyle}>{row.unit || "—"}</td><td style={cellStyle}>{number(row.periodQuantity)}</td><td style={cellStyle}>{number(row.periodOperatives)}</td><td style={cellStyle}>{row.periodProductivity === null ? "—" : number(row.periodProductivity)}</td><td style={cellStyle}>{number(row.periodHours)}</td><td style={cellStyle}>{row.periodManHourProductivity === null ? "—" : number(row.periodManHourProductivity)}</td><td style={cellStyle}>{number(row.cumulativeQuantity)}</td><td style={cellStyle}>{number(row.plannedQuantity)}</td><td style={cellStyle}>{row.plannedQuantity > 0 ? `${number(row.cumulativeQuantity / row.plannedQuantity * 100)}%` : "—"}</td></tr>)}</tbody></Table>}</Section>

    <Section number={3} title="Productivity by Gang / Day">{report.gangs.length === 0 ? <p>No gang productivity records available.</p> : <Table minWidth={1900}><thead><tr>{["Date", "Gang", "Activity", "Unit", "Quantity Achieved", "Planned Man-Day Productivity", "Earned Man-Days", "Actual Man-Days", "Man-Day Variance", "Productivity Factor", "RAG", "Actual Man-Day Productivity", "Disruption Labour Hours", "Disruption Man-Days (8h equivalent)"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.gangs.map((row) => <tr key={row.key}><td style={cellStyle}>{formatDay(row.date)}</td><td style={cellStyle}>{row.gang}</td><td style={cellStyle}>{row.activity}</td><td style={cellStyle}>{row.unit || "—"}</td><td style={cellStyle}>{number(row.quantity)}</td><td style={cellStyle}>{row.planned === null ? "—" : number(row.planned)}</td><td style={cellStyle}>{row.earnedManDays === null ? "—" : number(row.earnedManDays)}</td><td style={cellStyle}>{row.actualManDays === null ? "—" : number(row.actualManDays)}</td><td style={cellStyle}>{row.manDayVariance === null ? "—" : number(row.manDayVariance)}</td><td style={cellStyle}>{row.productivityFactor === null ? "—" : number(row.productivityFactor)}</td><td style={cellStyle}><ProductivityRagBadge status={row.productivityRag} /></td><td style={cellStyle}>{row.actualManDayProductivity === null ? "—" : number(row.actualManDayProductivity)}</td><td style={cellStyle}>{number(row.disruption)}</td><td style={cellStyle}>{number(row.disruption/8)}</td></tr>)}</tbody></Table>}</Section>

    <Section number={4} title="Disruptions">{report.disruptions.length === 0 ? <p>No disruptions recorded this week.</p> : <Table minWidth={1700}><thead><tr>{["Date", "Start", "Finish", "Duration", "Gang", "Building", "Elevation", "Level", "Affected Activity", "Reason", "Affected Operatives", "Lost Labour Hours", "Labour Cost"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.disruptions.map(({ date, day, event }) => { const activity = programmeFor(event, report.programmeById); return <tr key={`${date}-${event.id}`}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{event.startTime ?? event.time}</td><td style={cellStyle}>{event.finishTime ?? "—"}</td><td style={cellStyle}>{duration(event.duration ?? 0)}</td><td style={cellStyle}>{crewName(day.crews ?? [], event.crewId)}</td><td style={cellStyle}>{activity?.building || "—"}</td><td style={cellStyle}>{activity?.elevation || "—"}</td><td style={cellStyle}>{activity?.level || "—"}</td><td style={cellStyle}>{activity?.activity || event.title}</td><td style={cellStyle}>{event.reason || event.title}</td><td style={cellStyle}>{event.affectedOperativeIds?.map((id) => report.operativeById.get(String(id))?.name ?? id).join(", ") || "—"}</td><td style={cellStyle}>{number(event.lostLabourHours ?? eventLabourHours(event))}</td><td style={cellStyle}>{typeof event.labourCost === "number" ? currency(event.labourCost) : "—"}</td></tr>; })}</tbody><tfoot><tr><th colSpan={3} style={cellStyle}>{report.disruptions.length} event{report.disruptions.length === 1 ? "" : "s"}</th><th style={cellStyle}>{duration(report.disruptions.reduce((sum, { event }) => sum + (event.duration ?? 0), 0))}</th><th colSpan={7} style={cellStyle}>Total lost labour hours</th><th style={cellStyle}>{number(report.disruptionLostHours)}</th><th style={cellStyle}>{report.disruptions.some(({ event }) => typeof event.labourCost === "number") ? currency(report.disruptionCost) : "—"}</th></tr></tfoot></Table>}</Section>

    <Section number={5} title="VO / Change Work">{report.variations.length === 0 ? <p>No VO/change work recorded this week.</p> : <Table minWidth={1550}><thead><tr>{["Date", "Change Type", "Reference", "Instruction Reference", "Building", "Elevation", "Level", "Description", "Gang", "Quantity", "Unit", "Labour Hours", "Status"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.variations.map(({ date, day, event }) => { const activity = programmeFor(event, report.programmeById); return <tr key={`${date}-${event.id}`}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{event.reason || "—"}</td><td style={cellStyle}>{event.drawingReference || event.instructionReference || "—"}</td><td style={cellStyle}>{event.instructionReference || "—"}</td><td style={cellStyle}>{activity?.building || "—"}</td><td style={cellStyle}>{activity?.elevation || "—"}</td><td style={cellStyle}>{activity?.level || "—"}</td><td style={cellStyle}>{event.notes || event.title}</td><td style={cellStyle}>{crewName(day.crews ?? [], event.crewId)}</td><td style={cellStyle}>{typeof event.quantity === "number" ? number(event.quantity) : "—"}</td><td style={cellStyle}>{event.unit || activity?.unit || "—"}</td><td style={cellStyle}>{number(eventLabourHours(event))}</td><td style={cellStyle}>{event.status ?? "Recorded"}</td></tr>; })}</tbody></Table>}</Section>

    <Section number={6} title="Labour Summary"><Table minWidth={1000}><thead><tr>{["Date", "Operatives", "Productive Hours", "Disruption Hours", "VO / Change Hours", "Break Hours", "Total Recorded Labour Hours"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.dates.map((date) => { const day = report.dayByDate.get(date); const attendanceHours = day?.attendance.reduce((sum, record) => sum + elapsedHours(record.signIn, record.signOut), 0) ?? 0; return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{day?.attendance.length ?? 0}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "work") : 0)}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "disruption") : 0)}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "variation") : 0)}</td><td style={cellStyle}>{number(day ? labourHours(day.events, "break") : 0)}</td><td style={cellStyle}>{number(attendanceHours)}</td></tr>; })}</tbody><tfoot><tr><th style={cellStyle}>Weekly totals</th><th style={cellStyle}>{days.reduce((sum, day) => sum + day.attendance.length, 0)}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "work"))}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "disruption"))}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "variation"))}</th><th style={cellStyle}>{number(labourHours(report.weeklyEvents.map(({ event }) => event), "break"))}</th><th style={cellStyle}>{number(report.weeklyAttendanceHours)}</th></tr></tfoot></Table></Section>

    <Section number={7} title="Backshift and Labour Cost"><Table minWidth={700}><thead><tr>{["Date", "Attendance Hours", "Backshift Hours", "Weighted Labour Cost"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr></thead><tbody>{report.dates.map((date) => { const day = report.dayByDate.get(date); const labour = report.labourByDate.get(date); return <tr key={date}><td style={cellStyle}>{formatDay(date)}</td><td style={cellStyle}>{number(day?.attendance.reduce((sum, record) => sum + elapsedHours(record.signIn, record.signOut), 0) ?? 0)}</td><td style={cellStyle}>{number(labour?.backshiftHours ?? 0)}</td><td style={cellStyle}>{currency(labour?.cost ?? 0)}</td></tr>; })}</tbody><tfoot><tr><th style={cellStyle}>Weekly totals</th><th style={cellStyle}>{number(report.weeklyAttendanceHours)}</th><th style={cellStyle}>{number(report.weeklyBackshiftHours)}</th><th style={cellStyle}>{currency(report.weeklyAttendanceCost)}</th></tr></tfoot></Table></Section>

    <Section number={7} title="Automatic Weekly Narrative"><div style={{ padding: 20, border: "1px solid #d7dde3", borderRadius: 14, background: "#f7f9fa", lineHeight: 1.7 }}>{report.narrative}</div></Section>
  </section></main>;
}
