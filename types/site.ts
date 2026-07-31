export interface Project {
  id: string;
  name: string;
  code?: string;
  location?: string;
  isArchived?: boolean;
  createdAt: string;
}

export interface Operative {
  id: string;
  company: string;
  name: string;
  position: string;
  hourlyRate: number;
}

export interface AttendanceRecord {
  operativeId: string;
  signIn?: string;
  signOut?: string;
}

export type SiteRecordType =
  | "work"
  | "disruption"
  | "variation"
  | "break";

export interface Crew {
  id: string;
  name: string;
  operativeIds: string[];
}

export interface ProgrammeActivity {
  id: string; // internal UUID

  programmeActivityId: string; // P6 / Asta Activity ID

  building: string;

  elevation: string;

  level: string;

  activity: string;

  description?: string;

  trade?: string;

  wbs?: string;

  unit: string;

  plannedQuantity: number;

  plannedStart?: string;

  plannedFinish?: string;

  createdAt: string;
}

export interface TimelineEvent {
  id: string;

  crewId?: string;

  programmeActivityId?: string;

  time: string;

  endTime?: string;

  status?: "active" | "completed";

  title: string;

  type: SiteRecordType;

  reason?: string;

  notes?: string;

  quantity?: number;

  affectedOperativeIds?: string[];

  lostLabourHours?: number;

  labourCost?: number;

  photoIds?: string[];

  drawingReference?: string;

  instructionReference?: string;
}

export interface SiteDay {
  date: string;
  attendance: AttendanceRecord[];
  crews?: Crew[];
  events: TimelineEvent[];
}