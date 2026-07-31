"use client";

import { useEffect, useMemo, useState } from "react";
import { loadDay } from "@/lib/storage";
import type {
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

type RecordChoice = {
  type: SiteRecordType;
  title: string;
  description: string;
  icon: string;
};

const recordChoices: RecordChoice[] = [
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

export default function AddActivityModal({
  onAdd,
  onClose,
}: Props) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [selectedType, setSelectedType] =
    useState<SiteRecordType | null>(null);

  const [title, setTitle] = useState("");
  const [time, setTime] = useState(getCurrentTime());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const savedDay = loadDay() as SiteDay | null;
    const savedCrews = normaliseCrews(savedDay?.crews);

    setCrews(savedCrews);

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

  function chooseRecordType(choice: RecordChoice) {
    setSelectedType(choice.type);
    setNotes("");

    if (choice.type === "work") {
      setTitle("");
    }

    if (choice.type === "disruption") {
      setTitle("");
    }

    if (choice.type === "variation") {
      setTitle("");
    }

    if (choice.type === "break") {
      setTitle("Break");
    }
  }

  function goBack() {
    setSelectedType(null);
    setTitle("");
    setNotes("");
  }

  function saveRecord() {
    if (
      !selectedCrewId ||
      !selectedType ||
      !title.trim() ||
      !time
    ) {
      return;
    }

    onAdd({
      crewId: selectedCrewId,
      time,
      title: title.trim(),
      type: selectedType,
      status: "active",
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
            recording gang activity.
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
            onChange={(event) =>
              setSelectedCrewId(event.target.value)
            }
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
              onClick={() => chooseRecordType(choice)}
              disabled={!selectedCrewId}
            >
              <span className="site-record-choice-icon">
                {choice.icon}
              </span>

              <span className="site-record-choice-content">
                <strong>{choice.title}</strong>
                <span>{choice.description}</span>
              </span>

              <span className="site-record-choice-arrow">›</span>
            </button>
          ))}
        </div>

        {!selectedCrewId && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              color: "#687480",
            }}
          >
            Select a gang before choosing an activity.
          </p>
        )}

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
          <p className="eyebrow">
            {selectedCrew?.name ?? "Selected gang"}
          </p>

          <h2>
            {
              recordChoices.find(
                (choice) => choice.type === selectedType
              )?.title
            }
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

      <div
        style={{
          marginBottom: 18,
          padding: 14,
          border: "1px solid #d7dde3",
          borderRadius: 12,
          background: "#f7f9fa",
        }}
      >
        <strong>{selectedCrew?.name}</strong>

        <span
          style={{
            display: "block",
            marginTop: 4,
            color: "#5f6b76",
            fontSize: 13,
          }}
        >
          {selectedCrew?.operativeIds.length ?? 0} operative
          {(selectedCrew?.operativeIds.length ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

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
          placeholder={
            selectedType === "variation"
              ? "Example: Install temporary protection"
              : selectedType === "disruption"
                ? "Example: Waiting for crane"
                : selectedType === "break"
                  ? "Break"
                  : "Example: Installing curtain wall"
          }
          autoFocus
        />
      </label>

      <label className="attendance-field">
        <span>Start time</span>

        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
      </label>

      <label className="attendance-field">
        <span>Description</span>

        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={
            selectedType === "variation"
              ? "Describe the instruction, work, area and reason it is outside scope."
              : selectedType === "disruption"
                ? "Describe the cause, effect, location and what prevented the gang from working."
                : "Optional notes, location or work area."
          }
        />
      </label>

      {selectedType === "variation" && (
        <div className="evidence-placeholder">
          <strong>Evidence</strong>

          <span>
            Photo upload and drawing markup will be added after the
            live gang activity workflow.
          </span>
        </div>
      )}

      <button
        type="button"
        className="add-event-button"
        onClick={saveRecord}
        disabled={
          !selectedCrewId ||
          !selectedType ||
          !title.trim() ||
          !time
        }
      >
        Start for {selectedCrew?.name ?? "Gang"}
      </button>

      <button
        type="button"
        className="secondary-button site-record-cancel"
        onClick={goBack}
      >
        Back
      </button>
    </section>
  );
}