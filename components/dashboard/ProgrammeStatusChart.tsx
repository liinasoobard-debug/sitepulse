"use client";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartFrame from "./ChartFrame";

const colours = ["#78909c", "#176b87", "#1b8a5a", "#c84b3a", "#7b8794", "#d0932b"];

export default function ProgrammeStatusChart({ data, onSelect }: { data: Array<{ status: string; count: number }>; onSelect?: (status: string) => void }) {
  const total = data.reduce((sum, row) => sum + row.count, 0);
  return <ChartFrame title="Programme status" description="Published programme activities by current delivery status." summary={`${total} programme activities are represented.`}>
    <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data} margin={{ top: 8, right: 12, bottom: 8, left: 70 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="status" width={145} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" name="Activities" onClick={(entry) => onSelect?.((entry as unknown as { status: string }).status)}>{data.map((row, index) => <Cell key={row.status} fill={colours[index]} />)}</Bar></BarChart></ResponsiveContainer>
  </ChartFrame>;
}
