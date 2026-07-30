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

  setEvents([

    ...events,

    {

      id: Date.now(),

      time: new Date().toLocaleTimeString([], {

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
        <h1>Today's Timeline</h1>

        {events.map((event) => (
          <div key={event.id} className="timeline-item">
            <div className="time">{event.time}</div>

            <div className="content">
              <strong>{event.activity}</strong>

              {event.reason && <p>{event.reason}</p>}
            </div>
          </div>
        ))}

        <button
  className="primary-button"
  onClick={() => setShowModal(true)}
>{showModal && (
  <AddActivityModal onAdd={addActivity} />
)}
  + Add Activity
</button>
      </section>
    </main>
  );
}
