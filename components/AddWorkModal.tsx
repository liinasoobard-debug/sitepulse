'use client';

import { useEffect, useMemo, useState } from "react";
import {
  getActiveDate,
  getActiveProjectId,
  loadDay,
  loadOperatives,
} from "@/lib/storage";
import { loadActivityInstalledQuantity, updateProgrammeBaseline } from "@/lib/supabase/programmeData";
import { installedCompletionPercent } from "@/lib/progress";
import { loadPlant, type PlantRecord } from "@/lib/supabase/plantData";
import { plantReadiness } from "@/lib/plantReadiness";
import { loadConstraintLinks, loadConstraints } from "@/lib/supabase/constraintData";
import type { ConstraintActivityLink, ConstraintRecord } from "@/lib/constraints";
import { LEGACY_PROGRAMME_VERSION, locationLabel, locationValue, measuredWorkValidation, uniqueLocations } from "@/lib/programmeSelection";
import type {
  Crew,
  Operative,
  ProgrammeActivity,
  SiteDay,
  SiteRecordType,
  TimelineEvent,
} from "@/types/site";

type NewSiteRecord = Omit<TimelineEvent, "id">;
type AssignmentMode = "crew" | "individuals" | "unassigned";
type ChangeCategory = "additional_quantum" | "return_visit" | "replacement" | "remedial" | "other";

const changeLabels: Record<ChangeCategory, string> = {
  additional_quantum: "Additional quantum",
  return_visit: "Return visit",
  replacement: "Replacement work",
  remedial: "Remedial work",
  other: "Other change work",
};

type Props = {
  onAdd: (record: NewSiteRecord, photos: File[]) => void | Promise<void>;
  onClose: () => void;
  programmeActivities: ProgrammeActivity[];
  programmeLoading?: boolean;
  programmeError?: string;
  canEditProgramme?: boolean;
  initialAllocation?: { gangId: string; activityId: string; plannedOperatives: number; targetQuantity: number; areaZone?: string | null };
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
  { type: "non_measured_work", title: "Non-measured Work", description: "Productive work not linked to a measured programme quantity", icon: "🛠️" },
  { type: "waiting", title: "Waiting", description: "Gang waiting for access, information or materials", icon: "⏱️" },
  { type: "delay", title: "Delay", description: "Unplanned delay affecting production", icon: "⚠️" },
  { type: "plant", title: "Plant Activity", description: "Record plant or equipment activity", icon: "🏗️" },
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

export default function AddWorkModal({ onAdd, onClose, programmeActivities, programmeLoading = false, programmeError = "", canEditProgramme = false, initialAllocation }: Props) {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [operatives, setOperatives] = useState<Operative[]>([]);
  const [attendedOperativeIds, setAttendedOperativeIds] = useState<string[]>([]);
  const [onSiteOperativeIds, setOnSiteOperativeIds] = useState<string[]>([]);
  const [activeCrewIds, setActiveCrewIds] = useState<string[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("crew");
  const [selectedOperativeIds, setSelectedOperativeIds] = useState<string[]>([]);
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
  const [cumulativeQuantity, setCumulativeQuantity] = useState<number | null>(null);
  const [remainingQuantity, setRemainingQuantity] = useState<number | null>(null);
  const [percentComplete, setPercentComplete] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [numberOfOperatives, setNumberOfOperatives] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [validationMessage, setValidationMessage] = useState("");
  const [baselineUnit, setBaselineUnit] = useState("");
  const [baselineRate, setBaselineRate] = useState("");
  const [baselineCrewSize, setBaselineCrewSize] = useState("");
  const [notes, setNotes] = useState("");
  const [changeCategory, setChangeCategory] = useState<ChangeCategory>("additional_quantum");
  const [onSitePlant, setOnSitePlant] = useState<PlantRecord[]>([]);
  const [plantRecords, setPlantRecords] = useState<PlantRecord[]>([]);
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([]);
  const [openConstraints, setOpenConstraints] = useState<ConstraintRecord[]>([]);
  const [constraintLinks, setConstraintLinks] = useState<ConstraintActivityLink[]>([]);

  useEffect(() => {
    if (!initialAllocation || !programmeActivities.length) return;
    const activity = programmeActivities.find((row) => row.programmeActivityId === initialAllocation.activityId);
    if (!activity) return;
    queueMicrotask(() => {
      setSelectedType("work"); setAssignmentMode("crew"); setSelectedCrewId(initialAllocation.gangId);
      setSelectedBuilding(locationValue(activity.building)); setSelectedElevation(locationValue(activity.elevation)); setSelectedLevel(locationValue(activity.level));
      setSelectedProgrammeActivityId(activity.programmeActivityId); setTitle(activity.activity); setNumberOfOperatives(String(initialAllocation.plannedOperatives));
      setNotes(`Daily Plan target: ${initialAllocation.targetQuantity} ${activity.unit}${initialAllocation.areaZone ? ` · Area ${initialAllocation.areaZone}` : ""}`);
      setBaselineUnit(activity.unit); setBaselineRate(String(activity.plannedManDayProductivity ?? "")); setBaselineCrewSize(String(activity.assumedGangSize ?? ""));
    });
  }, [initialAllocation, programmeActivities]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const savedDay = loadDay() as SiteDay | null;
        const savedCrews = normaliseCrews(savedDay?.crews);
        const savedOperatives = loadOperatives();
        setCrews(savedCrews);
        setOperatives(savedOperatives);
        setAttendedOperativeIds((savedDay?.attendance ?? [])
          .filter((record) => record.signIn)
          .map((record) => String(record.operativeId)));
        setOnSiteOperativeIds((savedDay?.attendance ?? [])
          .filter((record) => record.signIn && !record.signOut)
          .map((record) => String(record.operativeId)));
      const busyCrewIds = (savedDay?.events ?? [])
        .filter((event) => event.type === "work" && event.status === "active" && event.crewId)
        .map((event) => String(event.crewId));
      setActiveCrewIds(busyCrewIds);
      const selectableCrews = savedCrews.filter(
        (crew) => crew.operativeIds.length > 0 && !busyCrewIds.includes(crew.id)
      );
        if (selectableCrews.length === 1) setSelectedCrewId(selectableCrews[0].id);
        if (selectableCrews.length === 0 && savedOperatives.length > 0) setAssignmentMode("individuals");
      } catch (error) { console.error("Unable to load site day:", error); }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const projectId = getActiveProjectId();
    void Promise.all([loadConstraints(projectId), loadConstraintLinks(projectId)])
      .then(([constraints, links]) => {
        setOpenConstraints(constraints.filter((row) => ["OPEN", "ACTIONED / MONITORING"].includes(row.status)));
        setConstraintLinks(links);
      })
      .catch(() => { setOpenConstraints([]); setConstraintLinks([]); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPlant(getActiveProjectId())
      .then((plant) => {
        if (!cancelled) {
          setPlantRecords(plant);
          setOnSitePlant(
            plant.filter(
              (item) =>
                item.record_kind !== "REQUIREMENT" &&
                Boolean(item.on_hire_date || item.arrival_date) &&
                !item.actual_off_hire_date,
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setOnSitePlant([]);
      });
    return () => {
      cancelled = true;
    };
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
  const assignmentReady = assignmentMode === "unassigned" ||
    (assignmentMode === "crew" && Boolean(selectedCrewId)) ||
    (assignmentMode === "individuals" && selectedOperativeIds.length > 0);
  const selectedOperativeNames = operatives
    .filter((operative) => selectedOperativeIds.includes(String(operative.id)))
    .map((operative) => operative.name);
  const orderedOperatives = [...operatives].sort((a, b) => {
    const attendanceDifference = Number(onSiteOperativeIds.includes(String(b.id))) - Number(onSiteOperativeIds.includes(String(a.id)));
    const attendedDifference = Number(attendedOperativeIds.includes(String(b.id))) - Number(attendedOperativeIds.includes(String(a.id)));
    return attendanceDifference || attendedDifference || a.name.localeCompare(b.name);
  });
  const assignmentLabel = assignmentMode === "crew"
    ? selectedCrew?.name ?? "Gang"
    : assignmentMode === "individuals"
      ? selectedOperativeNames.join(", ") || "Individuals"
      : "Unassigned";

  const selectedProgrammeActivity = programmeActivities.find(
    (activity) => activity.programmeActivityId === selectedProgrammeActivityId
  );
  const selectedPlantRequirements = plantRecords
    .filter(
      (plant) =>
        plant.record_kind === "REQUIREMENT" &&
        plant.programme_activity_external_id === selectedProgrammeActivityId,
    )
    .map((plant) => ({
      plant,
      readiness: plantReadiness(
        {
          requiredFromDate: plant.required_from_date,
          onHireDate:
            plant.confirmed_delivery_date &&
            ["CONFIRMED", "DELIVERED / ON SITE"].includes(
              plant.explicit_status || "",
            )
              ? plant.confirmed_delivery_date
              : null,
          explicitStatus:
            plant.actual_booking_date ||
            ["CALLED OFF / BOOKED", "CONFIRMED"].includes(
              plant.explicit_status || "",
            )
              ? "BOOKED"
              : plant.explicit_status === "ISSUE"
                ? "ISSUE / AT RISK"
                : "PLANNED",
          activeIssue: plant.explicit_status === "ISSUE",
        },
        getActiveDate(),
      ),
    }));
  const selectedConstraints = openConstraints.filter((row) =>
    constraintLinks.some(
      (link) =>
        link.constraint_id === row.id &&
        link.programme_activity_external_id === selectedProgrammeActivityId,
    ),
  );

  const programmeVersions: Array<{id:string;sourceFilename:string;importedAt:string}> = [];
  const versionActivities = programmeActivities;

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
  const matchingProgrammeActivities = useMemo(() => {
    const search = activitySearch.trim().toLowerCase();
    if (!search) return [];
    return versionActivities.filter((activity) => [activity.activity, activity.activityName, activity.programmeActivityId, activity.wbsCode, activity.wbsPath, activity.building, activity.elevation, activity.level]
      .some((value) => value?.toLowerCase().includes(search))).slice(0, 12);
  }, [activitySearch, versionActivities]);
  const selectedResources = selectedProgrammeActivity?.resourceNames ?? [];
  const importedBaselineValidation = selectedType === "work" ? measuredWorkValidation(selectedProgrammeActivity) : null;
  const effectiveActivity = selectedProgrammeActivity ? { ...selectedProgrammeActivity, unit: canEditProgramme ? baselineUnit || selectedProgrammeActivity.unit : selectedProgrammeActivity.unit, plannedManDayProductivity: canEditProgramme && Number(baselineRate) > 0 ? Number(baselineRate) : selectedProgrammeActivity.plannedManDayProductivity, assumedGangSize: canEditProgramme && Number(baselineCrewSize) > 0 ? Number(baselineCrewSize) : selectedProgrammeActivity.assumedGangSize } : undefined;
  const baselineValidation = selectedType === "work" ? measuredWorkValidation(effectiveActivity) : null;
  function chooseRecordType(type: SiteRecordType) {
    setSelectedType(type);
    setSelectedProgrammeVersion(programmeVersions[0]?.id ?? LEGACY_PROGRAMME_VERSION);
    setNotes("");
    setChangeCategory("additional_quantum");
    setSelectedPlantIds([]);
    setSelectedBuilding("");
    setSelectedElevation("");
    setSelectedLevel("");
    setSelectedProgrammeActivityId("");
    setTitle(type === "break" ? "Break" : "");
    setActualQuantity("");
    setCumulativeQuantity(null);
    setRemainingQuantity(null);
    setPercentComplete("");
    setActivitySearch("");
    setNumberOfOperatives(assignmentMode === "crew" && selectedCrew ? String(selectedCrew.operativeIds.length) : assignmentMode === "individuals" ? String(selectedOperativeIds.length) : "0");
    setPhotos([]);
    setValidationMessage("");
    setBaselineUnit("");
    setBaselineRate("");
    setBaselineCrewSize("");
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
    setBaselineRate(activity?.plannedManDayProductivity ? String(activity.plannedManDayProductivity) : "");
    setBaselineCrewSize(activity?.assumedGangSize ? String(activity.assumedGangSize) : "");
    setPercentComplete(activity?.physicalPercentComplete === undefined ? "" : String(activity.physicalPercentComplete));
    setCumulativeQuantity(null);
    setRemainingQuantity(null);
    if (selectedType === "work" && activity) {
      void loadActivityInstalledQuantity(getActiveProjectId(), activity.programmeActivityId)
        .then((installed) => {
          const remaining = Math.max(activity.plannedQuantity - installed, 0);
          setCumulativeQuantity(installed);
          setRemainingQuantity(remaining);
          setPercentComplete(String(installedCompletionPercent(installed, activity.plannedQuantity)));
          setActualQuantity(String(remaining));
        })
        .catch((error) => setValidationMessage(error instanceof Error ? error.message : "Unable to load activity quantities."));
    }
    setValidationMessage("");
  }

  function chooseSearchedActivity(activity: ProgrammeActivity) {
    setSelectedProgrammeVersion(LEGACY_PROGRAMME_VERSION);
    setSelectedBuilding(locationValue(activity.building));
    setSelectedElevation(locationValue(activity.elevation));
    setSelectedLevel(locationValue(activity.level));
    setActivitySearch(activity.activity);
    chooseActivity(activity.programmeActivityId);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotos((current) => [...current, ...files]);
  }

  async function saveRecord() {
    if (!assignmentReady || !selectedType || !title.trim() || !time) return;
    if (assignmentMode === "individuals" && selectedOperativeIds.some((id) => !attendedOperativeIds.includes(id))) {
      setValidationMessage("Only operatives who attended on the selected date can be assigned.");
      return;
    }
    if (selectedType === "work" && !selectedProgrammeActivityId) return;
    if (selectedType === "variation" && actualQuantity.trim() && (!Number.isFinite(Number(actualQuantity)) || Number(actualQuantity) < 0)) {
      setValidationMessage("Enter a valid change quantity of zero or more.");
      return;
    }
    let calculatedPercentComplete: number | undefined;
    if (selectedType === "work") {
      if (baselineValidation) { setValidationMessage(baselineValidation); return; }
      const quantity = Number(actualQuantity);
      const operativeCount = assignmentMode === "crew" ? Number(numberOfOperatives) : assignmentMode === "individuals" ? selectedOperativeIds.length : 0;
      if (!actualQuantity.trim() || !Number.isFinite(quantity) || quantity < 0) { setValidationMessage("Enter a valid actual quantity completed."); return; }
      if (assignmentMode === "crew" && (!Number.isInteger(operativeCount) || operativeCount < 1 || operativeCount > (selectedCrew?.operativeIds.length ?? 0))) { setValidationMessage(`Enter between 1 and ${selectedCrew?.operativeIds.length ?? 0} operatives for this gang.`); return; }
      if (!finishTime) { setValidationMessage("Enter a finish time."); return; }
      if (selectedProgrammeActivity) {
        try {
          const installed = await loadActivityInstalledQuantity(getActiveProjectId(), selectedProgrammeActivity.programmeActivityId);
          if (installed >= selectedProgrammeActivity.plannedQuantity) {
            setValidationMessage(`This activity is 100% complete. Record additional quantum, a return visit, replacement, or remedial work as Variation / Additional Work.`);
            return;
          }
          const projected = installed + quantity;
          if (projected > selectedProgrammeActivity.plannedQuantity) {
            setValidationMessage(`Only ${selectedProgrammeActivity.plannedQuantity - installed} ${selectedProgrammeActivity.unit} remains. Measured work cannot exceed the planned quantity; record the excess as Variation / Additional Work.`);
            return;
          }
          calculatedPercentComplete = installedCompletionPercent(projected, selectedProgrammeActivity.plannedQuantity);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "Unable to verify installed quantity.");
          return;
        }
      }
    }

    const selectedSnapshot = programmeVersions.find((snapshot) => snapshot.id === selectedProgrammeVersion);
    const operativeCount = assignmentMode === "crew"
      ? (selectedType === "work" ? Number(numberOfOperatives) : selectedCrew?.operativeIds.length ?? 0)
      : assignmentMode === "individuals" ? selectedOperativeIds.length : 0;
    const selectedOperatives = assignmentMode === "crew"
      ? selectedCrew?.operativeIds.slice(0, operativeCount).map(String) ?? []
      : assignmentMode === "individuals" ? selectedOperativeIds : [];
    const effectiveUnit = baselineUnit || selectedProgrammeActivity?.unit || "";
    const effectiveRate = Number(baselineRate) > 0 ? Number(baselineRate) : selectedProgrammeActivity?.plannedManDayProductivity;
    const effectiveCrewSize = Number(baselineCrewSize) > 0 ? Number(baselineCrewSize) : selectedProgrammeActivity?.assumedGangSize;
    if (canEditProgramme && selectedType === "work" && selectedProgrammeActivity && (effectiveUnit !== selectedProgrammeActivity.unit || effectiveRate !== selectedProgrammeActivity.plannedManDayProductivity || effectiveCrewSize !== selectedProgrammeActivity.assumedGangSize)) {
      try { await updateProgrammeBaseline(selectedProgrammeActivity.id,effectiveUnit,Number(effectiveRate),Number(effectiveCrewSize)); } catch(error) { setValidationMessage(error instanceof Error?error.message:"Unable to update planned data."); return; }
    }
    await onAdd({
      crewId: assignmentMode === "crew" ? selectedCrewId : undefined,
      programmeActivityId:
        selectedType === "work" || selectedType === "disruption" || selectedType === "variation"
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
      productivityTarget: selectedProgrammeActivity?.plannedProductionRate,
      resourceNames: selectedResources,
      numberOfOperatives: operativeCount,
      quantity: selectedType === "work" || selectedType === "variation" ? (actualQuantity.trim() ? Number(actualQuantity) : undefined) : undefined,
      percentComplete: selectedType === "work" ? calculatedPercentComplete : undefined,
      affectedOperativeIds: selectedOperatives,
      plantIds: selectedType === "work" ? selectedPlantIds : [],
      notes: notes.trim() || undefined,
      reason: selectedType === "variation" ? changeLabels[changeCategory] : undefined,
    }, photos);
  }

  if (!selectedType) {
    return (
      <section className="site-record-modal">
        <div className="site-record-modal-header">
          <div>
            <p className="eyebrow">New site record</p>
            <h2>Who is this for?</h2>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {(["crew", "individuals", "unassigned"] as AssignmentMode[]).map((mode) => (
            <button key={mode} type="button" className={assignmentMode === mode ? "primary-button" : "secondary-button"} onClick={() => { setAssignmentMode(mode); setValidationMessage(""); }}>
              {mode === "crew" ? "Gang" : mode === "individuals" ? "Individuals" : "Unassigned"}
            </button>
          ))}
        </div>

        {assignmentMode === "crew" && <label className="attendance-field">
          <span>Gang</span>
          <select value={selectedCrewId} onChange={(event) => setSelectedCrewId(event.target.value)}>
            <option value="">Select a gang</option>
            {availableCrews.map((crew) => <option key={crew.id} value={crew.id}>{crew.name} — {crew.operativeIds.length} operative{crew.operativeIds.length === 1 ? "" : "s"}</option>)}
          </select>
          {availableCrews.length === 0 && <small>No populated gangs are available. Choose Individuals or Unassigned.</small>}
        </label>}

        {assignmentMode === "individuals" && <fieldset style={{ display: "grid", gap: 8, margin: 0, padding: 12, border: "1px solid #d7dde3", borderRadius: 8 }}>
          <legend style={{ padding: "0 5px", fontWeight: 700 }}>Operatives</legend>
          {orderedOperatives.map((operative) => {
            const operativeId = String(operative.id);
            const attended = attendedOperativeIds.includes(operativeId);
            const isOnSite = onSiteOperativeIds.includes(operativeId);
            return <label key={operative.id} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", alignItems: "center", gap: 10, opacity: attended ? 1 : 0.62 }}>
              <input type="checkbox" checked={selectedOperativeIds.includes(operativeId)} disabled={!attended} onChange={(event) => setSelectedOperativeIds((current) => event.target.checked ? [...current, operativeId] : current.filter((id) => id !== operativeId))} />
              <span>{operative.name}<small style={{ display: "block", color: "#5f6b76" }}>{operative.position}</small></span>
              <span style={{ padding: "4px 7px", borderRadius: 6, background: isOnSite ? "#e8f5ee" : "#eef1f3", color: isOnSite ? "#176b45" : "#5f6b76", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{isOnSite ? "On site" : attended ? "Signed out" : "Did not attend"}</span>
            </label>;
          })}
          {operatives.length === 0 && <span>No operatives have been added.</span>}
        </fieldset>}

        <div className="site-record-choice-list">
          {recordChoices.map((choice) => (
            <button
              key={choice.type}
              type="button"
              className={`site-record-choice ${choice.type}`}
              onClick={() => chooseRecordType(choice.type)}
              disabled={!assignmentReady}
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
          <p className="eyebrow">{assignmentLabel}</p>
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

      {(selectedType === "work" || selectedType === "disruption" || selectedType === "variation") && (
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
                <span>Search all programme activities</span>
                <input type="search" value={activitySearch} onChange={(event) => { setActivitySearch(event.target.value); setSelectedProgrammeActivityId(""); setTitle(""); setValidationMessage(""); }} placeholder="Type activity name, ID, WBS or location" autoComplete="off" />
              </label>
              {activitySearch.trim() && !selectedProgrammeActivity && <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #d7dde3", borderRadius: 8 }}>
                {matchingProgrammeActivities.map((activity) => <button key={activity.id} type="button" onClick={() => chooseSearchedActivity(activity)} style={{ display: "grid", width: "100%", gap: 3, padding: "10px 12px", border: 0, borderBottom: "1px solid #e7edf0", background: "#fff", textAlign: "left", cursor: "pointer" }}>
                  <strong>{activity.activity}</strong>
                  <span style={{ color: "#5f6b76", fontSize: 12 }}>{activity.programmeActivityId} · {[activity.building, activity.elevation, activity.level].filter(Boolean).join(" / ") || "Location not specified"}</span>
                </button>)}
                {matchingProgrammeActivities.length === 0 && <p style={{ margin: 0, padding: 12, color: "#5f6b76" }}>No activities match this search.</p>}
              </div>}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1, height: 1, background: "#d7dde3" }} /><strong style={{ color: "#5f6b76", fontSize: 12 }}>OR BROWSE BY LOCATION</strong><span style={{ flex: 1, height: 1, background: "#d7dde3" }} /></div>
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
                      {programmeActivity.activity}{!programmeActivity.unit || !programmeActivity.plannedManDayProductivity || !programmeActivity.assumedGangSize ? " — baseline incomplete" : ""}
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

      {selectedType === "variation" && <>
        <label className="attendance-field"><span>Change type</span><select value={changeCategory} onChange={(event) => { const category = event.target.value as ChangeCategory; setChangeCategory(category); if (!title.trim() || Object.values(changeLabels).includes(title)) setTitle(changeLabels[category]); }}>
          {(Object.entries(changeLabels) as Array<[ChangeCategory, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="attendance-field"><span>Change quantity (optional)</span><input type="number" min="0" step="any" value={actualQuantity} onChange={(event) => setActualQuantity(event.target.value)} /><small>This quantity is reported separately and does not increase the original programme activity percentage.</small></label>
      </>}

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
          {selectedType === "work" && <>
            <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Actual quantity to date</span><strong>{cumulativeQuantity === null ? "Loading…" : cumulativeQuantity} {selectedProgrammeActivity.unit}</strong></div>
            <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>% Complete</span><strong>{percentComplete ? `${percentComplete}%` : "0%"}</strong></div>
            <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Remaining quantity</span><strong>{remainingQuantity === null ? "Loading…" : remainingQuantity} {selectedProgrammeActivity.unit}</strong></div>
          </>}
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Planned Man-Day Productivity</span><strong>{selectedProgrammeActivity.plannedManDayProductivity ? `${selectedProgrammeActivity.plannedManDayProductivity} ${selectedProgrammeActivity.unit}/man-day` : "—"}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Baseline men</span><strong>{selectedProgrammeActivity.plannedCrewSize ?? "—"}</strong></div>
          <div><span style={{ display: "block", fontSize: 12, color: "#5f6b76" }}>Resource / assignment</span><strong>{selectedResources.join(", ") || assignmentLabel}</strong></div>
        </div>
      )}

      {importedBaselineValidation && <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: 10, background: "#fff4e5" }}><p role="alert" style={{ color: "#8a3b00", fontWeight: 700, margin: 0 }}>{canEditProgramme ? "Complete the missing baseline to record measured work. These values will also be saved against the programme activity." : importedBaselineValidation}</p>{canEditProgramme && <><label className="attendance-field"><span>Unit of measure *</span><input value={baselineUnit} onChange={(event) => { setBaselineUnit(event.target.value); setValidationMessage(""); }} placeholder="e.g. m², nr, lm" /></label><label className="attendance-field"><span>Planned Man-Day Productivity *</span><input type="number" min="0.000001" step="any" value={baselineRate} onChange={(event) => { setBaselineRate(event.target.value); setValidationMessage(""); }} placeholder="Quantity per operative per day" /></label><label className="attendance-field"><span>Assumed Gang Size *</span><input type="number" min="1" step="1" value={baselineCrewSize} onChange={(event) => { setBaselineCrewSize(event.target.value); setValidationMessage(""); }} /></label></>}</div>}

      {selectedType === "work" && <>
        {selectedConstraints.length > 0 && <div className="timeline-constraint-warning"><strong>Known open constraints</strong>{selectedConstraints.map((row) => <span key={row.id}><b>{row.rag} CONSTRAINT</b> — {row.description}</span>)}<small>You may proceed; this warning preserves that the constraint was visible during planning/entry.</small></div>}
        <div className="timeline-plant-readiness">
          <strong>Plant readiness</strong>
          {selectedPlantRequirements.map(({ plant, readiness }) => (
            <span key={plant.id}>
              <b className={`calloff-rag ${readiness.rag.toLowerCase()}`}>
                {readiness.rag}
              </b>{" "}
              {plant.quantity} × {plant.description || plant.plant_type} —{" "}
              {plant.explicit_status || "REQUIRED"}
            </span>
          ))}
          {!selectedPlantRequirements.length && (
            <span>No plant requirement is linked to this activity.</span>
          )}
        </div>
        <fieldset className="plant-used-fieldset">
          <legend>Plant used</legend>
          <small>
            Select only plant actually used for this Timeline work event.
            Allocation alone is not usage.
          </small>
          {onSitePlant.map((plant) => (
            <label key={plant.id}>
              <input
                type="checkbox"
                checked={selectedPlantIds.includes(plant.id)}
                onChange={(event) =>
                  setSelectedPlantIds((current) =>
                    event.target.checked
                      ? [...current, plant.id]
                      : current.filter((id) => id !== plant.id),
                  )
                }
              />
              <span>
                {plant.description || plant.plant_type} —{" "}
                {plant.asset_number || plant.hire_reference || "No reference"}
              </span>
            </label>
          ))}
          {!onSitePlant.length && (
            <span>No on-site plant is available to select.</span>
          )}
        </fieldset>
        <label className="attendance-field"><span>Daily actual quantity completed</span><input type="number" min="0" max={remainingQuantity ?? undefined} step="any" value={actualQuantity} onChange={(event) => setActualQuantity(event.target.value)} /><small>{remainingQuantity === null ? "Loading remaining quantity…" : `Maximum available against this activity: ${remainingQuantity} ${selectedProgrammeActivity?.unit ?? ""}.`}</small></label>
        <label className="attendance-field"><span>Physical % complete</span><input value={percentComplete ? `${percentComplete}%` : "Calculated on save"} readOnly /><small>Automatically calculated from cumulative installed quantity against planned quantity.</small></label>
        {assignmentMode === "crew" && <label className="attendance-field"><span>Number of operatives</span><input type="number" min="1" max={selectedCrew?.operativeIds.length} step="1" value={numberOfOperatives} onChange={(event) => setNumberOfOperatives(event.target.value)} /></label>}
        {assignmentMode !== "crew" && <div className="evidence-placeholder"><strong>{assignmentMode === "individuals" ? `${selectedOperativeIds.length} operative${selectedOperativeIds.length === 1 ? "" : "s"} selected` : "No operatives assigned"}</strong></div>}
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
          !assignmentReady ||
          !title.trim() ||
          !time ||
          !finishTime ||
          (selectedType === "work" && !selectedProgrammeActivityId)
        }
      >
        Save for {assignmentLabel}
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
