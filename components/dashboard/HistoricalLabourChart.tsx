"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyAttendanceTotal } from "@/lib/supabase/attendanceData";

export function HistoricalLabourChart({ data }: { data: DailyAttendanceTotal[] }) {
  const hasData = data.length > 0;
  const peak = hasData ? Math.max(...data.map((row) => row.operatives)) : null;
  const average = hasData ? data.reduce((sum, row) => sum + row.operatives, 0) / data.length : null;

  return <section className="earned-value-card" aria-labelledby="site-labour-title">
    <header className="earned-value-header">
      <div><p className="eyebrow">Site Labour</p><h2 id="site-labour-title">Site Labour</h2><p>Actual operatives on site by day</p></div>
    </header>
    {hasData && <dl className="earned-value-kpis">
      <div><dt>Peak Labour</dt><dd>{peak} operatives</dd></div>
      <div><dt>Average Labour</dt><dd>{average!.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} operatives</dd></div>
    </dl>}
    {!hasData ? <div className="earned-value-empty"><strong>No attendance data recorded for this period</strong></div> : <div className="earned-value-chart" data-testid="site-labour-chart">
      <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 18, bottom: 6, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={48} />
        <Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload as DailyAttendanceTotal | undefined; return active && point ? <div className="dashboard-tooltip"><strong>{point.date}</strong><span>Actual operatives: {point.operatives}</span></div> : null; }} />
        <Line type="monotone" dataKey="operatives" name="Actual Operatives" stroke="#176b87" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart></ResponsiveContainer>
    </div>}
  </section>;
}
