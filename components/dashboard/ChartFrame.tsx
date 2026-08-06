"use client";

export default function ChartFrame({ title, description, summary, children, className = "" }: { title: string; description: string; summary: string; children: React.ReactNode; className?: string }) {
  return <figure className={`dashboard-chart ${className}`} aria-label={`${title}. ${summary}`}>
    <header><h2>{title}</h2><p>{description}</p></header>
    <div className="dashboard-chart-body" role="img" aria-label={summary}>{children}</div>
    <figcaption className="sr-only">{summary}</figcaption>
  </figure>;
}
