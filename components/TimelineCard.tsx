type Props = {
  time: string;
  icon: string;
  title: string;
  subtitle?: string;
};

export default function TimelineCard({
  time,
  icon,
  title,
  subtitle,
}: Props) {
  return (
    <div className="timeline-card">
      <div className="timeline-time">{time}</div>

      <div className="timeline-body">
        <div className="timeline-title">
          <span className="timeline-icon">{icon}</span>

          <strong>{title}</strong>
        </div>

        {subtitle && (
          <p className="timeline-subtitle">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}