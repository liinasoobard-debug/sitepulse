import Link from "next/link";

export default function HomePage() {
  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow">SitePulse</p>
            <h1>Today&apos;s Site</h1>
          </div>
        </header>

        <div style={{ display: "grid", gap: 14 }}>
          <Link href="/attendance" className="attendance-card">
            <span className="attendance-card-icon">👷</span>
            <span className="attendance-card-content">
              <strong>Attendance</strong>
              <span>Sign operatives in and out</span>
            </span>
            <span className="attendance-card-arrow">›</span>
          </Link>

          <Link href="/crews" className="attendance-card">
            <span className="attendance-card-icon">👥</span>
            <span className="attendance-card-content">
              <strong>Gang Setup</strong>
              <span>Create gangs and assign operatives</span>
            </span>
            <span className="attendance-card-arrow">›</span>
          </Link>

          <Link href="/timeline" className="attendance-card">
            <span className="attendance-card-icon">🕒</span>
            <span className="attendance-card-content">
              <strong>Timeline</strong>
              <span>View today&apos;s site records</span>
            </span>
            <span className="attendance-card-arrow">›</span>
          </Link>
        </div>

        <section
          style={{
            marginTop: 22,
            padding: 18,
            border: "1px solid #d7dde3",
            borderRadius: 16,
            background: "#f7f9fa",
          }}
        >
          <strong>Project-based records are now active.</strong>
          <p style={{ margin: "8px 0 0" }}>
            Use the project selector at the top of the screen. Attendance,
            gangs and timeline records are stored separately for each selected project.
          </p>
        </section>
      </section>
    </main>
  );
}
