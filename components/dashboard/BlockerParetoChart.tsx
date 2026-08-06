"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";

export default function BlockerParetoChart({ data, onSelect }: { data: Array<{ category: string; hours: number; events: number; activities: number; cumulative: number }>; onSelect?: (category: string) => void }) {
  return <ChartFrame title="Main blockers" description="Lost labour hours ranked with cumulative Pareto percentage." summary={data.length ? `${data[0].category} is the principal blocker with ${data[0].hours.toFixed(1)} lost hours across ${data[0].events} events.` : "No disruption blockers exist."}>
    <ResponsiveContainer width="100%" height="100%"><ComposedChart layout="vertical" data={data.slice(0, 10)} margin={{ top: 8, right: 24, bottom: 8, left: 44 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="category" width={105} tick={{ fontSize: 10 }} /><Tooltip content={({ active, payload }) => active && payload?.[0] ? <div className="dashboard-tooltip"><strong>{payload[0].payload.category}</strong><span>{payload[0].payload.hours.toFixed(2)} lost hours</span><span>{payload[0].payload.events} events · {payload[0].payload.activities} activities</span><span>{payload[0].payload.cumulative.toFixed(1)}% cumulative</span></div> : null} /><Legend /><Bar dataKey="hours" name="Lost labour hours" fill="#c84b3a" onClick={(entry) => onSelect?.((entry as unknown as { category: string }).category)} /><Line dataKey="cumulative" name="Cumulative %" stroke="#17202a" strokeWidth={2} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer>
  </ChartFrame>;
}
