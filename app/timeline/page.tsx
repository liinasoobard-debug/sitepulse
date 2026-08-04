"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import AddWorkModal from "@/components/AddWorkModal";
import { getActiveDate, getActiveProjectId, loadDay, saveDay } from "@/lib/storage";
import { loadProjectRole, loadPublishedProgramme } from "@/lib/supabase/programmeData";
import { createTimelineEvent, loadTimelineEvents, uploadTimelinePhotos } from "@/lib/supabase/timelineData";
import type {
  AttendanceRecord,
  Crew,
  ProgrammeActivity,
  SiteDay,
  TimelineEvent,
} from "@/types/site";

const startingEvents: TimelineEvent[] = [];

type NewSiteRecord = Omit<TimelineEvent, "id">;

function getTodayDate(): string {
  return getActiveDate();
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function calculateDuration(startTime: string, finishTime: string): number {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [finishHours, finishMinutes] = finishTime.split(":").map(Number);
  const start = startHours * 60 + startMinutes;
  let finish = finishHours * 60 + finishMinutes;
  if (finish < start) finish += 24 * 60;
  return finish - start;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
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

function getEventLabel(type: TimelineEvent["type"]): string {
  if (type === "work") return "Measured Work";
  if (type === "disruption") return "Disruption";
  if (type === "variation") return "Variation";
  if (type === "non_measured_work") return "Non-measured Work";
  if (type === "waiting") return "Waiting";
  if (type === "delay") return "Delay";
  if (type === "plant") return "Plant Activity";
  return "Break";
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>(startingEvents);
  const [programmeActivities, setProgrammeActivities] = useState<ProgrammeActivity[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [programmeLoading, setProgrammeLoading] = useState(true);
  const [programmeError, setProgrammeError] = useState("");
  const [canEditProgramme, setCanEditProgramme] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [today, setToday] = useState("Today");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      setToday(
        new Date(`${getActiveDate()}T12:00:00`).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      );

      const savedDay = loadDay() as SiteDay | null;

      if (savedDay) {
        setAttendance(normaliseAttendance(savedDay.attendance));
        setCrews(normaliseCrews(savedDay.crews));
      }
      try {
        const projectId=getActiveProjectId();
        const [programme,timeline,role]=await Promise.all([loadPublishedProgramme(projectId),loadTimelineEvents(projectId,getActiveDate()),loadProjectRole(projectId)]);
        if(cancelled)return;setProgrammeActivities(programme.activities);setEvents(timeline);setCanEditProgramme(role==="planner"||role==="admin");setProgrammeError("");
      } catch(error) { if(!cancelled)setProgrammeError(error instanceof Error?error.message:"Unable to load programme."); }
      finally { if(!cancelled)setProgrammeLoading(false); }
      setHasLoaded(true);
    });
    return () => { cancelled = true; };
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
      events: [],
    };

    saveDay(updatedDay);
  }, [attendance, crews, hasLoaded]);

  async function addSiteRecord(record: NewSiteRecord, photos: File[]) {
    if (
      record.type === "work" &&
      record.crewId &&
      events.some((event) =>
        event.type === "work" &&
        event.status === "active" &&
        event.crewId === record.crewId
      )
    ) {
      window.alert("This gang already has an active activity. Stop it before starting another.");
      return;
    }

    const activity=programmeActivities.find(item=>item.programmeActivityId===record.programmeActivityId);
    let newEvent:TimelineEvent;
    try { newEvent=await createTimelineEvent(getActiveProjectId(),getActiveDate(),record,activity?.id); if(photos.length)await uploadTimelinePhotos(getActiveProjectId(),newEvent.id,photos); }
    catch(error){window.alert(error instanceof Error?error.message:"Unable to save timeline event.");return;}

    setEvents((current) =>
      [...current, newEvent].sort((a, b) =>
        a.time.localeCompare(b.time)
      )
    );

    setShowModal(false);
  }

  function stopActivity(event: TimelineEvent) {
    const enteredQuantity = window.prompt("Enter the completed quantity:", "");
    if (enteredQuantity === null) return;

    const quantity = Number(enteredQuantity.trim());
    if (enteredQuantity.trim() === "" || !Number.isFinite(quantity) || quantity < 0) {
      window.alert("Enter a valid completed quantity of zero or more.");
      return;
    }

    const finishTime = getCurrentTime();
    const startTime = event.startTime ?? event.time;
    const duration = calculateDuration(startTime, finishTime);
    setEvents((current) => current.map((item) =>
      item.id === event.id
        ? { ...item, startTime, finishTime, duration, quantity, status: "completed" }
        : item
    ));
  }

  function getCrewName(crewId?: string): string | null {
    if (!crewId) return null;

    const crew = crews.find(
      (item) => String(item.id) === String(crewId)
    );

    return crew?.name ?? "Unknown Gang";
  }

  function getActivity(programmeActivityId?: string): ProgrammeActivity | null {
    if (!programmeActivityId) return null;

    return (
      programmeActivities.find(
        (activity) => activity.programmeActivityId === programmeActivityId
      ) ?? null
    );
  }

  const onSiteCount = attendance.filter(
    (record) => record.signIn && !record.signOut
  ).length;

  const sortedEvents = [...events].sort((a, b) =>
    (a.startTime ?? a.time).localeCompare(b.startTime ?? b.time)
  );

  return (
    <main className="timeline-page">
      <section className="timeline-panel">
        <header className="timeline-header">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>Site Timeline</h1>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link href="/programme" className="secondary-button">
              Programme
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
            const activity = getActivity(event.programmeActivityId);

            return (
              <article key={event.id} className="timeline-row">
                <div className="timeline-marker-column">
                  <div className={`timeline-marker ${event.type}`} />
                  {index < sortedEvents.length - 1 && (
                    <div className="timeline-line" />
                  )}
                </div>

                <div className="timeline-time">
                  <span>{event.startTime ?? event.time}</span>
                  {event.finishTime && (
                    <span className="timeline-end-time">
                      {event.finishTime}
                    </span>
                  )}
                </div>

                <div className={`event-card ${event.type}`}>
                  <div className="event-card-top">
                    <div>
                      {crewName && !activity && (
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
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                        gap: 10,
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 12,
                        background: "#f7f9fa",
                      }}
                    >
                      {[
                        ["Programme", event.programmeVersion || "—"],
                        ["Building", activity.building || "—"],
                        ["Work area", activity.elevation || "—"],
                        ["Level / floor", activity.level || "—"],
                        ["Activity", activity.activity],
                        ["Activity ID", event.programmeActivityId || "—"],
                        ["Quantity", typeof event.quantity === "number" ? `${event.quantity} ${activity.unit}`.trim() : "—"],
                        ["Operatives", event.numberOfOperatives ?? event.affectedOperativeIds?.length ?? "—"],
                        ["Gang", crewName || "—"],
                        ["Duration", typeof event.duration === "number" ? formatDuration(event.duration) : event.status === "active" ? "In progress" : "—"],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span style={{ display: "block", marginBottom: 3, color: "#5f6b76", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                          <strong style={{ fontSize: 13 }}>{value}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {event.type === "work" && event.status === "active" && (
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ marginTop: 12 }}
                      onClick={() => stopActivity(event)}
                    >
                      Stop activity
                    </button>
                  )}

                  {event.reason && (
                    <p className="event-reason">{event.reason}</p>
                  )}

                  {event.notes && (
                    <p className="event-notes">{event.notes}</p>
                  )}

                  {event.photoIds && event.photoIds.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {event.photoIds.map((photo, photoIndex) => <Image unoptimized width={88} height={88} key={`${event.id}-photo-${photoIndex}`} src={photo} alt={`Site record photo ${photoIndex + 1}`} style={{ objectFit: "cover", borderRadius: 8 }} />)}
                    </div>
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
          <AddWorkModal
            onAdd={addSiteRecord}
            onClose={() => setShowModal(false)}
            programmeActivities={programmeActivities}
            programmeLoading={programmeLoading}
            programmeError={programmeError}
            canEditProgramme={canEditProgramme}
          />
        )}
      </section>
    </main>
  );
}
