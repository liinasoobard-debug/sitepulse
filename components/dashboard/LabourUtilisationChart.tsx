"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";

export default function LabourUtilisationChart({ data }: { data: Array<{ label: string; productive: number; disruption: number; variation: number; breakHours: number; utilisation: number | null }> }) {
  const productive = data.reduce((sum, row) => sum + row.productive, 0), total = data.reduce((sum, row) => sum + row.productive + row.disruption + row.variation + row.breakHours, 0);
  return <ChartFrame title="Labour utilisation" description="Recorded labour-hour classification by period." summary={total > 0 ? `Productive utilisation is ${(productive / total * 100).toFixed(1)} percent.` : "No classified labour hours exist."}>
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => `${Number(value).toFixed(2)} hours`} /><Legend /><Bar stackId="hours" dataKey="productive" name="Productive Labour Hours" fill="#1b8a5a" /><Bar stackId="hours" dataKey="disruption" name="Disruption Labour Hours" fill="#c84b3a" /><Bar stackId="hours" dataKey="variation" name="VO / Change Labour Hours" fill="#b56b20" /><Bar stackId="hours" dataKey="breakHours" name="Break Hours" fill="#7b8794" /></BarChart></ResponsiveContainer>
  </ChartFrame>;
}
