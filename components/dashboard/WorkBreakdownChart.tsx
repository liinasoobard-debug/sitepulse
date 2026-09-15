"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildWorkBreakdown, type WorkBreakdownGranularity, type WorkBreakdownPoint } from "@/lib/workBreakdown";
import type { DatedDashboardEvent } from "@/lib/dashboard";

const hours = (value: number) => `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} hrs`;
const granularities: WorkBreakdownGranularity[] = ["day", "week", "month"];
const granularityLabel: Record<WorkBreakdownGranularity, string> = { day: "Day", week: "Week", month: "Month" };

// Reuses the same semantic colours as the existing labour-classification chart
// (components/dashboard/LabourUtilisationChart.tsx) rather than inventing new ones.
const colours = { measuredWork: "#1b8a5a", change: "#b56b20", standingTime: "#7b8794", disruption: "#c84b3a" };

export function WorkBreakdownChart({ events, range }: { events: DatedDashboardEvent[]; range: { start: string; end: string } }) {
  const [granularity, setGranularity] = useState<WorkBreakdownGranularity>("day");
  const data = buildWorkBreakdown(events, range, granularity);
  const hasAnyData = data.points.length > 0;

  const summaryItems: Array<{ key: keyof typeof colours | "total"; label: string }> = [
    { key: "measuredWork", label: "Measured Work" },
    { key: "change", label: "Change" },
    { key: "standingTime", label: "Standing Time" },
    { key: "disruption", label: "Disruption" },
    { key: "total", label: "Total Recorded" },
  ];

  return <section className="labour-chart-card" aria-labelledby="work-breakdown-title">
    <header className="labour-chart-header">
      <div><p className="eyebrow">Measured work, change and disruption</p><h2 id="work-breakdown-title">Labour Time Breakdown</h2><p>Labour hours by period</p></div>
      <div className="attendance-filter" aria-label="Work breakdown period granularity">
        {granularities.map((value) => (
          <button key={value} type="button" className={`attendance-filter-button${granularity === value ? " active" : ""}`} aria-pressed={granularity === value} onClick={() => setGranularity(value)}>
            {granularityLabel[value]}
          </button>
        ))}
      </div>
    </header>
    <dl className="labour-chart-kpis">
      {summaryItems.map(({ key, label }) => {
        const isTotal = key === "total";
        const available = isTotal ? hasAnyData : data.summary[key].available;
        const value = isTotal ? data.totalHours : data.summary[key].hours;
        const percent = isTotal ? (hasAnyData ? 100 : 0) : data.summary[key].percent;
        return <div key={key}>
          <dt>{label}</dt>
          <dd>{available ? hours(value) : "—"}</dd>
          <small>{available ? `${percent.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% of recorded total` : "No recorded data"}</small>
        </div>;
      })}
    </dl>
    {!hasAnyData ? <div className="labour-chart-empty"><strong>No recorded data for this period</strong><p>Measured work, change, standing time and disruption events will appear here once recorded.</p></div> : <>
      <div className="labour-chart-plot" data-testid="work-breakdown-chart">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data.points} barCategoryGap="34%" barGap={4} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7ebee" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5f6b76" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: "#5f6b76" }} tickLine={false} axisLine={false} width={44} domain={[0, "auto"]} />
          <Tooltip content={({ active, payload }) => {
            const point = payload?.[0]?.payload as WorkBreakdownPoint | undefined;
            return active && point ? <div className="dashboard-tooltip">
              <strong>{point.label}</strong>
              <span>Measured Work: {hours(point.measuredWork)}</span>
              <span>Change: {hours(point.change)}</span>
              <span>Standing Time: {hours(point.standingTime)}</span>
              <span>Disruption: {hours(point.disruption)}</span>
              <span>Total: {hours(point.total)}</span>
            </div> : null;
          }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#5f6b76", paddingTop: 6 }} />
          <Bar stackId="hours" dataKey="measuredWork" name="Measured Work" fill={colours.measuredWork} barSize={26} />
          <Bar stackId="hours" dataKey="change" name="Change" fill={colours.change} barSize={26} />
          <Bar stackId="hours" dataKey="standingTime" name="Standing Time" fill={colours.standingTime} barSize={26} />
          <Bar stackId="hours" dataKey="disruption" name="Disruption" fill={colours.disruption} barSize={26} radius={[4, 4, 0, 0]} />
        </BarChart></ResponsiveContainer>
      </div>
    </>}
  </section>;
}
