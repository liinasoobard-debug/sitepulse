"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadDay,
  loadOperatives,
  getActiveDate,
  saveDay,
} from "@/lib/storage";
import type {
  AttendanceRecord,
  Crew,
  Operative,
  SiteDay,
  TimelineEvent,
} from "@/types/site";

const MAX_GANGS = 10;

function getTodayDate(): string {
  return getActiveDate();
}

function getDefaultGangName(index: number): string {
  return `Gang ${String.fromCharCode(65 + index)}`;
}

function createCrewId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `crew-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
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

function normaliseCrews(records: Crew[] | undefined): Crew[] {
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

export default function CrewsPage() {
  const [operatives, setOperatives] = useState<Operative[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setOperatives(loadOperatives());

      const savedDay = loadDay() as SiteDay | null;
      if (savedDay) {
        setAttendance(normaliseAttendance(savedDay.attendance));
        setCrews(normaliseCrews(savedDay.crews));
        setEvents(
          Array.isArray(savedDay.events) ? savedDay.events : []
        );
      }
      setHasLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

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
  }, [attendance, crews, events, hasLoaded]);

  const attendedOperatives = useMemo(() => {
    const attendedIds = new Set(
      attendance
        .filter((record) => record.signIn)
        .map((record) => String(record.operativeId))
    );

    return operatives.filter((operative) =>
      attendedIds.has(String(operative.id))
    );
  }, [attendance, operatives]);

  const operativeGangMap = useMemo(() => {
    const map = new Map<string, string>();

    crews.forEach((crew) => {
      crew.operativeIds.forEach((operativeId) => {
        map.set(String(operativeId), String(crew.id));
      });
    });

    return map;
  }, [crews]);

  const unassignedOperatives = useMemo(
    () =>
      attendedOperatives.filter(
        (operative) =>
          !operativeGangMap.has(String(operative.id))
      ),
    [attendedOperatives, operativeGangMap]
  );

  const signedOutOperativeIds = useMemo(
    () => new Set(
      attendance
        .filter((record) => record.signIn && record.signOut)
        .map((record) => String(record.operativeId))
    ),
    [attendance]
  );

  function addGang() {
    if (crews.length >= MAX_GANGS) {
      return;
    }

    const newCrew: Crew = {
      id: createCrewId(),
      name: getDefaultGangName(crews.length),
      operativeIds: [],
    };

    setCrews((current) => [...current, newCrew]);
  }

  function updateGangName(crewId: string, name: string) {
    setCrews((current) =>
      current.map((crew) =>
        crew.id === crewId
          ? {
              ...crew,
              name,
            }
          : crew
      )
    );
  }

  function toggleOperative(
    selectedCrewId: string,
    operativeId: string
  ) {
    setCrews((current) => {
      const isAlreadyInSelectedCrew = current.some(
        (crew) =>
          crew.id === selectedCrewId &&
          crew.operativeIds.some(
            (id) => String(id) === String(operativeId)
          )
      );

      return current.map((crew) => {
        const withoutOperative = crew.operativeIds.filter(
          (id) => String(id) !== String(operativeId)
        );

        if (
          crew.id === selectedCrewId &&
          !isAlreadyInSelectedCrew
        ) {
          return {
            ...crew,
            operativeIds: [...withoutOperative, operativeId],
          };
        }

        return {
          ...crew,
          operativeIds: withoutOperative,
        };
      });
    });
  }

  function deleteGang(crewId: string) {
    const crewHasEvents = events.some(
      (event) => String(event.crewId) === String(crewId)
    );

    if (crewHasEvents) {
      window.alert(
        "This gang already has site records and cannot be deleted."
      );

      return;
    }

    setCrews((current) =>
      current.filter((crew) => crew.id !== crewId)
    );
  }

  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${getActiveDate()}T12:00:00`));

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow" suppressHydrationWarning>
              {today}
            </p>
            <h1>Gang Setup</h1>
          </div>

          <div
            className="page-actions"
            style={{
              display: "flex",
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
              href="/timeline"
              className="secondary-button"
            >
              Timeline
            </Link>
          </div>
        </header>

        <section className="attendance-summary">
          <div>
            <span className="attendance-summary-number">
              {crews.length}
            </span>

            <span className="attendance-summary-label">
              Active gangs
            </span>
          </div>

          <div>
            <span className="attendance-summary-number">
              {operativeGangMap.size}
            </span>

            <span className="attendance-summary-label">
              Assigned operatives
            </span>
          </div>

          <div>
            <span className="attendance-summary-number">
              {unassignedOperatives.length}
            </span>

            <span className="attendance-summary-label">
              Unassigned attendees
            </span>
          </div>
        </section>

        {operatives.length === 0 && (
          <section
            style={{
              marginBottom: 20,
              padding: 20,
              border: "1px solid #d7dde3",
              borderRadius: 16,
              background: "#f7f9fa",
            }}
          >
            <strong>No operatives have been added.</strong>

            <p style={{ margin: "8px 0 0" }}>
              Go to Attendance and add or import operatives first.
            </p>
          </section>
        )}

        {operatives.length > 0 &&
          attendedOperatives.length === 0 && (
            <section
              style={{
                marginBottom: 20,
                padding: 20,
                border: "1px solid #d7dde3",
                borderRadius: 16,
                background: "#f7f9fa",
              }}
            >
              <strong>
                No operatives attended on this date.
              </strong>

              <p style={{ margin: "8px 0 0" }}>
                Go to Attendance and add sign-in times before
                assigning operatives to gangs.
              </p>
            </section>
          )}

        {unassignedOperatives.length > 0 && (
          <section
            style={{
              marginBottom: 20,
              padding: 20,
              border: "1px solid #e0b84f",
              borderRadius: 16,
              background: "#fff9e8",
            }}
          >
            <strong>
              {unassignedOperatives.length} operative
              {unassignedOperatives.length === 1 ? "" : "s"} on
              attended but not assigned to a gang
            </strong>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
              }}
            >
              {unassignedOperatives.map((operative) => (
                <span
                  key={operative.id}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #e4d39b",
                    borderRadius: 999,
                    background: "#ffffff",
                    fontSize: 13,
                  }}
                >
                  {operative.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {crews.length === 0 && (
          <section
            style={{
              padding: 28,
              border: "1px dashed #b9c2ca",
              borderRadius: 18,
              background: "#f7f9fa",
              textAlign: "center",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              No gangs created yet
            </h2>

            <p>
              Create your first gang and assign the operatives
              working together on this date.
            </p>
          </section>
        )}

        <div
          className="gang-list"
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          {crews.map((crew) => (
            <article
              className="gang-card"
              key={crew.id}
              style={{
                padding: 20,
                border: "1px solid #d7dde3",
                borderRadius: 18,
                background: "#ffffff",
              }}
            >
              <div
                className="gang-card-header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 18,
                }}
              >
                <input
                  type="text"
                  value={crew.name}
                  onChange={(event) =>
                    updateGangName(
                      crew.id,
                      event.target.value
                    )
                  }
                  aria-label="Gang name"
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    padding: "10px 12px",
                    border: "1px solid #ccd3da",
                    borderRadius: 10,
                    fontSize: 20,
                    fontWeight: 700,
                  }}
                />

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => deleteGang(crew.id)}
                >
                  Delete
                </button>
              </div>

              {attendedOperatives.length === 0 ? (
                <p style={{ margin: 0 }}>
                  No attended operatives available.
                </p>
              ) : (
                <div
                  className="gang-assignment-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  {attendedOperatives.map((operative) => {
                    const operativeId = String(operative.id);
                    const assignedGangId =
                      operativeGangMap.get(operativeId);
                    const isSelected =
                      assignedGangId === crew.id;
                    const assignedGang = crews.find(
                      (item) =>
                        item.id === assignedGangId
                    );

                    return (
                      <label
                        className="gang-operative-card"
                        key={operative.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: 12,
                          border: isSelected
                            ? "2px solid #1f7a4d"
                            : "1px solid #d7dde3",
                          borderRadius: 12,
                          background: isSelected
                            ? "#eef8f2"
                            : "#ffffff",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            toggleOperative(
                              crew.id,
                              operativeId
                            )
                          }
                          style={{ marginTop: 3 }}
                        />

                        <span>
                          <strong
                            style={{
                              display: "block",
                            }}
                          >
                            {operative.name}
                          </strong>

                          <span
                            style={{
                              display: "block",
                              marginTop: 3,
                              color: "#5f6b76",
                              fontSize: 13,
                            }}
                          >
                            {operative.company} ·{" "}
                            {operative.position}
                          </span>

                          {signedOutOperativeIds.has(operativeId) && (
                            <span
                              style={{
                                display: "block",
                                marginTop: 5,
                                color: "#5f6b76",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Signed out
                            </span>
                          )}

                          {assignedGangId &&
                            assignedGangId !== crew.id && (
                              <span
                                style={{
                                  display: "block",
                                  marginTop: 5,
                                  color: "#7a5a00",
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                Currently in{" "}
                                {assignedGang?.name ??
                                  "another gang"}
                              </span>
                            )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  fontWeight: 700,
                }}
              >
                {crew.operativeIds.length} operative
                {crew.operativeIds.length === 1 ? "" : "s"}
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          className="add-event-button"
          onClick={addGang}
          disabled={crews.length >= MAX_GANGS}
          style={{ marginTop: 20 }}
        >
          <span>+</span>

          {crews.length >= MAX_GANGS
            ? "Maximum 10 Gangs"
            : "Add Gang"}
        </button>
      </section>
    </main>
  );
}
