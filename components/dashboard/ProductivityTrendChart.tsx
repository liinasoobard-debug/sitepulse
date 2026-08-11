"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";

export default function ProductivityTrendChart({ data, unit }: { data: Array<{ label: string; planned: number | null; actual: number | null }>; unit: string }) {
  const valid = data.filter((row) => row.actual !== null);
  return <ChartFrame title="Man-Day Productivity trend" description={`${unit || "Unit"} per contributing operative per day.`} summary={valid.length ? `${valid.length} periods contain Actual Man-Day Productivity.` : "No linked operative productivity data exists for this period."}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => value === null ? "Not available" : `${Number(value).toFixed(2)} ${unit}/man-day`} /><Legend /><Line connectNulls type="monotone" dataKey="planned" name="Planned Man-Day Productivity" stroke="#53788a" strokeWidth={2} /><Line connectNulls type="monotone" dataKey="actual" name="Actual Man-Day Productivity" stroke="#1b8a5a" strokeWidth={3} /></LineChart></ResponsiveContainer>
  </ChartFrame>;
}
