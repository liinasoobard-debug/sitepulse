import type { Operative, ProgrammeActivity, Project, SiteDay } from "@/types/site";

export const PROJECT_BACKUP_SCHEMA_VERSION = "1.0";

export interface ProjectBackup {
  SchemaVersion: typeof PROJECT_BACKUP_SCHEMA_VERSION;
  ExportedAt: string;
  ExportedBy?: string;
  ProjectId: string;
  Project: Project;
  ProgrammeActivities: ProgrammeActivity[];
  Operatives: Operative[];
  SiteDays: SiteDay[];
  ReportData: {
    Mode: "derived";
    GeneratedFrom: ["ProgrammeActivities", "SiteDays"];
  };
}

export type BackupPreview = {
  backup: ProjectBackup;
  firstDate: string | null;
  lastDate: string | null;
  timelineEvents: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateProjectBackup(value: unknown): BackupPreview {
  if (!isObject(value)) throw new Error("The selected file does not contain a JSON object.");
  if (value.SchemaVersion !== PROJECT_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported SchemaVersion. Expected ${PROJECT_BACKUP_SCHEMA_VERSION}.`);
  }
  if (!isString(value.ExportedAt) || Number.isNaN(Date.parse(value.ExportedAt))) {
    throw new Error("ExportedAt must be a valid timestamp.");
  }
  if (value.ExportedBy !== undefined && !isString(value.ExportedBy)) {
    throw new Error("ExportedBy must be text when provided.");
  }
  if (!isString(value.ProjectId) || !value.ProjectId.trim()) throw new Error("ProjectId is missing.");
  if (!isObject(value.Project) || !isString(value.Project.id) || !isString(value.Project.name)) {
    throw new Error("Project details are missing or invalid.");
  }
  if (value.Project.id !== value.ProjectId) throw new Error("ProjectId does not match Project.id.");
  if (!Array.isArray(value.ProgrammeActivities)) throw new Error("ProgrammeActivities must be an array.");
  if (!Array.isArray(value.Operatives)) throw new Error("Operatives must be an array.");
  if (!Array.isArray(value.SiteDays)) throw new Error("SiteDays must be an array.");
  if (!isObject(value.ReportData) || value.ReportData.Mode !== "derived") {
    throw new Error("ReportData is missing or invalid.");
  }

  value.ProgrammeActivities.forEach((activity, index) => {
    if (!isObject(activity) || !isString(activity.id) || !isString(activity.programmeActivityId) || !isString(activity.activity)) {
      throw new Error(`Programme activity ${index + 1} is invalid.`);
    }
  });
  value.Operatives.forEach((operative, index) => {
    if (!isObject(operative) || !isString(operative.id) || !isString(operative.name)) {
      throw new Error(`Operative ${index + 1} is invalid.`);
    }
  });
  const dates = new Set<string>();
  let timelineEvents = 0;
  value.SiteDays.forEach((day, index) => {
    if (!isObject(day) || !isIsoDate(day.date) || !Array.isArray(day.attendance) || !Array.isArray(day.events)) {
      throw new Error(`Daily record ${index + 1} is invalid.`);
    }
    if (dates.has(day.date)) throw new Error(`Duplicate daily record found for ${day.date}.`);
    dates.add(day.date);
    day.events.forEach((event, eventIndex) => {
      if (!isObject(event) || !isString(event.id) || !isString(event.type) || !isString(event.title) || !isString(event.time)) {
        throw new Error(`Timeline event ${eventIndex + 1} on ${day.date} is invalid.`);
      }
    });
    timelineEvents += day.events.length;
  });

  const sortedDates = [...dates].sort();
  return {
    backup: value as unknown as ProjectBackup,
    firstDate: sortedDates[0] ?? null,
    lastDate: sortedDates.at(-1) ?? null,
    timelineEvents,
  };
}
