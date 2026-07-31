import type {
  Activity,
  Operative,
  Project,
  SiteDay,
} from "@/types/site";
import { operatives as defaultOperatives } from "@/lib/operatives";

export const LEGACY_DAY_STORAGE_KEY = "sitepulse-day";
export const OPERATIVES_STORAGE_KEY = "sitepulse-operatives";
export const PROJECTS_STORAGE_KEY = "sitepulse-projects";
export const ACTIVE_PROJECT_STORAGE_KEY =
  "sitepulse-active-project";

const PROJECT_DAY_KEY_PREFIX = "sitepulse-day-project";
const PROJECT_ACTIVITIES_KEY_PREFIX =
  "sitepulse-activities-project";

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

function getProjectActivitiesStorageKey(
  projectId: string
): string {
  return `${PROJECT_ACTIVITIES_KEY_PREFIX}-${projectId}`;
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

function normaliseActivity(activity: Activity): Activity {
  return {
    id: String(activity.id),
    code: activity.code?.trim() || "",
    description:
      activity.description?.trim() || "Unnamed Activity",
    location: activity.location?.trim() || "",
    unit: activity.unit?.trim() || "",
    plannedQuantity:
      Number.isFinite(Number(activity.plannedQuantity))
        ? Number(activity.plannedQuantity)
        : 0,
    createdAt:
      activity.createdAt || new Date().toISOString(),
  };
}

function migrateLegacyDay(projectId: string): void {
  if (typeof window === "undefined") return;

  const projectDayKey = getProjectDayStorageKey(projectId);
  if (localStorage.getItem(projectDayKey)) return;

  const legacyDay = localStorage.getItem(
    LEGACY_DAY_STORAGE_KEY
  );
  if (!legacyDay) return;

  try {
    JSON.parse(legacyDay);
    localStorage.setItem(projectDayKey, legacyDay);
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
    localStorage.setItem(
      PROJECTS_STORAGE_KEY,
      JSON.stringify(projects.map(normaliseProject))
    );
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

export function loadActivities(
  projectId?: string
): Activity[] {
  if (typeof window === "undefined") return [];

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return [];

    const storedActivities = localStorage.getItem(
      getProjectActivitiesStorageKey(resolvedProjectId)
    );

    if (!storedActivities) return [];

    const parsedActivities = JSON.parse(storedActivities);
    if (!Array.isArray(parsedActivities)) return [];

    return parsedActivities.map((activity) =>
      normaliseActivity(activity as Activity)
    );
  } catch (error) {
    console.error("Unable to load activities:", error);
    return [];
  }
}

export function saveActivities(
  activities: Activity[],
  projectId?: string
): void {
  if (typeof window === "undefined") return;

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return;

    localStorage.setItem(
      getProjectActivitiesStorageKey(resolvedProjectId),
      JSON.stringify(activities.map(normaliseActivity))
    );
  } catch (error) {
    console.error("Unable to save activities:", error);
  }
}

export function addActivity(
  activity: Omit<Activity, "id" | "createdAt">,
  projectId?: string
): Activity[] {
  const activities = loadActivities(projectId);

  const newActivity: Activity = {
    id: createId("activity"),
    code: activity.code.trim(),
    description: activity.description.trim(),
    location: activity.location.trim(),
    unit: activity.unit.trim(),
    plannedQuantity: Number(activity.plannedQuantity) || 0,
    createdAt: new Date().toISOString(),
  };

  const updatedActivities = [...activities, newActivity];
  saveActivities(updatedActivities, projectId);
  return updatedActivities;
}

export function updateActivity(
  updatedActivity: Activity,
  projectId?: string
): Activity[] {
  const updatedActivities = loadActivities(projectId).map(
    (activity) =>
      activity.id === updatedActivity.id
        ? normaliseActivity(updatedActivity)
        : activity
  );

  saveActivities(updatedActivities, projectId);
  return updatedActivities;
}

export function deleteActivity(
  activityId: string,
  projectId?: string
): Activity[] {
  const updatedActivities = loadActivities(projectId).filter(
    (activity) => activity.id !== activityId
  );

  saveActivities(updatedActivities, projectId);
  return updatedActivities;
}

export function loadDay(projectId?: string): SiteDay | null {
  if (typeof window === "undefined") return null;

  try {
    const resolvedProjectId =
      projectId || getActiveProjectId();
    if (!resolvedProjectId) return null;

    const data = localStorage.getItem(
      getProjectDayStorageKey(resolvedProjectId)
    );

    return data ? (JSON.parse(data) as SiteDay) : null;
  } catch (error) {
    console.error("Unable to load the site day:", error);
    return null;
  }
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

    localStorage.setItem(
      getProjectDayStorageKey(resolvedProjectId),
      JSON.stringify(data)
    );
  } catch (error) {
    console.error("Unable to save the site day:", error);
  }
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
    localStorage.setItem(
      OPERATIVES_STORAGE_KEY,
      JSON.stringify(operatives)
    );
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
