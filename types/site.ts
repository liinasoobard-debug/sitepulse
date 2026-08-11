export interface Project {
  id: string;
  name: string;
  code?: string;
  location?: string;
  isArchived?: boolean;
  createdAt: string;
  labourRateSettings?: LabourRateSettings;
}

export interface LabourRateRule {
  backshiftStart: string;
  backshiftMultiplier: number;
}

export interface CompanyLabourRateRule extends LabourRateRule {
  company: string;
}

export interface LabourRateSettings extends LabourRateRule {
  companyRules: CompanyLabourRateRule[];
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
  | "non_measured_work"
  | "waiting"
  | "delay"
  | "plant"
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
  projectId?: string;
  programmeActivityId: string; // P6 / Asta Activity ID
  activityName?: string;
  wbsCode?: string;
  wbsPath?: string;
  building: string;
  elevation: string;
  level: string;

  gridline?: string;

  activity: string;
  workActivity?: string;

  description?: string;

  trade?: string;
  productType?: string;
  status?: string;

  wbs?: string;
  activityStatus?: string;
  originalDuration?: number;
  remainingDuration?: number;

  unit: string;

  plannedQuantity: number;

  budgetLabourHours?: number;

  plannedProductionRate?: number;

  plannedManDayProductivity?: number;

  assumedGangSize?: number;

  plannedGangDailyOutput?: number;

  plannedManDays?: number;

  plannedDurationDays?: number;

  plannedCrewSize?: number;

  plannedStart?: string;

  plannedFinish?: string;
  actualStart?: string;
  actualFinish?: string;
  physicalPercentComplete?: number;
  primaryConstraint?: string;
  secondaryConstraint?: string;
  calendar?: string;
  resourceNames?: string[];
  labourResourceNames?: string[];
  materialResourceNames?: string[];
  dataDate?: string;
  sourceType?: "sitepulse-template" | "p6-xlsx" | "asta-xlsx" | "manual";
  sourceImportId?: string;
  sourceFilename?: string;
  importDate?: string;
  importedBy?: string;
  missingFromLatestUpdate?: boolean;
  productivityBaselineComplete?: boolean;

  createdAt: string;
  updatedAt?: string;
}

export interface ProgrammeRelationship {
  id: string;
  projectId: string;
  predecessorActivityId: string;
  successorActivityId: string;
  relationshipType: string;
  lag?: number;
  sourceImportId: string;
}

export interface ProgrammeResource {
  id: string;
  projectId: string;
  resourceId: string;
  resourceName: string;
  resourceType?: string;
  parentResourceId?: string;
  unitOfMeasure?: string;
  calendar?: string;
  sourceImportId: string;
}

export interface ProgrammeResourceAssignment {
  id: string;
  projectId: string;
  programmeActivityId: string;
  resourceId: string;
  resourceType?: string;
  assignmentStart?: string;
  assignmentFinish?: string;
  budgetedLabourUnits?: number;
  actualLabourUnits?: number;
  remainingLabourUnits?: number;
  atCompletionUnits?: number;
  sourceImportId: string;
}

export interface ProgrammeImportChange {
  programmeActivityId: string;
  classification: "new" | "updated" | "unchanged" | "invalid" | "missing";
  before?: Partial<ProgrammeActivity>;
  after?: Partial<ProgrammeActivity>;
  changedFields?: string[];
}

export interface ProgrammeImportSnapshot {
  id: string;
  projectId: string;
  importedAt: string;
  importedBy?: string;
  sourceFilename: string;
  sourceType: "p6-xlsx";
  dataDate?: string;
  activityCount: number;
  relationshipCount: number;
  resourceCount: number;
  assignmentCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  invalidCount: number;
  missingCount: number;
  changes: ProgrammeImportChange[];
}

export interface ProgrammeImportData {
  relationships: ProgrammeRelationship[];
  resources: ProgrammeResource[];
  assignments: ProgrammeResourceAssignment[];
  snapshots: ProgrammeImportSnapshot[];
}

export interface ProgrammeProgress {
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  percentageComplete: number;
  labourHours: number;
  productivity: number;
  baselineComplete: boolean;
  plannedProductionRate: number | null;
  actualProductiveLabourHours: number;
  actualDisruptionLabourHours: number;
  actualProductionRate: number | null;
  overallProductionRate: number | null;
  earnedLabourHours: number | null;
  labourProductivityIndex: number | null;
  overallLabourEfficiencyIndex: number | null;
  productivityPerformancePercentage: number | null;
  plannedManDayProductivity?: number | null;
  actualManDayProductivity?: number | null;
  dailyGangOutput?: number;
  operativesContributing?: number;
}

export interface ProductivityBenchmark {
  productType: string;
  unit: string;
  plannedManDayProductivity: number;
  typicalGangSize: number;
  typicalDailyGangOutput: number;
  source?: string;
  effectiveDate?: string;
  notes?: string;
}

export interface TimelineEvent {
  id: string;

  crewId?: string;

  programmeActivityId?: string;
  programmeActivityDatabaseId?: string;
  programmeImportId?: string;
  programmeVersion?: string;
  activityDescription?: string;

  location?: string;

  unit?: string;
  plannedStart?: string;
  plannedFinish?: string;
  plannedDuration?: number;
  plannedQuantity?: number;
  productivityTarget?: number;
  resourceNames?: string[];
  numberOfOperatives?: number;

  time: string;

  startTime?: string;

  finishTime?: string;

  duration?: number; // minutes

  status?: "active" | "completed";

  title: string;

  type: SiteRecordType;

  reason?: string;

  notes?: string;

  quantity?: number;
  percentComplete?: number;

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
