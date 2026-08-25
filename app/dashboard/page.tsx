"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getActiveDate, getActiveProject, getActiveProjectId, setActiveDate } from "@/lib/storage";
import { loadV2DailyRecords, loadV2Programme } from "@/lib/supabase/v2Data";
import { V2_DEMO_PROJECT } from "@/lib/v2Demo";
import { plannedQuantityToDate, v2Productivity, type V2DailyRecord } from "@/lib/v2Productivity";
import type { ProgrammeActivity, Project } from "@/types/site";

const number = (value: number, digits = 1) => value.toLocaleString("en-GB", { maximumFractionDigits: digits });

export default function OverviewPage() {
  const [date, setDate] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<ProgrammeActivity[]>([]);
  const [records, setRecords] = useState<V2DailyRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => { setDate(getActiveDate()); setProject(getActiveProject()); });
    Promise.all([loadV2Programme(getActiveProjectId()), loadV2DailyRecords(getActiveProjectId())])
      .then(([programme, daily]) => { setActivities(programme.activities); setRecords(daily); if (programme.demo) { setProject(V2_DEMO_PROJECT); setDate("2026-08-25"); } })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load overview."));
  }, []);

  const summary = useMemo(() => {
    const throughDate = records.filter((record) => record.date <= date);
    const today = records.filter((record) => record.date === date);
    const totalHours = throughDate.reduce((sum, record) => sum + record.labourHours, 0);
    const positions = activities.map((activity) => {
      const quantity = throughDate.filter((row) => row.activityId === activity.programmeActivityId).reduce((total, row) => total + row.quantity, 0);
      const plannedQuantity = plannedQuantityToDate(activity, date);
      const activityWeight = Number(activity.plannedManDays ?? 0) || 1;
      return { activity, quantity, plannedQuantity, activityWeight };
    });
    const weighted = positions.filter(({ activity }) => activity.plannedQuantity > 0).reduce((total, row) => ({ planned: total.planned + Math.min(1, row.plannedQuantity / row.activity.plannedQuantity) * row.activityWeight, actual: total.actual + Math.min(1, row.quantity / row.activity.plannedQuantity) * row.activityWeight, weight: total.weight + row.activityWeight }), { planned: 0, actual: 0, weight: 0 });
    const attention = positions.filter((row) => row.plannedQuantity > row.quantity).map(({ activity, quantity, plannedQuantity }) => ({ activity, variance: quantity - plannedQuantity })).sort((a, b) => a.variance - b.variance).slice(0, 5);
    const earned = activities.reduce((sum, activity) => { const quantity = throughDate.filter((row) => row.activityId === activity.programmeActivityId).reduce((total, row) => total + row.quantity, 0); return sum + (v2Productivity(activity, quantity, 0, project?.hoursPerManDay ?? 8).earnedManDays ?? 0); }, 0);
    const actual = totalHours / (project?.hoursPerManDay ?? 8);
    const constrained = [...new Set(throughDate.filter((row) => row.constrained).map((row) => row.activityId))];
    return { earned, actual, pf: actual > 0 ? earned / actual : null, plannedProgress: weighted.weight ? weighted.planned / weighted.weight * 100 : null, actualProgress: weighted.weight ? weighted.actual / weighted.weight * 100 : null, today, constrained, attention };
  }, [activities, date, project?.hoursPerManDay, records]);

  function changeDate(next: string) { setDate(next); setActiveDate(next); }

  return <main className="v2-page">
    <header className="v2-hero"><div><p className="eyebrow">Overview</p><h1>{project?.name ?? "SitePulse"}</h1><p>Programme position and today&apos;s production at a glance.</p></div><label>Date<input type="date" value={date} onChange={(event) => changeDate(event.target.value)} /></label></header>
    {error && <p className="dashboard-notice error" role="alert">{error}</p>}
    <section className="v2-kpis" aria-label="Project performance">
      <article><span>Programme position</span><strong>{summary.actualProgress === null || summary.plannedProgress === null ? "—" : summary.actualProgress >= summary.plannedProgress ? "Ahead" : "Behind"}</strong><small>{summary.actualProgress === null || summary.plannedProgress === null ? "Progress unavailable" : `${number(summary.actualProgress)}% actual vs ${number(summary.plannedProgress)}% planned · ${number(summary.actualProgress - summary.plannedProgress)} points`}</small></article>
      <article><span>Productivity factor</span><strong>{summary.pf === null ? "—" : number(summary.pf, 2)}</strong><small>{summary.pf === null ? "No labour result yet" : summary.pf > 1 ? "Above labour allowance" : summary.pf < 1 ? "Below labour allowance" : "Achieving allowance"}</small></article>
      <article><span>Labour</span><strong>{number(summary.earned)} earned MD</strong><small>{number(summary.actual)} actual MD · {number(summary.earned - summary.actual)} variance</small></article>
      <article><span>Constraints</span><strong>{summary.constrained.length}</strong><small>{summary.constrained.length ? "Activities recorded as constrained" : "No constrained activities"}</small></article>
    </section>
    <section className="v2-grid">
      <article className="v2-panel"><div className="v2-panel-heading"><div><p className="eyebrow">Today</p><h2>Daily position</h2></div><Link className="primary-button" href="/daily-update">Add update</Link></div>{summary.today.length ? <ul className="v2-list">{summary.today.map((row) => <li key={row.id}><strong>{activities.find((activity) => activity.programmeActivityId === row.activityId)?.activityName ?? row.activityId}</strong><span>{number(row.quantity)} qty · {number(row.labourHours)} hrs</span></li>)}</ul> : <p className="v2-empty">No daily update has been entered for this date.</p>}</article>
      <article className="v2-panel"><div className="v2-panel-heading"><div><p className="eyebrow">Attention</p><h2>Activities needing attention</h2></div><Link href="/programme">Open programme</Link></div>{summary.attention.length ? <ul className="v2-list">{summary.attention.map(({ activity, variance }) => <li key={activity.id}><strong>{activity.activityName || activity.activity}</strong><span>{number(Math.abs(variance))} {activity.unit} behind</span></li>)}</ul> : <p className="v2-empty">No measurable activities are behind the evenly spread plan.</p>}</article>
    </section>
  </main>;
}
