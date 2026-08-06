"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";

export default function CumulativeProgressChart({ data, unit }: { data: Array<{ label: string; planned: number; actual: number }>; unit: string }) {
  const last = data.at(-1), variance = (last?.actual ?? 0) - (last?.planned ?? 0);
  return <ChartFrame title="Cumulative planned vs actual" description="S-curve using a linear planned production profile." summary={`Current cumulative variance is ${variance.toFixed(1)} ${unit || "units"}.`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => `${Number(value).toFixed(2)} ${unit}`} /><Legend /><Line type="monotone" dataKey="planned" name="Cumulative Planned Quantity" stroke="#53788a" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="actual" name="Cumulative Actual Quantity" stroke="#1b8a5a" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>
  </ChartFrame>;
}
