"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DailyLauncher() {
  const router = useRouter();

  const [project, setProject] = useState("HVB");
  const [building, setBuilding] = useState("HVB");
  const [workArea, setWorkArea] = useState("South Elevation");
  const [shift, setShift] = useState("Day");

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function openTimeline() {
    localStorage.setItem(
      "sitepulse-selection",
      JSON.stringify({
        project,
        building,
        workArea,
        shift,
      })
    );

    router.push("/timeline");
  }

  return (
    <main className="launcher-page">
      <section className="launcher-panel">
        <div className="launcher-header">
          <p className="eyebrow">{today}</p>
          <h1>SitePulse</h1>
          <p className="launcher-description">
            Select today&apos;s working location to open the site timeline.
          </p>
        </div>

        <div className="launcher-fields">
          <label className="attendance-field">
            <span>Project</span>

            <select
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="HVB">HVB</option>
              <option value="HBX">HBX</option>
              <option value="HZN">HZN</option>
            </select>
          </label>

          <label className="attendance-field">
            <span>Building</span>

            <select
              value={building}
              onChange={(event) => setBuilding(event.target.value)}
            >
              <option value="HVB">HVB</option>
              <option value="HBX">HBX</option>
              <option value="HZN">HZN</option>
            </select>
          </label>

          <label className="attendance-field">
            <span>Work area</span>

            <select
              value={workArea}
              onChange={(event) => setWorkArea(event.target.value)}
            >
              <option value="South Elevation">South Elevation</option>
              <option value="North Elevation">North Elevation</option>
              <option value="East Elevation">East Elevation</option>
              <option value="West Elevation">West Elevation</option>
            </select>
          </label>

          <label className="attendance-field">
            <span>Shift</span>

            <select
              value={shift}
              onChange={(event) => setShift(event.target.value)}
            >
              <option value="Day">Day</option>
              <option value="Night">Night</option>
              <option value="Weekend">Weekend</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="add-event-button"
          onClick={openTimeline}
        >
          Open Today&apos;s Timeline
        </button>
      </section>
    </main>
  );
}