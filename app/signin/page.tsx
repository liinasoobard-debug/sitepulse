"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AddActivityModal from "@/components/AddActivityModal";
import { loadDay, saveDay } from "@/lib/storage";
import type {
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
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record) => ({
    operativeId: String(record.operativeId),
    signIn: record.signIn ?? "",
    signOut: record.signOut ?? "",
  }));
}

function normaliseCrews(
  records: Crew[] | undefined
): Crew[] {
  if (!Array.isArray(records)) {
    return [];
  }

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
  if (!Array.isArray(records)) {
    return startingEvents;
  }

  return records.map((event) => ({
    ...event,
    id: String(event.id),
    crewId: event.crewId
      ? String(event.crewId)
      : undefined,
    type:
      (event.type as string) === "delay"
        ? "disruption"
        : event.type,
    affectedOperativeIds: Array.isArray(
      event.affectedOperativeIds
    )
      ? event.affectedOperativeIds.map(String)
      : undefined,
  }));
}

function getEventLabel(
  type: TimelineEvent["type"]
): string {
  if (type === "work") {
    return "Productive";
  }

  if (type === "disruption") {
    return "Disruption";
  }

  if (type === "variation") {
    return "Variation";
  }

  return "Break";
}

export default function SignInPage() {
  const [events, setEvents] =
    useState<TimelineEvent[]>(startingEvents);

  const [attendance, setAttendance] =
    useState<AttendanceRecord[]>([]);

  const [crews, setCrews] =
    useState<Crew[]>([]);

  const [showModal, setShowModal] =
    useState(false);

  const [hasLoaded, setHasLoaded] =
    useState(false);

  useEffect(() => {
    const savedDay = loadDay() as SiteDay | null;

    if (savedDay) {
      setEvents(
        normaliseEvents(savedDay.events)
      );

      setAttendance(
        normaliseAttendance(savedDay.attendance)
      );

      setCrews(
        normaliseCrews(savedDay.crews)
      );
    }

    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    const existingDay =
      loadDay() as SiteDay | null;

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
  }, [
    attendance,
    crews,
    events,
    hasLoaded,
  ]);

  function addActivity(
    record: NewSiteRecord
  ) {
    const newEvent: TimelineEvent = {
      ...record,
      id: crypto.randomUUID(),
    };

    setEvents((current) =>
      [...current, newEvent].sort((a, b) =>
        a.time.localeCompare(b.time)
      )
    );

    setShowModal(false);
  }

  const onSiteCount = attendance.filter(
    (record) =>
      record.signIn && !record.signOut
  ).length;

  const sortedEvents = [...events].sort(
    (a, b) =>
      a.time.localeCompare(b.time)
  );

  const today =
    new Date().toLocaleDateString(
      "en-GB",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
      }
    );

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow">
              {today}
            </p>

            <h1>
              Today&apos;s Timeline
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/attendance"
              className="secondary-button"
            >
              Attendance
            </Link>

            <Link
              href="/crews"
              className="secondary-button"
            >
              Gangs
            </Link>

            <div className="status-pill">
              <span className="status-dot" />
              Live
            </div>
          </div>
        </header>

        <div className="timeline-list">
          {sortedEvents.map(
            (event, index) => (
              <article
                key={event.id}
                className="timeline-row"
              >
                <div className="timeline-marker-column">
                  <div
                    className={`timeline-marker ${event.type}`}
                  />

                  {index <
                    sortedEvents.length -
                      1 && (
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

                <div
                  className={`event-card ${event.type}`}
                >
                  <div className="event-card-top">
                    <strong>
                      {event.title}
                    </strong>

                    <span className="event-label">
                      {getEventLabel(
                        event.type
                      )}
                    </span>
                  </div>

                  {event.reason && (
                    <p className="event-reason">
                      {event.reason}
                    </p>
                  )}

                  {event.notes && (
                    <p className="event-notes">
                      {event.notes}
                    </p>
                  )}

                  {event.type ===
                    "variation" && (
                    <div className="event-evidence-status">
                      Photo or markup can be
                      added
                    </div>
                  )}
                </div>
              </article>
            )
          )}
        </div>

        <button
          type="button"
          className="add-event-button"
          onClick={() =>
            setShowModal(true)
          }
        >
          <span>+</span>
          Add Site Record
        </button>

        <Link
          href="/attendance"
          className="attendance-card"
        >
          <span className="attendance-card-icon">
            👷
          </span>

          <span className="attendance-card-content">
            <strong>
              Attendance
            </strong>

            <span>
              View who is on site or
              record attendance
            </span>
          </span>

          <span className="attendance-card-count">
            {onSiteCount}
            <span>on site</span>
          </span>

          <span className="attendance-card-arrow">
            ›
          </span>
        </Link>

        {showModal && (
          <AddActivityModal
            onAdd={addActivity}
            onClose={() =>
              setShowModal(false)
            }
          />
        )}
      </section>
    </main>
  );
}