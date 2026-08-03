import type {
  AttendanceRecord,
  Crew,
  Operative,
  ProgrammeActivity,
  TimelineEvent,
} from "@/types/site";

export type MeasuredWorkRow = {
  building: string;
  elevation: string;
  level: string;
  activity: string;
  programmeActivityId: string;
  plannedQuantity: number;
  completedToday: number;
  totalCompleted: number;
  remainingQuantity: number;
  percentageComplete: number;
  unit: string;
  gangs: string;
  labourHours: number;
  productivity: number;
};

export type GangProductivityRow = {
  gang: string;
  activity: string;
  quantity: number;
  labourHours: number;
  productivity: number;
};

export type LabourSummaryRow = {
  gang: string;
  operatives: number;
  productiveHours: number;
  disruptionHours: number;
  breakHours: number;
  totalHours: number;
};

export function eventLabourHours(event: TimelineEvent): number {
  return ((event.duration ?? 0) / 60) * (event.affectedOperativeIds?.length ?? 0);
}

export function elapsedHours(start?: string, finish?: string): number {
  if (!start || !finish) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [finishHour, finishMinute] = finish.split(":").map(Number);
  if (![startHour, startMinute, finishHour, finishMinute].every(Number.isFinite)) return 0;
  const startValue = startHour * 60 + startMinute;
  let finishValue = finishHour * 60 + finishMinute;
  if (finishValue < startValue) finishValue += 24 * 60;
  return (finishValue - startValue) / 60;
}

export function crewName(crews: Crew[], crewId?: string): string {
  if (!crewId) return "Unassigned gang";
  return crews.find((crew) => crew.id === crewId)?.name ?? "Unknown gang";
}

export function buildMeasuredWorkRows(
  programme: ProgrammeActivity[],
  events: TimelineEvent[],
  crews: Crew[]
): MeasuredWorkRow[] {
  return programme.flatMap((item) => {
    const records = events.filter(
      (event) => event.type === "work" && event.programmeActivityId === item.programmeActivityId
    );
    if (records.length === 0) return [];
    const completed = records.filter((event) => event.status === "completed");
    const completedToday = completed.reduce((sum, event) => sum + (event.quantity ?? 0), 0);
    const labourHours = completed.reduce((sum, event) => sum + eventLabourHours(event), 0);
    // TODO: replace with cumulative production history when SiteDay storage becomes date-indexed.
    const totalCompleted = completedToday;
    return [{
      building: item.building || "—",
      elevation: item.elevation || "—",
      level: item.level || "—",
      activity: item.activity,
      programmeActivityId: item.programmeActivityId,
      plannedQuantity: item.plannedQuantity,
      completedToday,
      totalCompleted,
      remainingQuantity: Math.max(item.plannedQuantity - totalCompleted, 0),
      percentageComplete: item.plannedQuantity > 0
        ? Math.min((totalCompleted / item.plannedQuantity) * 100, 100)
        : 0,
      unit: item.unit,
      gangs: [...new Set(records.map((event) => crewName(crews, event.crewId)))].join(", "),
      labourHours,
      productivity: labourHours > 0 ? completedToday / labourHours : 0,
    }];
  });
}

export function buildGangProductivityRows(
  events: TimelineEvent[],
  programme: ProgrammeActivity[],
  crews: Crew[]
): GangProductivityRow[] {
  const programmeById = new Map(programme.map((item) => [item.programmeActivityId, item]));
  const rows = new Map<string, GangProductivityRow>();
  events.filter((event) => event.type === "work" && event.status === "completed").forEach((event) => {
    const activity = event.programmeActivityId ? programmeById.get(event.programmeActivityId) : undefined;
    if (!activity) return;
    const gang = crewName(crews, event.crewId);
    const key = `${event.crewId ?? "none"}|${activity.programmeActivityId}`;
    const current = rows.get(key) ?? { gang, activity: activity.activity, quantity: 0, labourHours: 0, productivity: 0 };
    current.quantity += event.quantity ?? 0;
    current.labourHours += eventLabourHours(event);
    current.productivity = current.labourHours > 0 ? current.quantity / current.labourHours : 0;
    rows.set(key, current);
  });
  return [...rows.values()];
}

export function buildLabourSummary(
  crews: Crew[],
  events: TimelineEvent[],
  attendance: AttendanceRecord[],
  operatives: Operative[]
): LabourSummaryRow[] {
  const attendanceByOperative = new Map(attendance.map((record) => [String(record.operativeId), record]));
  const knownOperativeIds = new Set(operatives.map((operative) => String(operative.id)));
  return crews.map((crew) => {
    const crewEvents = events.filter((event) => event.crewId === crew.id);
    const hoursFor = (type: TimelineEvent["type"]) => crewEvents
      .filter((event) => event.type === type)
      .reduce((sum, event) => sum + eventLabourHours(event), 0);
    const totalHours = crew.operativeIds.reduce((sum, id) => {
      if (!knownOperativeIds.has(String(id))) return sum;
      const record = attendanceByOperative.get(String(id));
      return sum + elapsedHours(record?.signIn, record?.signOut);
    }, 0);
    return {
      gang: crew.name,
      operatives: crew.operativeIds.length,
      productiveHours: hoursFor("work"),
      disruptionHours: hoursFor("disruption"),
      breakHours: hoursFor("break"),
      totalHours,
    };
  });
}
