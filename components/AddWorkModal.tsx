'use client';

import { useEffect, useMemo, useState } from "react";
import { loadProgramme, loadDay } from "@/lib/storage";
import type {
  Crew,
  ProgrammeActivity,
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

function durationMinutes(start: string, finish: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [finishHour, finishMinute] = finish.split(":").map(Number);
  const startValue = startHour * 60 + startMinute;
  let finishValue = finishHour * 60 + finishMinute;
  if (finishValue < startValue) finishValue += 24 * 60;
  return Math.max(0, finishValue - startValue);
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

const EMPTY_LOCATION = "__sitepulse_unspecified__";

function locationValue(value: string): string {
  return value || EMPTY_LOCATION;
}

function locationLabel(value: string): string {
  return value === EMPTY_LOCATION ? "Not specified" : value;
}

function uniqueLocations(values: string[]): string[] {
  return [...new Set(values.map(locationValue))].sort((a, b) =>
    locationLabel(a).localeCompare(locationLabel(b))
  );
}

export default function AddWorkModal({ onAdd, onClose }: Props) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [programmeActivities, setProgrammeActivities] = useState<ProgrammeActivity[]>([]);
  const [activeCrewIds, setActiveCrewIds] = useState<string[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedElevation, setSelectedElevation] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedProgrammeActivityId, setSelectedProgrammeActivityId] = useState("");
  const [selectedType, setSelectedType] =
    useState<SiteRecordType | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(getCurrentTime());
  const [finishTime, setFinishTime] = useState(getCurrentTime());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const savedDay = loadDay() as SiteDay | null;
      const savedCrews = normaliseCrews(savedDay?.crews);
      setCrews(savedCrews);
      setProgrammeActivities(loadProgramme());
      const busyCrewIds = (savedDay?.events ?? [])
        .filter((event) => event.type === "work" && event.status === "active" && event.crewId)
        .map((event) => String(event.crewId));
      setActiveCrewIds(busyCrewIds);
      const selectableCrews = savedCrews.filter(
        (crew) => crew.operativeIds.length > 0 && !busyCrewIds.includes(crew.id)
      );
      if (selectableCrews.length === 1) setSelectedCrewId(selectableCrews[0].id);
    });
    return () => { cancelled = true; };
  }, []);

  const availableCrews = useMemo(
    () => crews.filter(
      (crew) => crew.operativeIds.length > 0 && !activeCrewIds.includes(crew.id)
    ),
    [crews, activeCrewIds]
  );

  const selectedCrew = availableCrews.find(
    (crew) => crew.id === selectedCrewId
  );

  const selectedProgrammeActivity = programmeActivities.find(
    (activity) => activity.programmeActivityId === selectedProgrammeActivityId
  );

  const buildings = useMemo(
    () => uniqueLocations(programmeActivities.map((item) => item.building)),
    [programmeActivities]
  );
  const elevations = useMemo(
    () => uniqueLocations(
      programmeActivities
        .filter((item) => locationValue(item.building) === selectedBuilding)
        .map((item) => item.elevation)
    ),
    [programmeActivities, selectedBuilding]
  );
  const levels = useMemo(
    () => uniqueLocations(
      programmeActivities
        .filter((item) =>
          locationValue(item.building) === selectedBuilding &&
          locationValue(item.elevation) === selectedElevation
        )
        .map((item) => item.level)
    ),
    [programmeActivities, selectedBuilding, selectedElevation]
  );
  const availableProgrammeActivities = useMemo(
    () => programmeActivities.filter((item) =>
      locationValue(item.building) === selectedBuilding &&
      locationValue(item.elevation) === selectedElevation &&
      locationValue(item.level) === selectedLevel
    ),
    [programmeActivities, selectedBuilding, selectedElevation, selectedLevel]
  );
  function chooseRecordType(type: SiteRecordType) {
    setSelectedType(type);
    setNotes("");
    setSelectedBuilding("");
    setSelectedElevation("");
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle(type === "break" ? "Break" : "");
  }

  function chooseBuilding(building: string) {
    setSelectedBuilding(building);
    setSelectedElevation("");
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle("");
  }

  function chooseElevation(elevation: string) {
    setSelectedElevation(elevation);
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle("");
  }

  function chooseLevel(level: string) {
    setSelectedLevel(level);
    setSelectedProgrammeActivityId("");
    setTitle("");
  }

  function chooseActivity(programmeActivityId: string) {
    setSelectedProgrammeActivityId(programmeActivityId);
    const activity = programmeActivities.find(
      (item) => item.programmeActivityId === programmeActivityId
    );
    if (selectedType === "work") setTitle(activity?.activity ?? "");
  }

  function saveRecord() {
    if (!selectedCrewId || !selectedType || !title.trim() || !time) return;
    if (selectedType === "work" && !selectedProgrammeActivityId) return;

    onAdd({
      crewId: selectedCrewId,
      programmeActivityId:
        selectedType === "work" || selectedType === "disruption"
          ? selectedProgrammeActivity?.programmeActivityId
          : undefined,
      time,
      startTime: time,
      finishTime: selectedType === "work" ? undefined : finishTime,
      duration: selectedType === "work" ? undefined : durationMinutes(time, finishTime),
      title: title.trim(),
      type: selectedType,
      status: selectedType === "work" ? "active" : "completed",
      location: [selectedProgrammeActivity?.building, selectedProgrammeActivity?.elevation, selectedProgrammeActivity?.level, selectedProgrammeActivity?.gridline].filter(Boolean).join(" / ") || undefined,
      unit: selectedProgrammeActivity?.unit || undefined,
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

      {(selectedType === "work" || selectedType === "disruption") && (
        <>
          {programmeActivities.length === 0 ? (
            <div className="evidence-placeholder">
              <strong>No programme activities imported</strong>
              <span>
                Import the project programme before linking site records to planned work.
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.location.assign("/programme")}
              >
                Go to Programme
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <label className="attendance-field">
                <span>Building</span>
                <select value={selectedBuilding} onChange={(event) => chooseBuilding(event.target.value)}>
                  <option value="">Select a building</option>
                  {buildings.map((building) => <option key={building} value={building}>{locationLabel(building)}</option>)}
                </select>
              </label>

              <label className="attendance-field">
                <span>Elevation</span>
                <select value={selectedElevation} onChange={(event) => chooseElevation(event.target.value)} disabled={!selectedBuilding}>
                  <option value="">Select an elevation</option>
                  {elevations.map((elevation) => <option key={elevation} value={elevation}>{locationLabel(elevation)}</option>)}
                </select>
              </label>

              <label className="attendance-field">
                <span>Level</span>
                <select value={selectedLevel} onChange={(event) => chooseLevel(event.target.value)} disabled={!selectedElevation}>
                  <option value="">Select a level</option>
                  {levels.map((level) => <option key={level} value={level}>{locationLabel(level)}</option>)}
                </select>
              </label>

              <label className="attendance-field">
                <span>{selectedType === "work" ? "Activity" : "Affected Activity (optional)"}</span>
                <select value={selectedProgrammeActivityId} onChange={(event) => chooseActivity(event.target.value)} disabled={!selectedLevel}>
                  <option value="">Select an activity</option>
                  {availableProgrammeActivities.map((programmeActivity) => (
                    <option key={programmeActivity.id} value={programmeActivity.programmeActivityId}>
                      {programmeActivity.activity}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
          readOnly={selectedType === "work" && Boolean(selectedProgrammeActivity)}
          placeholder={
            selectedType === "work"
              ? "Select a planned activity"
              : "Describe the site record"
          }
        />
      </label>

      {selectedType !== "work" && (
        <label className="attendance-field">
          <span>Finish time</span>
          <input type="time" value={finishTime} onChange={(event) => setFinishTime(event.target.value)} />
        </label>
      )}

      {selectedProgrammeActivity && (
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
              Location
            </span>
            <strong>{[selectedProgrammeActivity.building, selectedProgrammeActivity.elevation, selectedProgrammeActivity.level].filter(Boolean).join(" / ") || "—"}</strong>
          </div>
          <div>
            <span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>
              Planned
            </span>
            <strong>
              {selectedProgrammeActivity.plannedQuantity || "—"} {selectedProgrammeActivity.unit}
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
          (selectedType !== "work" && !finishTime) ||
          (selectedType === "work" && !selectedProgrammeActivityId)
        }
      >
        Start for {selectedCrew?.name ?? "Gang"}
      </button>

      <button
        type="button"
        className="secondary-button site-record-cancel"
        onClick={() => {
          setSelectedType(null);
          setSelectedBuilding("");
          setSelectedElevation("");
          setSelectedLevel("");
          setSelectedProgrammeActivityId("");
          setTitle("");
          setNotes("");
        }}
      >
        Back
      </button>
    </section>
  );
}
