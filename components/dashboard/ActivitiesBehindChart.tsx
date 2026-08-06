"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";
import type { DashboardActivityVariance } from "@/lib/dashboard";

export default function ActivitiesBehindChart({ data, onSelect }: { data: DashboardActivityVariance[]; onSelect?: (id: string) => void }) {
  return <ChartFrame className="dashboard-chart-wide" title="Activities behind target" description="Quantity variance against expected output to date." summary={data.length ? `${data.length} activities are behind target; ${data[0].activity} has the largest negative variance.` : "No activities are behind target."}>
    <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.slice(0, 12)} margin={{ top: 8, right: 16, bottom: 8, left: 60 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="activity" width={125} tick={{ fontSize: 10 }} /><Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="dashboard-tooltip"><strong>{payload[0].payload.activity}</strong><span>Expected {payload[0].payload.expected.toFixed(1)}</span><span>Actual {payload[0].payload.actual.toFixed(1)}</span><span>{payload[0].payload.achievement?.toFixed(1) ?? "—"}% achieved</span></div> : null} /><Bar dataKey="variance" name="Quantity variance" fill="#c84b3a" onClick={(entry) => onSelect?.((entry as unknown as { id: string }).id)} /></BarChart></ResponsiveContainer>
  </ChartFrame>;
}
