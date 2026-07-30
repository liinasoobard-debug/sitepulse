"use client";

import { useState } from "react";
import AddActivityModal from "@/components/AddActivityModal";

type Event = {
  id: number;
  time: string;
  activity: string;
  reason?: string;
};

export default function TimelinePage() {
  const [events, setEvents] = useState<Event[]>([
    {
      id: 1,
      time: "08:00",
      activity: "Signed In",
    },
  ]);

  const [showModal, setShowModal] = useState(false);

  function addActivity(activity: string) {
    setEvents((currentEvents) => [
      ...currentEvents,
      {
        id: Date.now(),
        time: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        activity,
      },
    ]);

    setShowModal(false);
  }

  return (
    <main className="app-shell">
      <section className="launcher-card">
        <div className="timeline-header">
          <div>
            <p className="eyebrow">SitePulse</p>
            <h1>Today&apos;s Timeline</h1>
          </div>
        </div>

        <div className="timeline">
          {events.map((event) => (
            <div key={event.id} className="timeline-item">
              <div className="time">{event.time}</div>

              <div className="content">
                <strong>{event.activity}</strong>

                {event.reason && <p>{event.reason}</p>}
              </div>
            </div>
          ))}
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => setShowModal(true)}
        >
          + Add Activity
        </button>

        {showModal && <AddActivityModal onAdd={addActivity} />}
      </section>
    </main>
  );
}