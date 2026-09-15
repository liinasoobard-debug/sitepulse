"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyAttendanceTotal } from "@/lib/supabase/attendanceData";

const formatShortDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

export function HistoricalLabourChart({ data }: { data: DailyAttendanceTotal[] }) {
  const hasData = data.length > 0;
  const peak = hasData ? Math.max(...data.map((row) => row.operatives)) : null;
  const average = hasData ? data.reduce((sum, row) => sum + row.operatives, 0) / data.length : null;

  return <section className="labour-chart-card" aria-labelledby="site-labour-title">
    <header className="labour-chart-header">
      <div><p className="eyebrow">Site Labour</p><h2 id="site-labour-title">Site Labour</h2><p>Actual operatives on site by day</p></div>
    </header>
    {hasData && <dl className="labour-chart-kpis">
      <div><dt>Peak Labour</dt><dd>{peak} operatives</dd></div>
      <div><dt>Average Labour</dt><dd>{average!.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} operatives</dd></div>
    </dl>}
    {!hasData ? <div className="labour-chart-empty"><strong>No attendance data recorded for this period</strong></div> : <div className="labour-chart-plot compact" data-testid="site-labour-chart">
      <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7ebee" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "#5f6b76" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: "#5f6b76" }} tickLine={false} axisLine={false} allowDecimals={false} width={40} domain={[0, "auto"]} />
        <Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload as DailyAttendanceTotal | undefined; return active && point ? <div className="dashboard-tooltip"><strong>{formatShortDate(point.date)}</strong><span>Actual operatives: {point.operatives}</span></div> : null; }} />
        <Line type="monotone" dataKey="operatives" name="Actual Operatives" stroke="#176b87" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart></ResponsiveContainer>
    </div>}
  </section>;
}
