import type {
  Operative,
  ProgrammeActivity,
  Project,
  SiteDay,
} from "@/types/site";
import { operatives as defaultOperatives } from "@/lib/operatives";
import { deleteSharedRecord, queueSharedWrite } from "@/lib/sharedSync";

export const LEGACY_DAY_STORAGE_KEY = "sitepulse-day";
export const OPERATIVES_STORAGE_KEY = "sitepulse-operatives";
export const PROJECTS_STORAGE_KEY = "sitepulse-projects";
export const ACTIVE_PROJECT_STORAGE_KEY =
  "sitepulse-active-project";
export const ACTIVE_DATE_STORAGE_KEY = "sitepulse-active-date";

const PROJECT_DAY_KEY_PREFIX = "sitepulse-day-project";
const LEGACY_DAY_MIGRATION_KEY = "sitepulse-legacy-day-migrated";
const PROJECT_ACTIVITIES_KEY_PREFIX =
  "sitepulse-activities-project";
const PROJECT_PROGRAMME_KEY_PREFIX =
  "sitepulse-programme-project";

function createId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function createDefaultProject(): Project {
  return {
    id: createId("project"),
    name: "My First Project",
    code: "",
    location: "",
    createdAt: new Date().toISOString(),
  };
}

function getProjectDayStorageKey(projectId: string): string {
  return `${PROJECT_DAY_KEY_PREFIX}-${projectId}`;
}

function getDatedProjectDayStorageKey(
  projectId: string,
  date: string
): string {
  return `${PROJECT_DAY_KEY_PREFIX}-${projectId}-${date}`;
}

export function getLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && getLocalDate(parsed) === value;
}

export function getActiveDate(): string {
  if (typeof window === "undefined") return getLocalDate();
  const storedDate = localStorage.getItem(ACTIVE_DATE_STORAGE_KEY);
  const date = isIsoDate(storedDate) ? storedDate : getLocalDate();
  localStorage.setItem(ACTIVE_DATE_STORAGE_KEY, date);
  return date;
}

export function setActiveDate(date: string): void {
  if (typeof window === "undefined" || !isIsoDate(date)) return;
  localStorage.setItem(ACTIVE_DATE_STORAGE_KEY, date);
  window.dispatchEvent(
    new CustomEvent("sitepulse-date-changed", { detail: { date } })
  );
}

function emptySiteDay(date: string): SiteDay {
  return { date, attendance: [], crews: [], events: [] };
}

function getProjectActivitiesStorageKey(
  projectId: string
): string {
  return `${PROJECT_ACTIVITIES_KEY_PREFIX}-${projectId}`;
}

function getProjectProgrammeStorageKey(projectId: string): string {
  return `${PROJECT_PROGRAMME_KEY_PREFIX}-${projectId}`;
}

function normaliseProject(project: Project): Project {
  return {
    id: String(project.id),
    name: project.name?.trim() || "Unnamed Project",
    code: project.code?.trim() || "",
    location: project.location?.trim() || "",
    isArchived: Boolean(project.isArchived),
    createdAt:
      project.createdAt || new Date().toISOString(),
  };
}

type LegacyProgrammeRow = {
  id?: string;
  code?: string;
  description?: string;
  location?: string;
  unit?: string;
  plannedQuantity?: number;
  createdAt?: string;
};

function normaliseProgrammeActivity(
  activity: Partial<ProgrammeActivity> & LegacyProgrammeRow
): ProgrammeActivity {
  return {
    id: String(activity.id || createId("programme-activity")),
    programmeActivityId:
      activity.programmeActivityId?.trim() ||
      activity.code?.trim() ||
      String(activity.id || createId("programme-activity-id")),
    building: activity.building?.trim() || activity.location?.trim() || "",
    elevation: activity.elevation?.trim() || "",
    level: activity.level?.trim() || "",
    gridline: activity.gridline?.trim() || "",
    activity:
      activity.activity?.trim() ||
      activity.description?.trim() ||
      "Unnamed programme activity",
    description: activity.description?.trim() || "",
    trade: activity.trade?.trim() || "",
    wbs: activity.wbs?.trim() || "",
    unit: activity.unit?.trim() || "",
    plannedQuantity:
      Number.isFinite(Number(activity.plannedQuantity))
        ? Number(activity.plannedQuantity)
        : 0,
    budgetLabourHours:
      Number.isFinite(Number(activity.budgetLabourHours)) &&
      Number(activity.budgetLabourHours) > 0
        ? Number(activity.budgetLabourHours)
        : undefined,
    plannedProductionRate:
      Number.isFinite(Number(activity.plannedProductionRate)) &&
      Number(activity.plannedProductionRate) > 0
        ? Number(activity.plannedProductionRate)
        : undefined,
    plannedCrewSize:
      Number.isFinite(Number(activity.plannedCrewSize)) &&
      Number(activity.plannedCrewSize) > 0
        ? Number(activity.plannedCrewSize)
        : undefined,
    plannedStart: activity.plannedStart?.trim() || undefined,
    plannedFinish: activity.plannedFinish?.trim() || undefined,
    createdAt:
      activity.createdAt || new Date().toISOString(),
  };
}

function migrateLegacyDay(projectId: string): void {
  if (typeof window === "undefined") return;

  const projectDayKey = getProjectDayStorageKey(projectId);
  const projectLegacyDay = localStorage.getItem(projectDayKey);
  const globalLegacyDay = localStorage.getItem(LEGACY_DAY_MIGRATION_KEY)
    ? null
    : localStorage.getItem(LEGACY_DAY_STORAGE_KEY);
  const legacyDay = projectLegacyDay ?? globalLegacyDay;
  if (!legacyDay) return;

  try {
    const parsed = JSON.parse(legacyDay) as Partial<SiteDay>;
    const date = isIsoDate(parsed.date) ? parsed.date : getLocalDate();
    const datedKey = getDatedProjectDayStorageKey(projectId, date);
    if (!localStorage.getItem(datedKey)) {
      localStorage.setItem(
        datedKey,
        JSON.stringify({ ...emptySiteDay(date), ...parsed, date })
      );
    }
    if (globalLegacyDay) {
      localStorage.setItem(LEGACY_DAY_MIGRATION_KEY, projectId);
    }
  } catch (error) {
    console.error(
      "Unable to migrate the existing site day:",
      error
    );
  }
}

function ensureProjectSetup(): {
  projects: Project[];
  activeProjectId: string;
} {
  if (typeof window === "undefined") {
    return { projects: [], activeProjectId: "" };
  }

  let projects: Project[] = [];

  try {
    const storedProjects = localStorage.getItem(
      PROJECTS_STORAGE_KEY
    );

    if (storedProjects) {
      const parsedProjects = JSON.parse(storedProjects);

      if (Array.isArray(parsedProjects)) {
        projects = parsedProjects
          .map((project) =>
            normaliseProject(project as Project)
          )
          .filter((project) => project.id);
      }
    }
  } catch (error) {
    console.error("Unable to load projects:", error);
  }

  if (projects.length === 0) {
    projects = [createDefaultProject()];
    localStorage.setItem(
      PROJECTS_STORAGE_KEY,
      JSON.stringify(projects)
    );
    queueSharedWrite(PROJECTS_STORAGE_KEY, projects);
  }

  const storedActiveProjectId = localStorage.getItem(
    ACTIVE_PROJECT_STORAGE_KEY
  );

  const activeProjectExists = projects.some(
    (project) =>
      project.id === storedActiveProjectId &&
      !project.isArchived
  );

  const activeProjectId = activeProjectExists
    ? String(storedActiveProjectId)
    : projects.find((project) => !project.isArchived)?.id ??
      projects[0].id;

  localStorage.setItem(
    ACTIVE_PROJECT_STORAGE_KEY,
    activeProjectId
  );

  migrateLegacyDay(activeProjectId);

  return { projects, activeProjectId };
}

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  return ensureProjectSetup().projects;
}

export function saveProjects(projects: Project[]): void {
  if (typeof window === "undefined") return;

  try {
    const normalisedProjects = projects.map(normaliseProject);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(normalisedProjects));
    queueSharedWrite(PROJECTS_STORAGE_KEY, normalisedProjects);
  } catch (error) {
    console.error("Unable to save projects:", error);
  }
}

export function getActiveProjectId(): string {
  if (typeof window === "undefined") return "";
  return ensureProjectSetup().activeProjectId;
}

export function getActiveProject(): Project | null {
  if (typeof window === "undefined") return null;

  const { projects, activeProjectId } = ensureProjectSetup();
  return (
    projects.find(
      (project) => project.id === activeProjectId
    ) ?? null
  );
}

export function setActiveProject(projectId: string): void {
  if (typeof window === "undefined") return;

  const projectExists = loadProjects().some(
    (project) =>
      project.id === projectId && !project.isArchived
  );

  if (!projectExists) return;

  localStorage.setItem(
    ACTIVE_PROJECT_STORAGE_KEY,
    projectId
  );

  window.dispatchEvent(
    new CustomEvent("sitepulse-project-changed", {
      detail: { projectId },
    })
  );
}

export function addProject(
  project: Omit<Project, "id" | "createdAt">
): Project[] {
  const projects = loadProjects();

  const newProject: Project = {
    id: createId("project"),
    name: project.name.trim(),
    code: project.code?.trim() || "",
    location: project.location?.trim() || "",
    isArchived: false,
    createdAt: new Date().toISOString(),
  };

  const updatedProjects = [...projects, newProject];
  saveProjects(updatedProjects);
  setActiveProject(newProject.id);
  return updatedProjects;
}

export function updateProject(
  updatedProject: Project
): Project[] {
  const updatedProjects = loadProjects().map((project) =>
    project.id === updatedProject.id
      ? normaliseProject(updatedProject)
      : project
  );

  saveProjects(updatedProjects);
  return updatedProjects;
}

export function archiveProject(
  projectId: string
): Project[] {
  const updatedProjects = loadProjects().map((project) =>
    project.id === projectId
      ? { ...project, isArchived: true }
      : project
  );

  saveProjects(updatedProjects);

  if (getActiveProjectId() === projectId) {
    const nextProject = updatedProjects.find(
      (project) => !project.isArchived
    );

    if (nextProject) setActiveProject(nextProject.id);
  }

  return updatedProjects;
}

export function loadProgramme(
  projectId?: string
): ProgrammeActivity[] {
  if (typeof window === "undefined") return [];

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return [];

    const programmeKey = getProjectProgrammeStorageKey(resolvedProjectId);
    const storedActivities =
      localStorage.getItem(programmeKey) ??
      localStorage.getItem(getProjectActivitiesStorageKey(resolvedProjectId));

    if (!storedActivities) return [];

    const parsedActivities = JSON.parse(storedActivities);
    if (!Array.isArray(parsedActivities)) return [];

    const programme = parsedActivities.map((activity) =>
      normaliseProgrammeActivity(activity as Partial<ProgrammeActivity> & LegacyProgrammeRow)
    );
    localStorage.setItem(programmeKey, JSON.stringify(programme));
    return programme;
  } catch (error) {
    console.error("Unable to load programme activities:", error);
    return [];
  }
}

export function saveProgramme(
  programmeActivities: ProgrammeActivity[],
  projectId?: string
): void {
  if (typeof window === "undefined") return;

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return;

    const key = getProjectProgrammeStorageKey(resolvedProjectId);
    const normalisedProgramme = programmeActivities.map(normaliseProgrammeActivity);
    localStorage.setItem(key, JSON.stringify(normalisedProgramme));
    queueSharedWrite(key, normalisedProgramme);
  } catch (error) {
    console.error("Unable to save programme activities:", error);
  }
}

export function addProgrammeActivity(
  activity: Omit<ProgrammeActivity, "id" | "createdAt">,
  projectId?: string
): ProgrammeActivity[] {
  const programmeActivities = loadProgramme(projectId);

  const newActivity: ProgrammeActivity = {
    id: createId("programme-activity"),
    programmeActivityId: activity.programmeActivityId.trim(),
    building: activity.building.trim(),
    elevation: activity.elevation.trim(),
    level: activity.level.trim(),
    gridline: activity.gridline?.trim() || "",
    activity: activity.activity.trim(),
    description: activity.description?.trim() || "",
    trade: activity.trade?.trim() || "",
    wbs: activity.wbs?.trim() || "",
    unit: activity.unit.trim(),
    plannedQuantity: Number(activity.plannedQuantity) || 0,
    budgetLabourHours: Number(activity.budgetLabourHours) || undefined,
    plannedProductionRate: Number(activity.plannedProductionRate) || undefined,
    plannedCrewSize: Number(activity.plannedCrewSize) || undefined,
    plannedStart: activity.plannedStart?.trim() || undefined,
    plannedFinish: activity.plannedFinish?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const updatedActivities = [...programmeActivities, newActivity];
  saveProgramme(updatedActivities, projectId);
  return updatedActivities;
}

export function updateProgrammeActivity(
  updatedActivity: ProgrammeActivity,
  projectId?: string
): ProgrammeActivity[] {
  const updatedActivities = loadProgramme(projectId).map(
    (activity) =>
      activity.id === updatedActivity.id
        ? normaliseProgrammeActivity(updatedActivity)
        : activity
  );

  saveProgramme(updatedActivities, projectId);
  return updatedActivities;
}

export function deleteProgrammeActivity(
  internalId: string,
  projectId?: string
): ProgrammeActivity[] {
  const updatedActivities = loadProgramme(projectId).filter(
    (activity) => activity.id !== internalId
  );

  saveProgramme(updatedActivities, projectId);
  return updatedActivities;
}

export function loadDay(projectId?: string): SiteDay | null {
  if (typeof window === "undefined") return null;

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return null;

    const date = getActiveDate();
    const storedDay = loadSiteDay(date, resolvedProjectId);
    if (storedDay) return storedDay;

    const day = emptySiteDay(date);
    const key = getDatedProjectDayStorageKey(resolvedProjectId, date);
    localStorage.setItem(key, JSON.stringify(day));
    queueSharedWrite(key, day);
    return day;
  } catch (error) {
    console.error("Unable to load the site day:", error);
    return null;
  }
}

export function loadSiteDay(
  date: string,
  projectId?: string
): SiteDay | null {
  if (typeof window === "undefined" || !isIsoDate(date)) return null;

  try {
    const resolvedProjectId = projectId || getActiveProjectId();
    if (!resolvedProjectId) return null;
    migrateLegacyDay(resolvedProjectId);
    const data = localStorage.getItem(
      getDatedProjectDayStorageKey(resolvedProjectId, date)
    );
    return data ? { ...(JSON.parse(data) as SiteDay), date } : null;
  } catch (error) {
    console.error(`Unable to load the site day for ${date}:`, error);
    return null;
  }
}

export function loadSiteDaysBetween(
  startDate: string,
  endDate: string,
  projectId?: string
): SiteDay[] {
  if (typeof window === "undefined") return [];

  try {
    const resolvedProjectId = projectId || getActiveProjectId();
    if (!resolvedProjectId) return [];
    migrateLegacyDay(resolvedProjectId);
    const prefix = `${PROJECT_DAY_KEY_PREFIX}-${resolvedProjectId}-`;
    const days: SiteDay[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const date = key.slice(prefix.length);
      if (!isIsoDate(date) || date < startDate || date > endDate) continue;
      const data = localStorage.getItem(key);
      if (data) days.push({ ...(JSON.parse(data) as SiteDay), date });
    }

    return days.sort((first, second) => first.date.localeCompare(second.date));
  } catch (error) {
    console.error("Unable to load the site day range:", error);
    return [];
  }
}

export function loadAllSiteDays(projectId?: string): SiteDay[] {
  return loadSiteDaysBetween("1000-01-01", "9999-12-31", projectId);
}

export function restoreProjectData(
  data: {
    project: Project;
    programmeActivities: ProgrammeActivity[];
    operatives: Operative[];
    siteDays: SiteDay[];
  },
  mode: "new" | "replace"
): string {
  if (typeof window === "undefined") return "";

  const projects = loadProjects();
  const matchingProject = projects.find((project) => project.id === data.project.id);
  if (mode === "replace" && !matchingProject) {
    throw new Error("The matching project no longer exists in this browser.");
  }

  const projectId = mode === "new" ? createId("project") : data.project.id;
  const restoredProject = normaliseProject({
    ...data.project,
    id: projectId,
    name: mode === "new" ? `${data.project.name} (Imported)` : data.project.name,
    isArchived: false,
  });

  if (mode === "replace") {
    const dayPrefix = `${PROJECT_DAY_KEY_PREFIX}-${projectId}-`;
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(dayPrefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      void deleteSharedRecord(key);
    });
  }

  const updatedProjects = mode === "replace"
    ? projects.map((project) => project.id === projectId ? restoredProject : project)
    : [...projects, restoredProject];
  saveProjects(updatedProjects);
  saveProgramme(data.programmeActivities, projectId);

  const operativeMap = new Map(loadOperatives().map((operative) => [String(operative.id), operative]));
  data.operatives.forEach((operative) => operativeMap.set(String(operative.id), operative));
  saveOperatives([...operativeMap.values()]);

  data.siteDays.forEach((day) => saveDay(day, projectId));
  setActiveProject(projectId);
  return projectId;
}

export function saveDay(
  data: SiteDay,
  projectId?: string
): void {
  if (typeof window === "undefined") return;

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return;

    const date = isIsoDate(data.date) ? data.date : getActiveDate();
    const normalisedDay = { ...emptySiteDay(date), ...data, date };
    const key = getDatedProjectDayStorageKey(resolvedProjectId, date);
    localStorage.setItem(key, JSON.stringify(normalisedDay));
    queueSharedWrite(key, normalisedDay);
    window.dispatchEvent(
      new CustomEvent("sitepulse-day-changed", {
        detail: { projectId: resolvedProjectId, date },
      })
    );
  } catch (error) {
    console.error("Unable to save the site day:", error);
  }
}

export function duplicatePreviousDay(projectId?: string): SiteDay {
  const resolvedProjectId = projectId || getActiveProjectId();
  const date = getActiveDate();
  const previous = new Date(`${date}T12:00:00`);
  previous.setDate(previous.getDate() - 1);
  const previousDate = getLocalDate(previous);
  const previousData = localStorage.getItem(
    getDatedProjectDayStorageKey(resolvedProjectId, previousDate)
  );
  const source = previousData ? (JSON.parse(previousData) as SiteDay) : null;
  const duplicated: SiteDay = {
    date,
    attendance: source?.attendance ? structuredClone(source.attendance) : [],
    crews: source?.crews ? structuredClone(source.crews) : [],
    events: [],
  };
  saveDay(duplicated, resolvedProjectId);
  return duplicated;
}

export function loadOperatives(): Operative[] {
  if (typeof window === "undefined") return [];

  try {
    const savedData = localStorage.getItem(
      OPERATIVES_STORAGE_KEY
    );

    if (savedData) {
      const parsedData = JSON.parse(savedData);
      if (Array.isArray(parsedData)) {
        return parsedData as Operative[];
      }
    }

    saveOperatives(defaultOperatives);
    return defaultOperatives;
  } catch (error) {
    console.error("Unable to load operatives:", error);
    return defaultOperatives;
  }
}

export function saveOperatives(
  operatives: Operative[]
): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(OPERATIVES_STORAGE_KEY, JSON.stringify(operatives));
    queueSharedWrite(OPERATIVES_STORAGE_KEY, operatives);
  } catch (error) {
    console.error("Unable to save operatives:", error);
  }
}

export function addOperative(
  operative: Operative
): Operative[] {
  const existingOperatives = loadOperatives();

  if (
    existingOperatives.some(
      (item) => item.id === operative.id
    )
  ) {
    return existingOperatives;
  }

  const updatedOperatives = [
    ...existingOperatives,
    operative,
  ];

  saveOperatives(updatedOperatives);
  return updatedOperatives;
}

export function updateOperative(
  updatedOperative: Operative
): Operative[] {
  const updatedOperatives = loadOperatives().map(
    (operative) =>
      operative.id === updatedOperative.id
        ? updatedOperative
        : operative
  );

  saveOperatives(updatedOperatives);
  return updatedOperatives;
}

export function deleteOperative(
  operativeId: string
): Operative[] {
  const updatedOperatives = loadOperatives().filter(
    (operative) => operative.id !== operativeId
  );

  saveOperatives(updatedOperatives);
  return updatedOperatives;
}
