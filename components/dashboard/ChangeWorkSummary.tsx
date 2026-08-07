"use client";
import ChartFrame from "./ChartFrame";

export default function ChangeWorkSummary({ data }: { data: Array<{ id: string; date: string; gang: string; activity: string; hours: number; quantity: number | null; status: string; reference: string }> }) {
  const hours = data.reduce((sum, row) => sum + row.hours, 0);
  return <ChartFrame title="VO / change work" description="Change work is reported separately from measured productivity." summary={`${data.length} change events account for ${hours.toFixed(1)} labour hours.`}>
    <div className="dashboard-change-summary"><div><strong>{data.length}</strong><span>Change events</span></div><div><strong>{hours.toFixed(1)} hr</strong><span>Change labour</span></div></div>
    <div className="dashboard-mini-table"><table><thead><tr><th>Reference</th><th>Activity</th><th>Status</th><th>Hours</th></tr></thead><tbody>{data.slice(0, 6).map((row) => <tr key={row.id}><td>{row.reference}</td><td>{row.activity}</td><td>{row.status}</td><td>{row.hours.toFixed(1)}</td></tr>)}</tbody></table>{!data.length && <p>No VO/change work recorded for this selection.</p>}</div>
  </ChartFrame>;
}
