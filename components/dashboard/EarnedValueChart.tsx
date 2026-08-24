"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EarnedValueData, EarnedValuePoint } from "@/lib/earnedValue";

const hours = (value: number | null) => value === null ? "—" : `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} hrs`;
const ratio = (value: number | null) => value === null ? "—" : value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function EarnedValueChart({ data }: { data: EarnedValueData }) {
  const canRender = data.missing.length === 0 && data.points.length > 0;
  return <section className="earned-value-card" aria-labelledby="earned-value-title">
    <header className="earned-value-header">
      <div><p className="eyebrow">Earned hours</p><h2 id="earned-value-title">Project Progress &amp; Labour Performance</h2><p>Cumulative weekly labour hours through the reporting date.</p></div>
      <span className="earned-value-boundary">Labour performance · not financial EVM</span>
    </header>
    <dl className="earned-value-kpis">
      <div><dt>Planned to date</dt><dd>{hours(data.metrics.plannedHours)}</dd></div>
      <div><dt>Earned to date</dt><dd>{hours(data.metrics.earnedHours)}</dd></div>
      <div><dt>Actual to date</dt><dd>{hours(data.metrics.actualHours)}</dd></div>
      <div><dt>Productivity Factor</dt><dd>{ratio(data.metrics.productivityFactor)}</dd><small>Earned ÷ Actual</small></div>
      <div><dt>Schedule Performance</dt><dd>{ratio(data.metrics.schedulePerformance)}</dd><small>Earned ÷ Planned</small></div>
    </dl>
    {data.unallocatedHours > 0 && <p className="earned-value-warning" role="status">Unallocated labour: <strong>{hours(data.unallocatedHours)}</strong> excluded from activity productivity.</p>}
    {!canRender ? <div className="earned-value-empty"><strong>Labour-hours graph unavailable</strong><p>Complete the following project data before relying on this graph:</p><ul>{data.missing.map((item) => <li key={item}>{item}</li>)}</ul></div> : <>
      <div className="earned-value-chart" data-testid="earned-value-responsive-chart">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data.points} margin={{ top: 12, right: 18, bottom: 6, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => Number(value).toLocaleString("en-GB")} width={62} />
          <Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload as EarnedValuePoint | undefined; return active && point ? <div className="dashboard-tooltip"><strong>Week ending {point.reportingDate}</strong><span>Planned: {hours(point.plannedHours)}</span><span>Earned: {hours(point.earnedHours)}</span><span>Actual: {hours(point.actualHours)}</span></div> : null; }} />
          <Legend />
          <Line type="monotone" dataKey="plannedHours" name="Planned Labour Hours" stroke="#53788a" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="earnedHours" name="Earned Labour Hours" stroke="#16855b" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="actualHours" name="Actual Labour Hours" stroke="#c77b08" strokeWidth={2.5} dot={false} />
        </LineChart></ResponsiveContainer>
      </div>
      <div className="earned-value-guide" aria-label="How to interpret the graph"><span><b>Earned below Planned</b> Behind programme</span><span><b>Earned above Planned</b> Ahead of programme</span><span><b>Actual above Earned</b> Productivity loss</span><span><b>Earned above Actual</b> Favourable productivity</span></div>
    </>}
  </section>;
}
