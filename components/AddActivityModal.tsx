"use client";

import { useEffect, useMemo, useState } from "react";
import { loadActivities, loadDay } from "@/lib/storage";
import type {
  Activity,
  Crew,
  SiteDay,
  SiteRecordType,
  TimelineEvent,
} from "@/types/site";

type NewSiteRecord = Omit<TimelineEvent, "id">;

type Props = {
  onAdd: (record: NewSiteRecord) => void;
  onClose: () => void;
};

const recordChoices: Array<{
  type: SiteRecordType;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    type: "work",
    title: "Productive Work",
    description: "Normal planned or measured work",
    icon: "🔨",
  },
  {
    type: "disruption",
    title: "Disruption",
    description: "Waiting, restricted access or interrupted work",
    icon: "⏳",
  },
  {
    type: "variation",
    title: "Variation / Additional Work",
    description: "Work outside the measured or instructed scope",
    icon: "📐",
  },
  {
    type: "break",
    title: "Break",
    description: "Meal break or other planned stoppage",
    icon: "☕",
  },
];

function getCurrentTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

export default function AddActivityModal({ onAdd, onClose }: Props) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedType, setSelectedType] =
    useState<SiteRecordType | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(getCurrentTime());
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    const savedDay = loadDay() as SiteDay | null;
    const savedCrews = normaliseCrews(savedDay?.crews);

    setCrews(savedCrews);
    setActivities(loadActivities());

    if (savedCrews.length === 1) {
      setSelectedCrewId(savedCrews[0].id);
    }
  }, []);

  const availableCrews = useMemo(
    () => crews.filter((crew) => crew.operativeIds.length > 0),
    [crews]
  );

  const selectedCrew = availableCrews.find(
    (crew) => crew.id === selectedCrewId
  );

  const selectedActivity = activities.find(
    (activity) => activity.id === selectedActivityId
  );

  function chooseRecordType(type: SiteRecordType) {
    setSelectedType(type);
    setNotes("");
    setQuantity("");
    setSelectedActivityId("");
    setTitle(type === "break" ? "Break" : "");
  }

  function chooseActivity(activityId: string) {
    setSelectedActivityId(activityId);
    const activity = activities.find((item) => item.id === activityId);
    setTitle(activity?.description ?? "");
  }

  function saveRecord() {
    if (!selectedCrewId || !selectedType || !title.trim() || !time) return;
    if (selectedType === "work" && !selectedActivityId) return;

    onAdd({
      crewId: selectedCrewId,
      activityId:
        selectedType === "work" ? selectedActivityId : undefined,
      time,
      title: title.trim(),
      type: selectedType,
      status: "active",
      location: selectedActivity?.location || undefined,
      unit: selectedActivity?.unit || undefined,
      quantity:
        quantity.trim() && Number(quantity) > 0
          ? Number(quantity)
          : undefined,
      affectedOperativeIds:
        selectedCrew?.operativeIds.map(String) ?? [],
      notes: notes.trim() || undefined,
    });
  }

  if (availableCrews.length === 0) {
    return (
      <section className="site-record-modal">
        <div className="site-record-modal-header">
          <div>
            <p className="eyebrow">New gang activity</p>
            <h2>No gangs available</h2>
          </div>
          <button
            type="button"
            className="site-record-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="evidence-placeholder">
          <strong>Create and populate a gang first</strong>
          <span>
            Go to Gang Setup and assign signed-in operatives before
            recording activity.
          </span>
        </div>

        <button
          type="button"
          className="add-event-button"
          onClick={() => window.location.assign("/crews")}
        >
          Go to Gang Setup
        </button>

        <button
          type="button"
          className="secondary-button site-record-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </section>
    );
  }

  if (!selectedType) {
    return (
      <section className="site-record-modal">
        <div className="site-record-modal-header">
          <div>
            <p className="eyebrow">New gang activity</p>
            <h2>What is the gang doing?</h2>
          </div>
          <button
            type="button"
            className="site-record-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className="attendance-field">
          <span>Gang</span>
          <select
            value={selectedCrewId}
            onChange={(event) => setSelectedCrewId(event.target.value)}
          >
            <option value="">Select a gang</option>
            {availableCrews.map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name} — {crew.operativeIds.length} operative
                {crew.operativeIds.length === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>

        <div className="site-record-choice-list">
          {recordChoices.map((choice) => (
            <button
              key={choice.type}
              type="button"
              className={`site-record-choice ${choice.type}`}
              onClick={() => chooseRecordType(choice.type)}
              disabled={!selectedCrewId}
            >
              <span className="site-record-choice-icon">{choice.icon}</span>
              <span className="site-record-choice-content">
                <strong>{choice.title}</strong>
                <span>{choice.description}</span>
              </span>
              <span className="site-record-choice-arrow">›</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="secondary-button site-record-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </section>
    );
  }

  return (
    <section className="site-record-modal">
      <div className="site-record-modal-header">
        <div>
          <p className="eyebrow">{selectedCrew?.name}</p>
          <h2>
            {recordChoices.find((choice) => choice.type === selectedType)
              ?.title}
          </h2>
        </div>
        <button
          type="button"
          className="site-record-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {selectedType === "work" && (
        <>
          {activities.length === 0 ? (
            <div className="evidence-placeholder">
              <strong>No planned activities added</strong>
              <span>
                Add project activities before recording productive work.
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.location.assign("/activities")}
              >
                Go to Activities
              </button>
            </div>
          ) : (
            <label className="attendance-field">
              <span>Planned activity</span>
              <select
                value={selectedActivityId}
                onChange={(event) => chooseActivity(event.target.value)}
              >
                <option value="">Select an activity</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.code} — {activity.description}
                    {activity.location ? ` — ${activity.location}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      <label className="attendance-field">
        <span>
          {selectedType === "variation"
            ? "Additional work"
            : selectedType === "disruption"
              ? "Cause of disruption"
              : selectedType === "break"
                ? "Break"
                : "Activity"}
        </span>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          readOnly={selectedType === "work" && Boolean(selectedActivity)}
          placeholder={
            selectedType === "work"
              ? "Select a planned activity"
              : "Describe the site record"
          }
        />
      </label>

      {selectedActivity && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 16,
            padding: 14,
            border: "1px solid #d7dde3",
            borderRadius: 12,
            background: "#f7f9fa",
          }}
        >
          <div>
            <span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>
              Code
            </span>
            <strong>{selectedActivity.code}</strong>
          </div>
          <div>
            <span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>
              Location
            </span>
            <strong>{selectedActivity.location || "—"}</strong>
          </div>
          <div>
            <span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>
              Planned
            </span>
            <strong>
              {selectedActivity.plannedQuantity || "—"} {selectedActivity.unit}
            </strong>
          </div>
        </div>
      )}

      <label className="attendance-field">
        <span>Start time</span>
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
      </label>

      {selectedType === "work" && selectedActivity && (
        <label className="attendance-field">
          <span>
            Quantity completed
            {selectedActivity.unit ? ` (${selectedActivity.unit})` : ""}
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="Optional"
          />
        </label>
      )}

      <label className="attendance-field">
        <span>Description</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes, location or work area."
        />
      </label>

      <button
        type="button"
        className="add-event-button"
        onClick={saveRecord}
        disabled={
          !selectedCrewId ||
          !title.trim() ||
          !time ||
          (selectedType === "work" && !selectedActivityId)
        }
      >
        Start for {selectedCrew?.name ?? "Gang"}
      </button>

      <button
        type="button"
        className="secondary-button site-record-cancel"
        onClick={() => {
          setSelectedType(null);
          setSelectedActivityId("");
          setTitle("");
          setNotes("");
          setQuantity("");
        }}
      >
        Back
      </button>
    </section>
  );
}
