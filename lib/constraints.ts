import type { ProgrammeActivity, TimelineEvent } from "@/types/site";
export const constraintCategories = [
  "Access",
  "Materials",
  "Plant",
  "Design Information",
  "Preceding Trade",
  "Labour",
  "Client Instruction",
  "Temporary Works",
  "Permits / Approvals",
  "Weather",
  "Quality / Rework",
  "Health & Safety",
  "Productivity",
  "Programme",
  "Other",
] as const;
export type ConstraintRag = "GREEN" | "AMBER" | "RED" | "GREY";
export type ConstraintStatus =
  | "SUGGESTED"
  | "OPEN"
  | "ACTIONED / MONITORING"
  | "CLOSED"
  | "DISMISSED";
export type ConstraintRecord = {
  id: string;
  project_id: string;
  programme_activity_external_id?: string | null;
  category: string;
  description: string;
  source: string;
  source_record_id?: string | null;
  source_condition_key: string;
  first_detected_date: string;
  raised_date?: string | null;
  calculated_required_date?: string | null;
  overridden_required_date?: string | null;
  required_date_override_reason?: string | null;
  owner?: string | null;
  responsible_organisation?: string | null;
  status: ConstraintStatus;
  rag: ConstraintRag;
  programme_forecast_impact?: string | null;
  action_required?: string | null;
  latest_update?: string | null;
  closed_date?: string | null;
  evidence_notes?: string | null;
  occurrence_count: number;
  last_detected_date: string;
  created_at?: string;
  updated_at?: string;
};
export type ConstraintSuggestion = Omit<
  ConstraintRecord,
  | "id"
  | "project_id"
  | "status"
  | "raised_date"
  | "closed_date"
  | "created_at"
  | "updated_at"
>;
const DAY = 86400000;
const date = (value: string) => new Date(`${value}T12:00:00Z`);
export function daysOpen(
  row: Pick<ConstraintRecord, "first_detected_date" | "closed_date">,
  today: string,
) {
  return Math.max(
    0,
    Math.floor(
      (date(row.closed_date || today).getTime() -
        date(row.first_detected_date).getTime()) /
        DAY,
    ),
  );
}
export function constraintRequiredDate(
  activity?: ProgrammeActivity,
  override?: string | null,
) {
  return override || activity?.plannedStart || null;
}
export function constraintRag(
  requiredDate: string | null,
  today: string,
  affecting = false,
  controlled = false,
): ConstraintRag {
  if (affecting) return "RED";
  if (!requiredDate) return "GREY";
  const days = Math.ceil(
    (date(requiredDate).getTime() - date(today).getTime()) / DAY,
  );
  if (days <= 3) return "RED";
  if (days <= 14 && !controlled) return "AMBER";
  return "GREEN";
}
export function suggestionKey(
  activityId: string | undefined,
  category: string,
  condition: string,
) {
  return `${activityId || "project"}|${category}|${condition.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function materialRiskSuggestion(
  input: {
    activityId: string;
    activityName: string;
    requiredDate?: string | null;
    rag: ConstraintRag;
    reason: string;
    sourceId: string;
  },
  today: string,
): ConstraintSuggestion | null {
  if (input.rag !== "RED") return null;
  return {
    programme_activity_external_id: input.activityId,
    category: "Materials",
    description: `Material constraint detected: ${input.activityName} — ${input.reason}`,
    source: "MATERIALS",
    source_record_id: input.sourceId,
    source_condition_key: suggestionKey(
      input.activityId,
      "Materials",
      input.reason,
    ),
    first_detected_date: today,
    calculated_required_date: input.requiredDate ?? null,
    rag: "RED",
    programme_forecast_impact:
      "Material readiness exposure recorded against the linked programme activity.",
    action_required: "Confirm call-off and delivery readiness.",
    latest_update: input.reason,
    evidence_notes: input.reason,
    occurrence_count: 1,
    last_detected_date: today,
  };
}
export function plantRiskSuggestion(
  input: {
    activityId: string;
    requiredDate?: string | null;
    reason: string;
    sourceId: string;
  },
  today: string,
): ConstraintSuggestion {
  return {
    programme_activity_external_id: input.activityId,
    category: "Plant",
    description: input.reason,
    source: "PLANT",
    source_record_id: input.sourceId,
    source_condition_key: suggestionKey(
      input.activityId,
      "Plant",
      input.sourceId,
    ),
    first_detected_date: today,
    calculated_required_date: input.requiredDate ?? null,
    rag: "RED",
    programme_forecast_impact:
      "Plant readiness exposure recorded against the linked programme activity.",
    action_required: "Confirm plant booking and availability.",
    latest_update: input.reason,
    evidence_notes: input.reason,
    occurrence_count: 1,
    last_detected_date: today,
  };
}
export function recurringDisruptionSuggestions(
  events: Array<{ date: string; event: TimelineEvent }>,
  activities: ProgrammeActivity[],
  today: string,
): ConstraintSuggestion[] {
  const groups = new Map<
    string,
    { activityId: string; reason: string; dates: Set<string>; hours: number }
  >();
  for (const { event, date } of events) {
    if (event.type !== "disruption" || !event.programmeActivityId) continue;
    const reason = event.reason || event.title || "Other";
    const key = `${event.programmeActivityId}|${reason}`;
    const row = groups.get(key) ?? {
      activityId: event.programmeActivityId,
      reason,
      dates: new Set(),
      hours: 0,
    };
    row.dates.add(date);
    row.hours += Number(event.lostLabourHours ?? 0);
    groups.set(key, row);
  }
  return [...groups.values()]
    .filter((row) => row.dates.size >= 3)
    .map((row) => {
      const activity = activities.find(
        (item) => item.programmeActivityId === row.activityId,
      );
      return {
        programme_activity_external_id: row.activityId,
        category: /plant|crane/i.test(row.reason) ? "Plant" : "Other",
        description: `Recurring disruption detected: ${row.reason} affected ${row.dates.size} recorded days.`,
        source: "DISRUPTION",
        source_condition_key: suggestionKey(
          row.activityId,
          "Disruption",
          row.reason,
        ),
        first_detected_date: [...row.dates].sort()[0],
        calculated_required_date: activity?.plannedStart ?? null,
        rag: "AMBER",
        programme_forecast_impact: null,
        action_required: "Review recurring blocker and agree mitigation.",
        latest_update: `Historical Occurrence Rate evidence: ${row.dates.size} affected recorded days; ${row.hours} lost labour hours.`,
        evidence_notes: `${row.dates.size} affected recorded days; sample is recorded project days, not a probability.`,
        occurrence_count: row.dates.size,
        last_detected_date: today,
      };
    });
}
export function mergeSuggestions(
  suggestions: ConstraintSuggestion[],
  existing: ConstraintRecord[],
) {
  const existingKeys = new Set(
    existing
      .filter((row) => row.status !== "CLOSED")
      .map((row) => row.source_condition_key),
  );
  return suggestions.filter(
    (row) => !existingKeys.has(row.source_condition_key),
  );
}
export function constraintMovement(
  rows: ConstraintRecord[],
  start: string,
  end: string,
) {
  const within = (value?: string | null) =>
    Boolean(value && value >= start && value <= end);
  return {
    open: rows.filter((row) =>
      ["OPEN", "ACTIONED / MONITORING"].includes(row.status),
    ),
    newRows: rows.filter((row) => within(row.raised_date)),
    closed: rows.filter((row) => within(row.closed_date)),
    red: rows.filter((row) => row.status !== "CLOSED" && row.rag === "RED"),
    amber: rows.filter((row) => row.status !== "CLOSED" && row.rag === "AMBER"),
    green: rows.filter((row) => row.status !== "CLOSED" && row.rag === "GREEN"),
  };
}
