"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AddActivityModal from "@/components/AddActivityModal";
import { loadActivities, loadDay, saveDay } from "@/lib/storage";
import type {
  Activity,
  AttendanceRecord,
  Crew,
  SiteDay,
  TimelineEvent,
} from "@/types/site";

const startingEvents: TimelineEvent[] = [
  {
    id: "1",
    time: "08:15",
    title: "Installing curtain wall",
    type: "work",
  },
  {
    id: "2",
    time: "10:25",
    title: "Waiting for crane",
    type: "disruption",
    reason: "Crane unavailable",
  },
  {
    id: "3",
    time: "11:10",
    title: "Installation resumed",
    type: "work",
  },
];

type NewSiteRecord = Omit<TimelineEvent, "id">;

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function normaliseAttendance(
  records: AttendanceRecord[] | undefined
): AttendanceRecord[] {
  if (!Array.isArray(records)) return [];

  return records.map((record) => ({
    operativeId: String(record.operativeId),
    signIn: record.signIn ?? "",
    signOut: record.signOut ?? "",
  }));
}

function normaliseCrews(records: Crew[] | undefined): Crew[] {
  if (!Array.isArray(records)) return [];

  return records.map((crew) => ({
    id: String(crew.id),
    name: crew.name || "Unnamed Gang",
    operativeIds: Array.isArray(crew.operativeIds)
      ? crew.operativeIds.map(String)
      : [],
  }));
}

function normaliseEvents(
  records: TimelineEvent[] | undefined
): TimelineEvent[] {
  const sourceEvents =
    Array.isArray(records) && records.length > 0
      ? records
      : startingEvents;

  return sourceEvents.map((record) => ({
    ...record,
    id: String(record.id),
    crewId: record.crewId ? String(record.crewId) : undefined,
    activityId: record.activityId
      ? String(record.activityId)
      : undefined,
    affectedOperativeIds: Array.isArray(record.affectedOperativeIds)
      ? record.affectedOperativeIds.map(String)
      : undefined,
    type:
      (record.type as string) === "delay"
        ? "disruption"
        : record.type,
  }));
}

function getEventLabel(type: TimelineEvent["type"]): string {
  if (type === "work") return "Productive";
  if (type === "disruption") return "Disruption";
  if (type === "variation") return "Variation";
  return "Break";
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>(startingEvents);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [today, setToday] = useState("Today");

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    );

    setActivities(loadActivities());

    const savedDay = loadDay() as SiteDay | null;

    if (savedDay) {
      setEvents(normaliseEvents(savedDay.events));
      setAttendance(normaliseAttendance(savedDay.attendance));
      setCrews(normaliseCrews(savedDay.crews));
    }

    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;

    const existingDay = loadDay() as SiteDay | null;

    const updatedDay: SiteDay = {
      ...(existingDay ?? {
        date: getTodayDate(),
        attendance: [],
        crews: [],
        events: [],
      }),
      date: getTodayDate(),
      attendance,
      crews,
      events,
    };

    saveDay(updatedDay);
  }, [events, attendance, crews, hasLoaded]);

  function addSiteRecord(record: NewSiteRecord) {
    const newEvent: TimelineEvent = {
      ...record,
      id:
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `event-${Date.now()}`,
    };

    setEvents((current) =>
      [...current, newEvent].sort((a, b) =>
        a.time.localeCompare(b.time)
      )
    );

    setShowModal(false);
  }

  function getCrewName(crewId?: string): string | null {
    if (!crewId) return null;

    const crew = crews.find(
      (item) => String(item.id) === String(crewId)
    );

    return crew?.name ?? "Unknown Gang";
  }

  function getActivity(activityId?: string): Activity | null {
    if (!activityId) return null;

    return (
      activities.find(
        (activity) => String(activity.id) === String(activityId)
      ) ?? null
    );
  }

  const onSiteCount = attendance.filter(
    (record) => record.signIn && !record.signOut
  ).length;

  const sortedEvents = [...events].sort((a, b) =>
    a.time.localeCompare(b.time)
  );

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>Today&apos;s Timeline</h1>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link href="/activities" className="secondary-button">
              Activities
            </Link>

            <Link href="/crews" className="secondary-button">
              Gangs
            </Link>

            <div className="status-pill">
              <span className="status-dot" />
              Live
            </div>
          </div>
        </header>

        <div className="timeline-list">
          {sortedEvents.map((event, index) => {
            const crewName = getCrewName(event.crewId);
            const activity = getActivity(event.activityId);

            return (
              <article key={event.id} className="timeline-row">
                <div className="timeline-marker-column">
                  <div className={`timeline-marker ${event.type}`} />
                  {index < sortedEvents.length - 1 && (
                    <div className="timeline-line" />
                  )}
                </div>

                <div className="timeline-time">
                  <span>{event.time}</span>
                  {event.endTime && (
                    <span className="timeline-end-time">
                      {event.endTime}
                    </span>
                  )}
                </div>

                <div className={`event-card ${event.type}`}>
                  <div className="event-card-top">
                    <div>
                      {crewName && (
                        <span
                          style={{
                            display: "block",
                            marginBottom: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#5f6b76",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {crewName}
                        </span>
                      )}
                      <strong>{event.title}</strong>
                    </div>

                    <span className="event-label">
                      {getEventLabel(event.type)}
                    </span>
                  </div>

                  {activity && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "#eef2f5",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {activity.code}
                      </span>

                      {activity.location && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "#eef2f5",
                            fontSize: 12,
                          }}
                        >
                          {activity.location}
                        </span>
                      )}

                      {typeof event.quantity === "number" && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "#eef8f2",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {event.quantity} {event.unit || activity.unit}
                        </span>
                      )}
                    </div>
                  )}

                  {event.reason && (
                    <p className="event-reason">{event.reason}</p>
                  )}

                  {event.notes && (
                    <p className="event-notes">{event.notes}</p>
                  )}

                  {event.type === "disruption" &&
                    typeof event.lostLabourHours === "number" && (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        Lost labour: {event.lostLabourHours.toFixed(2)} hours
                      </div>
                    )}

                  {event.type === "variation" && (
                    <div className="event-evidence-status">
                      Photo or markup can be added
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <button
          type="button"
          className="add-event-button"
          onClick={() => setShowModal(true)}
        >
          <span>+</span>
          Add Site Record
        </button>

        <button
          type="button"
          className="attendance-card"
          onClick={() => window.location.assign("/attendance")}
        >
          <span className="attendance-card-icon">👷</span>
          <span className="attendance-card-content">
            <strong>Attendance</strong>
            <span>View or record site attendance</span>
          </span>
          <span className="attendance-card-count">
            {onSiteCount}
            <span>on site</span>
          </span>
          <span className="attendance-card-arrow">›</span>
        </button>

        {showModal && (
          <AddActivityModal
            onAdd={addSiteRecord}
            onClose={() => setShowModal(false)}
          />
        )}
      </section>
    </main>
  );
}
