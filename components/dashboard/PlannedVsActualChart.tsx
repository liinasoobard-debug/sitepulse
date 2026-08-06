"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";

export default function PlannedVsActualChart({ data, unit }: { data: Array<{ label: string; expected: number; actual: number; achievement: number | null }>; unit: string }) {
  const expected = data.reduce((sum, row) => sum + row.expected, 0), actual = data.reduce((sum, row) => sum + row.actual, 0);
  return <ChartFrame title="Planned vs achieved output" description="Expected and recorded quantities for the selected period." summary={`${actual.toFixed(1)} ${unit || "units"} achieved against ${expected.toFixed(1)} expected.`}>
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => `${Number(value).toFixed(2)} ${unit}`} /><Legend /><Bar dataKey="expected" name="Expected Quantity" fill="#53788a" radius={[3,3,0,0]} /><Bar dataKey="actual" name="Achieved Quantity" fill="#1b8a5a" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer>
  </ChartFrame>;
}
