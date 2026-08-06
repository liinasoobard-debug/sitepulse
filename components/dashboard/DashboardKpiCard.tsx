export default function DashboardKpiCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "neutral" | "good" | "warning" | "bad" }) {
  return <article className={`dashboard-kpi ${tone}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}
