import { constraintCategories, type BlockingRelationship, type ConstraintRag, type ConstraintStatus } from "./constraints.ts";
import type { ProgrammeActivity } from "../types/site.ts";

export type ConstraintImportClassification =
  | "NEW"
  | "UPDATED"
  | "UNCHANGED"
  | "UNMATCHED ACTIVITY"
  | "INVALID";
export type ConstraintImportRow = Record<string, unknown>;
const value = (row: ConstraintImportRow, name: string) =>
  String(row[name] ?? "").trim();
const normal = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

export function classifyConstraintImport(
  row: ConstraintImportRow,
  activities: ProgrammeActivity[],
  existingReferences: Set<string>,
) {
  const reference = value(row, "Constraint ID");
  const category = value(row, "Category");
  const description = value(row, "Description");
  const externalId = value(row, "Programme Activity ID");
  const activityName = value(row, "Activity");
  const projectWide = /^yes|true|project-wide$/i.test(value(row, "Project Wide"));
  const status = (value(row, "Status").toUpperCase() || "OPEN") as ConstraintStatus;
  const rag = (value(row, "RAG").toUpperCase() || "GREY") as ConstraintRag;
  const relationship = (value(row, "Blocking Relationship") || "Blocking Progress") as BlockingRelationship;
  if (!description || !constraintCategories.includes(category as never))
    return { classification: "INVALID" as const, error: "Description and a valid Category are required.", activityIds: [] };
  if (!["SUGGESTED", "OPEN", "ACTIONED / MONITORING", "CLOSED", "DISMISSED"].includes(status))
    return { classification: "INVALID" as const, error: "Status is not a supported SitePulse constraint status.", activityIds: [] };
  if (!["GREEN", "AMBER", "RED", "GREY"].includes(rag))
    return { classification: "INVALID" as const, error: "RAG must be GREEN, AMBER, RED or GREY.", activityIds: [] };
  if (!["Blocking Start", "Blocking Progress", "Blocking Completion", "Potential Risk", "General Constraint"].includes(relationship))
    return { classification: "INVALID" as const, error: "Blocking Relationship is invalid.", activityIds: [] };
  let matches: ProgrammeActivity[] = [];
  if (externalId)
    matches = activities.filter((activity) => activity.programmeActivityId === externalId);
  else if (activityName)
    matches = activities.filter((activity) => normal(activity.activity) === normal(activityName));
  if (!projectWide && matches.length !== 1)
    return {
      classification: "UNMATCHED ACTIVITY" as const,
      error: matches.length > 1 ? "Activity name is ambiguous; supply Programme Activity ID." : "Activity was not found in this project.",
      activityIds: [],
    };
  return {
    classification: existingReferences.has(reference) ? "UPDATED" as const : "NEW" as const,
    error: "",
    activityIds: matches.map((activity) => activity.programmeActivityId),
    values: {
      reference,
      category,
      description,
      projectWide,
      relationship,
      owner: value(row, "Owner"),
      organisation: value(row, "Responsible Organisation"),
      raisedDate: value(row, "Date Raised"),
      requiredDate: value(row, "Required Resolution Date"),
      status,
      rag,
      latestUpdate: value(row, "Latest Update"),
      impact: value(row, "Programme / Forecast Impact"),
      source: value(row, "Source") || "IMPORT",
      notes: value(row, "Notes"),
      closedDate: value(row, "Closed Date"),
    },
  };
}
