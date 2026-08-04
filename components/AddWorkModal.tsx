'use client';

import { useEffect, useMemo, useState } from "react";
import { loadProgramme, loadProgrammeImportData, loadDay, saveProgramme } from "@/lib/storage";
import { activitiesForVersion, LEGACY_PROGRAMME_VERSION, locationLabel, locationValue, measuredWorkValidation, resourcesForActivity, uniqueLocations } from "@/lib/programmeSelection";
import type {
  Crew,
  ProgrammeActivity,
  ProgrammeImportData,
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
    title: "Measured Work",
    description: "Measured work linked to an imported programme activity",
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

export default function AddWorkModal({ onAdd, onClose }: Props) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [programmeActivities, setProgrammeActivities] = useState<ProgrammeActivity[]>([]);
  const [programmeImportData, setProgrammeImportData] = useState<ProgrammeImportData>({ relationships: [], resources: [], assignments: [], snapshots: [] });
  const [programmeLoading, setProgrammeLoading] = useState(true);
  const [programmeError, setProgrammeError] = useState("");
  const [activeCrewIds, setActiveCrewIds] = useState<string[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [selectedProgrammeVersion, setSelectedProgrammeVersion] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedElevation, setSelectedElevation] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedProgrammeActivityId, setSelectedProgrammeActivityId] = useState("");
  const [selectedType, setSelectedType] =
    useState<SiteRecordType | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState(getCurrentTime());
  const [finishTime, setFinishTime] = useState(getCurrentTime());
  const [actualQuantity, setActualQuantity] = useState("");
  const [numberOfOperatives, setNumberOfOperatives] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [validationMessage, setValidationMessage] = useState("");
  const [baselineUnit, setBaselineUnit] = useState("");
  const [baselineRate, setBaselineRate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const savedDay = loadDay() as SiteDay | null;
        const savedCrews = normaliseCrews(savedDay?.crews);
        setCrews(savedCrews);
        setProgrammeActivities(loadProgramme());
        setProgrammeImportData(loadProgrammeImportData());
        setProgrammeError("");
      const busyCrewIds = (savedDay?.events ?? [])
        .filter((event) => event.type === "work" && event.status === "active" && event.crewId)
        .map((event) => String(event.crewId));
      setActiveCrewIds(busyCrewIds);
      const selectableCrews = savedCrews.filter(
        (crew) => crew.operativeIds.length > 0 && !busyCrewIds.includes(crew.id)
      );
        if (selectableCrews.length === 1) setSelectedCrewId(selectableCrews[0].id);
      } catch (error) {
        console.error("Unable to load programme activities:", error);
        setProgrammeError("Programme activities could not be loaded. Try reloading the page.");
      } finally {
        setProgrammeLoading(false);
      }
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

  const programmeVersions = programmeImportData.snapshots;
  const versionActivities = useMemo(
    () => activitiesForVersion(programmeActivities, programmeImportData, selectedProgrammeVersion),
    [programmeActivities, programmeImportData, selectedProgrammeVersion]
  );

  const buildings = useMemo(
    () => uniqueLocations(versionActivities.map((item) => item.building)),
    [versionActivities]
  );
  const elevations = useMemo(
    () => uniqueLocations(
      versionActivities
        .filter((item) => locationValue(item.building) === selectedBuilding)
        .map((item) => item.elevation)
    ),
    [versionActivities, selectedBuilding]
  );
  const levels = useMemo(
    () => uniqueLocations(
      versionActivities
        .filter((item) =>
          locationValue(item.building) === selectedBuilding &&
          locationValue(item.elevation) === selectedElevation
        )
        .map((item) => item.level)
    ),
    [versionActivities, selectedBuilding, selectedElevation]
  );
  const availableProgrammeActivities = useMemo(
    () => versionActivities.filter((item) =>
      locationValue(item.building) === selectedBuilding &&
      locationValue(item.elevation) === selectedElevation &&
      locationValue(item.level) === selectedLevel
    ),
    [versionActivities, selectedBuilding, selectedElevation, selectedLevel]
  );
  const selectedResources = selectedProgrammeActivity ? resourcesForActivity(selectedProgrammeActivity, programmeImportData) : [];
  const importedBaselineValidation = selectedType === "work" ? measuredWorkValidation(selectedProgrammeActivity) : null;
  const effectiveActivity = selectedProgrammeActivity ? { ...selectedProgrammeActivity, unit: baselineUnit || selectedProgrammeActivity.unit, plannedProductionRate: Number(baselineRate) > 0 ? Number(baselineRate) : selectedProgrammeActivity.plannedProductionRate } : undefined;
  const baselineValidation = selectedType === "work" ? measuredWorkValidation(effectiveActivity) : null;
  function chooseRecordType(type: SiteRecordType) {
    setSelectedType(type);
    setSelectedProgrammeVersion(programmeVersions[0]?.id ?? LEGACY_PROGRAMME_VERSION);
    setNotes("");
    setSelectedBuilding("");
    setSelectedElevation("");
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle(type === "break" ? "Break" : "");
    setActualQuantity("");
    setNumberOfOperatives(selectedCrew ? String(selectedCrew.operativeIds.length) : "");
    setPhotos([]);
    setValidationMessage("");
    setBaselineUnit("");
    setBaselineRate("");
  }

  function chooseProgrammeVersion(version: string) {
    setSelectedProgrammeVersion(version);
    setSelectedBuilding("");
    setSelectedElevation("");
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle("");
    setValidationMessage("");
  }

  function chooseBuilding(building: string) {
    setSelectedBuilding(building);
    setSelectedElevation("");
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle("");
    setValidationMessage("");
  }

  function chooseElevation(elevation: string) {
    setSelectedElevation(elevation);
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle("");
    setValidationMessage("");
  }

  function chooseLevel(level: string) {
    setSelectedLevel(level);
    setSelectedProgrammeActivityId("");
    setTitle("");
    setValidationMessage("");
  }

  function chooseActivity(programmeActivityId: string) {
    setSelectedProgrammeActivityId(programmeActivityId);
    const activity = programmeActivities.find(
      (item) => item.programmeActivityId === programmeActivityId
    );
    if (selectedType === "work") setTitle(activity?.activity ?? "");
    setBaselineUnit(activity?.unit ?? "");
    setBaselineRate(activity?.plannedProductionRate ? String(activity.plannedProductionRate) : "");
    setValidationMessage("");
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const selected = [...files];
    try {
      const encoded = await Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      })));
      setPhotos((current) => [...current, ...encoded]);
    } catch (error) {
      console.error("Unable to attach photos:", error);
      setValidationMessage("One or more photos could not be attached.");
    }
  }

  function saveRecord() {
    if (!selectedCrewId || !selectedType || !title.trim() || !time) return;
    if (selectedType === "work" && !selectedProgrammeActivityId) return;
    if (selectedType === "work") {
      if (baselineValidation) { setValidationMessage(baselineValidation); return; }
      const quantity = Number(actualQuantity);
      const operativeCount = Number(numberOfOperatives);
      if (!actualQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) { setValidationMessage("Enter a valid actual quantity completed."); return; }
      if (!Number.isInteger(operativeCount) || operativeCount < 1 || operativeCount > (selectedCrew?.operativeIds.length ?? 0)) { setValidationMessage(`Enter between 1 and ${selectedCrew?.operativeIds.length ?? 0} operatives for this gang.`); return; }
      if (!finishTime) { setValidationMessage("Enter a finish time."); return; }
    }

    const selectedSnapshot = programmeVersions.find((snapshot) => snapshot.id === selectedProgrammeVersion);
    const operativeCount = selectedType === "work" ? Number(numberOfOperatives) : selectedCrew?.operativeIds.length ?? 0;
    const selectedOperatives = selectedCrew?.operativeIds.slice(0, operativeCount).map(String) ?? [];
    const effectiveUnit = baselineUnit || selectedProgrammeActivity?.unit || "";
    const effectiveRate = Number(baselineRate) > 0 ? Number(baselineRate) : selectedProgrammeActivity?.plannedProductionRate;
    if (selectedType === "work" && selectedProgrammeActivity && (effectiveUnit !== selectedProgrammeActivity.unit || effectiveRate !== selectedProgrammeActivity.plannedProductionRate)) {
      const updatedProgramme = programmeActivities.map((activity) => activity.id === selectedProgrammeActivity.id ? { ...activity, unit: effectiveUnit, plannedProductionRate: effectiveRate, updatedAt: new Date().toISOString() } : activity);
      saveProgramme(updatedProgramme);
      setProgrammeActivities(updatedProgramme);
    }

    onAdd({
      crewId: selectedCrewId,
      programmeActivityId:
        selectedType === "work" || selectedType === "disruption"
          ? selectedProgrammeActivity?.programmeActivityId
          : undefined,
      programmeImportId: selectedProgrammeActivity?.sourceImportId,
      programmeVersion: selectedSnapshot?.sourceFilename || "Current programme",
      activityDescription: selectedProgrammeActivity?.description || selectedProgrammeActivity?.activityName,
      time,
      startTime: time,
      finishTime,
      duration: durationMinutes(time, finishTime),
      title: title.trim(),
      type: selectedType,
      status: "completed",
      location: [selectedProgrammeActivity?.building, selectedProgrammeActivity?.elevation, selectedProgrammeActivity?.level, selectedProgrammeActivity?.gridline].filter(Boolean).join(" / ") || undefined,
      unit: effectiveUnit || undefined,
      plannedStart: selectedProgrammeActivity?.plannedStart,
      plannedFinish: selectedProgrammeActivity?.plannedFinish,
      plannedDuration: selectedProgrammeActivity?.originalDuration,
      plannedQuantity: selectedProgrammeActivity?.plannedQuantity,
      productivityTarget: effectiveRate,
      resourceNames: selectedResources,
      numberOfOperatives: operativeCount,
      quantity: selectedType === "work" ? Number(actualQuantity) : undefined,
      affectedOperativeIds: selectedOperatives,
      notes: notes.trim() || undefined,
      photoIds: photos,
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
          {programmeLoading ? (
            <div className="evidence-placeholder"><strong>Loading programme activities…</strong></div>
          ) : programmeError ? (
            <div className="evidence-placeholder"><strong>Programme activities could not be loaded</strong><span>{programmeError}</span></div>
          ) : programmeActivities.length === 0 ? (
            <div className="evidence-placeholder">
              <strong>No programme has been imported for this project.</strong>
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
                <span>Programme / programme version</span>
                <select value={selectedProgrammeVersion} onChange={(event) => chooseProgrammeVersion(event.target.value)}>
                  <option value="">Select a programme version</option>
                  {programmeVersions.length === 0 && <option value={LEGACY_PROGRAMME_VERSION}>Current imported programme</option>}
                  {programmeVersions.map((snapshot, index) => <option key={snapshot.id} value={snapshot.id}>{index === 0 ? "Latest — " : ""}{snapshot.sourceFilename} · {new Date(snapshot.importedAt).toLocaleDateString("en-GB")}</option>)}
                </select>
              </label>
              <label className="attendance-field">
                <span>Building</span>
                <select value={selectedBuilding} onChange={(event) => chooseBuilding(event.target.value)} disabled={!selectedProgrammeVersion}>
                  <option value="">Select a building</option>
                  {buildings.map((building) => <option key={building} value={building}>{locationLabel(building)}</option>)}
                </select>
              </label>

              <label className="attendance-field">
                <span>Work area or elevation</span>
                <select value={selectedElevation} onChange={(event) => chooseElevation(event.target.value)} disabled={!selectedBuilding}>
                  <option value="">Select an elevation</option>
                  {elevations.map((elevation) => <option key={elevation} value={elevation}>{locationLabel(elevation)}</option>)}
                </select>
              </label>

              <label className="attendance-field">
                <span>Level / floor</span>
                <select value={selectedLevel} onChange={(event) => chooseLevel(event.target.value)} disabled={!selectedElevation}>
                  <option value="">Select a level</option>
                  {levels.map((level) => <option key={level} value={level}>{locationLabel(level)}</option>)}
                </select>
              </label>

              <label className="attendance-field">
                <span>{selectedType === "work" ? "Programme activity" : "Affected programme activity (optional)"}</span>
                <select value={selectedProgrammeActivityId} onChange={(event) => chooseActivity(event.target.value)} disabled={!selectedLevel}>
                  <option value="">Select an activity</option>
                  {availableProgrammeActivities.map((programmeActivity) => (
                    <option key={programmeActivity.id} value={programmeActivity.programmeActivityId}>
                      {programmeActivity.activity}{!programmeActivity.unit || !programmeActivity.plannedProductionRate ? " — baseline incomplete" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedLevel && availableProgrammeActivities.length === 0 && <div className="evidence-placeholder"><strong>No activities match the selected location.</strong></div>}
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
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Activity ID</span><strong>{selectedProgrammeActivity.programmeActivityId}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Description</span><strong>{selectedProgrammeActivity.description || selectedProgrammeActivity.activityName || selectedProgrammeActivity.activity}</strong></div>
          <div>
            <span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>
              Location
            </span>
            <strong>{[selectedProgrammeActivity.building, selectedProgrammeActivity.elevation, selectedProgrammeActivity.level].filter(Boolean).join(" / ") || "—"}</strong>
          </div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Planned dates</span><strong>{selectedProgrammeActivity.plannedStart || "—"} → {selectedProgrammeActivity.plannedFinish || "—"}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Planned duration</span><strong>{selectedProgrammeActivity.originalDuration ?? "—"}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Planned quantity</span><strong>{selectedProgrammeActivity.plannedQuantity || "—"} {selectedProgrammeActivity.unit}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Productivity target</span><strong>{selectedProgrammeActivity.plannedProductionRate ? `${selectedProgrammeActivity.plannedProductionRate} ${selectedProgrammeActivity.unit}/hr` : "—"}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Resource / gang</span><strong>{selectedResources.join(", ") || selectedCrew?.name || "—"}</strong></div>
        </div>
      )}

      {importedBaselineValidation && <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 10, background: "#fff4e5" }}><p role="alert" style={{ color: "#8a3b00", fontWeight: 700, margin: 0 }}>Complete the missing baseline to record measured work. These values will also be saved against the programme activity.</p><label className="attendance-field"><span>Unit of measure *</span><input value={baselineUnit} onChange={(event) => { setBaselineUnit(event.target.value); setValidationMessage(""); }} placeholder="e.g. m², nr, lm" /></label><label className="attendance-field"><span>Planned productivity target *</span><input type="number" min="0.000001" step="any" value={baselineRate} onChange={(event) => { setBaselineRate(event.target.value); setValidationMessage(""); }} placeholder="Quantity per labour hour" /></label></div>}

      {selectedType === "work" && <>
        <label className="attendance-field"><span>Actual quantity completed</span><input type="number" min="0" step="any" value={actualQuantity} onChange={(event) => setActualQuantity(event.target.value)} /></label>
        <label className="attendance-field"><span>Number of operatives</span><input type="number" min="1" max={selectedCrew?.operativeIds.length} step="1" value={numberOfOperatives} onChange={(event) => setNumberOfOperatives(event.target.value)} /></label>
      </>}

      <label className="attendance-field">
        <span>Start time</span>
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
      </label>

      <label className="attendance-field"><span>Finish time</span><input type="time" value={finishTime} onChange={(event) => setFinishTime(event.target.value)} /></label>

      <label className="attendance-field">
        <span>Description</span>
        <textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes, location or work area."
        />
      </label>

      <label className="attendance-field"><span>Photos</span><input type="file" accept="image/*" multiple onChange={(event) => void addPhotos(event.target.files)} /><small>{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} attached` : "Optional"}</small></label>
      {validationMessage && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{validationMessage}</p>}

      <button
        type="button"
        className="add-event-button"
        onClick={saveRecord}
        disabled={
          !selectedCrewId ||
          !title.trim() ||
          !time ||
          !finishTime ||
          (selectedType === "work" && !selectedProgrammeActivityId)
        }
      >
        Save for {selectedCrew?.name ?? "Gang"}
      </button>

      <button
        type="button"
        className="secondary-button site-record-cancel"
        onClick={() => {
          setSelectedType(null);
          setSelectedProgrammeVersion("");
          setSelectedBuilding("");
          setSelectedElevation("");
          setSelectedLevel("");
          setSelectedProgrammeActivityId("");
          setTitle("");
          setNotes("");
          setBaselineUnit("");
          setBaselineRate("");
        }}
      >
        Back
      </button>
    </section>
  );
}
