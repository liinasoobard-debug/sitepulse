"use client";
import { useMemo, useState } from "react";
import type { DashboardDetailRow } from "@/lib/dashboard";

type SortKey = keyof Pick<DashboardDetailRow, "date" | "gang" | "building" | "activity" | "quantity" | "operatives" | "productiveHours" | "disruptionHours" | "productivity">;
const format = (value: number | null) => value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

export default function DashboardDetailTable({ rows }: { rows: DashboardDetailRow[] }) {
  const [sort, setSort] = useState<SortKey>("date");
  const [descending, setDescending] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a, b) => { const left = a[sort] ?? "", right = b[sort] ?? ""; const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right)); return descending ? -result : result; }), [descending, rows, sort]);
  const choose = (key: SortKey) => { if (sort === key) setDescending((value) => !value); else { setSort(key); setDescending(false); } };
  return <section className="dashboard-detail-table"><header><div><h2>Dashboard audit detail</h2><p>{rows.length} timeline records match the current filters.</p></div></header><div className="report-table-scroll"><table><thead><tr>{([ ["date", "Date"], ["gang", "Gang"], ["building", "Building"], ["elevation", "Elevation"], ["level", "Level"], ["activity", "Activity"], ["activityId", "Activity ID"], ["quantity", "Quantity"], ["unit", "Unit"], ["operatives", "Operatives"], ["productivity", "Man-Day Productivity"], ["productiveHours", "Productive Hours"], ["manHourProductivity", "Man-Hour Productivity"], ["disruptionHours", "Disruption Hours"], ["blocker", "Blocker"], ["voReference", "VO Reference"] ] as Array<[keyof DashboardDetailRow, string]>).map(([key, label]) => <th key={key}>{["date", "gang", "building", "activity", "quantity", "operatives", "productiveHours", "disruptionHours", "productivity"].includes(key) ? <button onClick={() => choose(key as SortKey)}>{label}{sort === key ? (descending ? " ↓" : " ↑") : ""}</button> : label}</th>)}</tr></thead><tbody>{sorted.map((row) => <tr key={`${row.date}-${row.id}`}><td>{row.date}</td><td>{row.gang}</td><td>{row.building || "—"}</td><td>{row.elevation || "—"}</td><td>{row.level || "—"}</td><td>{row.activity}</td><td>{row.activityId}</td><td>{format(row.quantity)}</td><td>{row.unit || "—"}</td><td>{row.operatives || "—"}</td><td>{format(row.productivity)}</td><td>{format(row.productiveHours)}</td><td>{format(row.manHourProductivity)}</td><td>{format(row.disruptionHours)}</td><td>{row.blocker}</td><td>{row.voReference}</td></tr>)}</tbody></table></div>{!rows.length && <p>No records match the current filters.</p>}</section>;
}
