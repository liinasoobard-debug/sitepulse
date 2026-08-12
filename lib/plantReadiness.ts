import type { ProgrammeActivity } from "@/types/site";
export type PlantStatus =
  | "PLANNED"
  | "BOOKED"
  | "ON HIRE"
  | "OFF-HIRE REQUESTED"
  | "OFF HIRED"
  | "ISSUE / AT RISK";
export type PlantRag = "GREEN" | "AMBER" | "RED" | "GREY";
export type PlantInput = {
  requiredFromDate?: string | null;
  requiredToDate?: string | null;
  onHireDate?: string | null;
  offHireRequestedDate?: string | null;
  actualOffHireDate?: string | null;
  explicitStatus?: string | null;
  activeIssue?: boolean;
  activityComplete?: boolean;
};
const DAY = 86400000,
  date = (value: string) => new Date(`${value}T12:00:00Z`);
export function plantStatus(input: PlantInput): PlantStatus {
  if (input.activeIssue || input.explicitStatus === "ISSUE / AT RISK")
    return "ISSUE / AT RISK";
  if (input.actualOffHireDate) return "OFF HIRED";
  if (input.offHireRequestedDate) return "OFF-HIRE REQUESTED";
  if (input.onHireDate) return "ON HIRE";
  if (input.explicitStatus === "BOOKED") return "BOOKED";
  return "PLANNED";
}
export function plantReadiness(input: PlantInput, today: string) {
  const status = plantStatus(input);
  const days = input.requiredFromDate
    ? Math.ceil(
        (date(input.requiredFromDate).getTime() - date(today).getTime()) / DAY,
      )
    : null;
  let rag: PlantRag = "GREY";
  if (
    status === "ISSUE / AT RISK" ||
    (days !== null && days <= 0 && !["ON HIRE", "BOOKED"].includes(status))
  )
    rag = "RED";
  else if (
    days !== null &&
    days <= 3 &&
    !["ON HIRE", "BOOKED"].includes(status)
  )
    rag = "RED";
  else if (days !== null && days <= 14 && status === "PLANNED") rag = "AMBER";
  else if (
    days !== null &&
    ["BOOKED", "ON HIRE", "OFF-HIRE REQUESTED", "OFF HIRED"].includes(status)
  )
    rag = "GREEN";
  const potentialOffHire =
    (Boolean(input.requiredToDate && input.requiredToDate < today) ||
      Boolean(input.activityComplete)) &&
    status === "ON HIRE";
  return { status, rag, daysUntilRequired: days, potentialOffHire };
}
export function plantRiskReason(input: {
  description: string;
  activityName: string;
  result: ReturnType<typeof plantReadiness>;
}) {
  if (input.result.rag !== "RED") return null;
  return `Plant constraint detected: ${input.description} required for ${input.activityName}${input.result.daysUntilRequired === null ? "" : " within " + Math.max(0, input.result.daysUntilRequired) + " days"} but availability is not confirmed or an active issue exists.`;
}
export function plantInLookahead(
  record: { required_from_date?: string | null },
  activity: ProgrammeActivity | undefined,
  today: string,
) {
  const start = record.required_from_date || activity?.plannedStart;
  if (!start) return false;
  const end = new Date(date(today));
  end.setUTCDate(end.getUTCDate() + 14);
  return start >= today && start <= end.toISOString().slice(0, 10);
}
